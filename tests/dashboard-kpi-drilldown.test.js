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

test('Dashboard drill-downs use the current dashboard-filtered incident set', () => {
  assert.match(frontend, /function isActiveIncident\(inc\)/);
  assert.match(frontend, /inc\.status !== 'Closed' && inc\.status !== 'Resolved'/);
  assert.match(frontend, /var isDashboardDrillDown = Boolean\(dashboardPage && dashboardPage\.classList\.contains\('active'\)\)/);
  assert.match(frontend, /isDashboardDrillDown\s*\? getDashboardFilteredIncidents\(\)/);
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

test('dashboard Missed MTTR count and drill-down respect filters while excluding Historian-area incidents', () => {
  assert.match(frontend, /dashboardMttrIncidents = data\.filter\(function \(inc\) \{/);
  assert.match(frontend, /String\(\(inc && inc\.severity\) \|\| ''\)\.toLowerCase\(\) === 'critical'/);
  assert.match(frontend, /!isCustomer360HistorianIncident\(inc\)/);
  assert.match(frontend, /countMissedMttr\(dashboardMttrIncidents\)/);
  assert.match(frontend, /metric === 'mttr' && !customerName && !reportingCategory && isCustomer360HistorianIncident\(inc\)/);
});

test('Dashboard widgets that previously used all incidents now use the dashboard filter set', () => {
  assert.match(frontend, /var mine = getDashboardFilteredIncidents\(\)\.filter/);
  assert.match(frontend, /getDashboardFilteredIncidents\(\)\.forEach\(function \(i\) \{/);
  assert.match(frontend, /var missedMttdCount = countMissedMttd\(data\)/);
  assert.match(frontend, /renderMyIncidents\(\);\s*renderHealthGrid\(\);/);
  assert.match(html, /id="statTotalSub"/);
  assert.match(html, /id="statOpenSub"/);
  assert.match(html, /id="statClosedSub"/);
});

test('Resolution Timeline uses recorded resolution duration and never fabricated severity values', () => {
  const chartStart = frontend.indexOf('function _drawResolution');
  const chartEnd = frontend.indexOf('function _openPDFPreview', chartStart);
  const chart = frontend.slice(chartStart, chartEnd);
  assert.match(chart, /getIncResolutionMinutes\(incident\) > 0/);
  assert.match(chart, /recorded\.reduce\(function \(sum, incident\) \{ return sum \+ getIncResolutionMinutes\(incident\); \}, 0\)/);
  assert.match(chart, /No recorded resolution data/);
  assert.doesNotMatch(chart, /Math\.random/);
  assert.doesNotMatch(chart, /fallback estimate/);
});

test('temporary Missed MTTR exceptions exclude only the requested incidents', () => {
  assert.match(frontend, /MISSED_MTTR_EXCLUDED_INCIDENTS = new Set\(\['INC-227', 'INC-273'\]\)/);
  assert.match(frontend, /MISSED_MTTR_EXCLUDED_INCIDENTS\.has\(String\(\(inc && \(inc\.id \|\| inc\.incident_ref\)\) \|\| ''\)\)/);
});

test('incident filters visibly show selected values and drill-down selects the real multi-select inputs', () => {
  assert.match(html, /onchange="renderMsPills\('severityFilter'\);applyFilters\(\)"/);
  assert.match(html, /onchange="renderMsPills\('statusFilter'\);applyFilters\(\)"/);
  assert.match(frontend, /setMsValues\('severityFilter', \[filters\.severity\]\)/);
  assert.match(frontend, /setMsValues\('customerFilter', \[filters\.customer\]\)/);
  assert.match(frontend, /setMsValues\('areaFilter', \[filters\.area\]\)/);
  assert.match(frontend, /setMsValues\('statusFilter', \[filters\.status\]\)/);
});
