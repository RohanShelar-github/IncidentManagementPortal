const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('incident report status is not rendered in the user interface', () => {
  assert.doesNotMatch(html, /Incident Report Status/i);
  assert.doesNotMatch(html, /dp_(?:f_)?incident_report_status/);
});

test('incident closure does not validate incident report status', () => {
  assert.doesNotMatch(frontend, /requireIncidentReportStatus|hasIncidentReportStatus/);
  assert.doesNotMatch(frontend, /Incident Report Status is required|before closing the incident/);
  assert.doesNotMatch(controller, /isIncidentReportStatusValid/);
  assert.doesNotMatch(controller, /Incident Report Status must be/);
});

test('incident report status remains a backward-compatible optional API field', () => {
  assert.match(controller, /if \(b\.incident_report_status !== undefined\)/);
  assert.match(controller, /add\('incident_report_status', reportStatus \|\| null\)/);
});
