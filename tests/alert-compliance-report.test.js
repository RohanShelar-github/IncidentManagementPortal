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
const migrationResolution = fs.readFileSync(path.join(root, 'backend', 'sql', '039_alert_manual_resolution.sql'), 'utf8');
const migrationTicketStatus = fs.readFileSync(path.join(root, 'backend', 'sql', '040_alert_ticket_status_and_delete.sql'), 'utf8');

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

test('groupMessagesIntoAlerts splits the same alert into separate groups per IST calendar day', () => {
  const messages = [
    { id: 'd1', from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / Daily Repeat Test', receivedAt: '2026-09-20T04:00:00Z', category: 'coralogix' }, // 2026-09-20 09:30 IST
    { id: 'd2', from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / Daily Repeat Test', receivedAt: '2026-09-20T05:00:00Z', category: 'coralogix' }, // same IST day
    { id: 'd3', from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / Daily Repeat Test', receivedAt: '2026-09-22T04:00:00Z', category: 'coralogix' }  // 2 IST days later
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 2, 'same alert on two different days must produce two groups, not one');
  const byDay = new Map(groups.map((g) => [g.day, g]));
  assert.equal(byDay.get('2026-09-20').occurrenceCount, 2);
  assert.equal(byDay.get('2026-09-22').occurrenceCount, 1);
  assert.equal(byDay.get('2026-09-20').alertFingerprint, byDay.get('2026-09-22').alertFingerprint, 'the underlying alert identity is the same even though the day-groups differ');
  assert.notEqual(byDay.get('2026-09-20').fingerprint, byDay.get('2026-09-22').fingerprint, 'the day-scoped fingerprint used for comments/resolution must differ per day');
});

test('alertDayKey resolves the calendar day in IST (UTC+5:30), not UTC', () => {
  // 2026-09-19T19:00:00Z is already 2026-09-20 00:30 in IST.
  assert.equal(grouping.alertDayKey('2026-09-19T19:00:00Z'), '2026-09-20');
  assert.equal(grouping.alertDayKey('2026-09-19T18:00:00Z'), '2026-09-19');
});

test('deriveAlertState reflects only the alert\'s own activity signal — resolved, then recency — never "incident_created"', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  const base = { hasResolvedSignal: false, lastSeen: '2026-09-20T11:50:00Z' };
  assert.equal(grouping.deriveAlertState({ ...base, hasResolvedSignal: true }, now), 'confirmed_resolved');
  assert.equal(grouping.deriveAlertState(base, now), 'actively_repeating');
  assert.equal(grouping.deriveAlertState({ ...base, lastSeen: '2026-09-20T11:00:00Z' }, now), 'went_quiet');
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
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, updateTicketStatus, deleteAlert, getAlertMessage \};/);
  assert.match(reportRoutes, /router\.get\('\/comments', requirePermission\('view_alert_compliance_report'\), listAlertComments\)/);
  assert.match(reportRoutes, /router\.post\('\/comments', requirePermission\('view_alert_compliance_report'\), addAlertComment\)/);
});

test('comment text length and emptiness are validated server-side', () => {
  assert.match(reportController, /if \(!commentText\) return res\.status\(400\)/);
  assert.match(reportController, /commentText\.length > 2000/);
});

