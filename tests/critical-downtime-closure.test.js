'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');

test('Critical closure calculates downtime when the end time changes but permits an override', () => {
  assert.match(html, /onchange="[^"]*updateCriticalDowntime\(\)/);
  assert.match(html, /oninput="[^"]*updateCriticalDowntime\(\)/);
  assert.match(frontend, /field\.readOnly = false/);
  assert.match(frontend, /endDate\.getTime\(\) - startDate\.getTime\(\)/);
  assert.match(frontend, /if \(critical\) updateCriticalDowntime\(\)/);
});

test('non-Critical closure leaves downtime editable and MTTR stays optional', () => {
  assert.match(frontend, /String\(inc\.severity \|\| ''\)\.toLowerCase\(\) === 'critical'/);
  assert.doesNotMatch(frontend, /Please enter (?:the )?(?:Mean Time to Resolve|MTTR)/i);
});

test('Critical editing calculates downtime when start or end changes but permits an override', () => {
  assert.match(html, /id="dp_f_end_dt"[^>]*updateCriticalEditDowntime\(\)/);
  assert.match(html, /id="dp_f_start_dt"[^>]*updateCriticalEditDowntime\(\)/);
  assert.match(frontend, /function updateCriticalEditDowntime\(\)/);
  assert.match(frontend, /field\.readOnly = false/);
  assert.match(frontend, /dp_f_dtH/);
  assert.match(frontend, /dp_f_dtM/);
});

test('backend calculates Critical downtime only when no manual override is supplied', () => {
  assert.match(controller, /const isCriticalDowntimeCalculation = normalizeSeverity/);
  assert.match(controller, /&& hasEndDateUpdate && canonical\.closed_at_utc/);
  assert.match(controller, /const hasManualDowntime = \['downtime_mins'/);
  assert.match(controller, /if \(!hasManualDowntime\) canonical\.downtime_mins = Math\.round/);
  assert.match(controller, /const downtimeTouched = isCriticalDowntimeCalculation \|\| hasManualDowntime/);
  assert.match(controller, /Critical incident end time must be on or after its created time/);
});
