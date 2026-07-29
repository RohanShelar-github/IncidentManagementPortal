'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  buildCanonicalValues,
  localDateTimeToUtc,
  minutesToHM,
  normalizeIanaTimezone,
  resolveDurationMinutes
} = require('../backend/services/incidentNormalization');

test('normalizes downtime total minutes and derives compatibility values', () => {
  assert.equal(resolveDurationMinutes({ downtime_h: 2, downtime_m: 17 }, 'downtime', 0), 137);
  assert.equal(resolveDurationMinutes({ downtime_mins: 61, downtime_h: 9 }, 'downtime', 0), 61);
  assert.deepEqual(minutesToHM(137), { total: 137, hours: 2, minutes: 17, text: '2h 17m' });
});

test('persists MTTR and MTTD as canonical numeric minutes', () => {
  const values = buildCanonicalValues({
    mttr_h: 1,
    mttr_m: 23,
    mttd_minutes: 7,
    date_time_opened: '2026-07-27 10:00:00',
    timezone: 'IST'
  });
  assert.equal(values.mttr_minutes, 83);
  assert.equal(values.mttd_minutes, 7);
});

test('converts legacy timezone aliases to IANA zones without shifting wall time incorrectly', () => {
  assert.equal(normalizeIanaTimezone('IST'), 'Asia/Kolkata');
  assert.equal(localDateTimeToUtc('2026-07-27 10:00:00', 'IST'), '2026-07-27 04:30:00');
  assert.equal(localDateTimeToUtc('2026-01-15 10:00:00', 'America/New_York'), '2026-01-15 15:00:00');
  assert.equal(localDateTimeToUtc('2026-07-15 10:00:00', 'America/New_York'), '2026-07-15 14:00:00');
});

test('canonical migration is additive and archives every identified legacy field', () => {
  const migration = fs.readFileSync('backend/sql/005_incident_canonical_normalization.sql', 'utf8');
  for (const field of ['opened_at_utc', 'closed_at_utc', 'source_timezone', 'sla_minutes', 'mttr_minutes']) {
    assert.match(migration, new RegExp(field));
  }
  for (const field of ['legacy_month', 'legacy_source', 'legacy_raw', 'internal_status', 'project_area']) {
    assert.match(migration, new RegExp(field));
  }
  assert.doesNotMatch(migration, /DROP\s+COLUMN/i);
  assert.match(migration, /incident_legacy_metadata/);
});

test('controller and frontend preserve legacy aliases while writing canonical durations', () => {
  const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');
  const frontend = fs.readFileSync('js/app.js', 'utf8');
  for (const alias of ['downtime_h', 'downtime_m', 'downtime_mins', 'downtimeStr', 'mttrH', 'mttrM', 'mttrStr']) {
    assert.match(controller, new RegExp(alias));
  }
  assert.match(controller, /add\('mttr_minutes'/);
  assert.match(controller, /add\('downtime_mins'/);
  assert.match(frontend, /downtime_mins:\s*inc\.downtimeH \* 60 \+ inc\.downtimeM/);
  assert.match(frontend, /mttr_minutes:\s*inc\.mttrH \* 60 \+ inc\.mttrM/);
});

test('production baseline includes the canonical schema and no seeded credentials', () => {
  const baseline = fs.readFileSync('backend/sql/schema.sql', 'utf8');
  const production = fs.readFileSync('backend/sql/schema.production.sql', 'utf8');
  assert.equal(baseline, production);
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS incidents/);
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS incident_legacy_metadata/);
  assert.doesNotMatch(baseline, /admin123|babai123|INSERT INTO users/i);
});
