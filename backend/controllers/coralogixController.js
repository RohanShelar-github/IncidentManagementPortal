'use strict';

const pool = require('../config/database');
const { matchingCustomersByName } = require('./mailboxController');
const { subjectContains } = require('../services/operationsMailClassificationService');
const {
  coralogixConfigured,
  getAlertDef,
  LOGS_CONDITION_TYPES,
  LOGS_TIME_WINDOWS,
  listAlertDefs,
  METRIC_CONDITION_TYPES,
  METRIC_TIME_WINDOWS,
  setAlertEnabled,
  updateAlertDetails
} = require('../services/coralogixService');

// Only these three durations are offered — matching Coralogix's own UI
// snooze presets (1 hour / 3 hours / 24 hours), per explicit request.
const SNOOZE_DURATIONS_MINUTES = new Set([60, 180, 1440]);

async function attachSnoozeInfo(alerts) {
  if (!alerts.length) return alerts;
  const [rows] = await pool.query('SELECT alert_id, snoozed_until FROM coralogix_alert_snoozes WHERE alert_id IN (?)', [alerts.map((a) => a.id)]);
  const byId = new Map(rows.map((row) => [row.alert_id, row.snoozed_until]));
  return alerts.map((alert) => ({ ...alert, snoozedUntil: byId.get(alert.id) || null }));
}

// Coralogix alert names sometimes run a two-word customer name together in
// camelCase instead of separating it (confirmed live: "DemathieuBard - K8s
// Node Disk Usage..." for customer "DEMATHIEU BARD") — matchingCustomersByName
// only normalizes separator characters (spaces/hyphens/underscores), not a
// lowercase-to-uppercase word boundary with no separator at all, so it needs
// that boundary split out before matching can find it. This stays local to
// Coralogix attribution rather than changing the shared mailboxController
// matching function other already-working features (mailbox customer
// identification, SOP suggestion, Alert Compliance) rely on.
function splitCamelCaseBoundaries(text) {
  return String(text || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

// Strips everything but letters/digits and lowercases — used to compare a
// customer name against an alert's leading prefix with spacing/punctuation
// differences ignored entirely (not just separator normalization).
function squish(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The text before the alert's first hyphen/colon/en-dash — Coralogix alert
// names consistently lead with "{Customer} - {what the alert checks}", so
// this is the segment that should equal a customer name once squished.
function leadingPrefix(name) {
  const match = String(name || '').match(/^(.*?)(?:\s*[-:–]\s*|$)/);
  return (match ? match[1] : name).trim();
}

// Attributes each alert to a customer by matching its name against this
// app's customer list — first by customer name (matchingCustomersByName,
// the same logic the Operations mailbox already uses to identify a
// customer from free text), then against the same name with camelCase
// boundaries split (splitCamelCaseBoundaries — catches "DemathieuBard"),
// then by squishing the alert's leading prefix and comparing it to each
// squished customer name for an exact match (catches "Demathieubard" — no
// case transition at all for the camelCase step to find, confirmed live:
// both spellings exist side by side in this real account's alert data for
// the same customer, DEMATHIEU BARD), then by jira_project_code as a
// whole-word fallback (subjectContains) for alerts that name a customer by
// their short code instead of their full name (confirmed live: e.g. "GJKG
// K8s- Pod Memory..." names Georg Jos. Kaes GmbH only by its Jira project
// code, not its customer_name). An alert matching none of these (a
// universal/generic alert, e.g. "Workspace Node CPU more than 90%") gets
// customer: null, and the frontend groups those under "Others" rather than
// hiding them. Any step finding more than one candidate also falls through
// to null — guessing wrong is worse than leaving it in Others.
async function attachCustomerInfo(alerts) {
  if (!alerts.length) return alerts;
  const [customers] = await pool.query('SELECT customer_name, jira_project_code FROM customers WHERE is_active = 1');
  return alerts.map((alert) => {
    let nameMatches = matchingCustomersByName(customers, alert.name);
    if (nameMatches.length === 0) nameMatches = matchingCustomersByName(customers, splitCamelCaseBoundaries(alert.name));
    if (nameMatches.length === 1) return { ...alert, customer: nameMatches[0].customer_name };
    if (nameMatches.length === 0) {
      const squishedPrefix = squish(leadingPrefix(alert.name));
      if (squishedPrefix.length >= 4) {
        const prefixMatches = customers.filter((c) => squish(c.customer_name) === squishedPrefix);
        if (prefixMatches.length === 1) return { ...alert, customer: prefixMatches[0].customer_name };
      }
      const codeMatches = customers.filter((c) => c.jira_project_code && subjectContains(alert.name, c.jira_project_code));
      if (codeMatches.length === 1) return { ...alert, customer: codeMatches[0].customer_name };
    }
    return { ...alert, customer: null };
  });
}

const getAlerts = async (req, res) => {
  try {
    if (!coralogixConfigured()) return res.json({ success: true, data: { configured: false, alerts: [] } });
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const alerts = await attachCustomerInfo(await attachSnoozeInfo(await listAlertDefs({ forceRefresh })));
    res.json({ success: true, data: { configured: true, alerts, metricTimeWindows: METRIC_TIME_WINDOWS, logsTimeWindows: LOGS_TIME_WINDOWS, metricConditionTypes: METRIC_CONDITION_TYPES, logsConditionTypes: LOGS_CONDITION_TYPES } });
  } catch (error) {
    console.error('Coralogix alerts list error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load alerts from Coralogix.' });
  }
};

const getAlert = async (req, res) => {
  try {
    if (!coralogixConfigured()) return res.status(404).json({ success: false, message: 'Coralogix integration is not configured.' });
    const [alert] = await attachCustomerInfo(await attachSnoozeInfo([await getAlertDef(req.params.id)]));
    res.json({ success: true, data: alert });
  } catch (error) {
    console.error('Coralogix alert fetch error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load this alert from Coralogix.' });
  }
};

const postSnooze = async (req, res) => {
  const alertId = req.params.id;
  try {
    const durationMinutes = Number(req.body?.durationMinutes);
    if (!SNOOZE_DURATIONS_MINUTES.has(durationMinutes)) return res.status(400).json({ success: false, message: 'durationMinutes must be 60, 180, or 1440' });
    await setAlertEnabled(alertId, false);
    const alertName = String(req.body?.alertName || '').slice(0, 500);
    await pool.query(
      `INSERT INTO coralogix_alert_snoozes (alert_id, alert_name, snoozed_until, snoozed_by)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
       ON DUPLICATE KEY UPDATE alert_name = VALUES(alert_name), snoozed_until = VALUES(snoozed_until), snoozed_by = VALUES(snoozed_by), created_at = CURRENT_TIMESTAMP`,
      [alertId, alertName, durationMinutes, req.user.id]
    );
    const [[row]] = await pool.query('SELECT snoozed_until FROM coralogix_alert_snoozes WHERE alert_id = ?', [alertId]);
    res.json({ success: true, message: 'Alert snoozed.', data: { snoozedUntil: row.snoozed_until } });
  } catch (error) {
    console.error('Coralogix snooze error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to snooze this alert in Coralogix.' });
  }
};

