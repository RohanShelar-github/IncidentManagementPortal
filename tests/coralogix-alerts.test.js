'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const coralogixRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'coralogixRoutes.js'), 'utf8');
const coralogixController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'coralogixController.js'), 'utf8');
const coralogixServiceSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'coralogixService.js'), 'utf8');
const schedulerSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'coralogixSnoozeScheduler.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const roleController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'roleController.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '051_coralogix_alert_management.sql'), 'utf8');
const coralogixService = require(path.join(root, 'backend', 'services', 'coralogixService.js'));

test('the migration adds manage_coralogix_alerts (admin only) and a coralogix_alert_snoozes table whose row presence is the sole signal the scheduler acts on', () => {
  assert.match(migration, /INSERT INTO permissions\(permission_key, permission_name\) VALUES\s*\n\('manage_coralogix_alerts', 'Manage Coralogix Alerts'\)/);
  assert.match(migration, /SELECT r\.id, 'manage_coralogix_alerts' FROM roles r WHERE r\.role_key IN \('admin'\);/);
  assert.doesNotMatch(migration, /'admin', '(cso|pmo|aoc|engineer|stakeholder)'/, 'must be admin-only, not also granted to another role');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS coralogix_alert_snoozes \(/);
  assert.match(migration, /alert_id VARCHAR\(64\) NOT NULL PRIMARY KEY,/);
  assert.match(migration, /snoozed_until DATETIME NOT NULL,/);
});

test('roleController validates manage_coralogix_alerts as a real permission key, and Role Management has a checkbox for it', () => {
  assert.match(roleController, /'manage_coralogix_alerts'/);
  assert.match(html, /<input type="checkbox" value="manage_coralogix_alerts"\/> Manage Coralogix Alerts/);
});

test('the Coralogix routes are mounted and every route is gated behind manage_coralogix_alerts', () => {
  assert.match(server, /const coralogixRoutes = require\('\.\/routes\/coralogixRoutes'\);/);
  assert.match(server, /app\.use\('\/api\/coralogix', coralogixRoutes\);/);
  assert.match(coralogixRoutes, /router\.use\(authenticateToken\);/);
  assert.match(coralogixRoutes, /router\.get\('\/alerts', requirePermission\('manage_coralogix_alerts'\), getAlerts\);/);
  assert.match(coralogixRoutes, /router\.get\('\/alerts\/:id', requirePermission\('manage_coralogix_alerts'\), getAlert\);/);
  assert.match(coralogixRoutes, /router\.post\('\/alerts\/:id\/snooze', requirePermission\('manage_coralogix_alerts'\), postSnooze\);/);
  assert.match(coralogixRoutes, /router\.post\('\/alerts\/:id\/unsnooze', requirePermission\('manage_coralogix_alerts'\), postUnsnooze\);/);
  assert.match(coralogixRoutes, /router\.put\('\/alerts\/:id', requirePermission\('manage_coralogix_alerts'\), putAlertDetails\);/);
});

test('the snooze scheduler is started alongside the mailbox poller, polls every 60 seconds, and only ever acts on rows this app itself created (never re-enabling an alert a human disabled directly in Coralogix)', () => {
  assert.match(server, /const \{ startCoralogixSnoozeScheduler \} = require\('\.\/services\/coralogixSnoozeScheduler'\);/);
  assert.match(server, /startCoralogixSnoozeScheduler\(\);/);
  assert.match(schedulerSrc, /const POLL_INTERVAL_MS = 60 \* 1000;/);
  assert.match(schedulerSrc, /SELECT alert_id FROM coralogix_alert_snoozes WHERE snoozed_until <= NOW\(\)/);
  assert.match(schedulerSrc, /DELETE FROM coralogix_alert_snoozes WHERE alert_id = \?/);
});

test('only three snooze durations are offered (60/180/1440 minutes — 1h/3h/24h), matching Coralogix\'s own UI presets, per explicit request', () => {
  assert.match(coralogixController, /const SNOOZE_DURATIONS_MINUTES = new Set\(\[60, 180, 1440\]\);/);
  assert.match(coralogixController, /if \(!SNOOZE_DURATIONS_MINUTES\.has\(durationMinutes\)\)/);
});

