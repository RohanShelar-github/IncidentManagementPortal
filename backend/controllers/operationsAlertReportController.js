'use strict';

// Alert Compliance report: identifies unique Coralogix/Azure alerts and
// customer-raised (Jira) tickets that have no incident created against them,
// collapsing repeated notification emails into one row per real-world alert
// or ticket.
//
// New, additive controller — reuses existing, unmodified building blocks:
//   - emailService.listMailboxFolderMessages (raw Graph paging, read-only)
//   - operationsMailClassificationService.classifyOperationsMessage
//   - mailboxController.attachMailboxIncidentLinks (existing incident/draft
//     cross-reference against operations_email_incident_audit + incident_drafts)
//   - mailboxController.matchingCustomersByName (existing customer detection)
//   - operationsAlertGroupingService (new, pure grouping/state logic)
// No new tables, no writes anywhere in this file.

const pool = require('../config/database');
const { listMailboxFolderMessages, getInboxMessage } = require('../services/emailService');
const { classifyOperationsMessage } = require('../services/operationsMailClassificationService');
const { attachMailboxIncidentLinks, matchingCustomersByName } = require('./mailboxController');
const { groupMessagesIntoAlerts, deriveAlertState, fingerprintKey } = require('../services/operationsAlertGroupingService');

// Jira ('Customer Raised Tickets') included alongside the monitoring alert
// providers — see operationsAlertGroupingService.alertFingerprint for how
// tickets are grouped by their issue key rather than subject text.
const ALERT_CATEGORIES = new Set(['coralogix', 'azure', 'jira']);
const MAX_PAGES = 20; // hard safety ceiling on Graph calls per report request

async function fetchRecentAlertMessages(sinceMs) {
  const collected = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { messages, nextLink } = await listMailboxFolderMessages('inbox', 100, 'all', cursor);
    if (!messages.length) break;
    let reachedCutoff = false;
    for (const message of messages) {
      const receivedMs = message.receivedAt ? new Date(message.receivedAt).getTime() : NaN;
      if (Number.isFinite(receivedMs) && receivedMs < sinceMs) { reachedCutoff = true; continue; }
      const { category, jiraIssueKey } = classifyOperationsMessage(message);
      if (!ALERT_CATEGORIES.has(category)) continue;
      collected.push({ ...message, category, jiraIssueKey });
    }
    // Messages are returned newest-first, so once a full page is older than
    // the requested window there is nothing more recent left to fetch.
    if (reachedCutoff || !nextLink) break;
    cursor = nextLink;
  }
  return collected;
}

