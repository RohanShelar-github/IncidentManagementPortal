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
  assert.match(frontend, /String\(\(inc && inc\.severity\) \|\| ''\)\.toLowerCase\(\) !== 'critical'/);
  assert.match(frontend, /getIncidentOpenedTimestamp\(inc\)/);
  assert.match(frontend, /getIncidentSlaHours\(inc\) \* 3600000/);
  assert.match(frontend, /sla: 'SLA-Breached Active Incidents'/);
});

test('Open/Active drill-down reserves breach duration for Critical incidents', () => {
  assert.match(frontend, /var isCriticalSeverity = severity\.toLowerCase\(\) === 'critical';/);
  assert.match(frontend, /if \(!isCriticalSeverity && actualMinutes > targetMinutes\) targetMinutes = actualMinutes;/);
  assert.match(frontend, /formatMetricDuration\(visibleSlaTargetMinutes\)/);
});

test('metric drill-down no longer renders a legacy classification column', () => {
  assert.doesNotMatch(frontend, /inc\.(?:classLevel) \|\| severity/);
  assert.match(html, /<th>Incident ID<\/th><th>Title \/ Summary<\/th><th>Customer<\/th><th>Severity<\/th><th>Status<\/th>/);
});

test('dashboard Missed MTTR count and drill-down exclude Historian-area incidents', () => {
  assert.match(frontend, /dashboardMttrIncidents = incidents\.filter\(function \(inc\) \{/);
  assert.match(frontend, /String\(\(inc && inc\.severity\) \|\| ''\)\.toLowerCase\(\) === 'critical'/);
  assert.match(frontend, /!isCustomer360HistorianIncident\(inc\)/);
  assert.match(frontend, /countMissedMttr\(dashboardMttrIncidents\)/);
  assert.match(frontend, /metric === 'mttr' && !customerName && !reportingCategory && isCustomer360HistorianIncident\(inc\)/);
});
