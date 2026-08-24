const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

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
  assert.match(frontend, /'its24x7@magicsoftware\.com'/);
  assert.match(frontend, /const to = \(document\.getElementById\('notificationEmailTo'\)/);
  assert.match(frontend, /const cc = \(document\.getElementById\('notificationEmailCc'\)/);
});

test('new incidents open preview before the backend POST', () => {
  const start = frontend.indexOf('function saveIncident()');
  const end = frontend.indexOf('// â”€â”€â”€ USERS', start);
  const implementation = frontend.slice(start, end);
  assert.ok(implementation.indexOf('showPreSendEmailPreview') < implementation.indexOf("API_BASE_URL + '/incidents'"));
});
