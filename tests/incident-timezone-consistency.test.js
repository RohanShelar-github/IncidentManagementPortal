'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { localDateTimeToUtc, normalizeIanaTimezone } = require('../backend/services/incidentNormalization');

const frontend = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const database = fs.readFileSync('backend/config/database.js', 'utf8');
const repair = fs.readFileSync('backend/sql/015_repair_incident_timezone_values.sql', 'utf8');

test('legacy EST values are treated as Eastern Time and observe daylight saving', () => {
  assert.equal(normalizeIanaTimezone('EST'), 'America/New_York');
  assert.equal(localDateTimeToUtc('2026-08-03 23:56:00', 'EST'), '2026-08-04 03:56:00');
  assert.equal(localDateTimeToUtc('2026-08-04 02:00:00', 'EST'), '2026-08-04 06:00:00');
  assert.equal(localDateTimeToUtc('2026-01-15 10:00:00', 'EST'), '2026-01-15 15:00:00');
});

test('reports use canonical start and actual end timestamps without assuming IST', () => {
  const report = frontend.slice(frontend.indexOf('function updateReportTimestamps'), frontend.indexOf('// Override navigate'));
  assert.match(report, /incidentTimestampDate\(inc, 'start'\)/);
  assert.match(report, /incidentTimestampDate\(inc, 'end'\)/);
  assert.doesNotMatch(report, /getTZOffset\('IST'\).*3600000/);
});

test('edit fields preserve database wall-clock values and MySQL returns DATETIME strings', () => {
  assert.match(frontend, /toDatetimeLocalWall\(inc\.startDT/);
  assert.match(frontend, /toDatetimeLocalWall\(inc\.endDT/);
  assert.match(database, /dateStrings:\s*true/);
});

test('the legacy repair migration remains recorded for earlier deployments', () => {
  assert.match(repair, /opened_at_utc = CASE/);
  assert.match(repair, /closed_at_utc = CASE/);
  assert.match(repair, /WHEN 'EST' THEN CONVERT_TZ\(date_time_opened, '-05:00', '\+00:00'\)/);
  assert.match(repair, /015_repair_incident_timezone_values/);
});

test('the browser labels EST records as Eastern Time and uses the IANA zone', () => {
  assert.match(frontend, /ET — Eastern Time \(EST\/EDT\)/);
  assert.match(frontend, /iana: 'America\/New_York'/);
  assert.match(frontend, /function wallClockToUtcMilliseconds/);
  assert.match(frontend, /initialOffset = getTZOffset\('IST', now\)/);
});

test('new incident end values are explicitly entered in IST and converted once to the selected timezone', () => {
  assert.match(html, /id="dp_f_end_dt"[^>]*onchange="convertIncidentEndFromIST\('dp_f_end_dt','dp_end_tz_hint'\);updateCriticalEditDowntime\(\)"/);
  assert.match(html, /id="dtm_end_time"[^>]*onchange="convertIncidentEndFromIST\('dtm_end_time','dtm_end_tz_hint'\);updateCriticalDowntime\(\)"/);
  assert.match(html, /Enter end time in IST/);
  assert.match(frontend, /convertDatetimeLocalTZ\(field\.value, 'IST', targetTimezone\)/);
  assert.match(frontend, /field\.dataset\.inputTimezone !== 'IST'/);
  assert.match(frontend, /field\.dataset\.inputTimezone = targetTimezone/);
});
