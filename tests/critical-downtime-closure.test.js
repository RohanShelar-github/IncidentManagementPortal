'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');

test('Critical closure calculates MTTR when the end time changes and preserves editable downtime', () => {
  assert.match(html, /onchange="[^"]*updateCriticalMttr\(\)/);
  assert.match(html, /oninput="[^"]*updateCriticalMttr\(\)/);
  assert.match(frontend, /field\.readOnly = false/);
  assert.match(frontend, /endDate\.getTime\(\) - startDate\.getTime\(\)/);
  assert.match(frontend, /field\.readOnly = critical/);
  assert.match(frontend, /if \(critical\) updateCriticalMttr\(\)/);
});

test('non-Critical closure leaves downtime editable and MTTR stays optional', () => {
  assert.match(frontend, /String\(inc\.severity \|\| ''\)\.toLowerCase\(\) === 'critical'/);
  assert.doesNotMatch(frontend, /Please enter (?:the )?(?:Mean Time to Resolve|MTTR)/i);
});

test('Critical editing calculates MTTR when start or end changes but preserves downtime', () => {
  assert.match(html, /id="dp_f_end_dt"[^>]*updateCriticalEditMttr\(\)/);
  assert.match(html, /id="dp_f_start_dt"[^>]*updateCriticalEditMttr\(\)/);
  assert.match(frontend, /function updateCriticalEditMttr\(\)/);
  assert.match(frontend, /field\.readOnly = false/);
  assert.match(frontend, /dp_f_mttr_h/);
  assert.match(frontend, /dp_f_mttr_m/);
});

test('reopening a Critical incident preserves its saved downtime value', () => {
  const populateEditForm = frontend.match(/function populateEditForm\(inc\) \{[\s\S]*?function updateCriticalEditMttr/);
  assert.ok(populateEditForm, 'populateEditForm should be present');
  assert.doesNotMatch(populateEditForm[0], /updateCriticalEditMttr\(\)/);
});

test('backend calculates Critical MTTR from start/end while downtime stays manually recorded', () => {
  assert.match(controller, /const isCriticalMttrCalculation = normalizeSeverity/);
  assert.match(controller, /&& hasEndDateUpdate && canonical\.closed_at_utc/);
  assert.match(controller, /const hasManualDowntime = \['downtime_mins'/);
  assert.match(controller, /canonical\.mttr_minutes = Math\.round/);
  assert.match(controller, /const downtimeTouched = hasManualDowntime/);
  assert.match(controller, /const mttrTouched = isCriticalMttrCalculation/);
  assert.match(controller, /Critical incident end time must be on or after its created time/);
});
