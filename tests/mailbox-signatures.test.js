'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = (file) => fs.readFileSync(file, 'utf8');

test('mailbox signatures are persistent, one-per-user, and isolated by authenticated user id', () => {
  const migration = read('backend/sql/029_user_email_signatures.sql');
  const controller = read('backend/controllers/mailboxController.js');
  assert.match(migration, /UNIQUE KEY uq_user_email_signatures_user \(user_id\)/);
  assert.match(migration, /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(controller, /WHERE user_id = \? LIMIT 1', \[req\.user\.id\]/);
  assert.match(controller, /VALUES \(\?, \?\).*\[req\.user\.id, html\]/);
  assert.match(controller, /DELETE FROM user_email_signatures WHERE user_id = \?', \[req\.user\.id\]/);
  assert.match(controller, /sanitizeMailboxReplyHtml\(req\.body\?\.html, 500000\)/);
  assert.match(controller, /html\.length > 500000/);
});

test('signature administration is backend-admin-only and signatures remain opt-in in manual mail', () => {
  const routes = read('backend/routes/mailboxRoutes.js');
  const controller = read('backend/controllers/mailboxController.js');
  assert.match(routes, /router\.get\('\/signatures', listMailboxSignatures\)/);
  assert.match(routes, /router\.delete\('\/signatures\/:userId', deleteMailboxSignatureAsAdmin\)/);
  assert.match(controller, /if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(controller, /withUserSignature\(req\.user\.id, req\.body\)/);
  assert.match(controller, /Signature insertion is opt-in/);
  assert.match(controller, /signature_html/);
});

test('Operations offers an opt-in signature control for each manual compose editor', () => {
  const ui = read('js/app.js');
  assert.match(ui, /openMailboxSignatureManager/);
  assert.match(ui, /\/mailbox\/signature/);
  assert.match(ui, /appendMailboxSignature\(editor\)/);
  assert.match(ui, /data-aoc-user-signature/);
  assert.match(ui, /Signature/);
  assert.match(ui, /Add saved signature/);
  assert.match(ui, /data-view-signature/);
  assert.match(ui, /Saved signature preview/);
  assert.match(ui, /appendMailboxSignature\(document\.getElementById\('notificationEmailBody'\)\)/);
  assert.doesNotMatch(ui, /document\.addEventListener\('focusin'[\s\S]*appendMailboxSignature/);
});

test('signature editor uses a readable email-canvas preview in both portal themes', () => {
  const styles = read('css/styles.css');
  assert.match(styles, /#mailboxSignatureEditor \{ color:#172033; background:#fff/);
});
