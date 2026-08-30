'use strict';

const nodemailer = require('nodemailer');
const { classifyOperationsMessage, isJiraCustomerTicketSubject, jiraSubjectPrefix, normalizedOperationsCategory } = require('./operationsMailClassificationService');
const DEFAULT_EWS_URL = 'https://outlook.office365.com/EWS/Exchange.asmx';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
let graphTokenCache = null;

function mailProvider() {
  return String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeIncidentEmailHtml(value) {
  return String(value || '').slice(0, 500000)
    .replace(/<\/?(?:script|style|iframe|object)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/<(?!\/?(?:b|strong|i|em|u|font|div|p|br|ul|ol|li|img)\b)[^>]*>/gi, '')
    .replace(/<(font)\b[^>]*size\s*=\s*['"]?([1-7])['"]?[^>]*>/gi, '<$1 size="$2">')
    .replace(/<(font)\b[^>]*>/gi, '<$1>')
    .replace(/<img\b([^>]*)>/gi, (_, attributes) => {
      const source = String(attributes).match(/\bsrc\s*=\s*(['"])(data:image\/(?:png|jpeg|webp|gif);base64,[^'"]+)\1/i);
      const alt = String(attributes).match(/\balt\s*=\s*(['"])([^'"]{0,160})\1/i);
      return source ? `<img src="${source[2]}"${alt ? ` alt="${htmlEscape(alt[2])}"` : ''} style="display:block;max-width:100%;height:auto;margin:12px 0">` : '';
    });
}

function configured() {
  if (String(process.env.MAIL_ENABLED || '').toLowerCase() !== 'true') return false;
  if (mailProvider() === 'smtp') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER
      && process.env.SMTP_APP_PASSWORD && process.env.MAIL_FROM && process.env.MAIL_TO);
  }
  if (mailProvider() === 'graph') {
    return Boolean(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID
      && process.env.MAIL_CLIENT_SECRET && process.env.MAIL_FROM && process.env.MAIL_TO);
  }
  return Boolean(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID
      && process.env.MAIL_CLIENT_SECRET && process.env.MAIL_FROM
      && process.env.MAIL_TO && (process.env.MAIL_OAUTH_REFRESH_TOKEN || process.env.MAIL_OAUTH_ACCESS_TOKEN));
}

async function getGraphAccessToken() {
  if (graphTokenCache && graphTokenCache.expiresAt > Date.now() + 60000) return graphTokenCache.token;
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(process.env.MAIL_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MAIL_CLIENT_ID,
    client_secret: process.env.MAIL_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Microsoft Graph token request failed (${response.status})`);
  graphTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000 };
  return graphTokenCache.token;
}

async function getAccessToken() {
  if (process.env.MAIL_OAUTH_ACCESS_TOKEN) return process.env.MAIL_OAUTH_ACCESS_TOKEN;
  const tokenUrl = process.env.MAIL_TOKEN_URL
    || `https://login.microsoftonline.com/${encodeURIComponent(process.env.MAIL_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MAIL_CLIENT_ID,
    client_secret: process.env.MAIL_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: process.env.MAIL_OAUTH_REFRESH_TOKEN,
    scope: process.env.MAIL_SCOPE || 'offline_access https://outlook.office365.com/EWS.AccessAsUser.All'
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `OAuth token request failed (${response.status})`);
  }
  return data.access_token;
}

function recipientXml(kind, addresses) {
  const entries = String(addresses || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!entries.length) return '';
  return `<t:${kind}>${entries.map((address) => `<t:Mailbox><t:EmailAddress>${xmlEscape(address)}</t:EmailAddress></t:Mailbox>`).join('')}</t:${kind}>`;
}

function incidentEmail(incident) {
  const isClosed = incident.emailType === 'closed';
  const subject = isClosed
    ? `[Closed] ${incident.id}: ${incident.title}`
    : `[${incident.severity || 'Incident'}] ${incident.id}: ${incident.title}`;
  const portalBaseUrl = String(process.env.PORTAL_BASE_URL || '').replace(/\/$/, '');
  const incidentUrl = portalBaseUrl ? `${portalBaseUrl}/?incident=${encodeURIComponent(incident.id)}#incidents` : '';
  const body = [
    isClosed
      ? 'An incident has been closed in the AOC 24×7 Incident Management Portal.'
      : 'A new incident has been created in the AOC 24×7 Incident Management Portal.', '',
    `Incident ID: ${incident.id}`,
    `Summary: ${incident.title || 'Not provided'}`,
    `Severity: ${incident.severity || 'Not provided'}`,
    `Status: ${incident.status || 'New'}`,
    `Customer: ${incident.customer || 'Not provided'}`,
    `Project: ${incident.project || 'Not provided'}`,
    `Area: ${incident.area || 'Not provided'}`,
    `Assigned To: ${incident.engineer || 'Not assigned'}`,
    `MTTD: ${incident.mttd || 'Not recorded'}`,
    ...(isClosed ? [`Downtime: ${incident.downtime || '0m'}`, `MTTR: ${incident.mttr || 'Not recorded'}`, `Resolved By: ${incident.resolvedBy || 'Not recorded'}`] : []),
    `Incident Start: ${incident.startDT || incident.date_time_opened || 'Not provided'} ${incident.timezone || 'IST'}`,
    '', 'Description:', incident.description || 'Not provided',
    ...(incidentUrl ? ['', `Open Incident: ${incidentUrl}`] : [])
  ].join('\r\n');
  const details = [
    ['Incident ID', incident.id], ['Severity', incident.severity || 'Not provided'],
    ['Status', incident.status || 'New'], ['Customer', incident.customer || 'Not provided'],
    ['Project', incident.project || 'Not provided'], ['Area', incident.area || 'Not provided'],
    ['Assigned To', incident.engineer || 'Not assigned'], ['MTTD', incident.mttd || 'Not recorded'],
    ['Incident Start', `${incident.startDT || incident.date_time_opened || 'Not provided'} ${incident.timezone || 'IST'}`],
    ...(isClosed ? [['Downtime', incident.downtime || '0m'], ['MTTR', incident.mttr || 'Not recorded'], ['Resolved By', incident.resolvedBy || 'Not recorded'], ['Closed At', `${incident.closedAt || 'Not provided'} ${incident.timezone || 'IST'}`]] : [])
  ].map(([label, value]) => `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">${htmlEscape(label)}</td><td style="padding:8px 12px;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0">${htmlEscape(value)}</td></tr>`).join('');
  const descriptionHtml = safeIncidentEmailHtml(isClosed ? (incident.resolution || 'Not provided') : (incident.description || 'Not provided'));
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#172554;padding:24px;color:#fff"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8">AOC 24×7 Incident Management</div><h1 style="font-size:22px;margin:8px 0 0">Incident ${isClosed ? 'Closed' : 'Created'}</h1></div><div style="padding:24px"><div data-additional-message></div><div style="font-size:18px;font-weight:700;margin-bottom:6px">${htmlEscape(incident.title || 'Untitled incident')}</div><div style="display:inline-block;background:${isClosed ? '#dcfce7' : '#fee2e2'};color:${isClosed ? '#166534' : '#991b1b'};border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;margin-bottom:18px">${htmlEscape(isClosed ? 'Closed' : (incident.severity || 'Incident'))}</div><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${details}</table><div style="margin-top:20px"><div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:7px">${isClosed ? 'Resolution' : 'Description'}</div><div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:12px 14px;font-size:13px;line-height:1.5">${descriptionHtml}</div></div>${incidentUrl ? `<div style="margin-top:24px;text-align:center"><a href="${htmlEscape(incidentUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px">Open Incident ${htmlEscape(incident.id)}</a><div style="font-size:11px;color:#64748b;margin-top:9px">Sign in when prompted; the incident will open automatically.</div></div>` : ''}</div></div></body></html>`;
  return { subject, body, html, incidentUrl };
}

function cleanAddressList(value, fallback) {
  const raw = value === undefined ? fallback : value;
  const addresses = String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (addresses.some((address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) {
    throw new Error('One or more email recipients are invalid');
  }
  return addresses.join(',');
}

function graphRecipients(addresses) {
  return String(addresses || '').split(',').map((address) => address.trim()).filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

async function sendWithMicrosoftGraph({ from, to, cc, bcc, subject, html }) {
  const token = await getGraphAccessToken();
  const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: graphRecipients(to),
        ...(cc ? { ccRecipients: graphRecipients(cc) } : {}),
        ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {})
      },
      saveToSentItems: true
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (response.status === 202) return { sent: true, to, cc };
  const data = await response.json().catch(() => ({}));
  throw new Error(data?.error?.message || `Microsoft Graph send failed (${response.status})`);
}

// A draft is deliberately created before sending so the Graph conversation and
// message identifiers can be retained against the originating incident.
async function sendCriticalIncidentEmail({ from, to, cc, bcc, subject, html, attachments = [] }) {
  if (!configured()) return { sent: false, skipped: true, message: 'Email delivery is not configured' };
  if (mailProvider() !== 'graph') return sendIncidentCreatedEmail({ id: '', title: subject, emailTo: to, emailCc: cc, emailBcc: bcc, emailSubject: subject, emailBody: html });
  const token = await getGraphAccessToken();
  const base = `${GRAPH_ROOT}/users/${encodeURIComponent(from)}/messages`;
  const request = async (path, method, body) => {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Microsoft Graph send failed (${response.status})`);
    return data;
  };
  const draft = await request('', 'POST', { subject, body: { contentType: 'HTML', content: html }, toRecipients: graphRecipients(to), ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {}) });
  for (const attachment of normalizeMailboxAttachments(attachments)) await request(`/${encodeURIComponent(draft.id)}/attachments`, 'POST', { '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name, contentType: attachment.contentType, contentBytes: attachment.contentBytes });
  await request(`/${encodeURIComponent(draft.id)}/send`, 'POST');
  return { sent: true, to, cc, messageId: draft.id, conversationId: draft.conversationId || '', internetMessageId: draft.internetMessageId || '', status: 'sent' };
}

function inboundMailboxAddress() {
  return String(process.env.MAIL_INBOX_ADDRESS || process.env.MAIL_FROM || '').trim();
}

function mailboxDto(message, includeBody, attachments = []) {
  const sender = message?.from?.emailAddress || {};
  const dto = {
    id: String(message?.id || ''), subject: String(message?.subject || '(No subject)'),
    from: String(sender.address || ''), fromName: String(sender.name || sender.address || 'Unknown sender'),
    receivedAt: message?.receivedDateTime || null, isRead: Boolean(message?.isRead),
    preview: String(message?.bodyPreview || ''), hasAttachments: Boolean(message?.hasAttachments),
    conversationId: String(message?.conversationId || ''), internetMessageId: String(message?.internetMessageId || ''),
    to: (message?.toRecipients || []).map((recipient) => String(recipient?.emailAddress?.address || '')).filter(Boolean).join(', '),
    sentAt: message?.sentDateTime || null
  };
  Object.assign(dto, classifyOperationsMessage(dto));
  if (includeBody) {
    dto.body = String(message?.body?.content || '');
    dto.attachments = attachments;
    const self = inboundMailboxAddress().toLowerCase();
    const senderAddress = String(sender.address || '').toLowerCase();
    const replyAllCc = [...(message?.toRecipients || []), ...(message?.ccRecipients || [])]
      .map((recipient) => String(recipient?.emailAddress?.address || '').trim())
      .filter((address, index, list) => address && address.toLowerCase() !== self && address.toLowerCase() !== senderAddress && list.findIndex((value) => value.toLowerCase() === address.toLowerCase()) === index);
    dto.replyAllCc = replyAllCc.join(', ');
  }
  return dto;
}

function validMailboxId(value) {
  return /^[A-Za-z0-9_+\-=/]+$/.test(String(value || ''));
}

function attachmentDto(attachment) {
  return {
    id: String(attachment?.id || ''), name: String(attachment?.name || 'attachment'),
    contentType: String(attachment?.contentType || 'application/octet-stream'),
    size: Number(attachment?.size || 0), isInline: Boolean(attachment?.isInline)
  };
}

async function graphInboxRequest(path, extraHeaders = {}) {
  const mailbox = inboundMailboxAddress();
  if (!mailbox) throw new Error('Microsoft Graph inbox address is not configured');
  const token = await getGraphAccessToken();
  const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders }, signal: AbortSignal.timeout(30000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Microsoft Graph inbox request failed (${response.status})`);
  return data;
}

async function graphInboxJsonRequest(path, method, body) {
  const mailbox = inboundMailboxAddress();
  if (!mailbox) throw new Error('Microsoft Graph inbox address is not configured');
  const token = await getGraphAccessToken();
  const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000)
  });
  if (response.ok) return response.status === 204 || response.status === 202 ? {} : response.json().catch(() => ({}));
  const data = await response.json().catch(() => ({}));
  throw new Error(data?.error?.message || `Microsoft Graph mailbox request failed (${response.status})`);
}

function mailboxCategoryGraphFilter(category) {
  if (category === 'coralogix') return "from/emailAddress/address eq 'alerts@coralogix.com'";
  if (category === 'azure') return "from/emailAddress/address eq 'azure-noreply@microsoft.com'";
  if (category === 'jira') return `startswith(subject,'${jiraSubjectPrefix().replace(/'/g, "''")}')`;
  return '';
}

async function listMailboxFolderMessages(folder, limit = 50, category = 'all') {
  const selectedCategory = normalizedOperationsCategory(category);
  const query = new URLSearchParams({ '$top': String(Math.min(Math.max(Number(limit) || 50, 1), 100)), '$select': 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments,conversationId,internetMessageId', '$orderby': folder === 'sentitems' ? 'sentDateTime DESC' : 'receivedDateTime DESC' });
  // Microsoft Graph rejects some sender-filter + receivedDateTime-sort combinations
  // ("InefficientFilter"), while the matching unread-count call succeeds.  Fetch the
  // page in its normal order and apply the same deterministic classification locally.
  // This keeps category lists and their badges aligned instead of showing a badge with
  // an empty/erroring list.
  const data = await graphInboxRequest(`/mailFolders/${folder}/messages?${query}`);
  const messages = Array.isArray(data.value) ? data.value.map((message) => mailboxDto(message, false)) : [];
  return selectedCategory === 'all' || folder !== 'inbox' ? messages : messages.filter((message) => message.category === selectedCategory);
}

async function listInboxMessages(limit = 50, category = 'all') {
  const inbox = await listMailboxFolderMessages('inbox', limit, category);
  // Include only Sent Items that belong to an inbox conversation already in
  // this bounded page. This gives the UI a complete two-way thread without
  // turning the incoming category views into a second Sent Items list.
  const conversationIds = new Set(inbox.map((message) => message.conversationId).filter(Boolean));
  if (!conversationIds.size) return inbox.map((message) => ({ ...message, mailboxSource: 'inbox' }));
  const inboxWithSource = inbox.map((message) => ({ ...message, mailboxSource: 'inbox' }));
  try {
    const sent = await listMailboxFolderMessages('sentitems', limit, 'sent');
    return [...inboxWithSource,
      ...sent.filter((message) => conversationIds.has(message.conversationId)).map((message) => ({ ...message, mailboxSource: 'sent' }))];
  } catch (error) {
    // A Sent Items permission/folder issue must never hide incoming Operations
    // mail. The Inbox is the authoritative source for this view; users can
    // still open Sent Items separately while the administrator resolves Graph.
    console.warn('Mailbox Sent Items thread enrichment skipped:', error.message);
    return inboxWithSource;
  }
}

async function listSentMessages(limit = 50) {
  return (await listMailboxFolderMessages('sentitems', limit, 'sent')).map((message) => ({ ...message, mailboxSource: 'sent' }));
}

async function countUnreadMailboxMessages(category) {
  const selectedCategory = normalizedOperationsCategory(category);
  const filter = [mailboxCategoryGraphFilter(selectedCategory), 'isRead eq false'].filter(Boolean).join(' and ');
  const query = new URLSearchParams({ '$top': '1', '$count': 'true', '$select': 'id', '$filter': filter });
  const data = await graphInboxRequest(`/mailFolders/inbox/messages?${query}`, { ConsistencyLevel: 'eventual' });
  return Number(data?.['@odata.count'] || 0);
}

async function getOperationsMailboxCounts() {
  const categories = ['coralogix', 'azure', 'jira'];
  const values = await Promise.all(categories.map(async (category) => [category, await countUnreadMailboxMessages(category)]));
  return Object.fromEntries(values);
}

async function getInboxMessage(id) {
  if (!validMailboxId(id)) throw new Error('Invalid mailbox message identifier');
  const query = new URLSearchParams({ '$select': 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,body,conversationId,internetMessageId' });
  const data = await graphInboxRequest(`/messages/${encodeURIComponent(id)}?${query}`);
  let attachmentValues = [];
  if (data?.body?.content && /cid:/i.test(data.body.content)) {
    // Graph cannot $select fileAttachment-only fields (contentId/contentBytes) from the
    // polymorphic attachment collection, so load this one message's attachments here.
    const attachments = await graphInboxRequest(`/messages/${encodeURIComponent(id)}/attachments`);
    attachmentValues = Array.isArray(attachments.value) ? attachments.value : [];
    const inlineImages = new Map();
    for (const attachment of attachments.value || []) {
      const contentId = String(attachment?.contentId || '').replace(/^<|>$/g, '');
      const contentType = String(attachment?.contentType || '').toLowerCase();
      // Inline signature images are kept bounded; ordinary attachments are never exposed here.
      if (attachment?.isInline && contentId && /^image\//.test(contentType) && Number(attachment?.size || 0) <= 1_500_000) {
        const contentBytes = String(attachment?.contentBytes || '');
        if (!contentBytes || contentBytes.length > 2_000_000) continue;
        inlineImages.set(contentId, `data:${contentType};base64,${contentBytes}`);
      }
    }
    data.body.content = data.body.content.replace(/cid:([^"'\s>]+)/gi, (match, contentId) => inlineImages.get(String(contentId).replace(/^<|>$/g, '')) || match);
  } else if (data.hasAttachments) {
    const attachments = await graphInboxRequest(`/messages/${encodeURIComponent(id)}/attachments`);
    attachmentValues = Array.isArray(attachments.value) ? attachments.value : [];
  }
  return mailboxDto(data, true, attachmentValues.filter((attachment) => !attachment?.isInline).map(attachmentDto));
}

async function replyToInboxMessage(id, comment) {
  if (!validMailboxId(id)) throw new Error('Invalid mailbox message identifier');
  const options = typeof comment === 'object' && comment ? comment : { html: comment };
  const mode = ['reply', 'replyAll', 'forward'].includes(options.mode) ? options.mode : 'reply';
  const html = sanitizeMailboxReplyHtml(options.html);
  if (!html || html.length > 100000) throw new Error('Message must contain between 1 and 100,000 characters');
  const cc = cleanAddressList(options.cc, '');
  const bcc = cleanAddressList(options.bcc, '');
  const to = cleanAddressList(options.to, '');
  if (mode === 'forward' && !to) throw new Error('A recipient is required when forwarding an email');
  const action = mode === 'replyAll' ? 'createReplyAll' : mode === 'forward' ? 'createForward' : 'createReply';
  const draft = await graphInboxJsonRequest(`/messages/${encodeURIComponent(id)}/${action}`, 'POST', {});
  if (!draft?.id || !validMailboxId(draft.id)) throw new Error('Microsoft 365 could not create the mail draft');
  const updates = { body: { contentType: 'HTML', content: html } };
  if (mode === 'forward') updates.toRecipients = graphRecipients(to);
  if (cc) updates.ccRecipients = graphRecipients(cc);
  if (bcc) updates.bccRecipients = graphRecipients(bcc);
  if (options.subject) updates.subject = String(options.subject).replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}`, 'PATCH', updates);
  const attachments = normalizeMailboxAttachments(options.attachments);
  for (const attachment of attachments) {
    await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/attachments`, 'POST', {
      '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name,
      contentType: attachment.contentType, contentBytes: attachment.contentBytes
    });
  }
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/send`, 'POST');
  return { sent: true };
}

async function markInboxMessageRead(id) {
  if (!validMailboxId(id)) throw new Error('Invalid mailbox message identifier');
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(id)}`, 'PATCH', { isRead: true });
  return { read: true };
}

async function sendNewMailboxMessage(options) {
  const to = cleanAddressList(options?.to, '');
  const cc = cleanAddressList(options?.cc, '');
  const bcc = cleanAddressList(options?.bcc, '');
  const subject = String(options?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  const html = sanitizeMailboxReplyHtml(options?.html);
  if (!to) throw new Error('At least one To recipient is required');
  if (!subject) throw new Error('Email subject is required');
  if (!html || html.length > 100000) throw new Error('Message must contain between 1 and 100,000 characters');
  const draft = await graphInboxJsonRequest('/messages', 'POST', {
    subject, body: { contentType: 'HTML', content: html }, toRecipients: graphRecipients(to),
    ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {})
  });
  if (!draft?.id || !validMailboxId(draft.id)) throw new Error('Microsoft 365 could not create the mail draft');
  for (const attachment of normalizeMailboxAttachments(options?.attachments)) {
    await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/attachments`, 'POST', {
      '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name,
      contentType: attachment.contentType, contentBytes: attachment.contentBytes
    });
  }
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/send`, 'POST');
  return { sent: true };
}

function sanitizeMailboxReplyHtml(value) {
  return String(value || '').trim()
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:/gi, '$1=$2')
    .slice(0, 100000);
}

function normalizeMailboxAttachments(value) {
  const attachments = Array.isArray(value) ? value : [];
  if (attachments.length > 10) throw new Error('A maximum of 10 attachments can be sent at once');
  let total = 0;
  return attachments.map((attachment) => {
    const name = String(attachment?.name || 'attachment').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 255);
    const contentType = String(attachment?.contentType || 'application/octet-stream').slice(0, 100);
    const contentBytes = String(attachment?.contentBytes || '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBytes) || contentBytes.length > 3_500_000) throw new Error(`Attachment ${name} is invalid or exceeds 2.5 MB`);
    total += contentBytes.length;
    if (total > 8_000_000) throw new Error('Total attachments exceed the 6 MB send limit');
    return { name, contentType, contentBytes };
  });
}

async function getInboxAttachment(messageId, attachmentId) {
  if (!validMailboxId(messageId) || !validMailboxId(attachmentId)) throw new Error('Invalid mailbox attachment identifier');
  const attachment = await graphInboxRequest(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  const size = Number(attachment?.size || 0);
  const bytes = String(attachment?.contentBytes || '');
  if (!bytes || size > 25 * 1024 * 1024) throw new Error('This attachment is unavailable or exceeds the 25 MB download limit');
  return { name: String(attachment?.name || 'attachment').replace(/[\\/:*?"<>|\r\n]/g, '_'), contentType: String(attachment?.contentType || 'application/octet-stream'), data: Buffer.from(bytes, 'base64') };
}

async function deleteInboxMessage(id) {
  if (!validMailboxId(id)) throw new Error('Invalid mailbox message identifier');
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(id)}`, 'DELETE');
  return { deleted: true };
}

async function sendIncidentCreatedEmail(incident) {
  if (!configured()) return { sent: false, skipped: true, message: 'Email delivery is not configured' };
  const defaults = incidentEmail(incident);
  const requestedSubject = String(incident.emailSubject || defaults.subject).replace(/[\r\n]+/g, ' ').trim();
  const content = {
    subject: (requestedSubject.includes(String(incident.id)) ? requestedSubject : `${incident.id} | ${requestedSubject}`).slice(0, 255),
    body: String(incident.emailBody || defaults.body).trim().slice(0, 20000)
  };
  if (incident.emailBody) {
    defaults.html = defaults.html.replace('<div data-additional-message></div>', `<div style="margin:0 0 18px;padding:12px 14px;background:#eff6ff;border-left:4px solid #3b82f6;color:#334155;font-size:13px;line-height:1.55">${safeIncidentEmailHtml(content.body)}</div>`);
  }
  const to = cleanAddressList(incident.emailTo, process.env.MAIL_TO);
  const cc = cleanAddressList(incident.emailCc, process.env.MAIL_CC);
  const bcc = cleanAddressList(incident.emailBcc, process.env.MAIL_BCC);
  if (!to || !content.subject || !content.body) throw new Error('Email To, subject, and body are required');
  if (mailProvider() === 'smtp') {
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure,
      requireTLS: !secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD }
    });
    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: content.subject,
      text: defaults.body,
      html: defaults.html
    });
    return { sent: true, to, cc, messageId: result.messageId };
  }
  if (mailProvider() === 'graph') return sendWithMicrosoftGraph({ from: process.env.MAIL_FROM, to, cc, bcc, subject: content.subject, html: defaults.html });
  const token = await getAccessToken();
  const from = process.env.MAIL_FROM;
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header>
  <soap:Body><m:CreateItem MessageDisposition="SendAndSaveCopy"><m:SavedItemFolderId><t:DistinguishedFolderId Id="sentitems"/></m:SavedItemFolderId><m:Items><t:Message>
    <t:Subject>${xmlEscape(content.subject)}</t:Subject>
    <t:Body BodyType="HTML">${xmlEscape(defaults.html)}</t:Body>
    <t:From><t:Mailbox><t:EmailAddress>${xmlEscape(from)}</t:EmailAddress></t:Mailbox></t:From>
    ${recipientXml('ToRecipients', to)}
    ${recipientXml('CcRecipients', cc)}
    ${recipientXml('BccRecipients', bcc)}
  </t:Message></m:Items></m:CreateItem></soap:Body>
</soap:Envelope>`;
  const response = await fetch(process.env.MAIL_EWS_URL || DEFAULT_EWS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/xml; charset=utf-8' },
    body: envelope
  });
  const responseText = await response.text();
  const responseCode = (responseText.match(/ResponseCode>([^<]+)/) || [])[1];
  if (!response.ok || responseCode !== 'NoError') {
    const messageText = (responseText.match(/MessageText>([^<]+)/) || [])[1];
    throw new Error(messageText || responseCode || `EWS send failed (${response.status})`);
  }
  return { sent: true, to, cc };
}

async function sendIncidentClosedEmail(incident) {
  return sendIncidentCreatedEmail({ ...incident, emailType: 'closed' });
}

module.exports = { cleanAddressList, configured, countUnreadMailboxMessages, deleteInboxMessage, getAccessToken, getGraphAccessToken, getInboxAttachment, getInboxMessage, getOperationsMailboxCounts, graphRecipients, htmlEscape, incidentEmail, inboundMailboxAddress, listInboxMessages, listSentMessages, markInboxMessageRead, replyToInboxMessage, sendCriticalIncidentEmail, sendIncidentClosedEmail, sendIncidentCreatedEmail, sendNewMailboxMessage, xmlEscape };
