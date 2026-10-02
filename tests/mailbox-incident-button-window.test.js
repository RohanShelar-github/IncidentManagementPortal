'use strict';

// The Operations mailbox list's "+ Create Incident" button used to appear on
// every single repeat of a monitoring alert (e.g. every ~10 minutes). Now it
// only shows on the occurrence that STARTS a rolling 8-hour window per alert
// identity — every other repeat within that window is suppressed — and
// reappears once a new occurrence lands 8+ hours after the window started,
// which then begins the next window. This never affects rows that already
// have a real "Incident Created"/"Incident Draft" badge.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const emailService = fs.readFileSync(path.join(root, 'backend', 'services', 'emailService.js'), 'utf8');
const mailboxController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
const grouping = require(path.join(root, 'backend', 'services', 'operationsAlertGroupingService.js'));

function msg(id, fromAddr, subject, receivedAt, extra) {
  return Object.assign({ id, from: fromAddr, subject, receivedAt, category: 'coralogix' }, extra || {});
}

test('INCIDENT_BUTTON_WINDOW_MS is exactly 8 hours', () => {
  assert.equal(grouping.INCIDENT_BUTTON_WINDOW_MS, 8 * 60 * 60 * 1000);
});

test('markIncidentButtonWindowStarts marks only the first occurrence of a repeating alert within 8 hours as eligible', () => {
  const base = Date.parse('2026-10-02T00:00:00Z');
  const occurrences = [];
  // Fires every 10 minutes for 7 hours (42 occurrences) — all inside one window.
  for (let i = 0; i < 42; i += 1) {
    occurrences.push(msg('m' + i, 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + i * 10 * 60000).toISOString()));
  }
  const eligible = grouping.markIncidentButtonWindowStarts(occurrences);
  assert.equal(eligible.size, 1);
  assert.ok(eligible.has('m0'), 'only the very first occurrence should be eligible');
});

test('the button reappears once an occurrence lands 8+ hours after the window start, and that occurrence becomes the new window start', () => {
  const base = Date.parse('2026-10-02T00:00:00Z');
  const occurrences = [
    msg('a1', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base).toISOString()),
    msg('a2', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + 2 * 3600000).toISOString()),
    msg('a3', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + 7.9 * 3600000).toISOString()),
    // Exactly at the 8h boundary from a1 — must start a new window.
    msg('a4', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + 8 * 3600000).toISOString()),
    msg('a5', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + 8.5 * 3600000).toISOString()),
    // Well past two windows from a1 (16h+) — must start a third window.
    msg('a6', 'alerts@coralogix.com', 'Coralogix Alert on magic / Node Memory', new Date(base + 16.2 * 3600000).toISOString())
  ];
  const eligible = grouping.markIncidentButtonWindowStarts(occurrences);
  assert.deepEqual(Array.from(eligible).sort(), ['a1', 'a4', 'a6']);
});

test('different alerts (different sender/subject fingerprints) each get their own independent window, never sharing eligibility', () => {
  const base = Date.parse('2026-10-02T00:00:00Z');
  const occurrences = [
    msg('x1', 'alerts@coralogix.com', 'Coralogix Alert on magic / Disk Low', new Date(base).toISOString()),
    msg('x2', 'alerts@coralogix.com', 'Coralogix Alert on magic / Disk Low', new Date(base + 600000).toISOString()),
    msg('y1', 'azure-noreply@microsoft.com', "Alert 'No Historian Read' was fired", new Date(base + 300000).toISOString(), { category: 'azure' }),
    msg('y2', 'azure-noreply@microsoft.com', "Alert 'No Historian Read' was fired", new Date(base + 900000).toISOString(), { category: 'azure' })
  ];
  const eligible = grouping.markIncidentButtonWindowStarts(occurrences);
  assert.deepEqual(Array.from(eligible).sort(), ['x1', 'y1']);
});

