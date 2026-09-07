const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
const recipientDirectoryMigration = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'sql', '033_email_recipient_directory.sql'), 'utf8');

test('pre-send email preview allows recipients, subject, and body to be edited', () => {
  assert.match(frontend, /id="notificationEmailTo"/);
  assert.match(frontend, /id="notificationEmailCc"/);
  assert.doesNotMatch(frontend, /id="notificationEmailTo"[^>]*readonly/);
  assert.doesNotMatch(frontend, /id="notificationEmailCc"[^>]*readonly/);
  assert.match(frontend, /id="notificationEmailSubject"/);
  assert.match(frontend, /id="notificationEmailBody"/);
  assert.match(frontend, /Create Incident &amp; Send Email/);
});

test('generated subject and body remain editable defaults', () => {
  assert.match(frontend, /const defaultSubject = `\[\$\{inc\.severity\}\]/);
  assert.match(frontend, /const defaultBody = `Hi \$\{assigneeFirst\}/);
  assert.match(frontend, /notificationEmailSubject \|\| defaultSubject/);
  assert.match(frontend, /notificationEmailBody \|\| defaultBody/);
});

test('generated email body includes the incident description', () => {
  assert.match(frontend, /const incidentDescription = inc\.description \|\| inc\.desc \|\| 'Not provided'/);
  assert.match(frontend, /Description: \$\{incidentDescription\}/);
});

test('confirmation validates recipients and subject, then submits the optional note', () => {
  assert.match(frontend, /pendingIncidentEmail = \{ to, cc, subject, body \}/);
  assert.match(frontend, /notification_email: pendingIncidentEmail/);
  assert.match(frontend, /validEmailList\(to, true\)/);
  assert.match(frontend, /Email subject cannot be empty/);
  assert.match(frontend, /Additional message \(optional\)/);
});

test('preview uses editable recipient chips with authenticated creator and operations defaults', () => {
  assert.match(frontend, /id="notificationEmailToChips"/);
  assert.match(frontend, /id="notificationEmailCcChips"/);
  assert.match(frontend, /id="notificationEmailToInput"/);
  assert.match(frontend, /id="notificationEmailCcInput"/);
  assert.match(frontend, /function addPreSendRecipient\(group\)/);
  assert.match(frontend, /function removePreSendRecipient\(group, index\)/);
  assert.match(frontend, /currentUserProfile\.email \|\| ''/);
  assert.match(frontend, /its24x7@magicsoftware\.com,cloudopssupport@magicsoftware\.com/);
  assert.match(frontend, /cloudopssupport@magicsoftware\.com/);
  assert.match(frontend, /const to = \(document\.getElementById\('notificationEmailTo'\)/);
  assert.match(frontend, /const cc = \(document\.getElementById\('notificationEmailCc'\)/);
});

test('Notification Preview supports shared email suggestions and drag-and-drop between To and CC', () => {
  assert.match(frontend, /function preSendRecipientDirectory\(\)/);
  assert.match(frontend, /function loadRecipientDirectory\(callback\)/);
  assert.match(frontend, /\/incidents\/recipient-directory/);
  assert.match(frontend, /Searching known email addresses/);
  assert.match(frontend, /Array\.isArray\(users\)/);
  assert.match(frontend, /function showPreSendRecipientSuggestions\(group\)/);
  assert.match(frontend, /entry\.email\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(frontend, /menu\.style\.display = 'block';/);
  assert.match(frontend, /function bindPreSendRecipientDragAndDrop\(\)/);
  assert.match(frontend, /draggable="true"/);
  assert.match(frontend, /function movePreSendRecipientToGroup\(targetGroup\)/);
  assert.match(frontend, /Drag a recipient between To and CC/);
});

test('recipient suggestions use the dedicated database address book', () => {
  assert.match(recipientDirectoryMigration, /CREATE TABLE IF NOT EXISTS email_recipient_directory/);
  assert.match(recipientDirectoryMigration, /INSERT INTO email_recipient_directory/);
  assert.match(recipientDirectoryMigration, /033_email_recipient_directory/);
  const syncScript = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'scripts', 'sync-recipient-directory.js'), 'utf8');
  assert.match(syncScript, /customer_email_recipient_configs/);
  assert.match(syncScript, /is_customer_recipient = 1/);
});

test('NGC Historian mail pre-fills the required recipients for every severity while keeping them editable', () => {
  assert.match(frontend, /function historianMailRecipientPreset\(inc\)/);
  assert.match(frontend, /customer !== 'ngc' \|\| project !== 'historian' \|\| area !== 'historian'/);
  assert.match(frontend, /ServiceDesk@NationalGypsum\.com/);
  assert.match(frontend, /BillB@NationalGypsum\.com/);
  assert.match(frontend, /MatthewP@NationalGypsum\.com/);
  assert.match(frontend, /RyanSa@NationalGypsum\.com/);
  assert.match(frontend, /dimpalp@nationalgypsum\.com/);
  assert.match(frontend, /jkaplan@magicsoftware\.com/);
  assert.match(frontend, /cloudopssupport@magicsoftware\.com/);
  assert.match(frontend, /const recipientConfig = historianRecipients \|\| config/);
  assert.match(frontend, /You may edit the draft before sending/);
});

test('new incidents open preview before the backend POST', () => {
  const start = frontend.indexOf('function saveIncident()');
  const end = frontend.indexOf('// â”€â”€â”€ USERS', start);
  const implementation = frontend.slice(start, end);
  assert.ok(implementation.indexOf('showPreSendEmailPreview') < implementation.indexOf("API_BASE_URL + '/incidents'"));
});
