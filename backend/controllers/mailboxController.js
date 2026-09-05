'use strict';

const pool = require('../config/database');
const { deleteInboxMessage, getInboxAttachment, getInboxMessage, getOperationsMailboxCounts, listInboxMessages, listSentMessages, markInboxMessageRead, replyToInboxMessage, sanitizeMailboxReplyHtml, sendNewMailboxMessage, setInboxMessageReadState } = require('../services/emailService');
const { markMailboxNotificationsRead, notifyMailboxUsers } = require('../services/notificationService');
const { noHistorianReadIncidentDefaults, operationsIncidentDefaults } = require('../services/operationsMailClassificationService');

let knownMailboxMessageIds = null;
let mailboxPollTimer = null;
let mailboxPollInFlight = false;

function applyMailboxIncidentLinks(messages, links) {
  const byMessageId = new Map();
  (links || []).forEach((link) => {
    const messageId = String(link.graph_message_id || '');
    if (messageId && !byMessageId.has(messageId)) byMessageId.set(messageId, link.incident_ref);
  });
  return (messages || []).map((message) => {
    const incidentRef = byMessageId.get(String(message?.id || '')) || null;
    return incidentRef ? { ...message, incidentCreated: true, incidentRef } : message;
  });
}

async function attachMailboxIncidentLinks(messages) {
  const messageIds = Array.from(new Set((messages || [])
    .map((message) => String(message?.id || '').trim())
    .filter((id) => id && id.length <= 255)));
  if (!messageIds.length) return messages || [];
  const placeholders = messageIds.map(() => '?').join(', ');
  const [links] = await pool.query(
    `SELECT a.graph_message_id, i.incident_ref
       FROM operations_email_incident_audit a
       JOIN incidents i ON i.id = a.incident_id
      WHERE a.status = 'created' AND a.incident_id IS NOT NULL
        AND a.graph_message_id IN (${placeholders})
      ORDER BY a.created_at DESC, a.id DESC`,
    messageIds
  );
  return applyMailboxIncidentLinks(messages, links);
}

async function requireMailboxPermission(req, res, permission) {
  const [rows] = await pool.query(`SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id = r.id WHERE r.role_key = ? AND rp.permission_key = ? LIMIT 1`, [req.user?.role, permission]);
  if (rows.length) return true;
  res.status(403).json({ success: false, message: permission === 'send_mailbox' ? 'Your role cannot send mailbox replies.' : 'Your role cannot access the mailbox.' });
  return false;
}

async function hasRolePermission(req, permission) {
  const [rows] = await pool.query(`SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id = r.id WHERE r.role_key = ? AND rp.permission_key = ? LIMIT 1`, [req.user?.role, permission]);
  return Boolean(rows.length);
}

