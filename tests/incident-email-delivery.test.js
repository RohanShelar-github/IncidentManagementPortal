'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { cleanAddressList, configured, incidentEmail, xmlEscape } = require('../backend/services/emailService');

const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const example = fs.readFileSync('backend/.env.example', 'utf8');

test('incident creation sends mail only after the database insert and preserves incident success on mail failure', () => {
  const start = controller.indexOf('const createIncident');
  const end = controller.indexOf('const getIncidents', start);
  const implementation = controller.slice(start, end);
  assert.ok(implementation.indexOf('INSERT INTO incidents') < implementation.indexOf('sendIncidentCreatedEmail'));
  assert.match(implementation, /catch \(mailError\)/);
  assert.match(implementation, /success: true[\s\S]*data: \{ id: incidentRef, email \}/);
});

test('mail is addressed through server-side environment configuration', () => {
  assert.match(example, /MAIL_FROM=/);
  assert.match(example, /MAIL_TO=/);
  assert.match(example, /MAIL_CC=/);
  assert.match(example, /EWS\.AccessAsUser\.All/);
  assert.doesNotMatch(frontend, /MAIL_CLIENT_SECRET|MAIL_OAUTH_REFRESH_TOKEN/);
});

test('mailbox renders a safely sandboxed rich-email preview', () => {
  assert.match(frontend, /function mailboxSafeRichHtml/);
  assert.match(frontend, /script,iframe,object,embed,form,input,button,textarea,select,meta,base,link,style/);
  assert.match(frontend, /frame\.setAttribute\('sandbox', 'allow-popups'\)/);
  assert.match(frontend, /allow-popups allow-popups-to-escape-sandbox/);
  assert.match(frontend, /function openMailboxMessage\(id\)[\s\S]*?frame\.setAttribute\('sandbox', 'allow-popups allow-popups-to-escape-sandbox'\)/);
  assert.match(frontend, /node\.setAttribute\('target', '_blank'\)/);
  assert.match(frontend, /\^\(https:\|mailto:\|cid:\|data:image/);
  assert.match(frontend, /document\.body\.classList\.contains\('light-mode'\)/);
  assert.match(frontend, /localStorage\.getItem\('mc_theme'\) === 'light'/);
  assert.match(frontend, /mailboxPreview\.srcdoc = mailboxSafeRichHtml\(activeMailboxRichBody, !isLight\)/);
  assert.match(frontend, /body,body \*\{color:/);
  assert.match(frontend, /frame\.srcdoc = mailboxSafeRichHtml/);
});

test('generated incident email includes operational incident details and escapes XML', () => {
  const previousUrl = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = 'http://portal.example:5500';
  const email = incidentEmail({ id: 'INC-999', title: 'Test & verify', severity: 'High', customer: 'NGC', description: 'Details', mttd: '5m' });
  assert.match(email.subject, /INC-999/);
  assert.match(email.body, /Customer: NGC/);
  assert.match(email.body, /MTTD: 5m/);
  assert.match(email.body, /incident=INC-999/);
  assert.match(email.html, /Incident Created/);
  assert.match(email.html, /Open Incident INC-999/);
  assert.equal(xmlEscape('A&B<test>'), 'A&amp;B&lt;test&gt;');
  if (previousUrl === undefined) delete process.env.PORTAL_BASE_URL;
  else process.env.PORTAL_BASE_URL = previousUrl;
});

test('email link survives login and opens the referenced incident', () => {
  assert.match(example, /PORTAL_BASE_URL=/);
  assert.match(frontend, /URLSearchParams\(window\.location\.search\)\.get\('incident'\)/);
  assert.match(frontend, /openDetailPanel\(incidentId\)/);
  assert.match(controller, /mttd: mttd\.text \|\| 'Not recorded'/);
});

test('final subject includes the assigned incident ID', () => {
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(service, /requestedSubject\.includes\(String\(incident\.id\)\)/);
  assert.match(service, /`\$\{incident\.id\} \| \$\{requestedSubject\}`/);
});

test('formatted email does not repeat the generated incident summary above the details table', () => {
  const email = incidentEmail({ id: 'INC-1000', title: 'No duplicate summary', severity: 'Normal' });
  assert.doesNotMatch(email.html, /A new incident has been created in the portal/);
  assert.match(email.html, /data-additional-message/);
  assert.match(email.html, /Incident ID/);
});

test('mail configuration never becomes active without OAuth token material', () => {
  const previous = { ...process.env };
  process.env.MAIL_ENABLED = 'true';
  process.env.MAIL_TENANT_ID = 'tenant'; process.env.MAIL_CLIENT_ID = 'client';
  process.env.MAIL_CLIENT_SECRET = 'secret'; process.env.MAIL_FROM = 'from@example.com';
  process.env.MAIL_TO = 'to@example.com';
  delete process.env.MAIL_OAUTH_REFRESH_TOKEN; delete process.env.MAIL_OAUTH_ACCESS_TOKEN;
  assert.equal(configured(), false);
  Object.keys(process.env).forEach((key) => { if (!(key in previous)) delete process.env[key]; });
  Object.assign(process.env, previous);
});

test('Microsoft Graph mail provider uses application authentication and the Graph send endpoint', () => {
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  const exampleEnv = fs.readFileSync('backend/.env.example', 'utf8');
  assert.match(service, /mailProvider\(\) === 'graph'/);
  assert.match(service, /grant_type: 'client_credentials'/);
  assert.match(service, /https:\/\/graph\.microsoft\.com\/v1\.0/);
  assert.match(service, /\/users\/\$\{encodeURIComponent\(from\)\}\/sendMail/);
  assert.match(exampleEnv, /MAIL_PROVIDER=graph/);
});

test('shared operations mailbox is exposed through authenticated, role-permission endpoints', () => {
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  const routes = fs.readFileSync('backend/routes/mailboxRoutes.js', 'utf8');
  const controllerSource = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const server = fs.readFileSync('backend/server.js', 'utf8');
  assert.match(service, /mailFolders\/inbox\/messages/);
  assert.match(routes, /router\.use\(authenticateToken\)/);
  assert.match(controllerSource, /requireMailboxPermission/);
  assert.match(controllerSource, /view_mailbox/);
  assert.match(server, /app\.use\('\/api\/mailbox', mailboxRoutes\)/);
});

test('mailbox permits authenticated role-based replies and selected attachment downloads', () => {
  const routes = fs.readFileSync('backend/routes/mailboxRoutes.js', 'utf8');
  const controller = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(routes, /router\.post\('\/inbox\/:id\/reply', replyToMailboxMessage\)/);
  assert.match(routes, /attachments\/:attachmentId\/download/);
  assert.match(controller, /send_mailbox/);
  assert.match(mailService, /createReply/);
  assert.match(mailService, /25 \* 1024 \* 1024/);
  assert.match(frontend, /downloadMailboxAttachment/);
  assert.match(frontend, /showMailboxReply/);
});

test('mailbox composer supports rich reply, reply-all, forward, and bounded attachments', () => {
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(mailService, /createReplyAll/);
  assert.match(mailService, /createForward/);
  assert.match(mailService, /fileAttachment/);
  assert.match(mailService, /normalizeMailboxAttachments/);
  assert.match(frontend, /mailbox-rich-editor/);
  assert.match(frontend, /mailboxFilesToPayload/);
  assert.match(frontend, /showMailboxReply\(message, detail, 'replyAll'\)/);
  assert.match(frontend, /showMailboxReply\(message, detail, 'forward'\)/);
  assert.match(frontend, /bodyWrap\.style\.display = 'none'/);
  assert.match(frontend, /composerObserver/);
});

test('mailbox message actions use compact Outlook-style reply, reply-all, and forward controls', () => {
  assert.match(frontend, /function mailboxActionButton/);
  assert.match(frontend, /mailboxActionButton\('Reply', '↩'/);
  assert.match(frontend, /mailboxActionButton\('Reply all', '↩↩'/);
  assert.match(frontend, /mailboxActionButton\('Forward', '↪'/);
  assert.match(frontend, /showMailboxReply\(message, detail, 'replyAll'\)/);
});

test('reply all exposes original CC recipients while excluding the shared mailbox itself', () => {
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(mailService, /dto\.replyAllCc/);
  assert.match(mailService, /message\?\.ccRecipients/);
  assert.match(mailService, /address\.toLowerCase\(\) !== self/);
  assert.match(frontend, /message\.replyAllCc/);
  assert.match(frontend, /Reply all recipients from the original email are included below/);
});

test('mailbox access is an assignable role permission with an admin-safe default', () => {
  const roleController = fs.readFileSync('backend/controllers/roleController.js', 'utf8');
  const migration = fs.readFileSync('backend/sql/016_mailbox_role_permissions.sql', 'utf8');
  assert.match(roleController, /view_mailbox/);
  assert.match(roleController, /send_mailbox/);
  assert.match(migration, /INSERT IGNORE INTO role_permissions/);
  assert.match(frontend, /view_mailbox: 'View Mailbox'/);
  assert.match(frontend, /send_mailbox: 'Send Mailbox Replies'/);
});

test('mailbox deletion is role-controlled and uses Microsoft 365 Deleted Items behavior', () => {
  const routes = fs.readFileSync('backend/routes/mailboxRoutes.js', 'utf8');
  const controller = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  const migration = fs.readFileSync('backend/sql/017_mailbox_delete_permission.sql', 'utf8');
  assert.match(routes, /router\.delete\('\/inbox\/:id', deleteMailboxMessage\)/);
  assert.match(controller, /delete_mailbox/);
  assert.match(mailService, /async function deleteInboxMessage/);
  assert.match(migration, /delete_mailbox/);
  assert.match(frontend, /deleteMailboxMessage/);
});

test('mailbox supports batch selection deletion and editable reply subjects', () => {
  assert.match(frontend, /selectedMailboxMessageIds/);
  assert.match(frontend, /deleteSelectedMailboxMessages/);
  const bulkDelete = frontend.match(/function deleteSelectedMailboxMessages\(\)[\s\S]*?function renderMailboxList/)?.[0] || '';
  const singleDelete = frontend.match(/function deleteMailboxMessage\(message, detail\)[\s\S]*?function mailboxActionButton/)?.[0] || '';
  assert.doesNotMatch(bulkDelete, /window\.confirm/);
  assert.doesNotMatch(singleDelete, /window\.confirm/);
  assert.match(bulkDelete, /mailboxMessages = mailboxMessages\.filter/);
  assert.match(singleDelete, /mailboxMessages = mailboxMessages\.filter/);
  assert.match(frontend, /toggleMailboxSelectAll/);
  assert.match(frontend, /subject\.placeholder = 'Subject'/);
  assert.doesNotMatch(frontend, /subject\.readOnly = true/);
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(mailService, /if \(options\.subject\) updates\.subject/);
});

test('new mailbox emails create permission-scoped bell notifications and mailbox uses the standard refresh icon', () => {
  const mailboxController = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const notificationService = fs.readFileSync('backend/services/notificationService.js', 'utf8');
  const markup = fs.readFileSync('index.html', 'utf8');
  const server = fs.readFileSync('backend/server.js', 'utf8');
  assert.match(mailboxController, /pollMailboxForNotifications/);
  assert.match(mailboxController, /setInterval\(pollMailboxForNotifications, 60000\)/);
  assert.match(notificationService, /function notifyMailboxUsers/);
  assert.match(notificationService, /rp\.permission_key = 'view_mailbox'/);
  assert.match(server, /startMailboxNotificationPolling\(\)/);
  assert.match(markup, /id="mailboxRefreshIcon"/);
  assert.doesNotMatch(markup, /onclick="loadMailbox\(\)">Refresh/);
  assert.match(frontend, /n\.type === 'mailbox'/);
});

test('mailbox converts bounded inline signature images into safe preview data URLs', () => {
  const mailService = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(mailService, /attachments`\)/);
  assert.match(mailService, /attachment\?\.isInline/);
  assert.match(mailService, /\^image\\\//);
  assert.match(mailService, /data:\$\{contentType\};base64/);
});

test('mailbox refreshes automatically while its page is open', () => {
  assert.match(frontend, /function startMailboxPolling\(\)/);
  assert.match(frontend, /loadMailbox\(\{ silent: true \}\)/);
  assert.match(frontend, /\}, 15000\);/);
  assert.match(frontend, /if \(page === 'mailbox'\) startMailboxPolling\(\)/);
  assert.match(frontend, /New mailbox email received:/);
});

test('frontend reports whether post-creation email was sent, failed, or skipped', () => {
  assert.match(frontend, /data\.data\.email\.sent/);
  assert.match(frontend, /email failed/);
  assert.match(frontend, /email not sent/);
});

test('reviewed recipients are validated and forwarded to the mail service', () => {
  assert.equal(cleanAddressList('one@example.com, two@example.com'), 'one@example.com,two@example.com');
  assert.equal(cleanAddressList('', ''), '');
  assert.throws(() => cleanAddressList('invalid-address'), /invalid/);
  assert.match(controller, /emailTo: b\.notification_email\?\.to \|\| req\.user\.email/);
  assert.match(controller, /emailCc: b\.notification_email\?\.cc === undefined \? INCIDENT_NOTIFICATION_CC/);
  assert.match(controller, /emailSubject: b\.notification_email\?\.subject/);
});

test('incident mail recipients default to the authenticated creator and operations CC', () => {
  assert.match(controller, /const INCIDENT_NOTIFICATION_CC = 'its24x7@magicsoftware\.com'/);
  assert.match(controller, /emailTo: b\.notification_email\?\.to \|\| req\.user\.email/);
  assert.match(controller, /emailCc: b\.notification_email\?\.cc === undefined \? INCIDENT_NOTIFICATION_CC/);
});

test('created and closed incident emails include the fixed operational BCC list', () => {
  assert.match(controller, /const INCIDENT_NOTIFICATION_BCC = 'prachi_palande@magicsoftware\.com,nikhil_kawade@magicsoftware\.com,shravani_bhosale@magicsoftware\.com,jidnyasa_patil@magicsoftware\.com'/);
  assert.equal((controller.match(/emailBcc: INCIDENT_NOTIFICATION_BCC/g) || []).length, 2);
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(service, /bcc: bcc \|\| undefined/);
  assert.match(service, /recipientXml\('BccRecipients', bcc\)/);
});

test('closing an incident sends one closure email only on the transition to Closed', () => {
  assert.match(controller, /sendIncidentClosedEmail/);
  assert.match(controller, /transitionedToClosed = closed && normalizeStatus\(current\.status\) !== 'closed'/);
  assert.match(controller, /if \(transitionedToClosed\)/);
  assert.match(controller, /emailTo: current\.creator_email \|\| req\.user\.email/);
  assert.match(controller, /emailCc: INCIDENT_NOTIFICATION_CC/);
});

test('closed email contains resolution metrics and the incident link', () => {
  const previousUrl = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = 'http://portal.example:5500';
  const email = incidentEmail({ emailType: 'closed', id: 'INC-1001', title: 'Recovered', severity: 'High', downtime: '12m', mttr: '10m', mttd: '2m', resolution: 'Service restarted' });
  assert.match(email.subject, /\[Closed\] INC-1001/);
  assert.match(email.html, /Incident Closed/);
  assert.match(email.html, /Downtime/);
  assert.match(email.html, /12m/);
  assert.match(email.html, /Service restarted/);
  assert.match(email.html, /Open Incident INC-1001/);
  if (previousUrl === undefined) delete process.env.PORTAL_BASE_URL;
  else process.env.PORTAL_BASE_URL = previousUrl;
});

test('mailbox compose mode is selected only from the message action icons', () => {
  const replyComposer = frontend.match(/function showMailboxReply\(message, detail, initialMode\) \{[\s\S]*?function updateMode\(\)/)?.[0] || '';
  assert.match(replyComposer, /var mode = \{ value: initialMode \|\| 'reply' \}; heading\.append\(label\);/);
  assert.doesNotMatch(replyComposer, /document\.createElement\('select'\)/);
});
