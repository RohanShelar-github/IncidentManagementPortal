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

// Azure alerts are now split between Azure Alerts and NGC Plants Monitoring
// by the Resource Group named in the alert body (not subject text, since
// different alert types sharing a resource group have unrelated subjects).
test('extractAzureResourceGroup reads the Resource Group label out of the body, independent of subject', () => {
  assert.equal(classification.extractAzureResourceGroup('<div>Resource Group</div><a href="#">ngcrg</a>'), 'ngcrg');
  assert.equal(classification.extractAzureResourceGroup('<div>Resource Group</div><a href="#">ngcstagingrg</a>'), 'ngcstagingrg');
  assert.equal(classification.extractAzureResourceGroup('Resource Group: NGCRG'), 'ngcrg');
  assert.equal(classification.extractAzureResourceGroup('no resource info here'), null);
  assert.equal(classification.extractAzureResourceGroup(''), null);
});

test('classifyOperationsMessage routes Azure alerts by Resource Group: ngcrg to azure, ngcstagingrg to ngcplantsmonitoring', () => {
  const ngcrgAlert = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'Redis Container Instance Restarted' was resolved", body: '<div>Resource Group</div><a>ngcrg</a>' });
  assert.equal(ngcrgAlert.category, 'azure');

  const stagingAlert = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'NGC Monitoring - KF LIMAB Caliper Average Not Found' was fired", body: '<div>Resource Group</div><a>ngcstagingrg</a>' });
  assert.equal(stagingAlert.category, 'ngcplantsmonitoring');

  // Same subject/resource-group text, different alert type entirely —
  // membership follows the resource group, not the alert's own name.
  const stagingOtherAlert = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: "Alert 'Boardline, Main Belt or Line Running data has not been received for over 60 minutes, while other plant data is still coming in' was fired", body: '<div>Resource Group</div><a>ngcstagingrg</a>' });
  assert.equal(stagingOtherAlert.category, 'ngcplantsmonitoring');

  // An unknown/missing resource group fails open to the default Azure bucket
  // rather than hiding the alert.
  const unknownRg = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: 'Azure: Activated Severity: Sev2 XPI_ProjectStatus', body: '<div>Resource Group</div><a>some-other-rg</a>' });
  assert.equal(unknownRg.category, 'azure');
  const noRg = classification.classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: 'Azure: Activated Severity: Sev2 XPI_ProjectStatus', body: '' });
  assert.equal(noRg.category, 'azure');

  const coralogixAlert = classification.classifyOperationsMessage({ from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / All Customers - Workspace is down' });
  assert.equal(coralogixAlert.category, 'coralogix');

  // A different sender with the same body text must not match.
  const spoofedSender = classification.classifyOperationsMessage({ from: 'someone-else@example.com', subject: 'Some alert', body: '<div>Resource Group</div><a>ngcstagingrg</a>' });
  assert.notEqual(spoofedSender.category, 'ngcplantsmonitoring');
});

test('backend: full message body is fetched and forwarded into classification so Resource Group is visible even for list views', () => {
  assert.match(emailServiceSource, /const MAILBOX_SELECT_FIELDS = '[^']*\bbody\b[^']*\bbodyPreview\b[^']*';/);
  assert.match(emailServiceSource, /Object\.assign\(dto, classifyOperationsMessage\(\{ \.\.\.dto, body: rawBody \}\)\);/);
});

test('backend: the ngcplantsmonitoring unread badge is computed by a bounded body-classifying scan, since Graph cannot $filter on body content', () => {
  assert.match(emailServiceSource, /async function countUnreadNgcPlantsMonitoringMessages\(\) \{/);
  assert.match(emailServiceSource, /message\.category === 'ngcplantsmonitoring' && !message\.isRead/);
  assert.match(emailServiceSource, /countUnreadNgcPlantsMonitoringMessages\(\)/);
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

test('frontend: ngcPlantsMonitoringNotifyPreset uses a distinct subject/body template for the Boardline/Main Belt alert, with a <<plantId>> fallback', () => {
  assert.match(frontend, /if \(\/Boardline,\?\\s\*Main Belt or Line Running\/i\.test\(subject\)\) \{/);
  assert.match(frontend, /var plantId = ngcPlantsMonitoringPlantId\(message\) \|\| '<<plantId>>';/);
  assert.match(frontend, /subject: 'Boardline, Main Belt or Line Running Data Not Received',/);
  assert.match(frontend, /The Boardline \/ Main Belt \/ Line Running tag is currently not receiving any data for 60 minutes or more, while other sensor data continues to arrive\./);
  assert.match(frontend, /<strong>Plant Name:<\/strong> ' \+ escapeMetricHtml\(plantId\)/);
  assert.match(frontend, /The alert will clear automatically once data transmission resumes\./);
  assert.match(frontend, /function ngcPlantsMonitoringPlantId\(message\) \{/);
});

// Regression test: Azure alert bodies for this rule embed the underlying
// Kusto query text (e.g. "Plant = tostring(customDimensions.PlantId)"), and
// a naive "label = value" search captured "tostring" (a Kusto function name)
// as if it were the real plant value, inserting it into the customer email.
test('frontend: ngcPlantsMonitoringPlantId rejects Kusto query-syntax false positives instead of returning a wrong-looking value', () => {
  assert.match(frontend, /var NGC_PLANTS_MONITORING_PLANT_ID_FALSE_POSITIVES = \[[^\]]*'tostring'[^\]]*\];/);
  assert.match(frontend, /\{0,19\}\)\(\?!\\\(\)\/i,/);
  assert.match(frontend, /NGC_PLANTS_MONITORING_PLANT_ID_FALSE_POSITIVES\.indexOf\(match\[1\]\.toLowerCase\(\)\) === -1/);
});

test('frontend: the compose panel prefills recipients/subject/body from the NGC preset, and a Notify Customer button opens it', () => {
  assert.match(frontend, /var ngcPreset = initialMode === 'forward' \? null : ngcPlantsMonitoringNotifyPreset\(message\);/);
  assert.match(frontend, /if \(ngcPreset\) to\.value = ngcPreset\.to;/);
  assert.match(frontend, /cc\.value = ngcPreset \? ngcPreset\.cc : historianRecipients/);
  assert.match(frontend, /subject\.value = ngcPreset \? ngcPreset\.subject :/);
  assert.match(frontend, /if \(ngcPreset\) editor\.innerHTML = ngcPreset\.bodyHtml;/);
  assert.match(frontend, /hasMailboxPermission\('send_mailbox'\) && ngcPlantsMonitoringNotifyPreset\(message\)\) \{ var notifyCustomer[\s\S]{0,400}textContent = 'Notify Customer';/);
});