test('coralogixService read functions return a safe empty value (never throw) when Coralogix is not configured', async () => {
  const saved = { key: process.env.CORALOGIX_API_KEY, domain: process.env.CORALOGIX_DOMAIN };
  delete process.env.CORALOGIX_API_KEY; delete process.env.CORALOGIX_DOMAIN;
  try {
    assert.equal(coralogixService.coralogixConfigured(), false);
    assert.deepEqual(await coralogixService.listAlertDefs(), []);
    assert.equal(await coralogixService.getAlertDef('x'), null);
  } finally {
    if (saved.key !== undefined) process.env.CORALOGIX_API_KEY = saved.key;
    if (saved.domain !== undefined) process.env.CORALOGIX_DOMAIN = saved.domain;
  }
});

test('coralogixService rejects a malformed alert id before ever building a URL', async () => {
  await assert.rejects(() => coralogixService.getAlertDef('; DROP TABLE'), /Invalid Coralogix alert id/);
  await assert.rejects(() => coralogixService.getAlertDef('../../etc/passwd'), /Invalid Coralogix alert id/);
});

test('updateAlertDetails validates the threshold is a non-negative number (only when threshold/timeWindowValue are actually provided) before ever calling Coralogix, and rejects unsupported alert types for both threshold tuning and query editing', () => {
  const serviceSrc = coralogixServiceSrc;
  assert.match(serviceSrc, /if \(!Number\.isFinite\(numericThreshold\) \|\| numericThreshold < 0\) throw new Error\('Threshold must be a non-negative number'\);/);
  assert.match(serviceSrc, /throw new Error\('This alert type does not support threshold tuning'\);/);
  assert.match(serviceSrc, /throw new Error\('This alert type does not support query editing'\);/);
  assert.match(serviceSrc, /if \(!trimmedName\) throw new Error\('Name is required'\);/);
});

test('live: updateAlertDetails\' name/description/query edit paths are never exercised against a real alert in this test file — a write test like that happens through the actual Edit modal, not a throwaway script', () => {
  assert.match(coralogixServiceSrc, /async function updateAlertDetails\(id, \{ name, description, query, threshold, timeWindowValue, conditionType \}\) \{/);
});

test('live Coralogix integration (read-only): listAlertDefs and getAlertDef return real alert definitions from the account — never a write call in this test file, since mutating a real production alert is not something to probe blind', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const alerts = await coralogixService.listAlertDefs();
  assert.ok(Array.isArray(alerts) && alerts.length > 100, 'expected a few hundred real alert definitions');
  const first = alerts[0];
  assert.ok(first.id && first.name);
  assert.equal(typeof first.enabled, 'boolean');
  const single = await coralogixService.getAlertDef(first.id);
  assert.equal(single.id, first.id);
  assert.equal(single.name, first.name);
});

test('live: customer attribution finds real alerts under both a customer-name match and a jira_project_code match, and leaves a genuinely generic alert (e.g. the universal Workspace Node CPU alert) unattributed', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const pool = require(path.join(root, 'backend', 'config', 'database'));
  const { matchingCustomersByName } = require(path.join(root, 'backend', 'controllers', 'mailboxController'));
  const { subjectContains } = require(path.join(root, 'backend', 'services', 'operationsMailClassificationService'));
  const [customers] = await pool.query('SELECT customer_name, jira_project_code FROM customers WHERE is_active = 1');
  const alerts = await coralogixService.listAlertDefs();

  const attribute = (name) => {
    const nameMatches = matchingCustomersByName(customers, name);
    if (nameMatches.length === 1) return nameMatches[0].customer_name;
    if (nameMatches.length === 0) {
      const codeMatches = customers.filter((c) => c.jira_project_code && subjectContains(name, c.jira_project_code));
      if (codeMatches.length === 1) return codeMatches[0].customer_name;
    }
    return null;
  };

  const gjkgAlert = alerts.find((a) => /^GJKG\b/.test(a.name));
  if (gjkgAlert) assert.equal(attribute(gjkgAlert.name), 'Georg Jos. Kaes GmbH', 'expected a code-only alert name to resolve via jira_project_code');

  const universalAlert = alerts.find((a) => a.name === 'Workspace Node CPU more than 90%');
  if (universalAlert) assert.equal(attribute(universalAlert.name), null, 'a truly generic alert name must not be mis-attributed to any customer');
});