const postUnsnooze = async (req, res) => {
  const alertId = req.params.id;
  try {
    await setAlertEnabled(alertId, true);
    await pool.query('DELETE FROM coralogix_alert_snoozes WHERE alert_id = ?', [alertId]);
    res.json({ success: true, message: 'Alert unsnoozed.' });
  } catch (error) {
    console.error('Coralogix unsnooze error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to unsnooze this alert in Coralogix.' });
  }
};

// Updates whichever of name / description / query / threshold+wait-time the
// request actually included — lets the Edit modal save just the fields the
// user touched (e.g. only the description) without needing to resend
// everything else.
const putAlertDetails = async (req, res) => {
  try {
    const body = req.body || {};
    const edits = {};
    if (body.name !== undefined) edits.name = body.name;
    if (body.description !== undefined) edits.description = body.description;
    if (body.query !== undefined) edits.query = body.query;
    if (body.threshold !== undefined) edits.threshold = body.threshold;
    if (body.timeWindowValue !== undefined) edits.timeWindowValue = body.timeWindowValue;
    if (body.conditionType !== undefined) edits.conditionType = body.conditionType;
    await updateAlertDetails(req.params.id, edits);
    res.json({ success: true, message: 'Alert updated.' });
  } catch (error) {
    console.error('Coralogix alert update error:', error.message);
    res.status(502).json({ success: false, message: error.message || 'Unable to update this alert in Coralogix.' });
  }
};

module.exports = { getAlert, getAlerts, postSnooze, postUnsnooze, putAlertDetails, SNOOZE_DURATIONS_MINUTES };
