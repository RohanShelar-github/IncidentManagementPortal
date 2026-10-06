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
  assert.equal(groups[0].lastOccurrenceResolved, false);
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
  assert.equal(historianGroup.lastOccurrenceResolved, true, 'the resolved message here is also chronologically the latest one');
});

test('groupMessagesIntoAlerts.lastOccurrenceResolved reflects the chronologically LATEST message\'s resolved flag, not whichever message happens to be resolved or processed last — a fired message received after an earlier resolved one must flip it back to false', () => {
  const messages = [
    { id: 'r1', from: 'azure@example.com', subject: "Alert 'Node Memory' was fired", receivedAt: '2026-09-20T04:55:00Z', category: 'azure' },
    { id: 'r2', from: 'azure@example.com', subject: "Alert 'Node Memory' was resolved", receivedAt: '2026-09-20T05:02:00Z', category: 'azure' },
    { id: 'r3', from: 'azure@example.com', subject: "Alert 'Node Memory' was fired", receivedAt: '2026-09-20T15:21:00Z', category: 'azure' },
    { id: 'r4', from: 'azure@example.com', subject: "Alert 'Node Memory' was fired", receivedAt: '2026-09-20T15:41:00Z', category: 'azure' }
  ];
  const groups = grouping.groupMessagesIntoAlerts(messages);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].hasResolvedSignal, true, 'it did resolve once, so this historical flag stays true');
  assert.equal(groups[0].lastOccurrenceResolved, false, 'but the latest message (15:41) is a fresh fire, so the current signal must be false');
  assert.equal(grouping.deriveAlertState(groups[0], Date.parse('2026-09-20T15:45:00Z')), 'actively_repeating');
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

test('deriveAlertState reflects only the alert\'s own activity signal — whether the LATEST occurrence resolved, then recency — never "incident_created"', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  const base = { lastOccurrenceResolved: false, lastSeen: '2026-09-20T11:50:00Z' };
  assert.equal(grouping.deriveAlertState({ ...base, lastOccurrenceResolved: true }, now), 'confirmed_resolved');
  assert.equal(grouping.deriveAlertState(base, now), 'actively_repeating');
  assert.equal(grouping.deriveAlertState({ ...base, lastSeen: '2026-09-20T11:00:00Z' }, now), 'went_quiet');
});

test('deriveAlertState is NOT fooled by a resolved signal that happened earlier if the alert has since fired again — a re-fire after resolving means it\'s actively repeating again, not resolved', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  // hasResolvedSignal is still true here (it DID resolve once), but the
  // latest occurrence is a fresh fire, so the current state must not be
  // "confirmed_resolved" — this is the exact bug: a group with an earlier
  // resolved email and a later re-fire must show as still firing.
  const reFired = { hasResolvedSignal: true, lastOccurrenceResolved: false, lastSeen: '2026-09-20T11:55:00Z' };
  assert.equal(grouping.deriveAlertState(reFired, now), 'actively_repeating');
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
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, updateTicketStatus, updateIncidentSubstatus, deleteAlert, getAlertMessage \};/);
  assert.match(reportRoutes, /router\.get\('\/comments', requirePermission\('view_alert_compliance_report'\), listAlertComments\)/);
  assert.match(reportRoutes, /router\.post\('\/comments', requirePermission\('view_alert_compliance_report'\), addAlertComment\)/);
});

test('comment text length and emptiness are validated server-side', () => {
  assert.match(reportController, /if \(!commentText\) return res\.status\(400\)/);
  assert.match(reportController, /commentText\.length > 2000/);
});