function escapedPattern(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function containsCustomerToken(text, value, jiraCode) {
  const term = String(value || '').trim();
  if (!term) return false;
  const source = String(text || '');
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapedPattern(term)}(?=$|[^A-Za-z0-9])`, 'i');
  if (pattern.test(source)) return true;
  // Two-character Jira keys such as IN/CN are too common in prose. They are
  // accepted only in normal Jira-key notation, e.g. IN-123.
  if (jiraCode && term.length <= 2) return new RegExp(`\\b${escapedPattern(term)}-\\d+\\b`, 'i').test(source);
  return false;
}

function normaliseCustomerName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsCustomerName(text, value) {
  if (containsCustomerToken(text, value, false)) return true;
  const term = normaliseCustomerName(value);
  // Avoid turning short abbreviations into broad word matches. Names and
  // meaningful customer-family suffixes are always longer than this.
  if (term.length < 4) return false;
  const source = normaliseCustomerName(text);
  return (` ${source} `).includes(` ${term} `);
}

function plainMailText(value) {
  return String(value || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' $1 ')
    .replace(/<\/?(?:p|div|tr|li|br|h[1-6])\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(?:x2013|8211);?/gi, '-')
    .replace(/&#(?:x2019|8217);?/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 50000);
}

function conciseAlertDescription(category, value, fallbackTitle) {
  let content = plainMailText(value);
  // Alert messages contain delivery lists, rule definitions, query text and
  // legal footers after these markers. None of that belongs in an incident
  // description created from Operations.
  const cutoff = /\b(?:Affected Dimensions|\bTo:|\bCC:|VIEW ALERT|EDIT ALERT|Timeframe|Conditions|Additional Details|Account information|Unsubscribe from|Privacy Statement|Created By)\b/i;
  const cutoffMatch = content.match(cutoff);
  if (cutoffMatch?.index !== undefined) content = content.slice(0, cutoffMatch.index);

  let description = '';
  if (category === 'coralogix') {
    // Coralogix alert headers are followed by a human-readable impact
    // paragraph. Prefer it over the query threshold and trigger metadata.
    const impactMatch = content.match(/\b((?:One or more|This alert|The alert|A(?:n)? affected)[\s\S]{20,1800})$/i);
    if (impactMatch) description = impactMatch[1];
  }
  if (!description) {
    const labelledMatch = content.match(/\b(?:Alert )?Description\s*[-:]\s*([\s\S]{8,1800})/i);
    if (labelledMatch) description = labelledMatch[1];
  }
  if (!description && category === 'coralogix') {
    const detectedMatch = content.match(/\b(We've detected[\s\S]{8,1800})$/i);
    if (detectedMatch) description = detectedMatch[1];
  }

  // Azure alerts often do not include a separate prose description. In that
  // case retain a short, clear statement instead of copying dimensions,
  // Kusto queries, recipient lists, or the full HTML payload.
  description = String(description || fallbackTitle || '')
    .replace(/\s*(?:Triggered|Fired time|Resolved time)\s*:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ').trim();
  return description.slice(0, 1800);
}

function parseOperationsAlert(message) {
  const title = plainMailText(message.subject || '').slice(0, 500) || 'Operations alert';
  return {
    title,
    description: conciseAlertDescription(message.category, message.body || message.preview, title)
  };
}

function isNoHistorianReadAlert(message) {
  const subject = plainMailText(message?.subject || '');
  const content = plainMailText(message?.body || message?.preview || '');
  return /\b(?:FTD\s+)?No\s+Historian\s+Read\b/i.test(`${subject} ${content}`);
}

function firstMatch(value, expression) {
  const match = String(value || '').match(expression);
  return String(match?.[1] || match?.[0] || '').trim();
}

function noHistorianAlertFields(message) {
  const subject = plainMailText(message?.subject || '');
  const content = plainMailText(message?.body || message?.preview || '');
  const bracketed = [...subject.matchAll(/\[([^\]\r\n]{1,100})\]/g)].map((match) => match[1].trim());
  const plantFromSubject = bracketed.find((value) => /-APPSVR\b/i.test(value))
    // Azure uses this compact subject format, where the token immediately
    // after Severity is the plant. Both alert transitions occur in mail,
    // e.g. "Activated Severity: 0 MED ..." and "Deactivated Severity: 0 SHO ...".
    || firstMatch(subject, /\b(?:Activated|Deactivated)\s+Severity\s*:\s*\d+\s+([A-Za-z0-9][A-Za-z0-9._-]{1,99})\s+(?=(?:FTD\s+)?No\s+Historian\s+Read\b)/i)
    || firstMatch(subject, /\b(?:plant|site)\s*[:=-]\s*([A-Za-z0-9][A-Za-z0-9._-]{1,99})/i)
    || firstMatch(subject, /\bNo\s+Historian\s+Read\s+(?:at|for)\s+([A-Za-z0-9][A-Za-z0-9._-]{1,99})/i);
  const alertDetail = bracketed.find((value) => value !== plantFromSubject)
    || firstMatch(subject, /\bNGCXPI[A-Za-z0-9_-]+\b/i)
    || firstMatch(content, /\bNGCXPI[A-Za-z0-9_-]+\b/i);
  // Do not substitute an Azure monitoring resource for either of these
  // operational fields: when the alert does not provide a server, leave the
  // requested editable placeholder intact.
  const plantName = String(plantFromSubject || '').replace(/-APPSVR\b/i, '').trim() || '[plant name]';
  const plantServer = plantFromSubject && /-APPSVR\b/i.test(plantFromSubject)
    ? plantFromSubject
    : `${plantName.replace(/^\[|\]$/g, '')}-APPSVR`;
  return {
    plantName,
    plantServer,
    alertDetails: alertDetail ? `[${alertDetail}]` : '[NGCXPILAVM1]'
  };
}

function parseNoHistorianReadAlert(message) {
  const title = plainMailText(message?.subject || '').slice(0, 500) || 'No Historian Read alert';
  const { plantName, plantServer, alertDetails } = noHistorianAlertFields(message);
  return {
    title,
    description: [
      'Dear Team,',
      '',
      `We would like to inform you about a recent occurrence of a 'No Historian Read' alert at ${plantName}.`,
      'Our team has conducted an investigation and prepared a detailed report to provide you with all the necessary information.',
      '',
      'Please find the following details:',
      '',
      `- Plant Name: ${plantName}[${plantServer}]`,
      `- 'No Historian Read' Alert Details: ${alertDetails}`,
      '',
      `- Duration: [insert the time here] minutes plant ${plantName} is down.`,
      `- Impact: Data is not flowing into FactoryEye for ${plantName} while this alert is active.`,
      '',
      'Please find attached a screenshot for your reference.',
      '',
      '- Steps Taken:',
      '',
      'We have identified that we were not reading data from the Historian server and are not able to ping.',
      'We have identified that we cannot read data from the Historian server. We ask that someone on the NGC technical support team check the server’s network access, power to the server and/or the plant, the Historian licensing is active and lastly restart the server if all else fails.',
      'Please inform us when you have a resolution to the issue, and/or you have verified that the server is operational.',
      'We understand the importance of resolving this matter promptly, and we appreciate your collaboration towards ensuring a swift resolution.',
      '',
      'Thank you for your attention to this matter.'
    ].join('\n')
  };
}

function parseCustomerRaisedTicket(message) {
  const content = plainMailText(message.body || message.preview);
  // Jira notification subject lines are wrappers. The meaningful incident
  // summary is the text after the priority notice; customer-entered details
  // belong only to the Description section.
  const summaryMatch = content.match(/this\s+issue\s+needs\s+to\s+be\s+handled\s+with\s+the\s+highest\s+priority\s*[-:]+\s*(.*?)(?=\s*description\s*[-:]|$)/i);
  const descriptionMatch = content.match(/\bdescription\s*[-:]\s*(.*)$/i);
  return {
    title: String(summaryMatch?.[1] || message.subject || '').trim(),
    description: String(descriptionMatch?.[1] || '').trim()
  };
}

function matchingCustomersByName(customers, text) {
  const matches = customers.map((customer) => {
    const customerName = String(customer.customer_name || '').trim();
    // The text after a customer-family prefix is a safe additional alias:
    // e.g. “Morton Industries” identifies “MSE US - Morton Industries”.
    const suffix = customerName.includes(' - ') ? customerName.split(' - ').slice(1).join(' - ').trim() : '';
    const matchedLength = [customerName, suffix].reduce((longest, term) => (
      term && containsCustomerName(text, term) ? Math.max(longest, term.length) : longest
    ), 0);
    return { customer, matchedLength };
  }).filter((entry) => entry.matchedLength > 0);
  if (!matches.length) return [];
  const longestMatch = Math.max(...matches.map((entry) => entry.matchedLength));
  return matches.filter((entry) => entry.matchedLength === longestMatch).map((entry) => entry.customer);
}

function matchingCustomers(customers, text) {
  const namedMatches = matchingCustomersByName(customers, text);
  if (namedMatches.length) return namedMatches;
  return customers.filter((customer) => {
    const jiraCode = String(customer.jira_project_code || '').trim();
    // Do not treat common two-letter English words (for example “in”) as a
    // customer match. Short Jira codes must appear as a Jira issue key.
    if (jiraCode.length <= 2) return new RegExp(`\\b${escapedPattern(jiraCode)}-\\d+\\b`, 'i').test(String(text || ''));
    return containsCustomerToken(text, jiraCode, true);
  });
}

async function prepareMailboxIncident(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  if (!await hasRolePermission(req, 'create_incidents')) return res.status(403).json({ success: false, message: 'Your role cannot create incidents.' });
  try {
    const message = await getInboxMessage(req.params.id);
    const isNoHistorianAlert = isNoHistorianReadAlert(message);
    // This alert has a fixed operational owner and classification. It takes
    // precedence over generic Azure/Coralogix subject mappings, including
    // when an Azure notification was forwarded from another mailbox.
    const autoSelection = isNoHistorianAlert ? noHistorianReadIncidentDefaults() : operationsIncidentDefaults(message.category, message.subject);
    const ticketContent = message.category === 'jira' ? parseCustomerRaisedTicket(message) : null;
    // Forwarded Azure alerts may be classified as a regular email because the
    // sender changes. Detect this high-value alert by its subject/body too.
    const historianAlertContent = isNoHistorianReadAlert(message) ? parseNoHistorianReadAlert(message) : null;
    const alertContent = historianAlertContent || (['azure', 'coralogix'].includes(message.category) ? parseOperationsAlert(message) : null);
    const [customers] = await pool.query('SELECT id, customer_name, timezone, jira_project_code FROM customers WHERE is_active = 1 ORDER BY customer_name');
    let candidates = [], matchLocation = 'none', matchMessage = 'No matching customer was found. Select a customer manually.';
    if (isNoHistorianAlert) {
      candidates = customers.filter((customer) => String(customer.customer_name || '').trim().toLowerCase() === 'ngc');
      matchLocation = candidates.length === 1 ? 'no-historian-read-rule' : 'none';
      matchMessage = candidates.length === 1 ? 'No Historian Read alerts are assigned to NGC.' : 'No Historian Read customer mapping NGC was not found. Select a customer manually.';
    } else if (message.category === 'azure') {
      candidates = customers.filter((customer) => String(customer.jira_project_code || '').trim().toUpperCase() === 'NATGYP');
      matchLocation = candidates.length === 1 ? 'azure-source-rule' : 'none';
      matchMessage = candidates.length === 1 ? 'Azure Alerts are assigned to National Gypsum (NATGYP).' : 'Azure Alert customer mapping NATGYP was not found. Select a customer manually.';
    } else {
      // A Customer Raised Ticket has an authoritative Jira key (for example
      // TIL-236). Match that project prefix directly before broader text
      // searching, so TileBar is selected deterministically for TIL tickets.
      const issueProjectCode = String(message.jiraIssueKey || '').split('-')[0].trim().toUpperCase();
      if (issueProjectCode) {
        candidates = customers.filter((customer) => String(customer.jira_project_code || '').trim().toUpperCase() === issueProjectCode);
        // A shared project key (for example MSEUS) is not enough to choose a
        // customer. An explicit customer name in the ticket subject/body has
        // priority, including the meaningful suffix after “ - ”.
        if (candidates.length > 1) {
          const namedCandidates = matchingCustomersByName(candidates, `${message.subject || ''} ${plainMailText(message.body || message.preview)}`);
          if (namedCandidates.length === 1) candidates = namedCandidates;
        }
        if (candidates.length) {
          matchLocation = 'jira-project-key';
          matchMessage = candidates.length === 1 ? `Customer identified from ${issueProjectCode} and the customer name in the email.` : `More than one customer uses Jira project key ${issueProjectCode}. Select the correct customer.`;
        }
      }
      if (!candidates.length) candidates = matchingCustomers(customers, message.subject);
      if (candidates.length) {
        if (matchLocation === 'none') { matchLocation = 'subject'; matchMessage = candidates.length === 1 ? 'Customer identified from the email subject.' : 'More than one customer matched the email subject. Select the correct customer.'; }
      } else {
        candidates = matchingCustomers(customers, plainMailText(message.body || message.preview));
        if (candidates.length) {
          matchLocation = 'body'; matchMessage = candidates.length === 1 ? 'Customer identified from the email content.' : 'More than one customer matched the email content. Select the correct customer.';
        }
      }
    }
    const identified = candidates.length === 1 ? candidates[0] : null;
    const status = identified ? 'prefilled' : candidates.length > 1 ? 'ambiguous' : 'no_match';
    const [audit] = await pool.query(
      'INSERT INTO operations_email_incident_audit (graph_message_id, email_subject, source_category, identified_customer_id, identified_customer_name, jira_project_code, match_location, status, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [message.id, message.subject, message.category || 'other', identified?.id || null, identified?.customer_name || null, identified?.jira_project_code || null, matchLocation, status, req.user.id]
    );
    if (!identified) console.warn(`Operations email customer match ${status}: ${message.id}`);
    console.info('Operations incident auto-selection:', { messageId: message.id, category: message.category || 'other', ...autoSelection });
    return res.json({ success: true, data: {
      audit_id: audit.insertId, email_id: message.id, source_category: message.category || 'other',
      title: ticketContent ? ticketContent.title : alertContent ? alertContent.title : message.subject,
      description: ticketContent ? ticketContent.description : alertContent ? alertContent.description : plainMailText(message.body || message.preview), received_at: message.receivedAt,
      customer: identified ? { id: identified.id, name: identified.customer_name, timezone: identified.timezone || null, jira_project_code: identified.jira_project_code || null } : null,
      auto_selection: autoSelection,
      candidates: candidates.map((customer) => ({ id: customer.id, name: customer.customer_name, jira_project_code: customer.jira_project_code || null })),
      match_location: matchLocation, message: matchMessage
    }});
  } catch (error) {
    console.error('Operations incident prefill error:', error.message);
    return res.status(502).json({ success: false, message: 'Unable to prepare the incident from this email. You can still create an incident manually.' });
  }
}

async function listMailbox(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const messages = await listInboxMessages(req.query.limit, req.query.category);
    res.json({ success: true, data: await attachMailboxIncidentLinks(messages) });
  } catch (error) {
    console.error('Mailbox list error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the Microsoft 365 mailbox.' });
  }
}

async function listSentMailbox(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try { res.json({ success: true, data: await listSentMessages(req.query.limit) }); }
  catch (error) {
    console.error('Sent mailbox list error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load Microsoft 365 Sent Items.' });
  }
}

async function getMailboxOperationsCounts(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try { res.json({ success: true, data: await getOperationsMailboxCounts() }); }
  catch (error) {
    console.error('Mailbox counts error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load Operations unread counts.' });
  }
}

async function getMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const message = await getInboxMessage(req.params.id);
    const [linkedMessage] = await attachMailboxIncidentLinks([message]);
    res.json({ success: true, data: linkedMessage });
  }
  catch (error) {
    console.error('Mailbox message error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the mailbox message.' });
  }
}

function isAdmin(req) { return String(req.user?.role || '').toLowerCase() === 'admin'; }

async function getOwnMailboxSignature(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const [rows] = await pool.query('SELECT signature_html, updated_at FROM user_email_signatures WHERE user_id = ? LIMIT 1', [req.user.id]);
    res.json({ success: true, data: rows[0] ? { html: rows[0].signature_html, updated_at: rows[0].updated_at } : null });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load your email signature.' }); }
}

async function saveOwnMailboxSignature(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  const html = sanitizeMailboxReplyHtml(req.body?.html, 500000);
  if (!html || html.length > 500000) return res.status(400).json({ success: false, message: 'Signature must contain between 1 and 500,000 characters.' });
  try {
    await pool.query('INSERT INTO user_email_signatures (user_id, signature_html) VALUES (?, ?) ON DUPLICATE KEY UPDATE signature_html = VALUES(signature_html)', [req.user.id, html]);
    res.json({ success: true, data: { html } });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to save your email signature.' }); }
}

async function deleteOwnMailboxSignature(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try { await pool.query('DELETE FROM user_email_signatures WHERE user_id = ?', [req.user.id]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to remove your email signature.' }); }
}

async function listMailboxSignatures(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Only administrators can view user signatures.' });
  try {
    const [rows] = await pool.query('SELECT s.user_id, u.full_name, u.email, s.signature_html, s.updated_at FROM user_email_signatures s JOIN users u ON u.id = s.user_id ORDER BY u.full_name, u.email');
    res.json({ success: true, data: rows.map((row) => ({ user_id: row.user_id, name: row.full_name || row.email, email: row.email, html: row.signature_html, updated_at: row.updated_at })) });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load user signatures.' }); }
}

async function deleteMailboxSignatureAsAdmin(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Only administrators can remove user signatures.' });
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ success: false, message: 'Invalid user signature.' });
  try { await pool.query('DELETE FROM user_email_signatures WHERE user_id = ?', [userId]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to remove user signature.' }); }
}

async function withUserSignature(userId, payload) {
  // Signature insertion is opt-in in the compose UI. Do not add one at send
  // time when the user chose to omit it.
  return { ...(payload || {}) };
}

async function replyToMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'send_mailbox')) return;
  try { res.json({ success: true, data: await replyToInboxMessage(req.params.id, await withUserSignature(req.user.id, req.body)) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to send reply.' }); }
}

async function sendNewMailbox(req, res) {
  if (!await requireMailboxPermission(req, res, 'send_mailbox')) return;
  try { res.json({ success: true, data: await sendNewMailboxMessage(await withUserSignature(req.user.id, req.body)) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to send email.' }); }
}

async function markMailboxMessageRead(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const data = await markInboxMessageRead(req.params.id);
    await markMailboxNotificationsRead(req.params.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to mark email as read.' }); }
}

async function setMailboxMessageReadState(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  const isRead = req.body?.isRead;
  if (typeof isRead !== 'boolean') return res.status(400).json({ success: false, message: 'isRead must be true or false.' });
  try {
    const data = await setInboxMessageReadState(req.params.id, isRead);
    if (isRead) await markMailboxNotificationsRead(req.params.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to update email read state.' }); }
}

async function downloadMailboxAttachment(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const attachment = await getInboxAttachment(req.params.id, req.params.attachmentId);
    res.set({ 'Content-Type': attachment.contentType, 'Content-Length': String(attachment.data.length), 'Content-Disposition': `attachment; filename="${attachment.name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' });
    res.send(attachment.data);
  } catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to download attachment.' }); }
}