test('resolved-variant messages are excluded entirely — they never become eligible and never consume/start a window slot', () => {
  const base = Date.parse('2026-10-02T00:00:00Z');
  const occurrences = [
    msg('r1', 'alerts@coralogix.com', 'Coralogix Alert on magic / Pod Memory', new Date(base).toISOString()),
    msg('r2', 'alerts@coralogix.com', 'Coralogix Alert on magic /  [RESOLVED] Pod Memory', new Date(base + 600000).toISOString()),
    // Fires again later, still well within 8h of r1 — must stay suppressed,
    // and the resolved message in between must not have reset anything.
    msg('r3', 'alerts@coralogix.com', 'Coralogix Alert on magic / Pod Memory', new Date(base + 3600000).toISOString())
  ];
  const eligible = grouping.markIncidentButtonWindowStarts(occurrences);
  assert.deepEqual(Array.from(eligible), ['r1']);
});

test('Jira tickets are windowed by issue key (via the existing alertFingerprint jira branch), not subject text, consistent with the rest of the grouping logic', () => {
  const base = Date.parse('2026-10-02T00:00:00Z');
  const occurrences = [
    msg('j1', 'automation@example.atlassian.net', 'A new support issue CD-170 was reported by the customer', new Date(base).toISOString(), { category: 'jira', jiraIssueKey: 'CD-170' }),
    msg('j2', 'rohan_shelar@magicsoftware.com', 'Re: A new support issue CD-170 was reported by the customer', new Date(base + 3600000).toISOString(), { category: 'jira', jiraIssueKey: 'CD-170' }),
    msg('j3', 'automation@example.atlassian.net', 'A new support issue CD-171 was reported by the customer', new Date(base + 1800000).toISOString(), { category: 'jira', jiraIssueKey: 'CD-171' })
  ];
  const eligible = grouping.markIncidentButtonWindowStarts(occurrences);
  assert.deepEqual(Array.from(eligible).sort(), ['j1', 'j3']);
});

test('messages missing a parseable receivedAt are ignored rather than crashing the computation', () => {
  const occurrences = [msg('bad', 'alerts@coralogix.com', 'Coralogix Alert on magic / X', null)];
  assert.doesNotThrow(() => grouping.markIncidentButtonWindowStarts(occurrences));
  assert.equal(grouping.markIncidentButtonWindowStarts(occurrences).size, 0);
});