test('the frontend alert detail modal, functions, and Comments table column exist', () => {
  assert.match(html, /id="alertDetailModal"/);
  assert.match(html, />Comments<\/th>/);
  assert.match(frontend, /function acOpenAlertDetail\(fingerprintKey, commentsOnly\) \{/);
  assert.match(frontend, /function acLoadComments\(fingerprintKey\) \{/);
  assert.match(frontend, /function acSubmitComment\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/comments'/);
});

test('the whole row opens the full alert detail view (click and Enter-key), with the incident link and comments button stopping propagation so they act independently', () => {
  assert.match(frontend, /return '<tr onclick="acOpenAlertDetail\(\\''/);
  assert.match(frontend, /onkeydown="if\(event\.key===\\'Enter\\'\)\{acOpenAlertDetail\(/);
  assert.match(frontend, /'<button class="btn btn-secondary" onclick="event\.stopPropagation\(\);acOpenAlertComments\(/);
  assert.match(frontend, /onclick="event\.stopPropagation\(\);acOpenIncident\(\\''/);
});

test('the table\'s 💬 comment icon opens a comments-only view (acOpenAlertComments), not the full alert detail — hiding badges/meta/occurrence history/resolve/delete and showing just the Comments section', () => {
  assert.match(frontend, /function acOpenAlertComments\(fingerprintKey\) \{\s*\n\s*acOpenAlertDetail\(fingerprintKey, true\);\s*\n\}/);
  assert.match(html, /<div class="modal-body">\s*\n<div id="adDetailSections">/);
  assert.match(frontend, /const detailSections = document\.getElementById\('adDetailSections'\);\s*\n\s*if \(detailSections\) detailSections\.style\.display = commentsOnly \? 'none' : '';/);
  assert.match(frontend, /title\.textContent = commentsOnly \? 'Comments — ' \+ row\.subject : row\.subject;/);
  assert.match(frontend, /resolveBtn\.style\.display = \(!commentsOnly && row\.state === 'went_quiet'\) \? '' : 'none';/);
  assert.match(frontend, /deleteBtn\.style\.display = \(!commentsOnly && hasPermission\('delete_alert_compliance_alerts'\)\) \? '' : 'none';/);
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
  assert.match(reportController, /incidentRef: \(incidentByMessageId\.get\(o\.id\) \|\| \{\}\)\.ref \|\| null/);
});

test('a manual resolution only overrides state for went_quiet groups, never overriding a real incident or an automatic resolved signal', () => {
  assert.match(reportController, /if \(r\.state === 'went_quiet' && resolvedKeys\.has\(r\.fingerprintKey\)\) r\.state = 'manually_resolved';/);
});

test('the summary includes a manuallyResolved count, computed after the state override so it reflects the final displayed state', () => {
  const overrideIndex = reportController.indexOf("r.state = 'manually_resolved'");
  const summaryIndex = reportController.indexOf('manuallyResolved: report.filter');
  assert.ok(overrideIndex > -1 && summaryIndex > -1 && overrideIndex < summaryIndex);
});

test('resolveAlertManually requires a valid fingerprintKey and a length-bounded (but optional) note, falling back to a default comment when blank, and is exported/routed', () => {
  assert.match(reportController, /const resolveAlertManually = async \(req, res\) => \{/);
  assert.doesNotMatch(reportController, /if \(!note\) return res\.status\(400\)/, 'a comment must no longer be mandatory to manually resolve an alert');
  assert.match(reportController, /note\.length > 2000/);
  assert.match(reportController, /const commentText = note \|\| 'Marked as resolved \(no comment provided\)';/);
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, updateTicketStatus, updateIncidentSubstatus, deleteAlert, getAlertMessage \};/);
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
  assert.match(frontend, /resolveBtn\.style\.display = \(!commentsOnly && row\.state === 'went_quiet'\) \? '' : 'none';/);
});

test('acResolveAlert does not require the shared comment textarea to be filled in, and posts to the dedicated /resolve endpoint', () => {
  assert.match(frontend, /function acResolveAlert\(\) \{/);
  assert.doesNotMatch(frontend, /A comment describing the action taken or root cause is required to resolve this alert/, 'the comment must be optional when manually resolving an alert');
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

test('the controller calls deriveAlertState without hasIncident — the alert\'s own activity/resolution signal is never conflated with incident presence inside that function (the closed-incident override lives separately, in getAlertComplianceReport, keyed off the actual incident status)', () => {
  assert.match(reportController, /let state = deriveAlertState\(group, now\);/);
  assert.doesNotMatch(reportController, /deriveAlertState\(group, hasIncident, now\)/);
});

test('the incidentCreated summary count is based on incidentRef presence, not on r.state (which can no longer be "incident_created"), and also counts a manually-tracked incidentSubstatusRef', () => {
  assert.match(reportController, /incidentCreated: report\.filter\(\(r\) => Boolean\(r\.incidentRef\) \|\| Boolean\(r\.incidentSubstatusRef\)\)\.length,/);
});

test('the frontend table filter treats "incident_created" as "has an incidentRef", not a literal state match, since r.state never equals it', () => {
  assert.match(frontend, /if \(state === 'incident_created'\) \{ if \(!r\.incidentRef\) return false; \}/);
  assert.match(frontend, /else if \(state && r\.state !== state\) return false;/);
});

test('the detail modal explicitly labels an incident link "Incident Created ·  <ref>" rather than a bare ref, since the STATE badge no longer conveys it', () => {
  // acOpenAlertDetail, acResolveAlert, acUpdateTicketStatus, and
  // acUpdateIncidentSubstatus all build their badges via the shared
  // acIncidentBadgeHtml(row) helper (which itself renders the explicit
  // "Incident Created · <ref>" label), rather than each repeating the
  // ternary — also what makes a manually-tracked incidentSubstatusRef (see
  // acEffectiveIncidentRef) show up identically to an auto-linked one.
  assert.match(frontend, /function acIncidentBadgeHtml\(r\) \{/);
  assert.match(frontend, /class="badge badge-closed" style="cursor:pointer;text-decoration:none">Incident Created · ' \+ escapeMetricHtml\(ref\) \+ '<\/a>'/);
  const occurrences = (frontend.match(/\+ acIncidentBadgeHtml\(row\);/g) || []).length;
  assert.equal(occurrences, 4, 'acOpenAlertDetail, acResolveAlert, acUpdateTicketStatus, and acUpdateIncidentSubstatus must all render the badge via the shared helper');
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
  assert.match(frontend, /deleteBtn\.style\.display = \(!commentsOnly && hasPermission\('delete_alert_compliance_alerts'\)\) \? '' : 'none';/);
  assert.match(frontend, /function acDeleteAlert\(\) \{/);
  assert.match(frontend, /showConfirm\(\{ icon: '🗑', title: 'Delete Alert\?', msg: confirmMessage, ok: 'Delete', danger: true \}\)\.then\(function \(ok\) \{/);
  assert.doesNotMatch(frontend, /acRequestDelete[\s\S]{0,10}window\.confirm/, 'must use the in-app showConfirm modal, not the native browser confirm() dialog');
});

test('acRequestDelete (shared by the modal, per-row icon, and bulk action) removes deleted rows locally and closes the modal only if the deleted alert was the one open in it', () => {
  assert.match(frontend, /function acRequestDelete\(items, confirmMessage\) \{/);
  assert.match(frontend, /alertComplianceReportData = alertComplianceReportData\.filter\(function \(r\) \{ return !deletedKeys\.has\(r\.fingerprintKey\); \}\);/);
  assert.match(frontend, /if \(deletedKeys\.has\(acActiveCommentFingerprintKey\)\) closeModal\('alertDetailModal'\);/);
});

test('acDeleteAlert (modal) and acDeleteAlertRow (table icon) both delegate to the shared acRequestDelete helper', () => {
  assert.match(frontend, /function acDeleteAlert\(\) \{\s*\n\s*if \(!acActiveCommentFingerprintKey\) return;\s*\n\s*acRequestDelete\(/);
  assert.match(frontend, /function acDeleteAlertRow\(fingerprintKey\) \{/);
  assert.match(frontend, /const row = alertComplianceReportData\.find\(function \(r\) \{ return r\.fingerprintKey === fingerprintKey; \}\);\s*\n\s*if \(!row\) return;\s*\n\s*acRequestDelete\(/);
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

test('acToggleSelectAll only selects rows matching the current filters, via the same acRowMatchesFilters predicate used by renderAlertComplianceTable (so the two can never drift out of sync)', () => {
  assert.match(frontend, /function acToggleSelectAll\(checked\) \{\s*\n\s*alertComplianceReportData\.filter\(acRowMatchesFilters\)\.forEach\(function \(r\) \{/);
  assert.match(frontend, /function acRowMatchesFilters\(r\) \{/);
  assert.match(frontend, /if \(state === 'incident_created'\)/);
  assert.match(frontend, /const rows = alertComplianceReportData\.filter\(acRowMatchesFilters\);/);
});

test('acRowMatchesFilters also filters by a From/To date range against the group\'s IST day key (r.day), matching the date inputs\' YYYY-MM-DD format', () => {
  assert.match(frontend, /const dateFrom = document\.getElementById\('acFilterDateFrom'\)\?\.value \|\| '';/);
  assert.match(frontend, /const dateTo = document\.getElementById\('acFilterDateTo'\)\?\.value \|\| '';/);
  assert.match(frontend, /if \(dateFrom && r\.day < dateFrom\) return false;/);
  assert.match(frontend, /if \(dateTo && r\.day > dateTo\) return false;/);
  assert.match(html, /<input id="acFilterDateFrom" onchange="acFilterChanged\(\)" type="date"\/>/);
  assert.match(html, /<input id="acFilterDateTo" onchange="acFilterChanged\(\)" type="date"\/>/);
  assert.match(reportController, /day: group\.day,/, 'the report row must expose the IST day key the date filter relies on');
});

test('acDeleteSelectedAlerts confirms once (via the shared acRequestDelete helper), posts all selected items in a single bulk request, and clears the selection on success', () => {
  assert.match(frontend, /function acDeleteSelectedAlerts\(\) \{/);
  assert.match(frontend, /acRequestDelete\(items, 'Remove ' \+ label \+ /);
  assert.match(frontend, /body: JSON\.stringify\(\{ items: items \}\)/);
  assert.match(frontend, /acSelectedAlerts\.clear\(\);/);
});

test('loadAlertComplianceReport resets the selection and uses a permission-aware colspan for the loading/error placeholder rows', () => {
  assert.match(frontend, /const colCount = hasPermission\('delete_alert_compliance_alerts'\) \? 10 : 9;/);
  assert.match(frontend, /acSelectedAlerts\.clear\(\);\s*\n\s*acCurrentPage = 1;\s*\n\s*if \(tbody\) tbody\.innerHTML = '<tr><td colspan="' \+ colCount \+ '"/);
});

// ── Requirement: delete icon matching the rest of the app, in the table too ──

test('the per-row delete icon uses the same 🗑 (&#128465;) style already used for delete actions elsewhere in the app (Incidents, Users, Roles, Drafts)', () => {
  assert.match(frontend, /class="btn btn-sm" onclick="event\.stopPropagation\(\);acDeleteAlertRow\(\\''[\s\S]{0,200}background:transparent;color:#f75c7c;border:none;font-size:15px;padding:3px 7px[\s\S]{0,100}&#128465;<\/button>/);
});

test('the modal delete button is now the same icon style, not a text button', () => {
  assert.match(html, /id="adDeleteBtn" onclick="acDeleteAlert\(\)" style="display:none;background:transparent;color:#f75c7c;border:none;font-size:15px;padding:3px 7px" title="Delete alert — admin only" aria-label="Delete alert">&#128465;<\/button>/);
  assert.doesNotMatch(html, />Delete Alert<\/button>/);
});

test('the per-row delete icon only embeds the safe fingerprintKey (hex hash) in its onclick, never the raw fingerprint text — which can contain literal quote characters from alert subjects like "Alert \'X\' was fired" and would break the generated JS if embedded directly', () => {
  assert.match(frontend, /function acDeleteAlertRow\(fingerprintKey\) \{/);
  assert.doesNotMatch(frontend, /acDeleteAlertRow\(\\'' \+ escapeMetricHtml\(r\.fingerprintKey\) \+ '\\', \\''/, 'must not take a second inline argument built from raw fingerprint/subject text');
});

// ── Requirement: pagination in the table view ──────────────────────────────

test('the table has a pagination bar (rows-per-page select, info label, and controls container) mirroring the Incidents table pattern', () => {
  assert.match(html, /<select id="acPerPageSelect" onchange="acChangePerPage\(this\.value\)">/);
  assert.match(html, /<span class="pagination-info" id="acPaginationInfo">Showing all results<\/span>/);
  assert.match(html, /<div class="pagination-controls" id="acPaginationBtns"><\/div>/);
});

test('renderAlertComplianceTable paginates the filtered rows with acCurrentPage/acPerPage, clamping the page in range and rendering only the current page slice', () => {
  assert.match(frontend, /let acCurrentPage = 1;/);
  assert.match(frontend, /let acPerPage = 25;/);
  assert.match(frontend, /const totalPages = Math\.max\(1, Math\.ceil\(rows\.length \/ acPerPage\)\);\s*\n\s*if \(acCurrentPage > totalPages\) acCurrentPage = totalPages;/);
  assert.match(frontend, /const sortedRows = acSortRows\(rows\);\s*\n\s*const pageStart = \(acCurrentPage - 1\) \* acPerPage;\s*\n\s*const pageRows = sortedRows\.slice\(pageStart, pageStart \+ acPerPage\);\s*\n\s*tbody\.innerHTML = pageRows\.map\(function \(r\) \{/);
});

test('acChangePerPage and acGoToPage reset/move the current page and re-render; filter changes (category/state/customer) reset back to page 1 via acFilterChanged', () => {
  assert.match(frontend, /function acChangePerPage\(val\) \{\s*\n\s*acPerPage = parseInt\(val, 10\) \|\| 25;\s*\n\s*acCurrentPage = 1;\s*\n\s*renderAlertComplianceTable\(\);\s*\n\}/);
  assert.match(frontend, /function acGoToPage\(page\) \{\s*\n\s*acCurrentPage = page;\s*\n\s*renderAlertComplianceTable\(\);\s*\n\}/);
  assert.match(frontend, /function acFilterChanged\(\) \{\s*\n\s*acCurrentPage = 1;\s*\n\s*renderAlertComplianceTable\(\);\s*\n\}/);
  assert.match(html, /id="acFilterCategory" onchange="acFilterChanged\(\)"/);
  assert.match(html, /id="acFilterState" onchange="acFilterChanged\(\)"/);
  assert.match(html, /id="acFilterCustomer" onchange="acFilterChanged\(\)"/);
});

test('acRenderPagination builds prev/next and numbered page buttons into acPaginationBtns, matching the pg-btn/pg-ellipsis styling used by the Incidents table pagination', () => {
  assert.match(frontend, /function acRenderPagination\(total\) \{/);
  assert.match(frontend, /prev\.className = 'pg-btn';/);
  assert.match(frontend, /span\.className = 'pg-ellipsis';/);
  assert.match(frontend, /b\.className = 'pg-btn' \+ \(p === acCurrentPage \? ' active' : ''\);/);
});

test('loadAlertComplianceReport and acFilterByState both reset acCurrentPage back to 1', () => {
  assert.match(frontend, /acSelectedAlerts\.clear\(\);\s*\n\s*acCurrentPage = 1;\s*\n\s*if \(tbody\) tbody\.innerHTML = '<tr><td colspan="' \+ colCount \+ '" style="text-align:center;color:var\(--text-muted\);padding:20px">Loading alert activity/);
  assert.match(frontend, /function acFilterByState\(state\) \{[\s\S]{0,150}acCurrentPage = 1;\s*\n\s*renderAlertComplianceTable\(\);\s*\n\}/);
});

// ── Requirement: STATE badge distinguishes a real incident follow-up ──────

test('acStateLabel: confirmed_resolved/manually_resolved with an (auto-linked or manually-tracked) incident show "Action Taken & Resolved"; either state without one shows the plainer "Resolved" regardless of which resolved state it is', () => {
  assert.match(frontend, /function acStateLabel\(r\) \{/);
  const body = frontend.slice(frontend.indexOf('function acStateLabel'), frontend.indexOf('function acStateLabel') + 500);
  assert.match(body, /if \(r\.state === 'confirmed_resolved' \|\| r\.state === 'manually_resolved'\) \{/);
  assert.match(body, /return acEffectiveIncidentRef\(r\) \? 'Action Taken & Resolved' : 'Resolved';/);
  assert.match(body, /return ALERT_COMPLIANCE_STATE_LABELS\[r\.state\] \|\| r\.state;/);
});

test('the table uses acTableStateLabel, and the detail modal + acResolveAlert\'s local badge update use acStateLabel, instead of the raw ALERT_COMPLIANCE_STATE_LABELS lookup, so the incident-aware label is consistent everywhere the STATE badge is rendered', () => {
  assert.match(frontend, /tbody\.innerHTML = pageRows\.map\(function \(r\) \{\s*\n\s*const stateLabel = acTableStateLabel\(r\);/);
  assert.match(frontend, /const stateLabel = acStateLabel\(row\);\s*\n\s*const stateClass = ALERT_COMPLIANCE_STATE_CLASS\[row\.state\] \|\| 'badge-progress';\s*\n\s*const badges = document\.getElementById\('adBadges'\);\s*\n\s*if \(badges\) \{/);
  assert.match(frontend, /const badges = document\.getElementById\('adBadges'\);\s*\n\s*if \(badges && row\) \{\s*\n\s*const stateLabel = acStateLabel\(row\);/);
  // acUpdateTicketStatus deals with open/in_progress/resolved ticket
  // statuses, never confirmed_resolved/manually_resolved, so it's
  // deliberately left on the plain label lookup, not acStateLabel.
  assert.match(frontend, /function acUpdateTicketStatus\(\) \{[\s\S]*?const stateLabel = ALERT_COMPLIANCE_STATE_LABELS\[row\.state\] \|\| row\.state;/);
});

// ── Requirement: manual "incident pending/created/not required" sub-status ──
// ── for resolved alerts with no auto-linked incident, shown in the       ──
// ── Incident column without changing the STATE badge itself             ──

test('the migration adds operations_alert_incident_substatus (pending/created/not_required), and the report attaches r.incidentSubstatus (and a manually-tracked r.incidentSubstatusRef) to every group', () => {
  const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '041_alert_incident_substatus.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS operations_alert_incident_substatus/);
  assert.match(migration, /substatus ENUM\('pending','created','not_required'\) NOT NULL/);
  const refMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '046_alert_incident_substatus_ref.sql'), 'utf8');
  assert.match(refMigration, /ADD COLUMN incident_ref VARCHAR\(20\) NULL AFTER substatus/);
  assert.match(reportController, /SELECT fingerprint_key, substatus, incident_ref FROM operations_alert_incident_substatus WHERE fingerprint_key IN \(\?\)/);
  assert.match(reportController, /r\.incidentSubstatus = row \? row\.substatus : null;/);
  assert.match(reportController, /r\.incidentSubstatusRef = row \? row\.incident_ref : null;/);
});

test('updateIncidentSubstatus validates fingerprintKey and restricts substatus to pending/created/not_required, and is routed under view_alert_compliance_report (any viewer can triage)', () => {
  assert.match(reportController, /const INCIDENT_SUBSTATUSES = new Set\(\['pending', 'created', 'not_required'\]\);/);
  assert.match(reportController, /const updateIncidentSubstatus = async \(req, res\) => \{/);
  assert.match(reportController, /if \(!INCIDENT_SUBSTATUSES\.has\(substatus\)\) \{/);
  assert.match(reportController, /module\.exports = \{ getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, updateTicketStatus, updateIncidentSubstatus, deleteAlert, getAlertMessage \};/);
  assert.match(reportRoutes, /router\.post\('\/incident-substatus', requirePermission\('view_alert_compliance_report'\), updateIncidentSubstatus\)/);
});

test('the incident sub-status section and select exist in the detail modal, hidden by default', () => {
  assert.match(html, /id="adIncidentSubstatusSection" style="display:none/);
  assert.match(html, /id="adIncidentSubstatusSelect" onchange="acToggleIncidentRefInput\(\)"/);
  assert.match(html, /<option value="pending">Incident Pending<\/option>/);
  assert.match(html, /<option value="created">Incident Created<\/option>/);
  assert.match(html, /<option value="not_required">Not Required<\/option>/);
});

// ── Requirement: track an incident created the normal way (the Incidents ──
// ── tab's own Create Incident button) against its originating alert,     ──
// ── since only the mailbox's per-alert button auto-links one            ──
test('the Incident ID input exists next to the sub-status select, hidden until "Incident Created" is picked', () => {
  assert.match(html, /<input type="text" id="adIncidentRefInput" placeholder="Incident ID, e\.g\. INC-123" style="display:none/);
  assert.match(frontend, /function acToggleIncidentRefInput\(\) \{/);
  assert.match(frontend, /input\.style\.display = \(select && select\.value === 'created'\) \? '' : 'none';/);
});

test('updateIncidentSubstatus validates a typed incidentRef looks like INC-\\d+ and actually exists in the incidents table, and clears it for any sub-status other than created', () => {
  assert.match(reportController, /const INCIDENT_REF_PATTERN = \/\^INC-\\d\+\$\/i;/);
  assert.match(reportController, /if \(substatus !== 'created'\) \{\s*\n\s*incidentRef = '';\s*\n\s*\} else if \(incidentRef\) \{/);
  assert.match(reportController, /if \(!INCIDENT_REF_PATTERN\.test\(incidentRef\)\) \{/);
  assert.match(reportController, /SELECT id FROM incidents WHERE incident_ref = \? LIMIT 1/);
  assert.match(reportController, /INSERT INTO operations_alert_incident_substatus \(fingerprint_key, alert_fingerprint, substatus, incident_ref, updated_by\)/);
});

test('acEffectiveIncidentRef prefers the auto-linked incidentRef, falling back to a manually-tracked incidentSubstatusRef only when substatus is created, and every incident link/badge in the Alert Compliance report goes through it or acIncidentBadgeHtml', () => {
  assert.match(frontend, /function acEffectiveIncidentRef\(r\) \{\s*\n\s*return r\.incidentRef \|\| \(r\.incidentSubstatus === 'created' \? \(r\.incidentSubstatusRef \|\| null\) : null\);\s*\n\}/);
  assert.match(frontend, /const effectiveIncidentRef = acEffectiveIncidentRef\(r\);/);
  assert.match(frontend, /\? '<a href="javascript:void\(0\)" onclick="event\.stopPropagation\(\);acOpenIncident\(\\'' \+ escapeMetricHtml\(effectiveIncidentRef\)/);
  assert.match(frontend, /\['Incident', acEffectiveIncidentRef\(row\) \|\| 'None'\]/);
});

test('acShowsIncidentSubstatus is true only for confirmed_resolved/manually_resolved rows with no incidentRef, and gates both the table\'s Incident-column badge and the detail modal\'s sub-status section', () => {
  assert.match(frontend, /function acShowsIncidentSubstatus\(r\) \{\s*\n\s*return !r\.incidentRef && \(r\.state === 'confirmed_resolved' \|\| r\.state === 'manually_resolved'\);\s*\n\}/);
  assert.match(frontend, /\(acShowsIncidentSubstatus\(r\) && r\.incidentSubstatus && ALERT_INCIDENT_SUBSTATUS_LABELS\[r\.incidentSubstatus\]\)/);
  assert.match(frontend, /const showSubstatus = acShowsIncidentSubstatus\(row\);\s*\n\s*substatusSection\.style\.display = showSubstatus \? '' : 'none';/);
});

test('acUpdateIncidentSubstatus posts to /incident-substatus (including the manually-typed incidentRef) without requiring a comment, updates the row locally, and never touches row.state (the STATE badge stays "Resolved"/"Action Taken & Resolved")', () => {
  assert.match(frontend, /function acUpdateIncidentSubstatus\(\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/operations-alerts\/incident-substatus'/);
  assert.match(frontend, /body: JSON\.stringify\(\{ fingerprintKey: acActiveCommentFingerprintKey, fingerprint: acActiveCommentFingerprint, substatus: substatus, incidentRef: incidentRef \}\)/);
  assert.match(frontend, /row\.incidentSubstatus = substatus;/);
  assert.match(frontend, /row\.incidentSubstatusRef = result\.data\.incidentRef \|\| null;/);
  const body = frontend.slice(frontend.indexOf('function acUpdateIncidentSubstatus'), frontend.indexOf('function acUpdateIncidentSubstatus') + 1800);
  assert.doesNotMatch(body, /row\.state = substatus;/, 'must never overwrite the alert\'s own activity state');
});

// ── Requirement: sortable (ascending/descending) column headers ───────────

test('every sortable column header uses its own ac-sort-th class (kept separate from the Incidents table\'s sort-th, so the two tables\' click handlers can never collide) with a data-col and an acSortBy(...) click handler', () => {
  const cols = ['subject', 'category', 'severity', 'customer', 'firstSeen', 'lastSeen', 'state', 'incidentRef', 'commentCount'];
  cols.forEach(function (col) {
    const re = new RegExp('<th class="ac-sort-th" data-col="' + col + '" onclick="acSortBy\\(\'' + col + '\'\\)"');
    assert.match(html, re, 'missing sortable header for column: ' + col);
  });
});

test('acSortBy toggles asc/desc on repeat clicks of the same column, and resets to asc on a new column; acCurrentPage resets to 1 so a re-sort doesn\'t leave you stranded on a now-invalid page', () => {
  assert.match(frontend, /let acSortCol = 'lastSeen';/);
  assert.match(frontend, /let acSortDir = 'desc';/);
  assert.match(frontend, /function acSortBy\(col\) \{\s*\n\s*if \(acSortCol === col\) \{\s*\n\s*acSortDir = acSortDir === 'asc' \? 'desc' : 'asc';\s*\n\s*\} else \{\s*\n\s*acSortCol = col;\s*\n\s*acSortDir = 'asc';\s*\n\s*\}\s*\n\s*acCurrentPage = 1;\s*\n\s*renderAlertComplianceTable\(\);\s*\n\}/);
});

test('acSortRows sorts a copy of the array (never mutates the input) by acSortCol/acSortDir, case-insensitively for strings, and is applied to the filtered rows before the pagination slice', () => {
  assert.match(frontend, /function acSortRows\(arr\) \{\s*\n\s*if \(!acSortCol\) return arr;\s*\n\s*return arr\.slice\(\)\.sort\(function \(a, b\) \{/);
  assert.match(frontend, /if \(typeof av === 'string'\) av = av\.toLowerCase\(\);/);
  assert.match(frontend, /const sortedRows = acSortRows\(rows\);\s*\n\s*const pageStart = \(acCurrentPage - 1\) \* acPerPage;\s*\n\s*const pageRows = sortedRows\.slice\(pageStart, pageStart \+ acPerPage\);/);
});

test('renderAlertComplianceTable updates each ac-sort-th header\'s arrow (↑/↓) and highlight to reflect the current acSortCol/acSortDir', () => {
  assert.match(frontend, /document\.querySelectorAll\('\.ac-sort-th'\)\.forEach\(function \(th\) \{\s*\n\s*const col = th\.dataset\.col;\s*\n\s*const arrow = col === acSortCol \? \(acSortDir === 'asc' \? ' ↑' : ' ↓'\) : '';\s*\n\s*th\.textContent = th\.textContent\.replace\(\/ \[↑↓\]\$\/, ''\) \+ arrow;\s*\n\s*th\.style\.color = col === acSortCol \? 'var\(--accent\)' : '';\s*\n\s*\}\);/);
});

// ── Requirement: table STATE column shows "went_quiet" as just "Active" ──
// ── until resolved; the specific "Went Quiet — Unconfirmed" wording only ──
// ── appears once the alert is opened in the detail view                 ──

test('acTableStateLabel relabels went_quiet as "Active" but otherwise delegates to acStateLabel unchanged (so Resolved/Action Taken & Resolved/etc. still show as before)', () => {
  assert.match(frontend, /function acTableStateLabel\(r\) \{\s*\n\s*if \(r\.state === 'went_quiet'\) return 'Active';\s*\n\s*return acStateLabel\(r\);\s*\n\}/);
});

test('the table row uses acTableStateLabel, while the detail modal open and acResolveAlert\'s local badge update still use the unmodified acStateLabel — so "Went Quiet — Unconfirmed" only ever appears once you open the alert', () => {
  assert.match(frontend, /tbody\.innerHTML = pageRows\.map\(function \(r\) \{\s*\n\s*const stateLabel = acTableStateLabel\(r\);/);
  // acOpenAlertDetail's badge build, acResolveAlert's local badge refresh,
  // and acUpdateIncidentSubstatus's local badge refresh must be the only
  // remaining acStateLabel(row) call sites — acTableStateLabel is only for
  // the table.
  const stateLabelCalls = frontend.match(/const stateLabel = acStateLabel\(row\);/g) || [];
  assert.equal(stateLabelCalls.length, 3, 'expected exactly three remaining acStateLabel(row) call sites (detail modal open, acResolveAlert badge refresh, acUpdateIncidentSubstatus badge refresh)');
});

// ── Requirement: closing/resolving the linked incident auto-resolves the ──
// ── alert itself, without needing a manual "Mark as Resolved" click      ──

test('attachMailboxIncidentLinks/applyMailboxIncidentLinks now also carries the linked incident\'s own status (incidentStatus), via a new i.status column in the same join — additive, no existing field removed', () => {
  const mailboxController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
  assert.match(mailboxController, /SELECT a\.graph_message_id, i\.incident_ref, i\.status AS incident_status/);
  assert.match(mailboxController, /if \(link\.incident_ref\) return \{ \.\.\.message, incidentCreated: true, incidentRef: link\.incident_ref, incidentStatus: link\.incident_status \|\| null \};/);
});

test('getAlertComplianceReport looks up the linked incident\'s status per group and auto-promotes the state to confirmed_resolved once that incident is resolved/closed — no manual resolve click needed', () => {
  assert.match(reportController, /const CLOSED_INCIDENT_STATUSES = new Set\(\['resolved', 'closed'\]\);/);
  assert.match(reportController, /const linkedIncident = group\.messageIds\.map\(\(id\) => incidentByMessageId\.get\(id\)\)\.find\(Boolean\) \|\| null;/);
  assert.match(reportController, /const linkedIncidentRef = linkedIncident \? linkedIncident\.ref : null;/);
  assert.match(reportController, /if \(linkedIncident && CLOSED_INCIDENT_STATUSES\.has\(linkedIncident\.status\)\) \{\s*\n\s*state = 'confirmed_resolved';\s*\n\s*\}/);
  assert.match(reportController, /annotated\.filter\(\(m\) => m\.incidentCreated\)\.map\(\(m\) => \[m\.id, \{ ref: m\.incidentRef, status: m\.incidentStatus \|\| null \}\]\)/);
});

// ── Requirement: @mention autocomplete in the alert comment box, and an ──
// ── actual email sent to each mentioned user (not just an in-app note)  ──

test('the alert comment textarea wires the same handleMentionInput/closeMentionDropdown pattern already used by the other two comment boxes, into its own dedicated acMentionDropdown', () => {
  assert.match(html, /<div id="acMentionDropdown" style="display:none;position:absolute;bottom:calc\(100% \+ 4px\);left:0;right:0;background:var\(--surface\);border:1px solid var\(--border2\);border-radius:10px;box-shadow:0 8px 28px rgba\(0,0,0,0\.35\);z-index:999;overflow:hidden"><\/div>/);
  assert.match(html, /<textarea id="acCommentInput" onblur="setTimeout\(function\(\)\{closeMentionDropdown\('acMentionDropdown'\)\},200\)" oninput="handleMentionInput\(this,'acMentionDropdown'\)" onkeydown="handleAcCommentKey\(event\)"/);
});

test('handleAcCommentKey only intercepts Enter to accept a mention suggestion (via the shared selectMentionOnEnter), leaving plain Enter/newline behavior alone for this multi-line textarea', () => {
  assert.match(frontend, /function handleAcCommentKey\(e\) \{\s*\n\s*if \(selectMentionOnEnter\(e, 'acCommentInput', 'acMentionDropdown'\)\) return;\s*\n\}/);
});

test('acOpenAlertDetail also captures the alert\'s subject text (acActiveCommentSubject), and acSubmitComment sends it along as alertSubject for the mention email — it is never persisted to operations_alert_comments itself', () => {
  assert.match(frontend, /let acActiveCommentSubject = null;/);
  assert.match(frontend, /acActiveCommentSubject = row\.subject \|\| '';/);
  assert.match(frontend, /body: JSON\.stringify\(\{ fingerprintKey: acActiveCommentFingerprintKey, fingerprint: acActiveCommentFingerprint, alertSubject: acActiveCommentSubject, comment: text \}\)/);
});

test('notificationService exposes findMentionedUsers, returning active users (with email) whose full name is @mentioned, reusing the same containsMention check notifyUsers already relies on', () => {
  const notificationService = fs.readFileSync(path.join(root, 'backend', 'services', 'notificationService.js'), 'utf8');
  assert.match(notificationService, /async function findMentionedUsers\(text\) \{/);
  assert.match(notificationService, /SELECT id, full_name, email FROM users WHERE is_active = 1/);
  assert.match(notificationService, /return users\.filter\(\(user\) => containsMention\(text, user\.full_name\)\);/);
  assert.match(notificationService, /module\.exports = \{\s*\n\s*notifyUsers,\s*\n\s*notifyMailboxUsers,\s*\n\s*markMailboxNotificationsRead,\s*\n\s*containsMention,\s*\n\s*findMentionedUsers,/);
});

test('addAlertComment records the usual in-app mention notification AND emails every @mentioned user with an email address, via the existing generic sendCriticalIncidentEmail sender and the shared mentionNotificationEmailHtml template', () => {
  assert.match(reportController, /const \{ notifyUsers, findMentionedUsers \} = require\('\.\.\/services\/notificationService'\);/);
  assert.match(reportController, /const \{ listMailboxFolderMessages, getInboxMessage, sendCriticalIncidentEmail, mentionNotificationEmailHtml \} = require\('\.\.\/services\/emailService'\);/);
  assert.match(reportController, /await notifyUsers\(\{\s*\n\s*actorId: req\.user\.id,\s*\n\s*message: `\$\{actorName\} commented on an alert\$\{alertSubject \? ` \(\$\{alertSubject\}\)` : ''\}: \$\{commentText\}`,\s*\n\s*type: 'alert_comment',\s*\n\s*mentionText: commentText\s*\n\s*\}\);/);
  assert.match(reportController, /const mentioned = await findMentionedUsers\(commentText\);/);
  assert.match(reportController, /await Promise\.all\(mentioned\.filter\(\(user\) => user\.email\)\.map\(\(user\) =>\s*\n\s*sendCriticalIncidentEmail\(\{/);
  assert.match(reportController, /html: mentionNotificationEmailHtml\(\{\s*\n\s*actorName, commentText,\s*\n\s*itemLabel: alertSubject \|\| 'Alert Compliance',\s*\n\s*actionUrl: portalBaseUrl \? `\$\{portalBaseUrl\}\/#alertCompliance` : '',\s*\n\s*actionLabel: 'Open Alert Compliance'\s*\n\s*\}\)/);
});

test('emailService exports a shared mentionNotificationEmailHtml template, reused by both the Alert Compliance and incident comment mention emails instead of duplicating the markup', () => {
  const emailService = fs.readFileSync(path.join(root, 'backend', 'services', 'emailService.js'), 'utf8');
  assert.match(emailService, /function mentionNotificationEmailHtml\(\{ actorName, commentText, itemLabel, actionUrl, actionLabel \}\) \{/);
  assert.match(emailService, /module\.exports = \{[^}]*mentionNotificationEmailHtml[^}]*\};/);
});

test('the mention email CCs the commenter so they get a copy of who was notified, except when they mentioned themselves (to and cc would be identical)', () => {
  assert.match(reportController, /const actorEmail = String\(req\.user\.email \|\| ''\)\.trim\(\);/);
  assert.match(reportController, /cc: actorEmail && actorEmail\.toLowerCase\(\) !== String\(user\.email\)\.toLowerCase\(\) \? actorEmail : '',/);
});

test('a mention email delivery failure is caught per-recipient and only logged — it must never make the comment endpoint itself fail or roll back the already-saved comment', () => {
  const bodyStart = reportController.indexOf('const addAlertComment = async');
  const bodyEnd = reportController.indexOf('const resolveAlertManually');
  const body = reportController.slice(bodyStart, bodyEnd);
  assert.match(body, /\.catch\(\(error\) => console\.error\('Mention email delivery error:', error\.message\)\)/);
});

// ── Requirement: a derived P1/P2/P3 severity for Coralogix/Azure alerts ───

test('deriveAlertSeverity reads Azure\'s own numeric "Severity: N" subject convention first (Sev0/Sev1=Critical/Error→P1, Sev2=Warning→P2, Sev3+=Informational→P3), with or without the "Sev" prefix, before ever looking at body text', () => {
  assert.equal(grouping.deriveAlertSeverity('Azure: Activated Severity: 0 BUR No Historian Read', ''), 'P1');
  assert.equal(grouping.deriveAlertSeverity('Azure: Deactivated Severity: 1 BUR No Historian Read', ''), 'P1');
  assert.equal(grouping.deriveAlertSeverity('Azure: Activated Severity: Sev2 XPI_ProjectStatus', ''), 'P2');
  assert.equal(grouping.deriveAlertSeverity('Azure: Deactivated Severity: 3 BUR No Historian Read', ''), 'P3');
  assert.equal(grouping.deriveAlertSeverity('Azure: Activated Severity: 4 BUR No Historian Read', 'Critical severity text here'), 'P3', 'Sev4 (Verbose) falls back to P3, and the numeric subject match must win over any body text');
});

test('deriveAlertSeverity mirrors Coralogix\'s own embedded "Priority P#" exactly as shown in the email — not a word-based re-derivation — since the raw email already displays that literal P-number to the viewer and a differing value would look wrong next to it', () => {
  assert.equal(grouping.deriveAlertSeverity('Coralogix Alert on magic / X', 'Severity CRITICAL Priority P1 Conditions ...'), 'P1');
  assert.equal(grouping.deriveAlertSeverity('Coralogix Alert on magic / X', 'Severity ERROR Priority P2 Conditions ...'), 'P2', 'mirrors Coralogix\'s own "P2" tag for this alert as-is');
  assert.equal(grouping.deriveAlertSeverity('Coralogix Alert on magic / X', 'Severity WARNING Priority P3 Conditions ...'), 'P3', 'mirrors Coralogix\'s own "P3" tag for this alert as-is, even though it is a Warning');
});

test('a bare "Severity <WORD>" with no Priority number following it still falls back to the word-based mapping, same as Azure\'s other style', () => {
  assert.equal(grouping.deriveAlertSeverity('Coralogix Alert on magic / X', 'Severity CRITICAL with no priority label at all'), 'P1');
  assert.equal(grouping.deriveAlertSeverity('Coralogix Alert on magic / X', 'Severity WARNING with no priority label at all'), 'P2');
});

test('deriveAlertSeverity also recognizes Azure\'s other alert style, where the word comes BEFORE the word "severity" in the body (e.g. "Critical severity Alert \'X\' was fired") instead of after a "Severity:" label', () => {
  assert.equal(grouping.deriveAlertSeverity("Alert 'Critical Availability Alert - Virtual Machine - Unavailable' was fired", "some text Critical severity Alert 'Critical Availability Alert' more text"), 'P1');
  assert.equal(grouping.deriveAlertSeverity("Alert 'X' was fired", 'Warning severity Alert X'), 'P2');
  assert.equal(grouping.deriveAlertSeverity("Alert 'X' was fired", 'Informational severity Alert X'), 'P3');
});

test('deriveAlertSeverity returns null when no recognized severity text exists anywhere, rather than guessing — e.g. Jira customer tickets and the generic word "information" appearing in ordinary prose (not immediately paired with "severity")', () => {
  assert.equal(grouping.deriveAlertSeverity('A new support issue CD-174 was reported by the customer', 'No historian read related content'), null);
  assert.equal(grouping.deriveAlertSeverity('Notification for Scheduled Maintenance', 'Feel free to refer to your portal for more information.'), null, 'the bare word "information" elsewhere in ordinary prose must not be misread as a severity level');
});

test('operationsAlertGroupingService exports deriveAlertSeverity', () => {
  assert.match(fs.readFileSync(path.join(root, 'backend', 'services', 'operationsAlertGroupingService.js'), 'utf8'), /module\.exports = \{[\s\S]*deriveAlertSeverity[\s\S]*\};/);
});

test('mailboxController now exports plainMailText so the report controller can reuse the same HTML-to-plain-text stripping instead of matching a severity regex against raw, tag-laden HTML', () => {
  const mailboxController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
  assert.match(mailboxController, /function plainMailText\(value\) \{/);
  assert.match(mailboxController, /module\.exports = \{[^}]*\bplainMailText\b[^}]*\};/);
  assert.match(reportController, /const \{ attachMailboxIncidentLinks, matchingCustomersByName, plainMailText \} = require\('\.\/mailboxController'\);/);
});

test('getAlertComplianceReport computes severity per group: a cheap subject-only attempt first (covers Azure\'s numeric-subject style for free), then — only for Coralogix/Azure groups still unresolved, never Jira — fetches that group\'s latest occurrence body, stripped to plain text, caches the result by message id, and retries once before giving up on a transient failure', () => {
  assert.match(reportController, /report\.forEach\(\(r\) => \{ r\.severity = deriveAlertSeverity\(r\.subject, ''\); \}\);/);
  assert.match(reportController, /const needsSeverityBodyFetch = report\.filter\(\(r\) => r\.severity === null && \(r\.category === 'coralogix' \|\| r\.category === 'azure'\) && r\.occurrences\[0\]\);/);
  assert.match(reportController, /const alertSeverityCache = new Map\(\); \/\/ messageId -> \{ severity, expiresAt \}/);
  assert.match(reportController, /const ALERT_SEVERITY_CACHE_TTL_MS = 24 \* 60 \* 60 \* 1000;/);
  assert.match(reportController, /if \(cached && cached\.expiresAt > severityCacheNow\) \{ r\.severity = cached\.severity; return; \}/);
  assert.match(reportController, /for \(let attempt = 0; attempt < 2; attempt \+= 1\) \{/);
  assert.match(reportController, /const severity = deriveAlertSeverity\(r\.subject, plainMailText\(message\.body \|\| message\.preview \|\| ''\), r\.category\);/);
});

test('the severity body-fetch batch is kept small (2 at a time, with a pause between batches) since the mailbox already sits close to Microsoft Graph\'s own concurrency ceiling from the unrelated Operations mail center polling', () => {
  assert.match(reportController, /const SEVERITY_BODY_FETCH_BATCH_SIZE = 2;/);
  assert.match(reportController, /if \(i \+ SEVERITY_BODY_FETCH_BATCH_SIZE < needsSeverityBodyFetch\.length\) await sleep\(200\);/);
});

test('the frontend adds a Severity filter (All/P1/P2/P3) that narrows acRowMatchesFilters exactly like Category does', () => {
  assert.match(html, /<option value="P1">P1 — Critical\/Error<\/option>/);
  assert.match(html, /<option value="P2">P2 — Warning<\/option>/);
  assert.match(html, /<option value="P3">P3 — Information<\/option>/);
  assert.match(frontend, /const severity = document\.getElementById\('acFilterSeverity'\)\?\.value \|\| '';/);
  assert.match(frontend, /if \(severity && r\.severity !== severity\) return false;/);
});

test('the table has a sortable Severity column (header + badge cell), positioned right after Category, rendering "—" when a group has no derived severity instead of an empty cell', () => {
  assert.match(html, /<th class="ac-sort-th" data-col="severity" onclick="acSortBy\('severity'\)" style="cursor:pointer;user-select:none">Severity<\/th>/);
  assert.match(frontend, /const ALERT_COMPLIANCE_SEVERITY_LABELS = \{ P1: 'P1', P2: 'P2', P3: 'P3' \};/);
  assert.match(frontend, /const ALERT_COMPLIANCE_SEVERITY_CLASS = \{ P1: 'badge-critical', P2: 'badge-high', P3: 'badge-medium' \};/);
  assert.match(frontend, /\(r\.severity \? '<span class="badge ' \+ ALERT_COMPLIANCE_SEVERITY_CLASS\[r\.severity\] \+ '">' \+ escapeMetricHtml\(ALERT_COMPLIANCE_SEVERITY_LABELS\[r\.severity\]\) \+ '<\/span>' : '<span style="color:var\(--text-muted\)">—<\/span>'\)/);
});

test('both table colspan placeholders (loading/error and empty-state) account for the new Severity column — 10 when the delete checkbox column is also shown, 9 otherwise', () => {
  assert.match(frontend, /const colCount = hasPermission\('delete_alert_compliance_alerts'\) \? 10 : 9;/);
  assert.match(frontend, /const colCount = canDelete \? 10 : 9;/);
});

// ── Requirement: Azure-only fallback to the exported Azure Monitor alert- ──
// ── rules reference, when neither subject nor body states a severity      ──

test('azureAlertSeverityRules loads the exported CSV and maps SevN to P1/P2/P3 (Sev0/Sev1=P1, Sev2=P2, Sev3+=P3)', () => {
  const azureRules = require(path.join(root, 'backend', 'services', 'azureAlertSeverityRules.js'));
  // Exact quoted-subject-name lookups against real rule names from the CSV.
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName("Alert 'Critical Availability Alert - Virtual Machine - Unavailable' was STATE", ''), 'P1', 'Sev0 -> P1');
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName("Alert 'Free Disk Space Low' was STATE", ''), 'P1');
  // Free Disk Space Low is actually Sev1 in the CSV, not Sev0 — both still map to P1.
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName("Alert 'CPU Usage' was STATE", ''), 'P2', 'Sev2 -> P2');
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName("Alert 'Failure Anomalies - ngcmdeapp' was STATE", ''), 'P3', 'Sev3 -> P3');
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName("Alert 'NGC Service Health Alert Rule' was STATE", ''), 'P3', 'Sev4 -> P3');
});

test('azureAlertSeverityRules also finds a rule name mentioned in prose (not quoted) in the subject+body, for alerts like Azure Service Health notices that name their own alert rule inline', () => {
  const azureRules = require(path.join(root, 'backend', 'services', 'azureAlertSeverityRules.js'));
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName('Action required: Prepare for Azure VM series retirements', 'The activity log alert NGC Service Health Alert Rule was triggered for the Azure subscription MCS-US'), 'P3');
});

test('azureAlertSeverityRules returns null, not a guess, when no known rule name appears anywhere', () => {
  const azureRules = require(path.join(root, 'backend', 'services', 'azureAlertSeverityRules.js'));
  assert.equal(azureRules.lookupAzureAlertSeverityByRuleName('Some unrelated subject', 'Some unrelated body text with no rule name in it'), null);
});

test('deriveAlertSeverity only reaches the Azure rule-name fallback when subject AND body both have nothing, and only when category is azure — it never overrides a real severity word found in the body, and never applies to Coralogix/Jira even if their text happens to contain a matching rule name', () => {
  // Azure, nothing in subject or body at all -> falls through to the CSV.
  assert.equal(grouping.deriveAlertSeverity("Alert 'Redis Connection Lost' was STATE", '', 'azure'), 'P1');
  // Azure, but a real severity word IS present in the body -> that wins, CSV is never consulted.
  assert.equal(grouping.deriveAlertSeverity("Alert 'Redis Connection Lost' was STATE", 'Warning severity for this alert', 'azure'), 'P2');
  // Same subject/body, but category is NOT azure -> fallback must not apply, even though the text would otherwise match.
  assert.equal(grouping.deriveAlertSeverity("Alert 'Redis Connection Lost' was STATE", '', 'coralogix'), null);
  assert.equal(grouping.deriveAlertSeverity("Alert 'Redis Connection Lost' was STATE", '', 'jira'), null);
  assert.equal(grouping.deriveAlertSeverity("Alert 'Redis Connection Lost' was STATE", '', undefined), null, 'no category at all must also never trigger the Azure-only fallback');
});

test('the report only passes category into deriveAlertSeverity on the body-fetch pass, not the cheap subject-only first pass, so the Azure CSV fallback can never pre-empt a real severity word that would have been found in the body', () => {
  assert.match(reportController, /report\.forEach\(\(r\) => \{ r\.severity = deriveAlertSeverity\(r\.subject, ''\); \}\);/);
  assert.doesNotMatch(reportController, /deriveAlertSeverity\(r\.subject, ''\), r\.category\)/);
  assert.match(reportController, /const severity = deriveAlertSeverity\(r\.subject, plainMailText\(message\.body \|\| message\.preview \|\| ''\), r\.category\);/);
});
