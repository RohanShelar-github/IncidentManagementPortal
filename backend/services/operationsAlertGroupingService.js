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
  const sender = String(message && message.from || '').trim().toLowerCase();
  const normalizedSubject = normalizeAlertSubject(message && message.subject).toLowerCase();
  return sender + '::' + normalizedSubject;
}

// Groups a flat list of already-fetched mailbox messages (each expected to
// carry at least { id, from, subject, receivedAt, category }) into one entry
// per unique alert. Pure function — no Graph or database access here.
function groupMessagesIntoAlerts(messages) {
  const groups = new Map();
  (messages || []).forEach((message) => {
    if (!message || !message.subject) return;
    const fingerprint = alertFingerprint(message);
    const resolved = isResolvedVariant(message.subject);
    const receivedAt = message.receivedAt || null;
    let group = groups.get(fingerprint);
    if (!group) {
      group = {
        fingerprint,
        category: message.category || 'other',
        sender: String(message.from || '').trim(),
        sampleSubject: normalizeAlertSubject(message.subject),
        firstSeen: receivedAt,
        lastSeen: receivedAt,
        occurrenceCount: 0,
        hasResolvedSignal: false,
        messageIds: []
      };
      groups.set(fingerprint, group);
    }
    group.occurrenceCount += 1;
    group.messageIds.push(message.id);
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

// hasIncident is supplied by the caller (a DB lookup against
// operations_email_incident_audit / incident_drafts) — this function stays
// pure and DB-agnostic so it can be unit tested without a database.
function deriveAlertState(group, hasIncident, now = Date.now()) {
  if (hasIncident) return 'incident_created';
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
  fingerprintKey,
  groupMessagesIntoAlerts,
  deriveAlertState
};