test('emailService exposes a cached, bounded fetch of recent alert messages for the windowing computation, reusing listMailboxFolderMessages and classifyOperationsMessage', () => {
  assert.match(emailService, /const ALERT_WINDOW_CATEGORIES = new Set\(\['coralogix', 'azure', 'jira'\]\);/);
  assert.match(emailService, /async function fetchAlertMessagesSince\(sinceMs\) \{/);
  assert.match(emailService, /async function getCachedAlertMessagesSince\(sinceMs\) \{/);
  assert.match(emailService, /const ALERT_WINDOW_CACHE_TTL_MS = 90 \* 1000;/);
  assert.match(emailService, /module\.exports = \{ cleanAddressList, configured, countUnreadMailboxMessages, deleteInboxMessage, enrichInboxConversations, getAccessToken, getCachedAlertMessagesSince,/);
});

test('a cached window fetch is only reused when it already covers at least as far back as what is now being requested, so a wider lookback (e.g. Load More scrolled further into history) always triggers a fresh, correctly-ranged fetch instead of silently serving a too-narrow cached range', () => {
  assert.match(emailService, /if \(alertWindowMessagesCache && alertWindowMessagesCache\.expiresAt > now && alertWindowMessagesCache\.sinceMs <= sinceMs\) \{/);
  assert.match(emailService, /alertWindowMessagesCache = \{ expiresAt: now \+ ALERT_WINDOW_CACHE_TTL_MS, sinceMs, messages \};/);
});

test('mailboxController.listMailbox computes incidentButtonEligible per message via the cached window fetch, falling back to true (never suppress) if the computation itself fails', () => {
  assert.match(mailboxController, /const \{ INCIDENT_BUTTON_WINDOW_MS, markIncidentButtonWindowStarts \} = require\('\.\.\/services\/operationsAlertGroupingService'\);/);
  const start = mailboxController.indexOf('async function listMailbox');
  const end = mailboxController.indexOf('async function listIncidentSentMailbox');
  const body = mailboxController.slice(start, end);
  assert.match(body, /const windowMessages = await getCachedAlertMessagesSince\(sinceMs\);/);
  assert.match(body, /eligibleIds = markIncidentButtonWindowStarts\(windowMessages\);/);
  assert.match(body, /incidentButtonEligible: eligibleIds \? eligibleIds\.has\(message\.id\) : true/);
});

test('the window fetch always covers back to at least the oldest message on the CURRENT page, not just the last 8 hours from now — otherwise an older message already more than 8h old would be excluded from the computation entirely and would wrongly show no button at all, instead of getting its own earlier window start', () => {
  const start = mailboxController.indexOf('async function listMailbox');
  const end = mailboxController.indexOf('async function listIncidentSentMailbox');
  const body = mailboxController.slice(start, end);
  assert.match(body, /const receivedTimesMs = messages\.map\(\(message\) => \(message\.receivedAt \? new Date\(message\.receivedAt\)\.getTime\(\) : NaN\)\)\.filter\(Number\.isFinite\);/);
  assert.match(body, /const oldestVisibleMs = receivedTimesMs\.length \? Math\.min\(\.\.\.receivedTimesMs\) : Date\.now\(\);/);
  assert.match(body, /const sinceMs = Math\.min\(Date\.now\(\) - INCIDENT_BUTTON_WINDOW_MS, oldestVisibleMs\);/);
});

test('the frontend only suppresses the plain "+ Create Incident" button when mailboxHasCreateIncidentButton says no — the incidentCreated/incidentDraft badge branches are untouched', () => {
  assert.match(frontend, /var create = latest\.incidentCreated \? mailboxIncidentCreatedAction\(latest\) : latest\.incidentDraft \? mailboxIncidentDraftAction\(latest\) : \(mailboxHasCreateIncidentButton\(latest\) \? mailboxCreateIncidentButton\(latest\) : null\); if \(create\) \{ create\.classList\.add\('mailbox-row-create-incident'\); row\.appendChild\(create\); \}/);
});

// ── Requirement: a list filter to find the (rare) actionable alert among ──
// ── many suppressed repeats, instead of scrolling through all of them     ──

test('mailboxHasCreateIncidentButton is the single source of truth for "does this message show the + Create Incident button" — permission, not-sent, no existing incident/draft, not a resolved notification, and window-eligible', () => {
  assert.match(frontend, /function mailboxHasCreateIncidentButton\(message\) \{\s*\n\s*return hasPermission\('create_incidents'\) && message\.mailboxSource !== 'sent' && !message\.incidentCreated && !message\.incidentDraft && !isResolvedOperationsEmail\(message\) && message\.incidentButtonEligible !== false;\s*\n\}/);
});

test('a new "Create Incident Button" read-filter option lets the user isolate just the actionable alerts among many frequently-repeating, suppressed ones', () => {
  assert.match(frontend, /incident_eligible: 'Create Incident Button'/);
  assert.match(frontend, /\['all', 'unread', 'read', 'incident_sent', 'incident_eligible'\]\.indexOf\(filter\) > -1/);
  assert.match(frontend, /\['incident_eligible', 'Create Incident Button'\]/);
  assert.match(frontend, /if \(mailboxReadFilter === 'incident_eligible'\) messages = messages\.filter\(mailboxHasCreateIncidentButton\);/);
});

test('selecting the Create Incident Button filter is a plain client-side re-render over already-loaded messages, like Unread/Read — it does not need a fresh loadMailbox() round trip the way switching to/from Incident Sent does', () => {
  assert.match(frontend, /if \(mailboxReadFilter === 'incident_sent' \|\| previous === 'incident_sent'\) loadMailbox\(\); else renderMailboxList\(\);/);
});
