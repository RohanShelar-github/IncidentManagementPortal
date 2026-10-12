'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

function slice(fnStart, fnEnd) {
  const start = frontend.indexOf(fnStart);
  const end = frontend.indexOf(fnEnd, start);
  return frontend.slice(start, end);
}

// Customer 360's "Total Incidents"/"Open"/"Closed"/"Critical SLA Breach"/
// "Critical Missed MTTR"/"Missed MTTD Count" row already had the MTTR/MTTD
// two wired to openMetricDrillDown; the second row's "Total Downtime" and
// "Critical Incidents" cards had no drill-down at all.
test('renderC360MetricSection wires "Total Downtime" and "Critical Incidents" to openMetricDrillDown the same way "Critical Missed MTTR"/"Missed MTTD Count" already were, leaving "Avg MTTR"/"Resolution Rate" non-clickable', () => {
  const impl = slice('function renderC360MetricSection(', 'function renderC360Full(');
  assert.match(impl, /\{ metric: 'c360Downtime', label: 'Total Downtime', value: values\.totalDT \? minutesToHM\(values\.totalDT\) : '—', color: 'var\(--warning\)' \}/);
  assert.match(impl, /\{ metric: 'c360Critical', label: 'Critical Incidents', value: values\.critical, color: values\.critical \? 'var\(--danger\)' : 'var\(--success\)' \}/);
  assert.match(impl, /\{ label: 'Avg MTTR', value: values\.avgMTTR \? minutesToHM\(values\.avgMTTR\) : '—', color: 'var\(--accent\)' \}/);
  assert.match(impl, /\{ label: 'Resolution Rate', value: values\.resolutionRate \+ '%', color: values\.resolutionRate >= 80 \? 'var\(--success\)' : 'var\(--warning\)' \}/);
  assert.match(impl, /var drillDown = metric\.metric\s*\n\s*\? ' class="metric-kpi-card" role="button" tabindex="0" title="View contributing incidents" onclick="openMetricDrillDown\(\\'' \+ metric\.metric \+ '\\',document\.getElementById\(\\'c360CustName\\'\)\.textContent,\\'' \+ category \+ '\\'\)"/);
});

// Unlike the Dashboard's 'downtime'/'historianDowntime' metrics (closed-only,
// and hard-excludes/includes historian incidents regardless of
// reportingCategory — which would wrongly empty out if reused for the
// historian section's own Total Downtime card), these two match
// buildC360Metrics exactly: no status restriction, and no second historian
// check beyond the generic reportingCategory gate already applied earlier
// in the same filter chain.
test('c360Critical and c360Downtime predicates match buildC360Metrics exactly (no closed/resolved restriction, no extra historian check)', () => {
  const impl = slice('function openMetricDrillDown(', 'var dashboardPage = document.getElementById');
  assert.match(impl, /else if \(metric === 'c360Critical'\) predicate = function \(inc\) \{ return inc\.severity === 'Critical'; \};/);
  assert.match(impl, /else if \(metric === 'c360Downtime'\) predicate = function \(inc\) \{ return getIncDowntimeMinutes\(inc\) > 0; \};/);
});

test('the metric whitelist, titles, actual-column header, and actual-minutes logic all recognize c360Critical/c360Downtime', () => {
  assert.match(frontend, /'historianDowntime', 'c360Critical', 'c360Downtime', 'slaBreachChart'/);
  assert.match(frontend, /c360Critical: 'Critical Incidents — Contributing',\s*\n\s*c360Downtime: 'Total Downtime — Contributing Incidents'/);
  assert.match(frontend, /metric === 'resolutionAvg' \|\| metric === 'c360Downtime'\) \? 'Actual Downtime' : 'Actual Duration';/);
  assert.match(frontend, /metric === 'resolutionAvg' \|\| metric === 'c360Downtime'\) \? getIncDowntimeMinutes\(inc\)/);
});

// Monthly Incident Trend and Area Breakdown previously had zero interactivity
// at all (no onmousemove/onclick), unlike every chart on the main Dashboard.
test('Customer 360\'s Monthly Incident Trend chart is clickable, drilling into that month\'s incidents for this customer', () => {
  const impl = slice('// ── Monthly trend chart ──', '// ── Area breakdown chart ──');
  assert.match(impl, /var monthBounds2 = \[\];/);
  assert.match(impl, /monthBounds2\.push\(\{ start: d2, end: d2End \}\);/);
  assert.match(impl, /function findC360TrendHit\(e\) \{/);
  assert.match(impl, /trendEl\.onclick = function \(e\) \{/);
  assert.match(impl, /drillDownToIncidents\(\{ customer: custName, from: toYMD\(bounds\.start\), to: toYMD\(monthEndInclusive\), _label: custName \+ ' — ' \+ labels2\[idx\] \}\);/);
  assert.match(impl, /trendEl\.onmousemove = function \(e\) \{/);
  assert.match(impl, /trendEl\.onmouseleave = _hideTip;/);
});

test('Customer 360\'s Area Breakdown chart is clickable, drilling into that area\'s incidents for this customer, and clears its handlers when there\'s no data', () => {
  const impl = slice('// ── Area breakdown chart ──', '// ── Severity bars ──');
  assert.match(impl, /var areaBarRects3 = \[\];/);
  assert.match(impl, /areaBarRects3\.push\(\{ x: x3 - bW3 \/ 2, w: bW3, area: area, count: areaMap\[area\] \}\);/);
  assert.match(impl, /function findC360AreaHit\(e\) \{/);
  assert.match(impl, /if \(mx >= b\.x - 2 && mx <= b\.x \+ b\.w \+ 2 && my >= pad3\.t && my <= pad3\.t \+ cH3\) return b;/, 'hit-test must span the full plot height, not just the bar\'s own height, so short bars are just as clickable as tall ones');
  assert.match(impl, /areaEl\.onclick = function \(e\) \{/);
  assert.match(impl, /drillDownToIncidents\(\{ customer: custName, area: hit\.area, _label: custName \+ ' — ' \+ hit\.area \}\);/);
  assert.match(impl, /areaEl\.style\.cursor = 'default'; areaEl\.onmousemove = null; areaEl\.onclick = null; areaEl\.onmouseleave = _hideTip;/, 'the no-data branch must clear stale handlers from a previously-rendered customer with data');
});
