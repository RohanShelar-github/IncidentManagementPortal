'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');

test('Critical closure calculates and locks downtime when the end time changes', () => {
  assert.match(html, /onchange="[^"]*updateCriticalDowntime\(\)/);
  assert.match(html, /oninput="[^"]*updateCriticalDowntime\(\)/);
  assert.match(frontend, /field\.readOnly = critical/);
  assert.match(frontend, /endDate\.getTime\(\) - startDate\.getTime\(\)/);
  assert.match(frontend, /if \(critical\) updateCriticalDowntime\(\)/);
});

test('non-Critical closure leaves downtime editable and MTTR stays optional', () => {
  assert.match(frontend, /String\(inc\.severity \|\| ''\)\.toLowerCase\(\) === 'critical'/);
  assert.doesNotMatch(frontend, /Please enter (?:the )?(?:Mean Time to Resolve|MTTR)/i);
});

test('Critical editing calculates and locks downtime when start or end changes', () => {
  assert.match(html, /id="dp_f_end_dt"[^>]*updateCriticalEditDowntime\(\)/);
  assert.match(html, /id="dp_f_start_dt"[^>]*updateCriticalEditDowntime\(\)/);
  assert.match(frontend, /function updateCriticalEditDowntime\(\)/);
  assert.match(frontend, /field\.readOnly = critical/);
  assert.match(frontend, /dp_f_dtH/);
  assert.match(frontend, /dp_f_dtM/);
});

test('backend enforces calculated downtime for Critical edits and closure only', () => {
  assert.match(controller, /const isCriticalDowntimeCalculation = normalizeSeverity/);
  assert.match(controller, /&& hasEndDateUpdate && canonical\.closed_at_utc/);
  assert.match(controller, /canonical\.downtime_mins = Math\.round/);
  assert.match(controller, /const downtimeTouched = isCriticalDowntimeCalculation \|\|/);
  assert.match(controller, /Critical incident end time must be on or after its created time/);
});
