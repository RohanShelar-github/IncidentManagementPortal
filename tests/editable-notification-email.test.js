const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('post-creation email preview has editable subject and body fields', () => {
  assert.match(frontend, /id="notificationEmailSubject"/);
  assert.match(frontend, /id="notificationEmailBody"/);
  assert.match(frontend, /Save Email Draft/);
});

test('generated subject and body remain editable defaults', () => {
  assert.match(frontend, /const defaultSubject = `\[\$\{inc\.severity\}\]/);
  assert.match(frontend, /const defaultBody = `Hi \$\{assigneeFirst\}/);
  assert.match(frontend, /notificationEmailSubject \|\| defaultSubject/);
  assert.match(frontend, /notificationEmailBody \|\| defaultBody/);
});

test('saving updates only email draft fields on the incident', () => {
  assert.match(frontend, /incident\.notificationEmailSubject = subject/);
  assert.match(frontend, /incident\.notificationEmailBody = body/);
  assert.match(frontend, /Email subject and body cannot be empty/);
});