async function deleteMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'delete_mailbox')) return;
  try { res.json({ success: true, data: await deleteInboxMessage(req.params.id) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to delete email.' }); }
}

async function pollMailboxForNotifications() {
  if (mailboxPollInFlight || String(process.env.MAIL_PROVIDER || '').toLowerCase() !== 'graph') return;
  mailboxPollInFlight = true;
  try {
    const messages = await listInboxMessages(50);
    const currentIds = new Set(messages.map((message) => message.id));
    if (knownMailboxMessageIds) {
      const newMessages = messages.filter((message) => !knownMailboxMessageIds.has(message.id));
      for (const message of newMessages) {
        // Old/read messages are never alerts. This also prevents a polling
        // restart from producing popups for mail that was already opened.
        if (!message.isRead) await notifyMailboxUsers({ fromName: message.fromName || message.from, subject: message.subject, mailboxMessageId: message.id });
        // Conversation ID is Graph's authoritative thread key.  Messages which
        // do not belong to a critical-incident conversation remain mailbox-only.
        if (message.conversationId) {
          const [threads] = await pool.query('SELECT id, incident_id FROM incident_email_threads WHERE conversation_id = ? LIMIT 1', [message.conversationId]);
          if (threads.length) {
            await pool.query('INSERT IGNORE INTO incident_email_messages (thread_id, incident_id, direction, action_type, graph_message_id, internet_message_id, subject, sender, body_preview, status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [threads[0].id, threads[0].incident_id, 'inbound', 'reply_received', message.id, message.internetMessageId || null, message.subject, message.from, message.preview, 'received', message.receivedAt || new Date()]);
            await pool.query('INSERT INTO activity_logs (incident_id, action_type, detail) VALUES (?, ?, ?)', [threads[0].incident_id, 'critical_email_received', `Email reply received: ${message.subject}`]);
          }
        }
      }
    }
    knownMailboxMessageIds = currentIds;
  } catch (error) {
    console.error('Mailbox notification poll error:', error.message);
  } finally { mailboxPollInFlight = false; }
}

function startMailboxNotificationPolling() {
  if (mailboxPollTimer) return;
  pollMailboxForNotifications();
  mailboxPollTimer = setInterval(pollMailboxForNotifications, 60000);
}

module.exports = { applyMailboxIncidentLinks, attachMailboxIncidentLinks, conciseAlertDescription, containsCustomerName, deleteMailboxMessage, deleteMailboxSignatureAsAdmin, deleteOwnMailboxSignature, downloadMailboxAttachment, getMailboxMessage, getMailboxOperationsCounts, getOwnMailboxSignature, isNoHistorianReadAlert, listMailbox, listMailboxSignatures, listSentMailbox, markMailboxMessageRead, matchingCustomersByName, noHistorianAlertFields, parseNoHistorianReadAlert, parseOperationsAlert, prepareMailboxIncident, replyToMailboxMessage, saveOwnMailboxSignature, sendNewMailbox, setMailboxMessageReadState, startMailboxNotificationPolling, withUserSignature };
