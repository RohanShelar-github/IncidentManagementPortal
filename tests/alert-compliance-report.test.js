'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const roleController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'roleController.js'), 'utf8');
const reportRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'operationsAlertReportRoutes.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.sql'), 'utf8');
const schemaProd = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.production.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '037_alert_compliance_permission.sql'), 'utf8');

const grouping = require(path.join(root, 'backend', 'services', 'operationsAlertGroupingService.js'));
const reportController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'operationsAlertReportController.js'), 'utf8');
const migrationComments = fs.readFileSync(path.join(root, 'backend', 'sql', '038_alert_compliance_comments.sql'), 'utf8');

test('normalizeAlertSubject collapses fired/resolved variants to the same fingerprint text', () => {
  assert.equal(
    grouping.normalizeAlertSubject('Coralogix Alert on magic /  Toridoll- Average K8s Node Memory'),
    grouping.normalizeAlertSubject('Coralogix Alert on magic /  [RESOLVED] Toridoll- Average K8s Node Memory')
  );
  assert.equal(
    grouping.normalizeAlertSubject("Alert 'No Historian Read' was fired"),
    grouping.normalizeAlertSubject("Alert 'No Historian Read' was resolved")
  );
  assert.equal(
    grouping.normalizeAlertSubject('Azure: Activated Severity: Sev2 XPI_ProjectStatus'),
    grouping.normalizeAlertSubject('Azure: Deactivated Severity: Sev2 XPI_ProjectStatus')
  );
});

test('isResolvedVariant recognizes every empirically observed resolved-subject style', () => {
  assert.equal(grouping.isResolvedVariant('Coralogix Alert on magic /  [RESOLVED] Toridoll'), true);
  assert.equal(grouping.isResolvedVariant('Azure: Deactivated Severity: Sev2 XPI_ProjectStatus'), true);
  assert.equal(grouping.isResolvedVariant("Alert 'No Historian Read' was resolved"), true);
  assert.equal(grouping.isResolvedVariant('Coralogix Alert on magic /  Toridoll'), false);
  assert.equal(grouping.isResolvedVariant('Azure: Activated Severity: Sev2 XPI_ProjectStatus'), false);
});

test('groupMessagesIntoAlerts collapses a real 35-repeat alert into a single group, keyed by sender + normalized subject', () => {
  const messages = [];
  for (let i = 0; i < 35; i += 1) {
    messages.push({
      id: 'm' + i,
      from: 'ops-alerts@coralogix.com',
      subject: 'Coralogix Alert on magic /  Toridoll- Average K8s Node Memory',
      receivedAt: new Date(Date.now() - (35 - i) * 10 * 60000).toISOString(),
      category: 'coralogix'
    });
  }
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].occurrenceCount, 35);
  assert.equal(groups[0].messageIds.length, 35);
  assert.equal(groups[0].hasResolvedSignal, false);
});

test('groupMessagesIntoAlerts pairs a firing/resolved pair from different providers into distinct groups', () => {
  const messages = [
    { id: 'a1', from: 'azure@example.com', subject: "Alert 'No Historian Read' was fired", receivedAt: '2026-09-19T10:00:00Z', category: 'azure' },
    { id: 'a2', from: 'azure@example.com', subject: "Alert 'No Historian Read' was resolved", receivedAt: '2026-09-19T10:10:00Z', category: 'azure' },
    { id: 'a3', from: 'azure@example.com', subject: "Alert 'XPI_ProjectStatus' was fired", receivedAt: '2026-09-19T11:00:00Z', category: 'azure' }
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 2);
  const historianGroup = groups.find(g => /No Historian Read/i.test(g.sampleSubject));
  assert.ok(historianGroup);
  assert.equal(historianGroup.occurrenceCount, 2);
  assert.equal(historianGroup.hasResolvedSignal, true);
});

test('deriveAlertState prioritizes incident creation, then a resolved signal, then recency', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  const base = { hasResolvedSignal: false, lastSeen: '2026-09-20T11:50:00Z' };
  assert.equal(grouping.deriveAlertState(base, true, now), 'incident_created');
  assert.equal(grouping.deriveAlertState({ ...base, hasResolvedSignal: true }, false, now), 'confirmed_resolved');
  assert.equal(grouping.deriveAlertState(base, false, now), 'actively_repeating');
  assert.equal(grouping.deriveAlertState({ ...base, lastSeen: '2026-09-20T11:00:00Z' }, false, now), 'went_quiet');
});

test('the report route is gated behind the dedicated view_alert_compliance_report permission', () => {
  assert.match(reportRoutes, /requirePermission\('view_alert_compliance_report'\), getAlertComplianceReport\)/);
});

