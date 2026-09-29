'use strict';

// Regression test for a real data-integrity bug: Project is marked required
// (red asterisk) in the Create Incident form, the detail panel's edit form,
// AND the backend's own createIncident validation message — but none of the
// three JS save functions actually checked it, so incidents (e.g. INC-323,
// created from an Operations mailbox alert) could be saved/edited with a
// blank project despite the UI claiming it was mandatory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const incidentController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');

test('Project is visually marked required in both the Create/Edit modal and the detail panel\'s edit form', () => {
  assert.match(html, /<label class="form-label required">Project \/ Service<\/label>/);
  assert.match(html, /<label style="display:block;font-size:10px;font-weight:700;color:var\(--text-muted\);text-transform:uppercase;letter-spacing:\.8px;margin-bottom:6px">Project <span style="color:var\(--danger\)">\*<\/span><\/label>\s*\n<input id="dp_f_project"/);
});

test('saveIncident (Create/Edit modal) now rejects a blank project, matching the other required fields', () => {
  assert.match(frontend, /if \(!title \|\| !customer \|\| !project\.trim\(\) \|\| !severity \|\| !engineer\) \{\s*\n\s*showToast\('Please fill in all required fields', 'error'\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*if \(mttdMinutes <= 0\) \{/);
});

test('saveDetailEdit (detail panel edit) now rejects a blank project too', () => {
  assert.match(frontend, /if \(!title \|\| !customer \|\| !project\.trim\(\) \|\| !severity \|\| !engineer\) \{\s*\n\s*showToast\('Please fill in all required fields', 'error'\);\s*\n\s*return;/);
});

test('saveIncidentDraft is deliberately left unchanged — a draft is allowed to be incomplete pending later review; finalizing it re-runs through saveIncident, which now enforces project before it can become a real incident', () => {
  assert.match(frontend, /function saveIncidentDraft\(\) \{[\s\S]{0,1100}if \(!title \|\| !customer \|\| !severity \|\| !engineer\) \{ showToast\('Please fill in all required fields', 'error'\); return; \}/);
});

test('the backend createIncident endpoint also rejects a blank project (defense in depth, not just the two frontend forms)', () => {
  assert.match(incidentController, /if \(!b\.title \|\| !b\.severity \|\| !String\(b\.project \|\| ''\)\.trim\(\)\) return res\.status\(400\)\.json\(\{ success: false, message: 'Title, severity, and project are required' \}\);/);
});
