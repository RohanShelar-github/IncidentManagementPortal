'use strict';

const nodemailer = require('nodemailer');
const DEFAULT_EWS_URL = 'https://outlook.office365.com/EWS/Exchange.asmx';

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

function configured() {
  if (String(process.env.MAIL_ENABLED || '').toLowerCase() !== 'true') return false;
  if (String(process.env.MAIL_PROVIDER || '').toLowerCase() === 'smtp') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER
      && process.env.SMTP_APP_PASSWORD && process.env.MAIL_FROM && process.env.MAIL_TO);
  }
  return Boolean(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID
      && process.env.MAIL_CLIENT_SECRET && process.env.MAIL_FROM
      && process.env.MAIL_TO && (process.env.MAIL_OAUTH_REFRESH_TOKEN || process.env.MAIL_OAUTH_ACCESS_TOKEN));
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
  const subject = `[${incident.severity || 'Incident'}] ${incident.id}: ${incident.title}`;
  const portalBaseUrl = String(process.env.PORTAL_BASE_URL || '').replace(/\/$/, '');
  const incidentUrl = portalBaseUrl ? `${portalBaseUrl}/?incident=${encodeURIComponent(incident.id)}#incidents` : '';
  const body = [
    'A new incident has been created in the AOC 24×7 Incident Management Portal.', '',
    `Incident ID: ${incident.id}`,
    `Summary: ${incident.title || 'Not provided'}`,
    `Severity: ${incident.severity || 'Not provided'}`,
    `Status: ${incident.status || 'New'}`,
    `Customer: ${incident.customer || 'Not provided'}`,
    `Project: ${incident.project || 'Not provided'}`,
    `Area: ${incident.area || 'Not provided'}`,
    `Assigned To: ${incident.engineer || 'Not assigned'}`,
    `MTTD: ${incident.mttd || 'Not recorded'}`,
    `Incident Start: ${incident.startDT || incident.date_time_opened || 'Not provided'} ${incident.timezone || 'IST'}`,
    '', 'Description:', incident.description || 'Not provided',
    ...(incidentUrl ? ['', `Open Incident: ${incidentUrl}`] : [])
  ].join('\r\n');
  const details = [
    ['Incident ID', incident.id], ['Severity', incident.severity || 'Not provided'],
    ['Status', incident.status || 'New'], ['Customer', incident.customer || 'Not provided'],
    ['Project', incident.project || 'Not provided'], ['Area', incident.area || 'Not provided'],
    ['Assigned To', incident.engineer || 'Not assigned'], ['MTTD', incident.mttd || 'Not recorded'],
    ['Incident Start', `${incident.startDT || incident.date_time_opened || 'Not provided'} ${incident.timezone || 'IST'}`]
  ].map(([label, value]) => `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">${htmlEscape(label)}</td><td style="padding:8px 12px;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0">${htmlEscape(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#172554;padding:24px;color:#fff"><div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8">AOC 24×7 Incident Management</div><h1 style="font-size:22px;margin:8px 0 0">Incident Created</h1></div><div style="padding:24px"><div data-additional-message></div><div style="font-size:18px;font-weight:700;margin-bottom:6px">${htmlEscape(incident.title || 'Untitled incident')}</div><div style="display:inline-block;background:#fee2e2;color:#991b1b;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;margin-bottom:18px">${htmlEscape(incident.severity || 'Incident')}</div><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${details}</table><div style="margin-top:20px"><div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:7px">Description</div><div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:12px 14px;white-space:pre-wrap;font-size:13px;line-height:1.5">${htmlEscape(incident.description || 'Not provided')}</div></div>${incidentUrl ? `<div style="margin-top:24px;text-align:center"><a href="${htmlEscape(incidentUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px">Open Incident ${htmlEscape(incident.id)}</a><div style="font-size:11px;color:#64748b;margin-top:9px">Sign in when prompted; the incident will open automatically.</div></div>` : ''}</div></div></body></html>`;
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

async function sendIncidentCreatedEmail(incident) {
  if (!configured()) return { sent: false, skipped: true, message: 'Email delivery is not configured' };
  const defaults = incidentEmail(incident);
  const requestedSubject = String(incident.emailSubject || defaults.subject).replace(/[\r\n]+/g, ' ').trim();
  const content = {
    subject: (requestedSubject.includes(String(incident.id)) ? requestedSubject : `${incident.id} | ${requestedSubject}`).slice(0, 255),
    body: String(incident.emailBody || defaults.body).trim().slice(0, 20000)
  };
  if (incident.emailBody) {
    defaults.html = defaults.html.replace('<div data-additional-message></div>', `<div style="margin:0 0 18px;padding:12px 14px;background:#eff6ff;border-left:4px solid #3b82f6;color:#334155;white-space:pre-wrap;font-size:13px">${htmlEscape(content.body)}</div>`);
  }
  const to = cleanAddressList(incident.emailTo, process.env.MAIL_TO);
  const cc = cleanAddressList(incident.emailCc, process.env.MAIL_CC);
  if (!to || !content.subject || !content.body) throw new Error('Email To, subject, and body are required');
  if (String(process.env.MAIL_PROVIDER || '').toLowerCase() === 'smtp') {
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
      subject: content.subject,
      text: defaults.body,
      html: defaults.html
    });
    return { sent: true, to, cc, messageId: result.messageId };
  }
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

module.exports = { cleanAddressList, configured, getAccessToken, htmlEscape, incidentEmail, sendIncidentCreatedEmail, xmlEscape };
