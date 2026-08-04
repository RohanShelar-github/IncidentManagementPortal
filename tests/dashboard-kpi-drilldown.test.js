const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('Open and SLA dashboard KPI cards are keyboard-accessible drill-down controls', () => {
  assert.match(html, /onclick="openMetricDrillDown\('open'\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /onclick="openMetricDrillDown\('sla'\)"[^>]*role="button"[^>]*tabindex="0"/);
});

test('Open drill-down includes only active incidents under current dashboard filters', () => {
  assert.match(frontend, /function isActiveIncident\(inc\)/);
  assert.match(frontend, /inc\.status !== 'Closed' && inc\.status !== 'Resolved'/);
  assert.match(frontend, /\? getDashboardFilteredIncidents\(\) : incidents/);
  assert.match(frontend, /open: 'Open \/ Active Incidents'/);
});

test('SLA drill-down uses the live active-breach calculation', () => {
  assert.match(frontend, /function isActiveSlaBreached\(inc\)/);
  assert.match(frontend, /getIncidentOpenedTimestamp\(inc\)/);
  assert.match(frontend, /getIncidentSlaHours\(inc\) \* 3600000/);
  assert.match(frontend, /sla: 'SLA-Breached Active Incidents'/);
});