const getAlertComplianceReport = async (req, res) => {
  try {
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 14, 1), 90);
    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

    const rawMessages = await fetchRecentAlertMessages(sinceMs);
    const annotated = await attachMailboxIncidentLinks(rawMessages);
    const incidentByMessageId = new Map(
      annotated.filter((m) => m.incidentCreated).map((m) => [m.id, m.incidentRef])
    );

    const [customerRows] = await pool.query('SELECT customer_name FROM customers WHERE is_active = 1');

    // Alert groups are now scoped per IST calendar day (see
    // operationsAlertGroupingService.groupMessagesIntoAlerts), so the same
    // recurring alert firing on different days produces separate rows
    // instead of one row averaging first/last-seen across the whole window.
    const groups = groupMessagesIntoAlerts(annotated);
    const now = Date.now();
    const report = groups.map((group) => {
      const linkedIncidentRef = group.messageIds.map((id) => incidentByMessageId.get(id)).find(Boolean) || null;
      const hasIncident = Boolean(linkedIncidentRef);
      const state = deriveAlertState(group, hasIncident, now);
      const customerMatches = matchingCustomersByName(customerRows, group.sampleSubject);
      // Azure alert subjects rarely name a customer explicitly (e.g. "Azure:
      // Activated Severity: 0 SHO No Historian Read"), so subject matching
      // alone leaves most Azure rows blank. NGC is the only customer hosted
      // on Azure, so every Azure alert is unambiguously theirs regardless of
      // subject text.
      const customer = group.category === 'azure'
        ? 'NGC'
        : (customerMatches[0] ? customerMatches[0].customer_name : null);
      return {
        fingerprint: group.fingerprint,
        fingerprintKey: fingerprintKey(group.fingerprint),
        day: group.day,
        category: group.category,
        customer,
        subject: group.sampleSubject,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        occurrenceCount: group.occurrenceCount,
        state,
        incidentRef: linkedIncidentRef,
        // Full per-notification history so the report's detail view can show
        // exactly when each individual alert email arrived, not just the
        // aggregated first/last-seen summary — including the Incident ID
        // for whichever specific occurrence actually led to an incident.
        occurrences: group.occurrences
          .slice()
          .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
          .map((o) => ({ id: o.id, receivedAt: o.receivedAt, subject: o.subject, resolved: o.resolved, incidentRef: incidentByMessageId.get(o.id) || null }))
      };
    }).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

    // Attach a comment count, and whether a group has been manually marked
    // resolved (see resolveAlertManually below), per alert group so the
    // report table can show both without a separate round trip per row.
    // Read-only, additive.
    if (report.length) {
      const keys = report.map((r) => r.fingerprintKey);
      const [countRows] = await pool.query(
        'SELECT fingerprint_key, COUNT(*) AS cnt FROM operations_alert_comments WHERE fingerprint_key IN (?) GROUP BY fingerprint_key',
        [keys]
      );
      const countByKey = new Map(countRows.map((row) => [row.fingerprint_key, row.cnt]));
      report.forEach((r) => { r.commentCount = countByKey.get(r.fingerprintKey) || 0; });

      const [resolvedRows] = await pool.query(
        'SELECT DISTINCT fingerprint_key FROM operations_alert_comments WHERE fingerprint_key IN (?) AND is_resolution = 1',
        [keys]
      );
      const resolvedKeys = new Set(resolvedRows.map((row) => row.fingerprint_key));
      // A manual resolution only changes the displayed state for alerts
      // that were otherwise stuck at "went_quiet" — it never overrides a
      // group that already has a real incident or an automatic resolved
      // signal, since those outcomes are more authoritative.
      report.forEach((r) => { if (r.state === 'went_quiet' && resolvedKeys.has(r.fingerprintKey)) r.state = 'manually_resolved'; });
    }

    const summary = {
      wentQuiet: report.filter((r) => r.state === 'went_quiet').length,
      activelyRepeating: report.filter((r) => r.state === 'actively_repeating').length,
      confirmedResolved: report.filter((r) => r.state === 'confirmed_resolved').length,
      incidentCreated: report.filter((r) => r.state === 'incident_created').length,
      manuallyResolved: report.filter((r) => r.state === 'manually_resolved').length
    };

    res.json({ success: true, data: report, summary, windowDays: days });
  } catch (error) {
    console.error('Alert compliance report error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to build the Alert Compliance report.' });
  }
};

// Comment thread for a specific alert group, keyed by its fingerprintKey
// (see operationsAlertGroupingService.fingerprintKey). Lets Admin/PMO record
// why an alert did or did not become an incident, visible to anyone who can
// view this report.
const FINGERPRINT_KEY_PATTERN = /^[a-f0-9]{64}$/;

