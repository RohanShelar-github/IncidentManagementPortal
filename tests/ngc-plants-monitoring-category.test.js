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
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcPlantsMonitoring.key, 'ngcPlantsMonitoring');
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcPlantsMonitoring.label, 'NGC Plants Monitoring');
  assert.equal(classification.OPERATIONS_MAIL_CATEGORIES.ngcPlantsMonitoring.sender, 'azure-noreply@microsoft.com');
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

test('classifyOperationsMessage routes matching Azure subjects to ngcPlantsMonitoring, leaving other Azure alerts under azure', () => {
  const ngcFired = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired" });
  assert.equal(ngcFired.category, 'ngcPlantsMonitoring');

  const ngcResolved = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was resolved" });
  assert.equal(ngcResolved.category, 'ngcPlantsMonitoring');

  const otherAzure = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: 'Azure: Activated Severity: Sev2 XPI_ProjectStatus' });
  assert.equal(otherAzure.category, 'azure');

  // A different sender using the same subject text must not match.
  const spoofedSender = classification.classifyOperationsMessage({ from: 'someone-else@example.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired" });
  assert.notEqual(spoofedSender.category, 'ngcPlantsMonitoring');
});

test('backend: the Graph filter, client-side scan and unread-count paths all cover ngcPlantsMonitoring', () => {
  assert.match(emailServiceSource, /if \(category === 'ngcPlantsMonitoring'\) return "from\/emailAddress\/address eq 'azure-noreply@microsoft\.com' and contains\(subject,'NGC Monitoring - KF LIMAB Caliper Average Not Found'\)"/);
  assert.match(emailServiceSource, /selectedCategory === 'ngcPlantsMonitoring'/);
  assert.match(emailServiceSource, /const categories = \['coralogix', 'azure', 'ngcPlantsMonitoring', 'jira'\];/);
});

test('frontend: the sidebar, view whitelist, label map and count-badge loader all know about ngcPlantsMonitoring', () => {
  assert.match(frontend, /view\('ngcPlantsMonitoring', 'NGC Plants Monitoring'\)/);
  assert.match(frontend, /\['all', 'coralogix', 'azure', 'ngcPlantsMonitoring', 'jira', 'sent'\]\.indexOf\(view\)/);
  assert.match(frontend, /ngcPlantsMonitoring: 'NGC Plants Monitoring'/);
  assert.match(frontend, /\['coralogix', 'azure', 'ngcPlantsMonitoring', 'jira'\]\.forEach/);
});

test('frontend: Create Incident is unconditionally unavailable for ngcPlantsMonitoring messages', () => {
  assert.match(frontend, /if \(message\.category === 'ngcPlantsMonitoring'\) return false;/);
});

test('frontend: ngcPlantsMonitoringNotifyPreset only fires for a non-resolved ngcPlantsMonitoring message, with the exact requested recipients and body text', () => {
  assert.match(frontend, /function ngcPlantsMonitoringNotifyPreset\(message\) \{/);
  assert.match(frontend, /message\.category !== 'ngcPlantsMonitoring' \|\| isResolvedOperationsEmail\(message\)\) return null;/);
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
