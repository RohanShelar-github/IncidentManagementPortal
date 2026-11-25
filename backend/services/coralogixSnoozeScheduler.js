'use strict';

// Re-enables a snoozed Coralogix alert once its snooze window passes.
// Coralogix has no native time-boxed "snooze" in its public API (confirmed:
// its SDK exposes Acknowledge/Resolve/Assign/Close on incidents, but no
// Snooze call — IncidentEventSnoozeIndicator only ever appears as a
// read-only history field) — this poller is what actually turns "snooze for
// 1/3/24 hours" back on, the same way Coralogix's own UI snooze would.
// A row in coralogix_alert_snoozes only ever means "this app disabled it and
// owes it a re-enable" — an alert a human disabled directly in Coralogix's
// UI has no row here and is never touched by this poller.
const pool = require('../config/database');
const { setAlertEnabled } = require('./coralogixService');

const POLL_INTERVAL_MS = 60 * 1000;
let timer = null;

async function processDueSnoozes() {
  let dueRows;
  try {
    [dueRows] = await pool.query('SELECT alert_id FROM coralogix_alert_snoozes WHERE snoozed_until <= NOW()');
  } catch (error) {
    console.error('Coralogix snooze scheduler: lookup failed:', error.message);
    return;
  }
  for (const row of dueRows) {
    try {
      await setAlertEnabled(row.alert_id, true);
      await pool.query('DELETE FROM coralogix_alert_snoozes WHERE alert_id = ?', [row.alert_id]);
      console.info('Coralogix snooze expired, alert re-enabled:', row.alert_id);
    } catch (error) {
      // Leave the row in place — the Coralogix call failing (network blip,
      // alert deleted, etc.) must not silently lose track of a snooze that
      // still owes a re-enable; it retries on the next tick instead.
      console.error('Coralogix snooze scheduler: failed to re-enable', row.alert_id, error.message);
    }
  }
}

function startCoralogixSnoozeScheduler() {
  if (timer) return;
  timer = setInterval(() => { processDueSnoozes().catch((error) => console.error('Coralogix snooze scheduler tick error:', error.message)); }, POLL_INTERVAL_MS);
  processDueSnoozes().catch((error) => console.error('Coralogix snooze scheduler initial run error:', error.message));
}

module.exports = { startCoralogixSnoozeScheduler };