test('frontend: Alert Management nav, page and permission gating (page renamed from "Coralogix Alerts" to "Alert Management"; internal ids/permission key unchanged)', () => {
  assert.match(html, /<div class="nav-item" id="coralogixAlertsNav" onclick="navigate\('coralogixAlerts', this\)">/);
  assert.match(html, /<span class="nav-label"> Alert Management<\/span>/);
  assert.match(html, /<div class="page" id="page-coralogixAlerts">/);
  assert.match(html, /<div class="page-header-title">Alert Management<\/div>/);
  assert.match(html, /<input id="coralogixAlertsSearch"/);
  assert.match(frontend, /coralogixAlerts: 'manage_coralogix_alerts'/);
  assert.match(frontend, /coralogixAlerts: 'Alert Management'/);
  assert.match(frontend, /if \(page === 'coralogixAlerts'\) loadCoralogixAlerts\(\);/);
  assert.match(frontend, /el = document\.getElementById\('coralogixAlertsNav'\);\s*\n\s*if \(el\) el\.style\.display = can\('manage_coralogix_alerts'\) \? '' : 'none';/);
});

test('frontend: each enabled, not-currently-snoozed alert row offers a single "Snooze ▾" dropdown with the three 1 hour/3 hours/24 hours presets (matching Coralogix\'s own snooze UI, not three bare unlabeled buttons); a snoozed row offers Unsnooze instead', () => {
  assert.match(frontend, /\[\[60, '1 hour'\], \[180, '3 hours'\], \[1440, '24 hours'\]\]\.map/);
  assert.match(frontend, /<button class="btn btn-secondary btn-sm" onclick="event\.stopPropagation\(\); coralogixToggleSnoozeMenu\(this\)">Snooze ▾<\/button>/);
  assert.match(frontend, /class="coralogix-snooze-menu-item" onclick="coralogixSnoozeAlert\(/);
  assert.match(frontend, /function coralogixToggleSnoozeMenu\(button\) \{/);
  assert.match(frontend, /function coralogixSnoozeAlert\(id, name, minutes, button\) \{/);
  assert.match(frontend, /function coralogixUnsnoozeAlert\(id, button\) \{/);
  assert.match(html, /<th>Snooze \/ Tune<\/th>/);
});

test('frontend: the snooze dropdown closes on an outside click, same pattern already used for the multiselect dropdowns', () => {
  assert.match(frontend, /if \(!e\.target\.closest\('\.coralogix-snooze-dropdown-wrap'\)\) \{\s*\n\s*document\.querySelectorAll\('\.coralogix-snooze-menu\.open'\)\.forEach\(function \(el\) \{ el\.classList\.remove\('open'\); \}\);/);
});

test('frontend: the Edit button/modal is offered for every alert (not just tunable ones), fetches the full detail (description/query) fresh rather than reusing the list\'s lighter copy, and hides the Query/Threshold sections for alert types that don\'t support them', () => {
  assert.match(frontend, /actions \+= '<button class="btn btn-secondary btn-sm" title="Edit this alert\\'s name, description, query and \(where supported\) threshold\/wait time" onclick="coralogixOpenTuneModal\(/);
  assert.doesNotMatch(frontend, /if \(a\.tunable\) actions \+= '<button[^>]*>Edit<\/button>';/, 'Edit must not be gated behind tunable — every alert is editable');
  assert.match(frontend, /function coralogixOpenTuneModal\(id\) \{/);
  assert.match(frontend, /fetch\(window\.APP_CONFIG\.API_BASE_URL \+ '\/coralogix\/alerts\/' \+ encodeURIComponent\(id\), \{ headers: \{ Authorization: 'Bearer ' \+ token \} \}\)/);
  assert.match(frontend, /if \(querySection\) querySection\.style\.display = alert\.query === null \? 'none' : '';/);
  assert.match(frontend, /if \(thresholdSection\) thresholdSection\.style\.display = alert\.tunable \? 'flex' : 'none';/);
  assert.match(frontend, /var options = alert\.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD' \? coralogixLogsTimeWindows : coralogixMetricTimeWindows;/);
  assert.match(frontend, /function coralogixSaveTune\(\) \{/);
  assert.match(frontend, /method: 'PUT', headers: \{ Authorization: 'Bearer ' \+ token, 'Content-Type': 'application\/json' \}, body: JSON\.stringify\(body\)/);
});

test('backend: the Edit modal can change the comparison (more/less than), not just threshold/wait-time — toAlertSummary exposes the raw conditionType, METRIC_CONDITION_TYPES/LOGS_CONDITION_TYPES list the four real options per alert type, getAlerts returns both lists, and updateAlertDetails includes conditionType in the same condition object it already updates threshold/timeWindowValue in', () => {
  assert.match(coralogixServiceSrc, /conditionType: rule\?\.condition\?\.conditionType \|\| null,/);
  assert.match(coralogixServiceSrc, /function conditionTypeOptions\(prefix\) \{/);
  assert.match(coralogixServiceSrc, /const METRIC_CONDITION_TYPES = conditionTypeOptions\('METRIC'\);/);
  assert.match(coralogixServiceSrc, /const LOGS_CONDITION_TYPES = conditionTypeOptions\('LOGS'\);/);
  assert.match(coralogixServiceSrc, /if \(threshold !== undefined \|\| timeWindowValue !== undefined \|\| conditionType !== undefined\) \{/);
  assert.match(coralogixServiceSrc, /\.\.\.\(conditionType !== undefined \? \{ conditionType \} : \{\}\)/);
  const controllerSrc = fs.readFileSync(path.join(root, 'backend', 'controllers', 'coralogixController.js'), 'utf8');
  assert.match(controllerSrc, /metricConditionTypes: METRIC_CONDITION_TYPES, logsConditionTypes: LOGS_CONDITION_TYPES/);
  assert.match(controllerSrc, /if \(body\.conditionType !== undefined\) edits\.conditionType = body\.conditionType;/);
});

test('live: METRIC_CONDITION_TYPES/LOGS_CONDITION_TYPES each list exactly the four real comparison options confirmed against this account\'s alert data, and a real alert\'s conditionType round-trips through toAlertSummary correctly', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const metricTypes = coralogixService.METRIC_CONDITION_TYPES;
  const logsTypes = coralogixService.LOGS_CONDITION_TYPES;
  assert.equal(metricTypes.length, 4);
  assert.equal(logsTypes.length, 4);
  assert.ok(metricTypes.every((t) => t.value.startsWith('METRIC_THRESHOLD_CONDITION_TYPE_')));
  assert.ok(logsTypes.every((t) => t.value.startsWith('LOGS_THRESHOLD_CONDITION_TYPE_')));
  const alerts = await coralogixService.listAlertDefs();
  const mcmAlert = alerts.find((a) => a.name.includes('MCM is down'));
  if (!mcmAlert) return;
  assert.equal(mcmAlert.conditionType, 'METRIC_THRESHOLD_CONDITION_TYPE_LESS_THAN');
  assert.ok(metricTypes.some((t) => t.value === mcmAlert.conditionType), 'the real alert\'s conditionType must be one of the dropdown\'s own options, or the Edit modal could never pre-select it');
});

test('frontend: the Edit modal\'s Comparison dropdown is populated from the backend-provided metric/logs condition-type lists (never hardcoded) and pre-selects the alert\'s current conditionType; Save includes it alongside threshold/timeWindowValue', () => {
  assert.match(html, /<select id="coralogixTuneConditionType" style="width:100%"><\/select>/);
  assert.match(frontend, /var conditionTypeSelect = document\.getElementById\('coralogixTuneConditionType'\);/);
  assert.match(frontend, /var conditionOptions = alert\.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD' \? coralogixLogsConditionTypes : coralogixMetricConditionTypes;/);
  assert.match(frontend, /\(c\.value === alert\.conditionType \? ' selected' : ''\)/);
  assert.match(frontend, /body\.conditionType = document\.getElementById\('coralogixTuneConditionType'\)\.value;/);
});

test('backend: toAlertSummary assembles the same "Conditions" sentence Coralogix\'s own UI shows (e.g. "When the query returns a value of less than 1 for at least 10 minutes"), from the real conditionType/threshold/time-window fields — falls back to a humanized raw value for any conditionType this app hasn\'t explicitly labeled', () => {
  assert.match(coralogixServiceSrc, /function conditionComparisonLabel\(conditionType\) \{/);
  assert.match(coralogixServiceSrc, /MORE_THAN_OR_UNSPECIFIED: 'more than',/);
  assert.match(coralogixServiceSrc, /LESS_THAN: 'less than',/);
  assert.match(coralogixServiceSrc, /conditionText: \(comparison && threshold !== null && windowLabel\)\s*\n\s*\? `When the query returns a value of \$\{comparison\} \$\{threshold\} for at least \$\{windowLabel\}`\s*\n\s*: null,/);
});

test('backend: toAlertDetail also adds the "When there is no data" / "Auto retire undetected values" lines from undetectedValuesManagement, matching Coralogix\'s own exact wording ("Set OK" / "Never")', () => {
  assert.match(coralogixServiceSrc, /function undetectedValuesInfo\(props\) \{/);
  assert.match(coralogixServiceSrc, /noDataLabel: mgmt\.triggerUndetectedValues \? 'Trigger Alert' : 'Set OK',/);
  assert.match(coralogixServiceSrc, /undetectedValues: undetectedValuesInfo\(props\)/);
});

test('live: a real alert\'s conditionText and undetectedValues match Coralogix\'s own real wording exactly ("When the query returns a value of less than 1 for at least 10 minutes" / "Set OK" / "Never")', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const alerts = await coralogixService.listAlertDefs();
  const mcmAlert = alerts.find((a) => a.name.includes('MCM is down'));
  if (!mcmAlert) return;
  assert.match(mcmAlert.conditionText, /^When the query returns a value of (more than|more than or equal to|less than|less than or equal to) -?\d+(\.\d+)? for at least .+$/);
  const detail = await coralogixService.getAlertDef(mcmAlert.id);
  assert.ok(detail.undetectedValues);
  assert.ok(['Set OK', 'Trigger Alert'].includes(detail.undetectedValues.noDataLabel));
  assert.equal(typeof detail.undetectedValues.autoRetireLabel, 'string');
});

test('frontend: the detail modal\'s Conditions section renders conditionText plus the no-data/auto-retire lines, hidden entirely when an alert type has no condition (e.g. LOGS_NEW_VALUE)', () => {
  assert.match(html, /<div id="coralogixDetailConditionsSection">/);
  assert.match(html, /<div id="coralogixDetailConditionText"/);
  assert.match(html, /<strong id="coralogixDetailNoData"/);
  assert.match(html, /<strong id="coralogixDetailAutoRetire"/);
  assert.match(frontend, /if \(conditionsSection\) conditionsSection\.style\.display = alert\.conditionText \? '' : 'none';/);
  assert.match(frontend, /if \(noDataEl\) noDataEl\.textContent = \(alert\.undetectedValues && alert\.undetectedValues\.noDataLabel\) \|\| '—';/);
});

test('backend: toAlertDetail (single-alert fetch only) adds description and the underlying query (PromQL for metric alerts, Lucene for logs alerts, null for unsupported types like LOGS_NEW_VALUE) on top of the list summary', () => {
  assert.match(coralogixServiceSrc, /function alertQueryText\(props\) \{/);
  assert.match(coralogixServiceSrc, /if \(props\.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD'\) return props\.metricThreshold\?\.metricFilter\?\.promql \?\? null;/);
  assert.match(coralogixServiceSrc, /if \(props\.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD'\) return props\.logsThreshold\?\.logsFilter\?\.simpleFilter\?\.luceneQuery \?\? null;/);
  assert.match(coralogixServiceSrc, /function toAlertDetail\(def\) \{/);
  assert.match(coralogixServiceSrc, /async function getAlertDef\(id\) \{\s*\n\s*if \(!coralogixConfigured\(\)\) return null;\s*\n\s*const def = await getAlertDefRaw\(id\);\s*\n\s*return toAlertDetail\(def\);/);
});

test('live: getAlertDef returns the real description and query for a real alert — the full-content "open and edit" request only makes sense if the content actually is the real thing', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const alerts = await coralogixService.listAlertDefs();
  const metricAlert = alerts.find((a) => a.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD');
  const detail = await coralogixService.getAlertDef(metricAlert.id);
  assert.equal(typeof detail.description, 'string');
  assert.equal(typeof detail.query, 'string');
  assert.ok(detail.query.length > 0, 'a real metric threshold alert must have a non-empty PromQL query');
});

test('frontend: clicking an alert row opens a read-only detail view (status/type/priority/customer/threshold/description/query), separate from the Edit modal; the actions cell stops that click from bubbling up to the row so Snooze/Unsnooze/Edit never also pop the detail view open behind themselves', () => {
  assert.match(frontend, /return '<tr onclick="coralogixOpenDetailModal\(\\'' \+ escapeMetricHtml\(a\.id\) \+ '\\'\)" style="cursor:pointer">'/);
  assert.match(frontend, /\+ '<td onclick="event\.stopPropagation\(\)"><div style="display:flex;gap:4px;flex-wrap:wrap">' \+ actions \+ '<\/div><\/td>'/);
  assert.match(frontend, /function coralogixOpenDetailModal\(id\) \{/);
  assert.match(frontend, /fetch\(window\.APP_CONFIG\.API_BASE_URL \+ '\/coralogix\/alerts\/' \+ encodeURIComponent\(id\), \{ headers: \{ Authorization: 'Bearer ' \+ token \} \}\)/);
  assert.match(html, /<div class="modal-overlay" id="coralogixDetailModal">/);
  assert.match(html, /<div id="coralogixDetailDescription"/);
  assert.match(html, /<pre id="coralogixDetailQuery"/);
});

test('frontend: the detail view\'s Edit button closes it and opens the real Edit modal for the same alert — one fetch per open, not a shared/stale copy between the two modals', () => {
  assert.match(frontend, /function coralogixEditFromDetail\(\) \{/);
  assert.match(frontend, /closeModal\('coralogixDetailModal'\);\s*\n\s*coralogixOpenTuneModal\(id\);/);
  assert.match(html, /<button class="btn btn-primary" onclick="coralogixEditFromDetail\(\)">Edit<\/button>/);
});

test('backend: each alert is attributed to a customer by name, then by name again with camelCase word boundaries split (e.g. "DemathieuBard" -> "Demathieu Bard" resolving to customer "DEMATHIEU BARD"), then by jira_project_code as a whole-word fallback (e.g. an alert naming a customer only by its short Jira code) — ambiguous or no match leaves customer null so the frontend buckets it under Others rather than guessing', () => {
  const controllerSrc = fs.readFileSync(path.join(root, 'backend', 'controllers', 'coralogixController.js'), 'utf8');
  assert.match(controllerSrc, /const \{ matchingCustomersByName \} = require\('\.\/mailboxController'\);/);
  assert.match(controllerSrc, /const \{ subjectContains \} = require\('\.\.\/services\/operationsMailClassificationService'\);/);
  assert.match(controllerSrc, /function splitCamelCaseBoundaries\(text\) \{/);
  assert.match(controllerSrc, /return String\(text \|\| ''\)\.replace\(\/\(\[a-z0-9\]\)\(\[A-Z\]\)\/g, '\$1 \$2'\);/);
  assert.match(controllerSrc, /let nameMatches = matchingCustomersByName\(customers, alert\.name\);/);
  assert.match(controllerSrc, /if \(nameMatches\.length === 0\) nameMatches = matchingCustomersByName\(customers, splitCamelCaseBoundaries\(alert\.name\)\);/);
  assert.match(controllerSrc, /const codeMatches = customers\.filter\(\(c\) => c\.jira_project_code && subjectContains\(alert\.name, c\.jira_project_code\)\);/);
});

test('live: a real alert whose customer name is run together in camelCase (DemathieuBard, capital B) resolves to the real "DEMATHIEU BARD" customer via the camelCase-split fallback', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const pool = require(path.join(root, 'backend', 'config', 'database'));
  const { matchingCustomersByName } = require(path.join(root, 'backend', 'controllers', 'mailboxController'));
  const [customers] = await pool.query('SELECT customer_name FROM customers WHERE is_active = 1');
  const alerts = await coralogixService.listAlertDefs();
  // Must genuinely have a camelCase transition (capital B) — this real
  // account also has an all-lowercase "Demathieubard" spelling (no case
  // transition at all) for the same customer, which the camelCase split is
  // a no-op on; picking the wrong variant here would make this test
  // flaky/meaningless depending on array order, so it's filtered explicitly.
  const demathieuAlert = alerts.find((a) => /DemathieuBard/.test(a.name));
  if (!demathieuAlert) return;
  assert.equal(matchingCustomersByName(customers, demathieuAlert.name).length, 0, 'the direct (unsplit) match must still fail — confirms this is genuinely testing the fallback, not a no-op');
  const split = demathieuAlert.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  assert.notEqual(split, demathieuAlert.name, 'the split must actually change the string, or this test isn\'t exercising the camelCase fallback at all');
  const splitMatches = matchingCustomersByName(customers, split);
  assert.equal(splitMatches.length, 1);
  assert.equal(splitMatches[0].customer_name, 'DEMATHIEU BARD');
});

test('backend: a third fallback squishes the alert\'s leading prefix (text before the first hyphen) and each customer name down to just lowercase letters/digits, matching on exact equality — catches a customer name squished with NO case transition at all (e.g. "Demathieubard", confirmed to exist alongside "DemathieuBard" for the same real customer), which the camelCase-split fallback cannot find a boundary in', () => {
  const controllerSrc = fs.readFileSync(path.join(root, 'backend', 'controllers', 'coralogixController.js'), 'utf8');
  assert.match(controllerSrc, /function squish\(text\) \{/);
  assert.match(controllerSrc, /function leadingPrefix\(name\) \{/);
  assert.match(controllerSrc, /const squishedPrefix = squish\(leadingPrefix\(alert\.name\)\);/);
  assert.match(controllerSrc, /if \(squishedPrefix\.length >= 4\) \{/);
  assert.match(controllerSrc, /const prefixMatches = customers\.filter\(\(c\) => squish\(c\.customer_name\) === squishedPrefix\);/);
});

test('live: every remaining lowercase "Demathieubard" alert variant (no case transition — the camelCase fallback is a no-op on these) resolves to DEMATHIEU BARD via the squish-prefix fallback', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const pool = require(path.join(root, 'backend', 'config', 'database'));
  const { matchingCustomersByName } = require(path.join(root, 'backend', 'controllers', 'mailboxController'));
  const [customers] = await pool.query('SELECT customer_name FROM customers WHERE is_active = 1');
  const alerts = await coralogixService.listAlertDefs();
  const squish = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const leadingPrefix = (n) => { const m = String(n || '').match(/^(.*?)(?:\s*[-:–]\s*|$)/); return (m ? m[1] : n).trim(); };
  const plainVariants = alerts.filter((a) => /^Demathieubard\b/.test(a.name));
  assert.ok(plainVariants.length > 0, 'expected at least one real "Demathieubard" (no case transition) alert to exist in this account');
  plainVariants.forEach((a) => {
    assert.equal(matchingCustomersByName(customers, a.name).length, 0, 'direct match must still fail for ' + a.name);
    // Only the leading customer-name PREFIX needs to be a camelCase no-op —
    // the rest of the alert name can legitimately contain its own unrelated
    // case transitions (e.g. "...Exceeded 6GB" splits to "6 GB", which is
    // fine and expected; it just isn't what this fallback is testing).
    const prefix = leadingPrefix(a.name);
    const splitPrefix = prefix.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    assert.equal(splitPrefix, prefix, 'the camelCase split must be a genuine no-op for this variant\'s customer-name prefix, or this test is misclassifying it');
    const squishedPrefix = squish(prefix);
    const match = customers.find((c) => squish(c.customer_name) === squishedPrefix);
    assert.ok(match, 'expected the squish-prefix fallback to resolve ' + JSON.stringify(a.name));
    assert.equal(match.customer_name, 'DEMATHIEU BARD');
  });
});

test('backend: the single-alert detail endpoint (getAlert) also attaches customer attribution, not just the list endpoint — otherwise the detail/edit modal would always show "Customer: —" even for an alert the list view correctly grouped under a real customer', () => {
  const controllerSrc = fs.readFileSync(path.join(root, 'backend', 'controllers', 'coralogixController.js'), 'utf8');
  assert.match(controllerSrc, /const \[alert\] = await attachCustomerInfo\(await attachSnoozeInfo\(\[await getAlertDef\(req\.params\.id\)\]\)\);/);
});

test('live: a real alert with a known customer prefix (e.g. CCCU) resolves to a real customer via the exact same matchingCustomersByName logic getAlert now runs — confirms the fix has real data to work with, not just a wiring check', async (t) => {
  if (!coralogixService.coralogixConfigured()) { t.skip('CORALOGIX_API_KEY/CORALOGIX_DOMAIN not loaded in this run'); return; }
  const pool = require(path.join(root, 'backend', 'config', 'database'));
  const { matchingCustomersByName } = require(path.join(root, 'backend', 'controllers', 'mailboxController'));
  const [customers] = await pool.query('SELECT customer_name FROM customers WHERE is_active = 1');
  const alerts = await coralogixService.listAlertDefs();
  const cccuAlert = alerts.find((a) => /^CCCU\b/.test(a.name));
  if (!cccuAlert) return;
  const nameMatches = matchingCustomersByName(customers, cccuAlert.name);
  assert.equal(nameMatches.length, 1, 'expected exactly one customer to match the CCCU- prefixed alert name');
});

test('frontend: alerts are grouped by customer in an expandable accordion tree (All Customers / each matched customer / Others pinned last for generic alerts), each node expanding to list its alerts by name directly — not just a separate click-to-filter interaction; clicking one alert narrows the table to exactly that alert', () => {
  assert.match(html, /<div id="coralogixAlertsGroupTree" class="sop-library-tree"><\/div>/);
  assert.match(frontend, /function renderCoralogixAlertsGroupTree\(\) \{/);
  assert.match(frontend, /if \(a\.customer\) \{ \(byCustomer\[a\.customer\] = byCustomer\[a\.customer\] \|\| \[\]\)\.push\(a\); \} else othersAlerts\.push\(a\);/);
  assert.match(frontend, /html \+= groupBlock\('__others__', 'Others', othersAlerts\);/);
  assert.match(frontend, /function coralogixSelectGroup\(group, alertName\) \{/);
  assert.match(frontend, /function coralogixToggleGroupExpand\(key\) \{/);
  assert.match(frontend, /if \(coralogixSelectedGroup === '__others__' && a\.customer\) return false;/);
  assert.match(frontend, /if \(coralogixSelectedGroup && coralogixSelectedGroup !== '__others__' && a\.customer !== coralogixSelectedGroup\) return false;/);
});