test('the frontend alert detail modal, functions, and Comments table column exist', () => {
  assert.match(html, /id="alertDetailModal"/);
  assert.match(html, /<th>Comments<\/th>/);
  assert.match(frontend, /function acOpenAlertDetail\(fingerprintKey\) \{/);
  assert.match(frontend, /function acLoadComments\(fingerprintKey\) \{/);
  assert.match(frontend, /function acSubmitComment\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/comments'/);
});

test('the whole row opens the alert detail view (click and Enter-key), with the incident link and comments button stopping propagation so they act independently', () => {
  assert.match(frontend, /return '<tr onclick="acOpenAlertDetail\(\\''/);
  assert.match(frontend, /onkeydown="if\(event\.key===\\'Enter\\'\)\{acOpenAlertDetail\(/);
  assert.match(frontend, /const commentCell = '<button class="btn btn-secondary" onclick="event\.stopPropagation\(\);acOpenAlertDetail\(/);
  assert.match(frontend, /onclick="event\.stopPropagation\(\);acOpenIncident\(\\''/);
});

test('the report includes per-occurrence history (timestamp + resolved flag) for the detail view', () => {
  assert.match(reportController, /occurrences: group\.occurrences/);
  assert.match(frontend, /const occCountEl = document\.getElementById\('adOccurrenceCount'\);/);
  assert.match(frontend, /const occList = document\.getElementById\('adOccurrenceList'\);/);
});

test('the full alert email endpoint is gated by view_alert_compliance_report and restricted to alert categories', () => {
  assert.match(reportRoutes, /router\.get\('\/message\/:id', requirePermission\('view_alert_compliance_report'\), getAlertMessage\)/);
  assert.match(reportController, /const message = await getInboxMessage\(req\.params\.id\);/);
  assert.match(reportController, /if \(!ALERT_CATEGORIES\.has\(category\)\) \{/);
});

test('occurrence rows are clickable and load the full email via mailboxSafeRichHtml (the same sanitizer the Mailbox page uses)', () => {
  assert.match(frontend, /function acViewAlertEmail\(messageId, rowEl\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/message\/' \+ encodeURIComponent\(messageId\)/);
  assert.match(frontend, /frame\.srcdoc = mailboxSafeRichHtml\(message\.body \|\| message\.preview \|\| 'This message has no readable text body\.', document\.body\.classList\.contains\('light-mode'\)\);/);
  assert.match(frontend, /onclickAttr = o\.id \? ' onclick="acViewAlertEmail\(\\''/);
});

test('groupMessagesIntoAlerts records a timestamped, resolved-flagged occurrence per message', () => {
  const messages = [
    { id: 'x1', from: 'ops@example.com', subject: "Alert 'Disk Low' was fired", receivedAt: '2026-09-21T10:00:00Z', category: 'azure' },
    { id: 'x2', from: 'ops@example.com', subject: "Alert 'Disk Low' was fired", receivedAt: '2026-09-21T10:10:00Z', category: 'azure' },
    { id: 'x3', from: 'ops@example.com', subject: "Alert 'Disk Low' was resolved", receivedAt: '2026-09-21T10:20:00Z', category: 'azure' }
  ];
  const [group] = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(group.occurrences.length, 3);
  assert.equal(group.occurrences.filter((o) => o.resolved).length, 1);
  assert.ok(group.occurrences.every((o) => typeof o.receivedAt === 'string'));
});

// ── Requirement: unique alerts per day, manual resolution, incident ID per occurrence ──

test('the manual-resolution migration adds is_resolution to the existing comments table (no new table needed)', () => {
  assert.match(migrationResolution, /ALTER TABLE operations_alert_comments/);
  assert.match(migrationResolution, /ADD COLUMN is_resolution TINYINT\(1\) NOT NULL DEFAULT 0/);
});

test('the report row carries the day field and the per-occurrence incidentRef, additively', () => {
  assert.match(reportController, /day: group\.day,/);
  assert.match(reportController, /incidentRef: incidentByMessageId\.get\(o\.id\) \|\| null/);
});

test('a manual resolution only overrides state for went_quiet groups, never overriding a real incident or an automatic resolved signal', () => {
  assert.match(reportController, /if \(r\.state === 'went_quiet' && resolvedKeys\.has\(r\.fingerprintKey\)\) r\.state = 'manually_resolved';/);
});

test('the summary includes a manuallyResolved count, computed after the state override so it reflects the final displayed state', () => {
  const overrideIndex = reportController.indexOf("r.state = 'manually_resolved'");
  const summaryIndex = reportController.indexOf('manuallyResolved: report.filter');
  assert.ok(overrideIndex > -1 && summaryIndex > -1 && overrideIndex < summaryIndex);
});

test('resolveAlertManually requires a valid fingerprintKey and a non-empty, length-bounded note, and is exported/routed', () => {
  assert.match(reportController, /const resolveAlertManually = async \(req, res\) => \{/);
  assert.match(reportController, /if \(!note\) return res\.status\(400\)/);
  assert.match(reportController, /note\.length > 2000/);
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, updateTicketStatus, deleteAlert, getAlertMessage \};/);
  assert.match(reportRoutes, /router\.post\('\/resolve', requirePermission\('view_alert_compliance_report'\), resolveAlertManually\)/);
});

test('resolving inserts a comment tagged is_resolution=1, so it appears in the same audit trail as regular comments', () => {
  assert.match(reportController, /INSERT INTO operations_alert_comments \(fingerprint_key, alert_fingerprint, comment_text, is_resolution, created_by\) VALUES \(\?, \?, \?, 1, \?\)/);
});

test('listAlertComments exposes isResolution per comment', () => {
  assert.match(reportController, /c\.is_resolution, c\.created_at, u\.full_name AS author_name/);
  assert.match(reportController, /isResolution: Boolean\(row\.is_resolution\)/);
});

test('the frontend recognizes manually_resolved as a distinct, labeled state', () => {
  assert.match(frontend, /manually_resolved: 'Manually Resolved'/);
  assert.match(frontend, /manually_resolved: 'badge-closed'/);
  assert.match(html, /value="manually_resolved">Manually Resolved</);
  assert.match(html, /id="acTileManualResolved"/);
  assert.match(html, /id="acStatManualResolved"/);
});

test('the Mark as Resolved button exists, is hidden by default, and only appears for went_quiet alerts', () => {
  assert.match(html, /id="adResolveBtn"[^>]*style="display:none/);
  assert.match(frontend, /resolveBtn\.style\.display = row\.state === 'went_quiet' \? '' : 'none';/);
});

test('acResolveAlert requires the shared comment textarea to be non-empty and posts to the dedicated /resolve endpoint', () => {
  assert.match(frontend, /function acResolveAlert\(\) \{/);
  assert.match(frontend, /A comment describing the action taken or root cause is required to resolve this alert/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/resolve'/);
});

test('acResolveAlert updates local state, hides the resolve button, and adjusts the summary tiles without a full page reload', () => {
  assert.match(frontend, /row\.state = 'manually_resolved';/);
  assert.match(frontend, /resolveBtn\.style\.display = 'none';/);
  assert.match(frontend, /alertComplianceReportSummary\.wentQuiet = Math\.max\(0, \(alertComplianceReportSummary\.wentQuiet \|\| 0\) - 1\);/);
  assert.match(frontend, /alertComplianceReportSummary\.manuallyResolved = \(alertComplianceReportSummary\.manuallyResolved \|\| 0\) \+ 1;/);
});

test('resolution comments are visually tagged RESOLVED in the comment/audit trail', () => {
  assert.match(frontend, /c\.isResolution \? ' <span class="badge badge-closed"[^']*RESOLVED/);
});

test('occurrence rows show the Incident ID when that specific occurrence led to an incident, opening it without triggering the row\'s own email-view click', () => {
  assert.match(frontend, /event\.stopPropagation\(\);acOpenIncident\(\\''/);
});

// ── Requirement: Customer Raised Tickets (Jira) participate in the report ──

test('Jira (Customer Raised Tickets) is included alongside Coralogix/Azure in the fetched categories', () => {
  assert.match(reportController, /const ALERT_CATEGORIES = new Set\(\['coralogix', 'azure', 'jira'\]\);/);
  assert.match(reportController, /const \{ category, jiraIssueKey \} = classifyOperationsMessage\(message\);/);
  assert.match(reportController, /collected\.push\(\{ \.\.\.message, category, jiraIssueKey \}\);/);
});

test('Jira tickets are fingerprinted by their issue key, not subject text, since every ticket shares an almost-identical subject template', () => {
  const messages = [
    { id: 'j1', from: 'jira@example.com', subject: 'A new support issue AS-41 was reported by the customer', category: 'jira', jiraIssueKey: 'AS-41', receivedAt: '2026-09-20T04:00:00Z' },
    { id: 'j2', from: 'jira@example.com', subject: 'A new support issue AS-42 was reported by the customer', category: 'jira', jiraIssueKey: 'AS-42', receivedAt: '2026-09-20T04:05:00Z' },
    { id: 'j3', from: 'jira@example.com', subject: 'RE: A new support issue AS-41 was reported by the customer', category: 'jira', jiraIssueKey: 'AS-41', receivedAt: '2026-09-20T05:00:00Z' }
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 2, 'two distinct tickets (AS-41, AS-42) must produce two groups, not one merged by near-identical subject text');
  const as41 = groups.find((g) => g.fingerprint.includes('AS-41'));
  assert.equal(as41.occurrenceCount, 2, 'both messages referencing AS-41 belong to the same group');
});

test('Jira tickets stay as ONE row across multiple days, unlike Coralogix/Azure alerts — a support ticket is a single ongoing case, not a repeating alert', () => {
  const messages = [
    { id: 'k1', from: 'automation@example.atlassian.net', subject: 'A new support issue CD-170 was reported by the customer', category: 'jira', jiraIssueKey: 'CD-170', receivedAt: '2026-09-22T17:13:00Z' },
    { id: 'k2', from: 'rohan_shelar@magicsoftware.com', subject: 'Re: A new support issue CD-170 was reported by the customer', category: 'jira', jiraIssueKey: 'CD-170', receivedAt: '2026-09-23T13:02:00Z' }
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 1, 'the same ticket correspondence on two different days must stay one row, not split like a monitoring alert');
  assert.equal(groups[0].occurrenceCount, 2);
  assert.equal(groups[0].fingerprint, 'jira::CD-170', 'the jira fingerprint must never carry a day suffix');

  // Contrast: a monitoring alert with the same day gap DOES split.
  const alertMessages = [
    { id: 'a1', from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / X', category: 'coralogix', receivedAt: '2026-09-22T17:13:00Z' },
    { id: 'a2', from: 'alerts@coralogix.com', subject: 'Coralogix Alert on magic / X', category: 'coralogix', receivedAt: '2026-09-23T13:02:00Z' }
  ];
  assert.equal(grouping.groupMessagesIntoAlerts(alertMessages).length, 2);
});

test('Jira grouping ignores sender, since the same ticket thread is replied to by several different addresses (customer, agent, automation)', () => {
  const messages = [
    { id: 'j1', from: 'automation@magicsoftware2.atlassian.net', subject: 'A new support issue CD-170 was reported by the customer', category: 'jira', jiraIssueKey: 'CD-170', receivedAt: '2026-09-23T04:00:00Z' },
    { id: 'j2', from: 'rohan_shelar@magicsoftware.com', subject: 'Re: A new support issue CD-170 was reported by the customer', category: 'jira', jiraIssueKey: 'CD-170', receivedAt: '2026-09-23T05:00:00Z' },
    { id: 'j3', from: 'babai_chatterjee@magicsoftware.com', subject: 'Re: A new support issue CD-170 was reported by the customer', category: 'jira', jiraIssueKey: 'CD-170', receivedAt: '2026-09-23T06:00:00Z' }
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 1, 'three different senders replying to the same ticket must still collapse into one group');
  assert.equal(groups[0].occurrenceCount, 3);
  assert.doesNotMatch(groups[0].fingerprint, /@/, 'the jira fingerprint must not embed any sender address');
});

test('the frontend category filter and display labels recognize Customer Raised Tickets (jira)', () => {
  assert.match(html, /<option value="jira">Customer Raised Tickets<\/option>/);
  assert.match(frontend, /jira: 'Customer Raised Tickets'/);
  assert.match(frontend, /function acCategoryLabel\(category\) \{/);
});

test('every Azure alert is attributed to NGC regardless of subject text, since NGC is the only customer hosted on Azure', () => {
  assert.match(reportController, /const customer = group\.category === 'azure'\s*\n\s*\? 'NGC'\s*\n\s*: \(customerMatches\[0\] \? customerMatches\[0\]\.customer_name : null\);/);
});

// ── Requirement: table STATE column shows only the real activity state; ──
// ── "Incident Created" is surfaced separately, inside the alert detail   ──

test('the controller calls deriveAlertState without hasIncident — state is never driven by incident presence', () => {
  assert.match(reportController, /const state = deriveAlertState\(group, now\);/);
  assert.doesNotMatch(reportController, /deriveAlertState\(group, hasIncident, now\)/);
});

test('the incidentCreated summary count is based on incidentRef presence, not on r.state (which can no longer be "incident_created")', () => {
  assert.match(reportController, /incidentCreated: report\.filter\(\(r\) => Boolean\(r\.incidentRef\)\)\.length,/);
});

test('the frontend table filter treats "incident_created" as "has an incidentRef", not a literal state match, since r.state never equals it', () => {
  assert.match(frontend, /if \(state === 'incident_created'\) \{ if \(!r\.incidentRef\) return false; \}/);
  assert.match(frontend, /else if \(state && r\.state !== state\) return false;/);
});

test('the detail modal explicitly labels an incident link "Incident Created ·  <ref>" rather than a bare ref, since the STATE badge no longer conveys it', () => {
  const occurrences = (frontend.match(/class="badge badge-closed" style="cursor:pointer;text-decoration:none">Incident Created · ' \+ escapeMetricHtml\(row\.incidentRef\)/g) || []).length;
  assert.equal(occurrences, 3, 'acOpenAlertDetail, acResolveAlert, and acUpdateTicketStatus must all render the explicit incident-created label');
});

test('an occurrence with an incident shows "Incident Created · <ref>" in place of the Firing/Resolved signal label entirely, not alongside it', () => {
  assert.match(frontend, /'<span>Incident Created · <a href="javascript:void\(0\)" onclick="event\.stopPropagation\(\);acOpenIncident/);
  assert.match(frontend, /const statusCell = o\.incidentRef\s*\n\s*\? '<span>Incident Created/);
});

// ── Requirement: Customer Raised Tickets get a manual Open/In Progress/  ──
// ── Resolved status; Admin-only delete for false alerts/tickets          ──

test('the migration adds the ticket-status and deletion tables plus an admin-only delete permission', () => {
  assert.match(migrationTicketStatus, /CREATE TABLE IF NOT EXISTS operations_alert_ticket_status/);
  assert.match(migrationTicketStatus, /status ENUM\('open','in_progress','resolved'\) NOT NULL DEFAULT 'open'/);
  assert.match(migrationTicketStatus, /CREATE TABLE IF NOT EXISTS operations_alert_deletions/);
  assert.match(migrationTicketStatus, /\('delete_alert_compliance_alerts', 'Delete Alert Compliance Alerts'\)/);
  assert.match(migrationTicketStatus, /WHERE r\.role_key = 'admin'/);
  assert.doesNotMatch(migrationTicketStatus, /role_key IN \('admin', 'pmo'\)/, 'delete must be admin-only, unlike view_alert_compliance_report which also grants pmo');
});

test('delete_alert_compliance_alerts is a real, validated permission', () => {
  assert.match(roleController, /'view_alert_compliance_report', 'delete_alert_compliance_alerts'/);
});

test('jira category rows get their status from operations_alert_ticket_status (default "open"), overriding the derived activity state entirely', () => {
  assert.match(reportController, /SELECT fingerprint_key, status FROM operations_alert_ticket_status WHERE fingerprint_key IN \(\?\)/);
  assert.match(reportController, /if \(r\.category === 'jira'\) r\.state = statusByKey\.get\(r\.fingerprintKey\) \|\| 'open';/);
});

test('deleted alert groups are filtered out of the report entirely before any other query runs against them', () => {
  const deleteFilterIndex = reportController.indexOf('operations_alert_deletions');
  const commentCountIndex = reportController.indexOf('operations_alert_comments WHERE fingerprint_key');
  assert.ok(deleteFilterIndex > -1 && commentCountIndex > -1 && deleteFilterIndex < commentCountIndex);
  assert.match(reportController, /report = report\.filter\(\(r\) => !deletedKeys\.has\(r\.fingerprintKey\)\);/);
});

test('updateTicketStatus validates fingerprintKey and restricts status to open/in_progress/resolved, and is routed under view_alert_compliance_report (any viewer can triage)', () => {
  assert.match(reportController, /const TICKET_STATUSES = new Set\(\['open', 'in_progress', 'resolved'\]\);/);
  assert.match(reportController, /if \(!TICKET_STATUSES\.has\(status\)\) \{/);
  assert.match(reportRoutes, /router\.post\('\/ticket-status', requirePermission\('view_alert_compliance_report'\), updateTicketStatus\)/);
});

test('deleteAlert is routed under the new admin-only delete_alert_compliance_alerts permission, not the general view permission', () => {
  assert.match(reportController, /const deleteAlert = async \(req, res\) => \{/);
  assert.match(reportRoutes, /router\.post\('\/delete', requirePermission\('delete_alert_compliance_alerts'\), deleteAlert\)/);
});

test('the frontend recognizes the ticket status values as distinct, labeled states', () => {
  assert.match(frontend, /open: 'Open',/);
  assert.match(frontend, /in_progress: 'In Progress',/);
  assert.match(frontend, /resolved: 'Resolved'\s*\n\};/);
  assert.match(html, /<option value="open">Open \(Ticket\)<\/option>/);
  assert.match(html, /<option value="in_progress">In Progress \(Ticket\)<\/option>/);
  assert.match(html, /<option value="resolved">Resolved \(Ticket\)<\/option>/);
});

test('the ticket-status section and select exist, hidden by default, shown only for jira rows', () => {
  assert.match(html, /id="adTicketStatusSection" style="display:none/);
  assert.match(html, /id="adTicketStatusSelect"/);
  assert.match(frontend, /ticketSection\.style\.display = row\.category === 'jira' \? '' : 'none';/);
  assert.match(frontend, /if \(ticketSelect && row\.category === 'jira'\) ticketSelect\.value = row\.state \|\| 'open';/);
});

test('acUpdateTicketStatus posts to /ticket-status without requiring a comment (unlike acResolveAlert)', () => {
  assert.match(frontend, /function acUpdateTicketStatus\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/ticket-status'/);
  assert.doesNotMatch(frontend.slice(frontend.indexOf('function acUpdateTicketStatus'), frontend.indexOf('function acDeleteAlert')), /Enter a comment first/);
});

test('the Delete Alert Compliance Alerts permission checkbox exists in Role Management', () => {
  assert.match(html, /value="delete_alert_compliance_alerts"\/> Delete Alert Compliance Alerts/);
  assert.match(frontend, /delete_alert_compliance_alerts: 'Delete Alert Compliance Alerts',/);
});

test('the Delete Alert button is hidden by default and only shown per hasPermission, with a confirmation before deleting', () => {
  assert.match(html, /id="adDeleteBtn"[^>]*style="display:none/);
  assert.match(frontend, /deleteBtn\.style\.display = hasPermission\('delete_alert_compliance_alerts'\) \? '' : 'none';/);
  assert.match(frontend, /function acDeleteAlert\(\) \{/);
  assert.match(frontend, /if \(!window\.confirm\(/);
});

test('acDeleteAlert removes the row locally and closes the modal on success, matching the suppression-list semantics', () => {
  assert.match(frontend, /alertComplianceReportData = alertComplianceReportData\.filter\(function \(r\) \{ return r\.fingerprintKey !== acActiveCommentFingerprintKey; \}\);/);
  assert.match(frontend, /closeModal\('alertDetailModal'\);/);
});

// ── Requirement: table-view delete + multi-select delete ──

test('deleteAlert accepts either a single {fingerprintKey} (backward compatible) or a bulk {items: [...]}, capped and validated', () => {
  assert.match(reportController, /const rawItems = Array\.isArray\(req\.body\.items\) && req\.body\.items\.length/);
  assert.match(reportController, /const MAX_BULK_DELETE = 200;/);
  assert.match(reportController, /if \(items\.length > MAX_BULK_DELETE\)/);
  assert.match(reportController, /items\.some\(\(item\) => !FINGERPRINT_KEY_PATTERN\.test\(item\.key\)\)/);
});

test('the table has a checkbox column, hidden by default, shown per hasPermission, with a Select All header checkbox', () => {
  assert.match(html, /id="acSelectHeaderCell" style="display:none"><input id="acSelectAll" type="checkbox"/);
  assert.match(html, /onchange="acToggleSelectAll\(this\.checked\)"/);
  assert.match(frontend, /const canDelete = hasPermission\('delete_alert_compliance_alerts'\);/);
  assert.match(frontend, /if \(selectHeaderCell\) selectHeaderCell\.style\.display = canDelete \? '' : 'none';/);
});

test('the table has a "Delete selected" bulk-action button, hidden by default, updated with the current selection count', () => {
  assert.match(html, /id="acBulkDeleteBtn" class="btn btn-danger btn-sm" onclick="acDeleteSelectedAlerts\(\)" style="display:none"/);
  assert.match(frontend, /function acUpdateBulkDeleteButton\(\) \{/);
  assert.match(frontend, /btn\.textContent = 'Delete selected \(' \+ acSelectedAlerts\.size \+ '\)';/);
});

test('a row checkbox stops propagation so clicking it never also opens the alert detail modal', () => {
  assert.match(frontend, /'<td onclick="event\.stopPropagation\(\)"><input type="checkbox"/);
});

test('selections are dropped for rows no longer visible under the active filter, so a stale hidden selection can never be bulk-deleted by surprise', () => {
  assert.match(frontend, /acSelectedAlerts\.forEach\(function \(key\) \{ if \(!visibleKeys\.has\(key\)\) acSelectedAlerts\.delete\(key\); \}\);/);
});

test('acToggleSelectAll only selects rows matching the current category/state/customer filters, mirroring renderAlertComplianceTable\'s own filter logic', () => {
  assert.match(frontend, /function acToggleSelectAll\(checked\) \{/);
  const body = frontend.slice(frontend.indexOf('function acToggleSelectAll'), frontend.indexOf('function acToggleRowSelect'));
  assert.match(body, /if \(state === 'incident_created'\)/);
});

test('acDeleteSelectedAlerts confirms once, posts all selected items in a single bulk request, and clears the selection on success', () => {
  assert.match(frontend, /function acDeleteSelectedAlerts\(\) \{/);
  assert.match(frontend, /if \(!window\.confirm\(/);
  assert.match(frontend, /body: JSON\.stringify\(\{ items: items \}\)/);
  assert.match(frontend, /acSelectedAlerts\.clear\(\);/);
});

test('loadAlertComplianceReport resets the selection and uses a permission-aware colspan for the loading/error placeholder rows', () => {
  assert.match(frontend, /const colCount = hasPermission\('delete_alert_compliance_alerts'\) \? 11 : 10;/);
  assert.match(frontend, /acSelectedAlerts\.clear\(\);\s*\n\s*if \(tbody\) tbody\.innerHTML = '<tr><td colspan="' \+ colCount \+ '"/);
});
