'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { classifyOperationsMessage, isJiraCustomerTicketSubject, jiraSubjectPrefix, normalizedOperationsCategory } = require('./operationsMailClassificationService');
const DEFAULT_EWS_URL = 'https://outlook.office365.com/EWS/Exchange.asmx';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
let graphTokenCache = null;
const conversationMessagesCache = new Map();
const CONVERSATION_CACHE_TTL_MS = 2 * 60 * 1000;

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

function safeIncidentEmailHtml(value, { preserveSignatureLayout = false } = {}) {
  const allowedTags = preserveSignatureLayout
    ? 'b|strong|i|em|u|font|div|p|br|ul|ol|li|img|table|thead|tbody|tfoot|tr|td|th|span|a'
    : 'b|strong|i|em|u|font|div|p|br|ul|ol|li|img';
  const unsupportedTag = new RegExp(`<(? !\\/?(?:${allowedTags})\\b)[^>]*>`.replace('(? !', '(?!'), 'gi');
  return String(value || '').slice(0, 500000)
    .replace(/<\/?(?:script|style|iframe|object)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(unsupportedTag, '')
    .replace(/<(font)\b[^>]*size\s*=\s*['"]?([1-7])['"]?[^>]*>/gi, '<$1 size="$2">')
    .replace(/<(font)\b[^>]*>/gi, '<$1>')
    .replace(/<img\b([^>]*)>/gi, (_, attributes) => {
      const source = String(attributes).match(/\bsrc\s*=\s*(['"])(data:image\/(?:png|jpeg|webp|gif);base64,[^'"]+)\1/i);
      const alt = String(attributes).match(/\balt\s*=\s*(['"])([^'"]{0,160})\1/i);
      const width = String((String(attributes).match(/\bwidth\s*=\s*['"]?(\d{1,4})/i) || [])[1] || '');
      const safeWidth = Number(width) > 0 && Number(width) <= 1200 ? ` width="${width}"` : '';
      return source ? `<img src="${source[2]}"${alt ? ` alt="${htmlEscape(alt[2])}"` : ''}${safeWidth} style="display:block;max-width:100%;height:auto;margin:0">` : '';
    });
}

function sanitizeSignatureLayoutHtml(value) {
  return String(value || '')
    // Outlook's image viewer adds a "show original size" button. It is not
    // signature content and its icon becomes a stray glyph in sent mail.
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')
    // Drop empty paragraphs copied around an Outlook image. They create large
    // blank gaps before the actual logo and contact details.
    .replace(/<p\b[^>]*>\s*(?:<span\b[^>]*>)?\s*(?:<br\s*\/?>|&nbsp;|\s)*(?:<\/span>)?\s*<\/p>/gi, '')
    // Email clients give paragraphs large default margins. Compact them only
    // inside the saved signature; incident-description formatting is untouched.
    .replace(/<p\b[^>]*>/gi, '<p style="margin:0 0 8px">');
}

function hasDisplayableEmailContent(value) {
  const html = String(value || '');
  // Formatting-only editor output (for example <br> or &nbsp;) must not
  // produce an empty "additional message" panel. An image is meaningful even
  // when it has no accompanying text.
  if (/<img\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').replace(/\u200B/g, '').trim().length > 0;
}

function inlineDataImagesForEmail(html) {
  const attachments = [];
  let imageNumber = 0;
  const content = String(html || '').replace(/<img\b([^>]*)>/gi, (tag, attributes) => {
    // Rich signatures copied from Outlook can wrap Base64 data over multiple
    // lines. Normalize that harmless whitespace before turning it into a CID
    // attachment, because Outlook does not render data: image URLs directly.
    const source = String(attributes).match(/\bsrc\s*=\s*(['"])(data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/\s]+={0,2}))\1/i);
    const contentBytes = String(source?.[4] || '').replace(/\s+/g, '');
    if (!source || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBytes) || contentBytes.length > 3_500_000) return tag;
    imageNumber += 1;
    const contentId = `incident-inline-${imageNumber}`;
    const extension = source[3] === 'jpeg' ? 'jpg' : source[3];
    attachments.push({
      name: `incident-image-${imageNumber}.${extension}`,
      contentType: `image/${source[3]}`,
      contentBytes,
      isInline: true,
      contentId
    });
    return tag.replace(source[2], `cid:${contentId}`);
  });
  return { html: content, attachments };
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
  const detailsTable = `<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${details}</table>`;
  const descriptionSection = `<div style="margin-top:20px"><div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:7px">${isClosed ? 'Resolution' : 'Description'}</div><div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:12px 14px;font-size:13px;line-height:1.5">${descriptionHtml}</div></div>`;
  const isNoHistorianAlert = /no\s+historian\s+read/i.test(String(incident.title || ''));
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#172554;padding:24px;color:#fff"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8">AOC 24×7 Incident Management</div><h1 style="font-size:22px;margin:8px 0 0">Incident ${isClosed ? 'Closed' : 'Created'}</h1></div><div style="padding:24px"><div data-additional-message></div><div style="font-size:18px;font-weight:700;margin-bottom:6px">${htmlEscape(incident.title || 'Untitled incident')}</div><div style="display:inline-block;background:${isClosed ? '#dcfce7' : '#fee2e2'};color:${isClosed ? '#166534' : '#991b1b'};border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;margin-bottom:18px">${htmlEscape(isClosed ? 'Closed' : (incident.severity || 'Incident'))}</div><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${details}</table><div style="margin-top:20px"><div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:7px">${isClosed ? 'Resolution' : 'Description'}</div><div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:12px 14px;font-size:13px;line-height:1.5">${descriptionHtml}</div></div>${incidentUrl ? `<div style="margin-top:24px;text-align:center"><a href="${htmlEscape(incidentUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px">Open Incident ${htmlEscape(incident.id)}</a><div style="font-size:11px;color:#64748b;margin-top:9px">Sign in when prompted; the incident will open automatically.</div></div>` : ''}</div></div></body></html>`;
  const orderedHtml = isNoHistorianAlert
    ? html.replace(`${detailsTable}${descriptionSection}`, `${descriptionSection}${detailsTable}`)
    : html;
  return { subject, body, html: orderedHtml, incidentUrl };
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

// Temporary opt-in diagnostics for Microsoft Graph mail investigations.  Do
// not log access tokens, client secrets, message bodies, or attachments.
function writeMailDiagnostic(event, details = {}) {
  if (String(process.env.MAIL_DIAGNOSTIC_LOG || '').toLowerCase() !== 'true') return;
  const recipients = (value) => String(value || '').split(',').map((address) => address.trim()).filter(Boolean).slice(0, 25);
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    provider: mailProvider() || 'unspecified',
    from: String(details.from || '').trim(),
    to: recipients(details.to),
    ccCount: recipients(details.cc).length,
    bccCount: recipients(details.bcc).length,
    subjectLength: String(details.subject || '').length,
    graphStatus: Number.isFinite(Number(details.graphStatus)) ? Number(details.graphStatus) : null,
    graphRequestId: String(details.graphRequestId || '').slice(0, 200) || null,
    error: String(details.error || '').replace(/[\r\n]+/g, ' ').slice(0, 1000) || null
  };
  try {
    const logDirectory = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(path.join(logDirectory, 'mail-diagnostic.log'), JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    // Mail delivery must never fail merely because optional diagnostics cannot
    // be written. Keep the fallback message free of protected credential data.
    console.error('Mail diagnostic log write failed:', error.message);
  }
}

function graphRequestError(response, data, operation) {
  const error = new Error(data?.error?.message || `Microsoft Graph ${operation} failed (${response.status})`);
  error.graphStatus = response.status;
  error.graphRequestId = response.headers.get('request-id') || response.headers.get('client-request-id') || '';
  return error;
}

async function sendWithMicrosoftGraph({ from, to, cc, bcc, subject, html }) {
  const diagnostic = { from, to, cc, bcc, subject };
  writeMailDiagnostic('graph_send_attempt', diagnostic);
  try {
    const token = await getGraphAccessToken();
    const inline = inlineDataImagesForEmail(html);
    if (inline.attachments.length) {
      const base = `${GRAPH_ROOT}/users/${encodeURIComponent(from)}/messages`;
      const request = async (requestPath, method, body) => {
        const response = await fetch(base + requestPath, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw graphRequestError(response, data, 'send');
        return data;
      };
      const draft = await request('', 'POST', { subject, body: { contentType: 'HTML', content: inline.html }, toRecipients: graphRecipients(to), ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {}) });
      for (const attachment of inline.attachments) await request(`/${encodeURIComponent(draft.id)}/attachments`, 'POST', { '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name, contentType: attachment.contentType, contentBytes: attachment.contentBytes, isInline: true, contentId: attachment.contentId, contentDisposition: 'inline' });
      await request(`/${encodeURIComponent(draft.id)}/send`, 'POST', {});
      const result = { sent: true, to, cc, messageId: draft.id };
      writeMailDiagnostic('graph_send_succeeded', diagnostic);
      return result;
    }
    const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(from)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: graphRecipients(to), ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {}) }, saveToSentItems: true }),
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 202) {
      writeMailDiagnostic('graph_send_succeeded', { ...diagnostic, graphStatus: response.status, graphRequestId: response.headers.get('request-id') || response.headers.get('client-request-id') || '' });
      return { sent: true, to, cc };
    }
    const data = await response.json().catch(() => ({}));
    throw graphRequestError(response, data, 'send');
  } catch (error) {
    writeMailDiagnostic('graph_send_failed', { ...diagnostic, graphStatus: error.graphStatus, graphRequestId: error.graphRequestId, error: error.message });
    throw error;
  }
}

// A draft is deliberately created before sending so the Graph conversation and
// message identifiers can be retained against the originating incident.
async function sendCriticalIncidentEmail({ from, to, cc, bcc, subject, html, attachments = [] }) {
  if (!configured()) return { sent: false, skipped: true, message: 'Email delivery is not configured' };
  cc = cleanAddressList(cc, '');
  bcc = '';
  if (mailProvider() !== 'graph') return sendIncidentCreatedEmail({ id: '', title: subject, emailTo: to, emailCc: cc, emailBcc: bcc, emailSubject: subject, emailBody: html });
  const token = await getGraphAccessToken();
  const inline = inlineDataImagesForEmail(html);
  const outgoingAttachments = normalizeMailboxAttachments(attachments);
  const base = `${GRAPH_ROOT}/users/${encodeURIComponent(from)}/messages`;
  const request = async (path, method, body) => {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Microsoft Graph send failed (${response.status})`);
    return data;
  };
  const draft = await request('', 'POST', { subject, body: { contentType: 'HTML', content: inline.html }, toRecipients: graphRecipients(to), ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {}) });
  for (const attachment of [...outgoingAttachments, ...inline.attachments]) await request(`/${encodeURIComponent(draft.id)}/attachments`, 'POST', { '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name, contentType: attachment.contentType, contentBytes: attachment.contentBytes, ...(attachment.isInline ? { isInline: true, contentId: attachment.contentId, contentDisposition: 'inline' } : {}) });
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
    cc: (message?.ccRecipients || []).map((recipient) => String(recipient?.emailAddress?.address || '')).filter(Boolean).join(', '),
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
  // Reply/forward prefixes are normal for Customer Raised Tickets, so an
  // exact startswith filter would undercount and hide active conversations.
  if (category === 'jira') return "contains(subject,'was reported by the customer')";
  return '';
}

async function listMailboxFolderMessages(folder, limit = 50, category = 'all') {
  const selectedCategory = normalizedOperationsCategory(category);
  const query = new URLSearchParams({ '$top': String(Math.min(Math.max(Number(limit) || 50, 1), 100)), '$select': 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments,conversationId,internetMessageId', '$orderby': folder === 'sentitems' ? 'sentDateTime DESC' : 'receivedDateTime DESC' });
  // Microsoft Graph rejects some sender-filter + receivedDateTime-sort combinations
  // ("InefficientFilter"), while the matching unread-count call succeeds.  Fetch the
  // page in its normal order and apply the same deterministic classification locally.
  // This keeps sender-based alert lists reliable. Jira tickets can safely use
  // a subject filter, which lets their dedicated view reach older tickets that
  // are outside the newest general Inbox page.
  const jiraFilter = selectedCategory === 'jira' && folder === 'inbox' ? mailboxCategoryGraphFilter('jira') : '';
  if (jiraFilter) {
    // Graph rejects a contains(subject, ...) filter combined with its default
    // receivedDateTime sort. The UI already orders conversations by timestamp.
    query.set('$filter', jiraFilter);
    query.delete('$orderby');
  }
  const data = await graphInboxRequest(`/mailFolders/${folder}/messages?${query}`, jiraFilter ? { ConsistencyLevel: 'eventual' } : {});
  const messages = Array.isArray(data.value) ? data.value.map((message) => mailboxDto(message, false)) : [];
  return selectedCategory === 'all' || folder !== 'inbox' ? messages : messages.filter((message) => message.category === selectedCategory);
}

async function listConversationMessages(conversationId) {
  const key = String(conversationId || '').trim();
  if (!key) return [];
  const cached = conversationMessagesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.messages;

  const query = new URLSearchParams({
    '$top': '100',
    '$select': 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments,conversationId,internetMessageId,parentFolderId',
    '$filter': `conversationId eq '${key.replace(/'/g, "''")}'`
  });
  const data = await graphInboxRequest(`/messages?${query}`, { ConsistencyLevel: 'eventual' });
  const self = inboundMailboxAddress().toLowerCase();
  const messages = (Array.isArray(data.value) ? data.value : []).map((message) => {
    const dto = mailboxDto(message, false);
    // The all-messages Graph query spans Inbox and Sent Items. Sent replies
    // originate from the Operations mailbox, which keeps existing UI actions
    // (such as Create Incident and delete) correctly scoped.
    return { ...dto, mailboxSource: dto.from.toLowerCase() === self ? 'sent' : 'inbox' };
  });
  conversationMessagesCache.set(key, { messages, expiresAt: Date.now() + CONVERSATION_CACHE_TTL_MS });
  return messages;
}

async function enrichInboxConversations(inbox) {
  const conversationIds = [...new Set(inbox.map((message) => message.conversationId).filter(Boolean))];
  if (!conversationIds.length) return inbox.map((message) => ({ ...message, mailboxSource: 'inbox' }));

  const enriched = await Promise.all(conversationIds.map(async (conversationId) => {
    try { return await listConversationMessages(conversationId); }
    catch (error) {
      // The original Inbox page remains authoritative if Graph cannot expand
      // one conversation (for example, a transient throttling response).
      console.warn('Mailbox conversation enrichment skipped:', error.message);
      return [];
    }
  }));
  const messagesById = new Map(inbox.map((message) => [message.id, { ...message, mailboxSource: 'inbox' }]));
  enriched.flat().forEach((message) => messagesById.set(message.id, message));
  return Array.from(messagesById.values());
}

async function listInboxMessages(limit = 50, category = 'all') {
  const inbox = await listMailboxFolderMessages('inbox', limit, category);
  // A bounded Inbox page can contain only the newest reply in a conversation.
  // Expand its exact Graph conversation ID so older messages still appear in
  // the thread instead of being silently omitted by the page limit.
  return enrichInboxConversations(inbox);
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
  const query = new URLSearchParams({ '$select': 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,hasAttachments,body,conversationId,internetMessageId' });
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
  const html = sanitizeMailboxReplyHtml(options.html, 500000);
  if (!html || html.length > 500000) throw new Error('Message must contain between 1 and 500,000 characters');
  const cc = cleanAddressList(options.cc, '');
  const bcc = cleanAddressList(options.bcc, '');
  const to = cleanAddressList(options.to, '');
  if (mode === 'forward' && !to) throw new Error('A recipient is required when forwarding an email');
  const action = mode === 'replyAll' ? 'createReplyAll' : mode === 'forward' ? 'createForward' : 'createReply';
  const draft = await graphInboxJsonRequest(`/messages/${encodeURIComponent(id)}/${action}`, 'POST', {});
  if (!draft?.id || !validMailboxId(draft.id)) throw new Error('Microsoft 365 could not create the mail draft');
  const inline = inlineDataImagesForEmail(html);
  const updates = { body: { contentType: 'HTML', content: inline.html } };
  // Reply recipients are editable in the UI, including for Sent Items.
  if (to) updates.toRecipients = graphRecipients(to);
  if (cc) updates.ccRecipients = graphRecipients(cc);
  if (bcc) updates.bccRecipients = graphRecipients(bcc);
  if (options.subject) updates.subject = String(options.subject).replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}`, 'PATCH', updates);
  const attachments = [...normalizeMailboxAttachments(options.attachments), ...inline.attachments];
  for (const attachment of attachments) {
    await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/attachments`, 'POST', {
      '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name,
      contentType: attachment.contentType, contentBytes: attachment.contentBytes,
      ...(attachment.isInline ? { isInline: true, contentId: attachment.contentId, contentDisposition: 'inline' } : {})
    });
  }
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/send`, 'POST');
  return { sent: true };
}

async function setInboxMessageReadState(id, isRead) {
  if (!validMailboxId(id)) throw new Error('Invalid mailbox message identifier');
  const read = Boolean(isRead);
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(id)}`, 'PATCH', { isRead: read });
  return { read };
}

async function markInboxMessageRead(id) {
  return setInboxMessageReadState(id, true);
}

async function sendNewMailboxMessage(options) {
  const to = cleanAddressList(options?.to, '');
  const cc = cleanAddressList(options?.cc, '');
  const bcc = cleanAddressList(options?.bcc, '');
  const subject = String(options?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  const html = sanitizeMailboxReplyHtml(options?.html, 500000);
  if (!to) throw new Error('At least one To recipient is required');
  if (!subject) throw new Error('Email subject is required');
  if (!html || html.length > 500000) throw new Error('Message must contain between 1 and 500,000 characters');
  const inline = inlineDataImagesForEmail(html);
  const draft = await graphInboxJsonRequest('/messages', 'POST', {
    subject, body: { contentType: 'HTML', content: inline.html }, toRecipients: graphRecipients(to),
    ...(cc ? { ccRecipients: graphRecipients(cc) } : {}), ...(bcc ? { bccRecipients: graphRecipients(bcc) } : {})
  });
  if (!draft?.id || !validMailboxId(draft.id)) throw new Error('Microsoft 365 could not create the mail draft');
  for (const attachment of [...normalizeMailboxAttachments(options?.attachments), ...inline.attachments]) {
    await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/attachments`, 'POST', {
      '@odata.type': '#microsoft.graph.fileAttachment', name: attachment.name,
      contentType: attachment.contentType, contentBytes: attachment.contentBytes,
      ...(attachment.isInline ? { isInline: true, contentId: attachment.contentId, contentDisposition: 'inline' } : {})
    });
  }
  await graphInboxJsonRequest(`/messages/${encodeURIComponent(draft.id)}/send`, 'POST');
  return { sent: true };
}

function sanitizeMailboxReplyHtml(value, maxLength = 100000) {
  return String(value || '').trim()
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:/gi, '$1=$2')
    .slice(0, maxLength);
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
    // A saved signature may contain one bounded inline image. Keep the whole
    // HTML document fragment so its img tag is never cut into visible text.
    body: String(incident.emailBody || defaults.body).trim().slice(0, 500000)
  };
  if (incident.emailBody) {
    const signatureMatch = content.body.match(/<div\b[^>]*data-aoc-user-signature[^>]*>([\s\S]*)$/i);
    const signatureHtml = signatureMatch ? safeIncidentEmailHtml(sanitizeSignatureLayoutHtml(signatureMatch[1].replace(/<\/div>\s*$/i, '')), { preserveSignatureLayout: true }) : '';
    const additionalHtml = safeIncidentEmailHtml(signatureMatch ? content.body.replace(signatureMatch[0], '').trim() : content.body);
    defaults.html = defaults.html.replace('<div data-additional-message></div>', hasDisplayableEmailContent(additionalHtml) ? `<div style="margin:0 0 18px;padding:12px 14px;background:#eff6ff;border-left:4px solid #3b82f6;color:#334155;font-size:13px;line-height:1.55">${additionalHtml}</div>` : '');
    if (signatureHtml) defaults.html = defaults.html.replace('</body>', `<div style="max-width:680px;margin:0 auto 24px;padding:14px 24px;background:#fff;border:1px solid #e2e8f0;color:#334155;font-size:13px;line-height:1.5">${signatureHtml}</div></body>`);
  }
  const to = cleanAddressList(incident.emailTo, process.env.MAIL_TO);
  const cc = cleanAddressList(incident.emailCc, process.env.MAIL_CC);
  const bcc = '';
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

module.exports = { cleanAddressList, configured, countUnreadMailboxMessages, deleteInboxMessage, enrichInboxConversations, getAccessToken, getGraphAccessToken, getInboxAttachment, getInboxMessage, getOperationsMailboxCounts, graphRecipients, hasDisplayableEmailContent, htmlEscape, incidentEmail, inboundMailboxAddress, inlineDataImagesForEmail, listConversationMessages, listInboxMessages, listSentMessages, markInboxMessageRead, replyToInboxMessage, safeIncidentEmailHtml, sanitizeMailboxReplyHtml, sanitizeSignatureLayoutHtml, sendCriticalIncidentEmail, sendIncidentClosedEmail, sendIncidentCreatedEmail, sendNewMailboxMessage, setInboxMessageReadState, writeMailDiagnostic, xmlEscape };
