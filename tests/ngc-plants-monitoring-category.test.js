'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const emailServiceSource = fs.readFileSync(path.join(root, 'backend', 'services', 'emailService.js'), 'utf8');
const classification = require(path.join(root, 'backend', 'services', 'operationsMailClassificationService.js'));

test('NGC Plants Monitoring is registered as its own sidebar category, scoped to the Azure sender', () => {
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcplantsmonitoring.key, 'ngcplantsmonitoring');
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcplantsmonitoring.label, 'NGC Plants Monitoring');
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcplantsmonitoring.sender, 'azure-noreply@microsoft.com');
});

// Regression test for the bug this feature actually shipped with: the
// category key must be the same string normalizedOperationsCategory()
// produces (it lowercases the incoming value before the hasOwnProperty
// lookup), otherwise ?category=ngcPlantsMonitoring silently falls back to
// 'all' and the "category" shows every message in the inbox unfiltered.
test('normalizedOperationsCategory recognizes the NGC category regardless of the caller\'s casing', () => {
  assert.equal(classification.normalizedOperationsCategory('ngcplantsmonitoring'), 'ngcplantsmonitoring');
  assert.equal(classification.normalizedOperationsCategory('ngcPlantsMonitoring'), 'ngcplantsmonitoring');
  assert.equal(classification.normalizedOperationsCategory('NGCPLANTSMONITORING'), 'ngcplantsmonitoring');
});

test('ngcPlantsMonitoringAlertState recognizes both exact subject variants, straight or curly quotes', () => {
  assert.equal(classification.ngcPlantsMonitoringAlertState("Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired"), 'fired');
  assert.equal(classification.ngcPlantsMonitoringAlertState("Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was resolved"), 'resolved');
  assert.equal(classification.ngcPlantsMonitoringAlertState('Alert ’NGC Monitoring - KF LIMAB Caliper Average Not Found’ was fired'), 'fired');
  // Reply/forward prefixes must not block the match.
  assert.equal(classification.ngcPlantsMonitoringAlertState("Re: Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired"), 'fired');
  assert.equal(classification.ngcPlantsMonitoringAlertState("FW: Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was resolved"), 'resolved');
});

test('ngcPlantsMonitoringAlertState rejects unrelated or partially-matching subjects', () => {
  assert.equal(classification.ngcPlantsMonitoringAlertState("Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was something else"), null);
  assert.equal(classification.ngcPlantsMonitoringAlertState('Azure: Activated Severity: Sev2 XPI_ProjectStatus'), null);
  assert.equal(classification.ngcPlantsMonitoringAlertState(''), null);
});

test('classifyOperationsMessage routes matching Azure subjects to ngcplantsmonitoring, leaving other Azure alerts under azure', () => {
  const ngcFired = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired" });
  assert.equal(ngcFired.category, 'ngcplantsmonitoring');

  const ngcResolved = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was resolved" });
  assert.equal(ngcResolved.category, 'ngcplantsmonitoring');

  const otherAzure = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: 'Azure: Activated Severity: Sev2 XPI_ProjectStatus' });
  assert.equal(otherAzure.category, 'azure');

  const coralogixAlert = classification.classifyOperationsMessage({ from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / All Customers - Workspace is down' });
  assert.equal(coralogixAlert.category, 'coralogix');

  // A different sender using the same subject text must not match.
  const spoofedSender = classification.classifyOperationsMessage({ from: 'someone-else@example.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired" });
  assert.notEqual(spoofedSender.category, 'ngcplantsmonitoring');
});

test('backend: the Graph filter, client-side scan and unread-count paths all cover ngcplantsmonitoring', () => {
  assert.match(emailServiceSource, /if \(category === 'ngcplantsmonitoring'\) return "from\/emailAddress\/address eq 'azure-noreply@microsoft\.com' and contains\(subject,'NGC Monitoring - KF LIMAB Caliper Average Not Found'\)"/);
  assert.match(emailServiceSource, /selectedCategory === 'ngcplantsmonitoring'/);
  assert.match(emailServiceSource, /const categories = \['coralogix', 'azure', 'ngcplantsmonitoring', 'jira'\];/);
});

test('frontend: the sidebar, view whitelist, label map and count-badge loader all know about ngcplantsmonitoring', () => {
  assert.match(frontend, /view\('ngcplantsmonitoring', 'NGC Plants Monitoring'\)/);
  assert.match(frontend, /\['all', 'coralogix', 'azure', 'ngcplantsmonitoring', 'jira', 'sent'\]\.indexOf\(view\)/);
  assert.match(frontend, /ngcplantsmonitoring: 'NGC Plants Monitoring'/);
  assert.match(frontend, /\['coralogix', 'azure', 'ngcplantsmonitoring', 'jira'\]\.forEach/);
});

test('frontend: Create Incident is unconditionally unavailable for ngcplantsmonitoring messages', () => {
  assert.match(frontend, /if \(message\.category === 'ngcplantsmonitoring'\) return false;/);
});

test('frontend: ngcPlantsMonitoringNotifyPreset only fires for a non-resolved ngcplantsmonitoring message, with the exact requested recipients and body text', () => {
  assert.match(frontend, /function ngcPlantsMonitoringNotifyPreset\(message\) \{/);
  assert.match(frontend, /message\.category !== 'ngcplantsmonitoring' \|\| isResolvedOperationsEmail\(message\)\) return null;/);
  assert.match(frontend, /to: 'matthewp@nationalgypsum\.com,billb@nationalgypsum\.com,dimpalp@nationalgypsum\.com'/);
  assert.match(frontend, /cc: 'Rohan_Vikhe@magicsoftware\.com,jaiprakash_prajapati@magicsoftware\.com,Mayur_Jaipurkar@magicsoftware\.com'/);
  assert.match(frontend, /The KF LIMAB Caliper Average tag is currently not receiving any data from the following plants:/);
  assert.match(frontend, /<li>BAL2<\/li><li>MED2<\/li><li>RIC<\/li><li>SAV<\/li><li>WLM<\/li>/);
  assert.match(frontend, /no new data is received from the KF LIMAB Caliper Average tag for 120 minutes\./);
});

test('frontend: the compose panel prefills recipients/subject/body from the NGC preset, and a Notify Customer button opens it', () => {
  assert.match(frontend, /var ngcPreset = initialMode === 'forward' \? null : ngcPlantsMonitoringNotifyPreset\(message\);/);
  assert.match(frontend, /if \(ngcPreset\) to\.value = ngcPreset\.to;/);
  assert.match(frontend, /cc\.value = ngcPreset \? ngcPreset\.cc : historianRecipients/);
  assert.match(frontend, /subject\.value = ngcPreset \? ngcPreset\.subject :/);
  assert.match(frontend, /if \(ngcPreset\) editor\.innerHTML = ngcPreset\.bodyHtml;/);
  assert.match(frontend, /hasMailboxPermission\('send_mailbox'\) && ngcPlantsMonitoringNotifyPreset\(message\)\) \{ var notifyCustomer[\s\S]{0,400}textContent = 'Notify Customer';/);
});
