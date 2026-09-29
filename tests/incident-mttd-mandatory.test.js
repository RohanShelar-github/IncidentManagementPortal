'use strict';

// MTTD (Mean Time to Detect) was optional at creation and had no edit
// affordance at all — several real incidents (e.g. INC-335, INC-333, ...,
// INC-304) ended up with no MTTD recorded because the field was silently
// skippable. This locks in: (1) MTTD is now mandatory before an incident can
// be created, both in the browser and on the server, and (2) it can be
// modified afterward from the incident detail panel's edit section.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const incidentController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');

test('MTTD is visually marked required in the Create/Edit incident modal', () => {
  assert.match(html, /<label class="form-label required">Mean Time to Detect \(MTTD\)<\/label>/);
});

test('saveIncident rejects a total MTTD of 0 (blank hours and minutes), with its own dedicated error message, right after the other required-field check', () => {
  assert.match(frontend, /if \(mttdMinutes <= 0\) \{\s*\n\s*showToast\('Mean Time to Detect \(MTTD\) is required — enter a value greater than 0', 'error'\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*if \(status === 'Closed'\) \{/);
});

test('the backend createIncident endpoint also rejects a missing/zero MTTD (defense in depth), checked right after canonical.mttd_minutes is computed', () => {
  assert.match(incidentController, /const canonical = buildCanonicalValues\(\{ \.\.\.b, date_time_opened: b\.date_time_opened \|\| start \}, null\);\s*\n\s*if \(!canonical\.mttd_minutes \|\| canonical\.mttd_minutes <= 0\) \{\s*\n\s*return res\.status\(400\)\.json\(\{ success: false, message: 'Mean Time to Detect \(MTTD\) is required and must be greater than 0' \}\);\s*\n\s*\}/);
});

test('the incident detail panel\'s edit section now has an MTTD row (dp_f_mttd_h/dp_f_mttd_m), matching the existing MTTR/Downtime rows\' style', () => {
  assert.match(html, /Mean Time to Detect \(MTTD\) <span style="color:var\(--danger\)">\*<\/span><\/label>\s*\n<div style="display:flex;gap:10px;align-items:center">\s*\n<div style="display:flex;align-items:center;gap:6px">\s*\n<input id="dp_f_mttd_h"/);
  assert.match(html, /<input id="dp_f_mttd_m"/);
});

test('populateEditForm pre-fills dp_f_mttd_h/dp_f_mttd_m from the incident\'s current mttdH/mttdM when opening it for editing', () => {
  assert.match(frontend, /set\('dp_f_mttd_h', inc\.mttdH \|\| 0\);\s*\n\s*set\('dp_f_mttd_m', inc\.mttdM \|\| 0\);/);
});

test('saveDetailEdit reads dp_f_mttd_h/dp_f_mttd_m, updates the local incident object, and sends mttd_h/mttd_m/mttd_minutes to the server (same keys the backend\'s existing mttdTouched update logic already understands)', () => {
  assert.match(frontend, /const mttdH = parseInt\(getVal\('dp_f_mttd_h'\)\) \|\| 0;\s*\n\s*const mttdM = parseInt\(getVal\('dp_f_mttd_m'\)\) \|\| 0;\s*\n\s*const mttdMinutesEdit = mttdH \* 60 \+ mttdM;\s*\n\s*inc\.mttdH = mttdH;\s*\n\s*inc\.mttdM = mttdM;\s*\n\s*inc\.mttd_minutes = mttdMinutesEdit > 0 \? mttdMinutesEdit : null;/);
  assert.match(frontend, /mttd_h: inc\.mttdH,\s*\n\s*mttd_m: inc\.mttdM,\s*\n\s*mttd_minutes: inc\.mttd_minutes,/);
  assert.match(incidentController, /const mttdTouched = \['mttd_minutes', 'mttdH', 'mttd_h', 'mttdM', 'mttd_m', 'mttdStr', 'mttd_str'\]/, 'the backend must already recognize mttd_h/mttd_m as an update trigger');
});
