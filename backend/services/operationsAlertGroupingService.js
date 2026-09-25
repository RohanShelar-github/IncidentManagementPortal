'use strict';

const crypto = require('crypto');

// Groups repeated Operations-mailbox alert notifications (Coralogix / Azure)
// into a single logical "alert" so a PMO/Admin report can show one row per
// real-world alert instead of one row per 10-minute notification email.
//
// New, additive module — nothing here is imported by any existing feature.
// Deleting this file (and its one caller, operationsAlertReportController.js)
// fully removes the Alert Compliance report with no other side effects.
//
// Why subject-text grouping, not Microsoft Graph conversationId: verified
// empirically against the live mailbox before building this — a real alert
// that fired 35 times over several hours produced 35 distinct conversationIds
// (Coralogix/Azure send each repeat as an independent message, not a reply).
// Grouping must therefore be based on the alert's own subject convention.

// How long PMO/Admin should wait past the last-seen notification before an
// unresolved, non-incident alert is treated as "gone quiet" rather than
// "still actively repeating". Alerts fire roughly every 10 minutes; this
// buffer absorbs normal timing jitter without flagging a still-firing alert
// as quiet too eagerly.
const EXPECTED_NOTIFICATION_INTERVAL_MINUTES = 10;
const QUIET_THRESHOLD_MINUTES = EXPECTED_NOTIFICATION_INTERVAL_MINUTES * 2.5;

// Tokens that the same logical alert swaps between its "firing" and
// "resolved" notification, observed directly in the live mailbox:
//   Coralogix: "Coralogix Alert on magic / <name>" vs "... / [RESOLVED] <name>"
//   Azure (style A): "Azure: Activated Severity: ..." vs "Azure: Deactivated Severity: ..."
//   Azure (style B): "Alert '<name>' was fired" vs "Alert '<name>' was resolved"
function normalizeAlertSubject(subject) {
  return String(subject || '')
    .trim()
    .replace(/\[RESOLVED\]\s*/i, '')
    .replace(/\b(?:activated|deactivated)\b/i, 'STATE')
    .replace(/\bwas\s+(?:fired|resolved)\b/i, 'was STATE')
    .replace(/\s+/g, ' ')
    .trim();
}

function isResolvedVariant(subject) {
  const value = String(subject || '');
  return /\[RESOLVED\]/i.test(value) || /\bdeactivated\b/i.test(value) || /\bwas\s+resolved\b/i.test(value) || /\bresolved\b/i.test(value);
}

function alertFingerprint(message) {
  // Customer-raised tickets (category 'jira') all share an almost-identical
  // subject template ("A new support issue <KEY> was reported by the
  // customer"), so subject-text grouping alone would incorrectly merge
  // unrelated tickets into one row. Group these by their extracted Jira
  // issue key instead, which uniquely identifies the ticket — and
  // deliberately without the sender: the same ticket's thread is replied to
  // by several different addresses (the customer, support agents, Jira's
  // own automation), so including sender would incorrectly split one
  // ticket's conversation into several groups.
  if (message && message.category === 'jira' && message.jiraIssueKey) {
    return 'jira::' + String(message.jiraIssueKey).trim().toUpperCase();
  }
  const sender = String(message && message.from || '').trim().toLowerCase();
  const normalizedSubject = normalizeAlertSubject(message && message.subject).toLowerCase();
  return sender + '::' + normalizedSubject;
}