test('the new route is wired into the server as a purely additive mount', () => {
  assert.match(server, /require\('\.\/routes\/operationsAlertReportRoutes'\)/);
  assert.match(server, /app\.use\('\/api\/operations-alerts', operationsAlertReportRoutes\)/);
});

test('view_alert_compliance_report is a real, validated permission granted to admin and pmo by default', () => {
  assert.match(roleController, /'manage_customer_csm', 'view_alert_compliance_report'/);
  assert.match(migration, /\('view_alert_compliance_report', 'View Alert Compliance Report'\)/);
  assert.match(migration, /role_key IN \('admin', 'pmo'\)/);
  assert.match(schema, /\('view_alert_compliance_report','View Alert Compliance Report'\)/);
  assert.match(schemaProd, /\('view_alert_compliance_report','View Alert Compliance Report'\)/);
});

test('the Alert Compliance nav item and page exist and are gated behind the new permission', () => {
  assert.match(html, /id="alertComplianceNav" onclick="navigate\('alertCompliance', this\)"/);
  assert.match(html, /id="page-alertCompliance"/);
  assert.match(html, /value="view_alert_compliance_report"/);
});

test('navigateInternal, switchRole, and PERM_LABELS all recognize the alertCompliance page', () => {
  assert.match(frontend, /alertCompliance: 'view_alert_compliance_report'/);
  assert.match(frontend, /if \(page === 'alertCompliance'\) loadAlertComplianceReport\(\);/);
  assert.match(frontend, /getElementById\('alertComplianceNav'\);\s*\n\s*if \(el\) el\.style\.display = can\('view_alert_compliance_report'\) \? '' : 'none';/);
  assert.match(frontend, /view_alert_compliance_report: 'View Alert Compliance Report',/);
});

test('the report fetch and render functions exist and call the real endpoint', () => {
  assert.match(frontend, /function loadAlertComplianceReport\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\?days=' \+ encodeURIComponent\(days\)/);
  assert.match(frontend, /function renderAlertComplianceTable\(\) \{/);
  assert.match(frontend, /function acOpenIncident\(incidentRef\) \{/);
});

test('fingerprintKey is a stable SHA-256 hex hash of the group fingerprint', () => {
  const key1 = grouping.fingerprintKey('ops@example.com::alert x was state');
  const key2 = grouping.fingerprintKey('ops@example.com::alert x was state');
  const key3 = grouping.fingerprintKey('ops@example.com::alert y was state');
  assert.match(key1, /^[a-f0-9]{64}$/);
  assert.equal(key1, key2);
  assert.notEqual(key1, key3);
});

test('the alert comments migration creates an additive, standalone table keyed by fingerprint_key', () => {
  assert.match(migrationComments, /CREATE TABLE IF NOT EXISTS operations_alert_comments/);
  assert.match(migrationComments, /fingerprint_key CHAR\(64\) NOT NULL/);
  assert.match(migrationComments, /FOREIGN KEY \(created_by\) REFERENCES users\(id\) ON DELETE SET NULL/);
});

test('the report attaches a fingerprintKey and commentCount to every group', () => {
  assert.match(reportController, /fingerprintKey: fingerprintKey\(group\.fingerprint\)/);
  assert.match(reportController, /r\.commentCount = countByKey\.get\(r\.fingerprintKey\) \|\| 0;/);
});

test('comment endpoints validate the fingerprintKey shape and are exported/wired', () => {
  assert.match(reportController, /const FINGERPRINT_KEY_PATTERN = \/\^\[a-f0-9\]\{64\}\$\//);
  assert.match(reportController, /const listAlertComments = async \(req, res\) => \{/);
  assert.match(reportController, /const addAlertComment = async \(req, res\) => \{/);
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment \};/);
  assert.match(reportRoutes, /router\.get\('\/comments', requirePermission\('view_alert_compliance_report'\), listAlertComments\)/);
  assert.match(reportRoutes, /router\.post\('\/comments', requirePermission\('view_alert_compliance_report'\), addAlertComment\)/);
});

test('comment text length and emptiness are validated server-side', () => {
  assert.match(reportController, /if \(!commentText\) return res\.status\(400\)/);
  assert.match(reportController, /commentText\.length > 2000/);
});

test('the frontend comment modal, functions, and Comments table column exist', () => {
  assert.match(html, /id="alertCommentModal"/);
  assert.match(html, /<th>Comments<\/th>/);
  assert.match(frontend, /function acOpenComments\(fingerprintKey\) \{/);
  assert.match(frontend, /function acLoadComments\(fingerprintKey\) \{/);
  assert.match(frontend, /function acSubmitComment\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/comments'/);
});