const listAlertComments = async (req, res) => {
  try {
    const key = String(req.query.fingerprintKey || '').trim().toLowerCase();
    if (!FINGERPRINT_KEY_PATTERN.test(key)) {
      return res.status(400).json({ success: false, message: 'A valid fingerprintKey is required' });
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.comment_text, c.is_resolution, c.created_at, u.full_name AS author_name
         FROM operations_alert_comments c
         LEFT JOIN users u ON u.id = c.created_by
        WHERE c.fingerprint_key = ?
        ORDER BY c.created_at ASC`,
      [key]
    );
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        comment: row.comment_text,
        isResolution: Boolean(row.is_resolution),
        author: row.author_name || 'Unknown',
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('List alert comments error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load comments' });
  }
};

const addAlertComment = async (req, res) => {
  try {
    const key = String(req.body.fingerprintKey || '').trim().toLowerCase();
    const fingerprint = String(req.body.fingerprint || '').trim();
    const commentText = String(req.body.comment || '').trim();
    if (!FINGERPRINT_KEY_PATTERN.test(key)) {
      return res.status(400).json({ success: false, message: 'A valid fingerprintKey is required' });
    }
    if (!commentText) return res.status(400).json({ success: false, message: 'Comment text is required' });
    if (commentText.length > 2000) return res.status(400).json({ success: false, message: 'Comment is too long (max 2000 characters)' });

    await pool.query(
      'INSERT INTO operations_alert_comments (fingerprint_key, alert_fingerprint, comment_text, created_by) VALUES (?, ?, ?, ?)',
      [key, fingerprint.slice(0, 1000) || null, commentText, req.user.id]
    );
    res.status(201).json({
      success: true,
      message: 'Comment added',
      data: { comment: commentText, isResolution: false, author: req.user.name || req.user.email || 'User', createdAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Add alert comment error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to add comment' });
  }
};

// Manually marks a "Went Quiet — Unconfirmed" alert group as resolved.
// Stored as a regular comment with is_resolution=1, so the mandatory
// root-cause note becomes part of the same audit trail already shown in
// the alert's comment history — no separate table, no separate read path.
// The state override itself lives in getAlertComplianceReport above.
const resolveAlertManually = async (req, res) => {
  try {
    const key = String(req.body.fingerprintKey || '').trim().toLowerCase();
    const fingerprint = String(req.body.fingerprint || '').trim();
    const note = String(req.body.note || '').trim();
    if (!FINGERPRINT_KEY_PATTERN.test(key)) {
      return res.status(400).json({ success: false, message: 'A valid fingerprintKey is required' });
    }
    if (!note) return res.status(400).json({ success: false, message: 'A comment describing the action taken or the identified root cause is required to resolve this alert' });
    if (note.length > 2000) return res.status(400).json({ success: false, message: 'Resolution note is too long (max 2000 characters)' });

    await pool.query(
      'INSERT INTO operations_alert_comments (fingerprint_key, alert_fingerprint, comment_text, is_resolution, created_by) VALUES (?, ?, ?, 1, ?)',
      [key, fingerprint.slice(0, 1000) || null, note, req.user.id]
    );
    res.status(201).json({
      success: true,
      message: 'Alert marked as resolved',
      data: { comment: note, isResolution: true, author: req.user.name || req.user.email || 'User', createdAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Resolve alert error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to mark this alert as resolved' });
  }
};

// Full content (HTML body + attachments) of one individual alert notification
// email, for the report's detail view. Reuses emailService.getInboxMessage —
// the same Graph fetch the Mailbox page uses — but is exposed on this
// separate, view_alert_compliance_report-gated route so Admin/PMO can read an
// alert's full email without also being granted general Mailbox access
// (view_mailbox), which carries send/delete capabilities they don't need
// here. Restricted to Coralogix/Azure alert messages only, so this route
// cannot be used to browse arbitrary mailbox content.
const getAlertMessage = async (req, res) => {
  try {
    const message = await getInboxMessage(req.params.id);
    const { category } = classifyOperationsMessage(message);
    if (!ALERT_CATEGORIES.has(category)) {
      return res.status(403).json({ success: false, message: 'Only Coralogix/Azure alert emails are available here.' });
    }
    res.json({ success: true, data: message });
  } catch (error) {
    console.error('Alert message detail error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the alert email.' });
  }
};

module.exports = { getAlertComplianceReport, listAlertComments, addAlertComment, resolveAlertManually, getAlertMessage };
