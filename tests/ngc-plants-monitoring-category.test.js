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

test('frontend: ngcPlantsMonitoringNotifyPreset uses a distinct, plant-category-aware subject/body template for the Running Tag No Data alert, with a <<plantId>> fallback', () => {
  assert.match(frontend, /if \(\/Boardline,\?\\s\*Main Belt or Line Running\/i\.test\(subject\)\) \{/);
  assert.match(frontend, /var plantId = ngcPlantsMonitoringPlantId\(message\) \|\| '<<plantId>>';/);
  assert.match(frontend, /var runningTagDescription = ngcRunningTagDescription\(plantId\);/);
  assert.match(frontend, /var runningTagSubject = '\[Alert\] ' \+ runningTagDescription \+ ' Data Not Received - ' \+ plantId;/);
  assert.match(frontend, /The ' \+ escapeMetricHtml\(runningTagDescription\) \+ ' tag is currently not receiving any data for 60 minutes or more, while other sensor data continues to arrive\./);
  assert.match(frontend, /<strong>Plant Name:<\/strong> ' \+ escapeMetricHtml\(plantId\)/);
  assert.match(frontend, /The alert will clear automatically once data transmission resumes\./);
  assert.match(frontend, /function ngcPlantsMonitoringPlantId\(message\) \{/);
  assert.match(frontend, /function ngcRunningTagDescription\(plantId\) \{/);
});

// Balanced-brace function extractor — a plain non-greedy regex stops at the
// first "\n}" it finds, which for a function with nested if-blocks is an
// inner brace, not the function's own closing one.
function extractFunction(src, name) {
  const startMarker = 'function ' + name + '(';
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('not found: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { i += 1; break; } }
  }
  return src.slice(start, i);
}

// Loads the real, unmodified NGC Plants Monitoring frontend functions into
// an isolated sandbox (a minimal document.createElement shim stands in for
// mailboxDecodeEntities's DOM dependency) so these tests exercise actual
// behavior, not just "does this regex/string exist in the source".
function loadNgcPlantsMonitoringFunctions() {
  const sandbox = { document: { createElement: () => ({ set innerHTML(v) { this._v = v; }, get value() { return this._v; } }) } };
  const fnSource = [
    extractFunction(frontend, 'mailboxDecodeEntities'),
    extractFunction(frontend, 'mailboxPlainText'),
    frontend.match(/var NGC_PLANTS_MONITORING_PLANT_ID_FALSE_POSITIVES = \[[^\]]*\];/)[0],
    extractFunction(frontend, 'ngcPlantsMonitoringPlantId'),
    frontend.match(/var NGC_RUNNING_TAG_PLANT_CATEGORIES = \{[\s\S]*?\n\};/)[0],
    extractFunction(frontend, 'ngcRunningTagDescription'),
    extractFunction(frontend, 'escapeMetricHtml'),
    extractFunction(frontend, 'ngcPlantsMonitoringCardWrap'),
    extractFunction(frontend, 'isResolvedOperationsEmail'),
    extractFunction(frontend, 'ngcPlantsMonitoringNotifyPreset'),
    'module.exports = { ngcPlantsMonitoringPlantId, ngcRunningTagDescription, ngcPlantsMonitoringNotifyPreset };'
  ].join('\n');
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('document', 'module', 'exports', fnSource)(sandbox.document, module, module.exports);
  return module.exports;
}

test('ngcPlantsMonitoringPlantId finds the Dimensions table value, skipping the Kusto query text that mentions the same field name', () => {
  const { ngcPlantsMonitoringPlantId } = loadNgcPlantsMonitoringFunctions();
  const realisticBody = '<div>Query: | extend Plant = tostring(customDimensions.PlantId) | where Plant != ""</div>'
    + '<h2>Dimensions</h2><table><tr><td>plantId</td><td>ATL2</td></tr></table>'
    + '<h2>Affected resource hierarchy</h2><div>Resource Group</div><a>ngcstagingrg</a>';
  assert.equal(ngcPlantsMonitoringPlantId({ body: realisticBody }), 'ATL2');

  // The query text alone (no real Dimensions row present) must not produce
  // a wrong-looking value — the known regression this test guards against.
  const queryOnlyBody = '<div>Query: | extend Plant = tostring(customDimensions.PlantId)</div>';
  assert.equal(ngcPlantsMonitoringPlantId({ body: queryOnlyBody }), null);

  assert.equal(ngcPlantsMonitoringPlantId({ body: '' }), null);
  assert.equal(ngcPlantsMonitoringPlantId({}), null);
});

test('ngcRunningTagDescription maps each plant list to its own tag description, and an unknown plant to the generic default', () => {
  const { ngcRunningTagDescription } = loadNgcPlantsMonitoringFunctions();
  assert.equal(ngcRunningTagDescription('APL'), 'Boardline Running');
  assert.equal(ngcRunningTagDescription('wlm'), 'Boardline Running'); // case-insensitive
  assert.equal(ngcRunningTagDescription('ATL2'), 'Line Running');
  assert.equal(ngcRunningTagDescription('JSP4'), 'Line Running');
  assert.equal(ngcRunningTagDescription('CIN'), 'Main Belt Running');
  assert.equal(ngcRunningTagDescription('JAX'), 'Main Belt Running');
  assert.equal(ngcRunningTagDescription('SOME-UNLISTED-PLANT'), 'Running Tag');
  assert.equal(ngcRunningTagDescription(''), 'Running Tag');
});

test('ngcPlantsMonitoringNotifyPreset builds the Running Tag No Data subject/body end-to-end, per plant category, matching the exact requested template', () => {
  const { ngcPlantsMonitoringNotifyPreset } = loadNgcPlantsMonitoringFunctions();
  const firedBoardlineSubject = "Alert 'Boardline, Main Belt or Line Running data has not been received for over 60 minutes, while other plant data is still coming in' was fired";
  const bodyWithPlant = (plant) => '<h2>Dimensions</h2><table><tr><td>plantId</td><td>' + plant + '</td></tr></table>';

  const ifpCase = ngcPlantsMonitoringNotifyPreset({ category: 'ngcplantsmonitoring', subject: firedBoardlineSubject, body: bodyWithPlant('ATL2') });
  assert.equal(ifpCase.subject, '[Alert] Line Running Data Not Received - ATL2');
  assert.match(ifpCase.bodyHtml, /The Line Running tag is currently not receiving any data for 60 minutes or more/);
  assert.match(ifpCase.bodyHtml, /<strong>Plant Name:<\/strong> ATL2/);

  const gypCase = ngcPlantsMonitoringNotifyPreset({ category: 'ngcplantsmonitoring', subject: firedBoardlineSubject, body: bodyWithPlant('APL') });
  assert.equal(gypCase.subject, '[Alert] Boardline Running Data Not Received - APL');
  assert.match(gypCase.bodyHtml, /The Boardline Running tag is currently not receiving any data for 60 minutes or more/);

  const cemCase = ngcPlantsMonitoringNotifyPreset({ category: 'ngcplantsmonitoring', subject: firedBoardlineSubject, body: bodyWithPlant('CIN') });
  assert.equal(cemCase.subject, '[Alert] Main Belt Running Data Not Received - CIN');
  assert.match(cemCase.bodyHtml, /The Main Belt Running tag is currently not receiving any data for 60 minutes or more/);

  // No Dimensions table present at all — the <<plantId>> placeholder must
  // appear rather than a wrong/blank value, and the description falls back
  // to the generic "Running Tag" since the plant could not be identified.
  const unknownCase = ngcPlantsMonitoringNotifyPreset({ category: 'ngcplantsmonitoring', subject: firedBoardlineSubject, body: '<div>no plant info here</div>' });
  assert.equal(unknownCase.subject, '[Alert] Running Tag Data Not Received - <<plantId>>');
  assert.match(unknownCase.bodyHtml, /The Running Tag tag is currently not receiving any data for 60 minutes or more/);

  // Same requested To/CC recipients regardless of which plant/category fired.
  assert.equal(ifpCase.to, 'matthewp@nationalgypsum.com,billb@nationalgypsum.com,dimpalp@nationalgypsum.com');
  assert.equal(ifpCase.cc, 'Rohan_Vikhe@magicsoftware.com,jaiprakash_prajapati@magicsoftware.com,Mayur_Jaipurkar@magicsoftware.com');
});

test('frontend: the compose panel prefills recipients/subject/body from the NGC preset, and a Notify Customer button opens it', () => {
  assert.match(frontend, /var ngcPreset = initialMode === 'forward' \? null : ngcPlantsMonitoringNotifyPreset\(message\);/);
  assert.match(frontend, /if \(ngcPreset\) to\.value = ngcPreset\.to;/);
  assert.match(frontend, /cc\.value = ngcPreset \? ngcPreset\.cc : historianRecipients/);
  assert.match(frontend, /subject\.value = ngcPreset \? ngcPreset\.subject :/);
  assert.match(frontend, /if \(ngcPreset\) editor\.innerHTML = ngcPreset\.bodyHtml;/);
  assert.match(frontend, /hasMailboxPermission\('send_mailbox'\) && ngcPlantsMonitoringNotifyPreset\(message\)\) \{ var notifyCustomer[\s\S]{0,400}textContent = 'Notify Customer';/);
});