// IST (UTC+5:30) calendar-day key for a timestamp, used to split "the same
// alert on two different days" into separate report rows instead of one
// row averaged across the whole window. IST has no DST, so a fixed offset
// is safe here without needing a timezone library.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function alertDayKey(receivedAt) {
  const ms = receivedAt ? new Date(receivedAt).getTime() : NaN;
  if (!Number.isFinite(ms)) return 'unknown';
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Groups a flat list of already-fetched mailbox messages (each expected to
// carry at least { id, from, subject, receivedAt, category }) into one entry
// per unique alert PER CALENDAR DAY (IST) — the same alert firing on two
// different days produces two separate groups, each scoped to that day's
// own occurrences, so "Repeats"/"First Seen"/"Last Seen" never blur several
// days together into one misleading row. Pure function — no Graph or
// database access here.
//
// Known, accepted tradeoff of day-based splitting: an alert that fires
// continuously across midnight is split into a "yesterday" group and a
// "today" group, even though it never actually went quiet in between — the
// "yesterday" group can show as went_quiet once enough time has passed,
// while the alert is really still firing under today's group. This matches
// the explicit "unique alerts per day" requirement.
//
// Customer Raised Tickets (category 'jira') are deliberately exempt from
// day-splitting: a support ticket is a single ongoing case, not a
// repeating alert, so its "Re:" replies over several days must stay one
// row — otherwise its manually-set Open/In Progress/Resolved status (see
// operationsAlertReportController) would reset to "open" on every new
// day's row instead of tracking the one real ticket end to end.
function groupMessagesIntoAlerts(messages) {
  const groups = new Map();
  (messages || []).forEach((message) => {
    if (!message || !message.subject) return;
    const fingerprint = alertFingerprint(message);
    const day = alertDayKey(message.receivedAt);
    const dayFingerprint = message.category === 'jira' ? fingerprint : (fingerprint + '::' + day);
    const resolved = isResolvedVariant(message.subject);
    const receivedAt = message.receivedAt || null;
    let group = groups.get(dayFingerprint);
    if (!group) {
      group = {
        fingerprint: dayFingerprint,
        alertFingerprint: fingerprint,
        day,
        category: message.category || 'other',
        sender: String(message.from || '').trim(),
        sampleSubject: normalizeAlertSubject(message.subject),
        firstSeen: receivedAt,
        lastSeen: receivedAt,
        occurrenceCount: 0,
        hasResolvedSignal: false,
        messageIds: [],
        occurrences: []
      };
      groups.set(dayFingerprint, group);
    }
    group.occurrenceCount += 1;
    group.messageIds.push(message.id);
    group.occurrences.push({ id: message.id, receivedAt, subject: String(message.subject || ''), resolved });
    if (resolved) group.hasResolvedSignal = true;
    if (receivedAt && (!group.firstSeen || new Date(receivedAt) < new Date(group.firstSeen))) group.firstSeen = receivedAt;
    if (receivedAt && (!group.lastSeen || new Date(receivedAt) > new Date(group.lastSeen))) group.lastSeen = receivedAt;
  });
  return Array.from(groups.values());
}

// Stable, fixed-length key derived from a group's fingerprint, used to link
// admin/PMO comments (stored in operations_alert_comments) to a recurring
// alert across separate report loads, without indexing a variable-length
// sender+subject string directly.
function fingerprintKey(fingerprint) {
  return crypto.createHash('sha256').update(String(fingerprint || '')).digest('hex');
}

// Reflects the alert's own activity/resolution signal only — never
// "incident_created". Whether an incident exists is a separate, orthogonal
// fact (the caller attaches it as incidentRef), shown in the alert's detail
// view rather than replacing its real activity state in the table: an
// alert that already led to an incident can still legitimately be
// "actively_repeating" or "went_quiet" depending on whether it's still
// firing, and collapsing that into a single "Incident Created" state hid
// that signal.
function deriveAlertState(group, now = Date.now()) {
  if (group.hasResolvedSignal) return 'confirmed_resolved';
  const lastSeenMs = group.lastSeen ? new Date(group.lastSeen).getTime() : NaN;
  const minutesSinceLastSeen = Number.isFinite(lastSeenMs) ? (now - lastSeenMs) / 60000 : Infinity;
  return minutesSinceLastSeen > QUIET_THRESHOLD_MINUTES ? 'went_quiet' : 'actively_repeating';
}

module.exports = {
  EXPECTED_NOTIFICATION_INTERVAL_MINUTES,
  QUIET_THRESHOLD_MINUTES,
  normalizeAlertSubject,
  isResolvedVariant,
  alertFingerprint,
  alertDayKey,
  fingerprintKey,
  groupMessagesIntoAlerts,
  deriveAlertState
};
