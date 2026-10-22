'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const emailServiceSource = fs.readFileSync(path.join(root, 'backend', 'services', 'emailService.js'), 'utf8');
const classification = require(path.join(root, 'backend', 'services', 'operationsMailClassificationService'));

test('isIgnoredOperationsAlert matches both not-yet-production-ready Azure alert types, any quote/dash style, fired or resolved', () => {
  const sender = 'azure-noreply@microsoft.com';
  assert.equal(classification.isIgnoredOperationsAlert(sender, "Alert 'Error – Product code not found, last product code found' was fired"), true);
  assert.equal(classification.isIgnoredOperationsAlert(sender, 'Alert ’Error – Product code not found, last product code found’ was resolved'), true);
  assert.equal(classification.isIgnoredOperationsAlert(sender, "Alert 'Error - Effective Unprocessed Blob Count >= 20' was fired"), true);
  assert.equal(classification.isIgnoredOperationsAlert(sender, 'Alert ’Error – Effective Unprocessed Blob Count ≥ 20’ was resolved'), true);
});

test('isIgnoredOperationsAlert requires the Azure sender and leaves unrelated Azure subjects alone', () => {
  const sender = 'azure-noreply@microsoft.com';
  assert.equal(classification.isIgnoredOperationsAlert(sender, 'Azure: Activated Severity: Sev2 XPI_ProjectStatus'), false);
  assert.equal(classification.isIgnoredOperationsAlert(sender, "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired"), false);
  // Same subject text from a different sender must not match.
  assert.equal(classification.isIgnoredOperationsAlert('someone-else@example.com', "Alert 'Error – Product code not found, last product code found' was fired"), false);
});

test('classifyOperationsMessage tags ignored alerts with a reserved category not exposed as a sidebar view', () => {
  const ignored = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'Error – Product code not found, last product code found' was fired" });
  assert.equal(ignored.category, 'ignored');
  // Never a real sidebar/query category — normalizing it falls back to 'all'.
  assert.equal(classification.normalizedOperationsCategory('ignored'), 'all');
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ignored, undefined);
});

test('backend: the ignored-category messages are filtered out of every mailbox listing, including All Incoming', () => {
  assert.match(emailServiceSource, /const visibleMessages = rawMessages\.filter\(\(message\) => message\.category !== 'ignored'\);/);
  assert.match(emailServiceSource, /const messages = selectedCategory === 'all' \|\| folder !== 'inbox' \? visibleMessages : visibleMessages\.filter/);
});

test('backend: the Azure Alerts unread-count filter excludes every ignored alert name fragment', () => {
  assert.match(emailServiceSource, /if \(category === 'azure'\) return `from\/emailAddress\/address eq 'azure-noreply@microsoft\.com' and \$\{IGNORED_AZURE_ALERT_NAME_FRAGMENTS\.map\(\(fragment\) => `not contains\(subject,'\$\{fragment\}'\)`\)\.join\(' and '\)\}`;/);

  // Evaluate the same template the source builds, against the real fragment
  // list, so a future edit to the fragment list is covered without needing
  // to touch this test.
  const filter = `from/emailAddress/address eq 'azure-noreply@microsoft.com' and ${classification.IGNORED_AZURE_ALERT_NAME_FRAGMENTS.map((fragment) => `not contains(subject,'${fragment}')`).join(' and ')}`;
  assert.match(filter, /not contains\(subject,'Product code not found, last product code found'\)/);
  assert.match(filter, /not contains\(subject,'Effective Unprocessed Blob Count'\)/);
});
