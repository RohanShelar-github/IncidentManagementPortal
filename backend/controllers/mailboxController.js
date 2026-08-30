'use strict';

const pool = require('../config/database');
const { deleteInboxMessage, getInboxAttachment, getInboxMessage, getOperationsMailboxCounts, listInboxMessages, listSentMessages, markInboxMessageRead, replyToInboxMessage, sendNewMailboxMessage } = require('../services/emailService');
const { markMailboxNotificationsRead, notifyMailboxUsers } = require('../services/notificationService');

let knownMailboxMessageIds = null;
let mailboxPollTimer = null;
let mailboxPollInFlight = false;

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
    const ticketContent = message.category === 'jira' ? parseCustomerRaisedTicket(message) : null;
    const alertContent = ['azure', 'coralogix'].includes(message.category) ? parseOperationsAlert(message) : null;
    const [customers] = await pool.query('SELECT id, customer_name, timezone, jira_project_code FROM customers WHERE is_active = 1 ORDER BY customer_name');
    let candidates = [], matchLocation = 'none', matchMessage = 'No matching customer was found. Select a customer manually.';
    if (message.category === 'azure') {
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
    return res.json({ success: true, data: {
      audit_id: audit.insertId, email_id: message.id, source_category: message.category || 'other',
      title: ticketContent ? ticketContent.title : alertContent ? alertContent.title : message.subject,
      description: ticketContent ? ticketContent.description : alertContent ? alertContent.description : plainMailText(message.body || message.preview), received_at: message.receivedAt,
      customer: identified ? { id: identified.id, name: identified.customer_name, timezone: identified.timezone || null, jira_project_code: identified.jira_project_code || null } : null,
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
    res.json({ success: true, data: messages });
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
  try { res.json({ success: true, data: await getInboxMessage(req.params.id) }); }
  catch (error) {
    console.error('Mailbox message error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the mailbox message.' });
  }
}

async function replyToMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'send_mailbox')) return;
  try { res.json({ success: true, data: await replyToInboxMessage(req.params.id, req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to send reply.' }); }
}

async function sendNewMailbox(req, res) {
  if (!await requireMailboxPermission(req, res, 'send_mailbox')) return;
  try { res.json({ success: true, data: await sendNewMailboxMessage(req.body) }); }
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

module.exports = { conciseAlertDescription, containsCustomerName, deleteMailboxMessage, downloadMailboxAttachment, getMailboxMessage, getMailboxOperationsCounts, listMailbox, listSentMailbox, markMailboxMessageRead, matchingCustomersByName, parseOperationsAlert, prepareMailboxIncident, replyToMailboxMessage, sendNewMailbox, startMailboxNotificationPolling };
