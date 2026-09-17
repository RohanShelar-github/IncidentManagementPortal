'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('every remaining dashboard KPI card is wired as an accessible drill-down control', () => {
  assert.match(html, /id="dashboardCardTotalIncidents" onclick="drillDownToIncidents\(\{ _label: 'All Filtered Incidents' \}\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /id="dashboardCardResolved" onclick="drillDownToIncidents\(\{ statuses: \['Closed','Resolved'\], _label: 'Resolved Incidents' \}\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /id="dashboardCardAvgResolution" onclick="openMetricDrillDown\('resolutionAvg'\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /id="dashboardCardTotalDowntime" onclick="openMetricDrillDown\('downtime'\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /id="statHistorianDowntimeCard" onclick="openMetricDrillDown\('historianDowntime'\)"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /id="dashboardCardResolutionRate" onclick="drillDownToIncidents\(\{ statuses: \['Closed','Resolved'\], _label: 'Resolved Incidents' \}\)"[^>]*role="button"[^>]*tabindex="0"/);
  // The 4 previously-wired cards stay untouched.
  assert.match(html, /onclick="openMetricDrillDown\('open'\)"/);
  assert.match(html, /onclick="openMetricDrillDown\('sla'\)"/);
  assert.match(html, /onclick="openMetricDrillDown\('mttr'\)"/);
  assert.match(html, /onclick="openMetricDrillDown\('mttd'\)"/);
});

test('openMetricDrillDown supports the new computed metrics without altering the existing 4', () => {
  assert.match(frontend, /function openMetricDrillDown\(metric, customerName, reportingCategory, extra\)/);
  assert.match(frontend, /\['mttr', 'mttd', 'open', 'sla', 'resolutionAvg', 'downtime', 'historianDowntime', 'slaBreachChart', 'dow', 'byProject', 'byAreaOpen'\]\.indexOf\(metric\) === -1/);
  assert.match(frontend, /predicate = function \(inc\) \{ return \(inc\.status === 'Closed' \|\| inc\.status === 'Resolved'\) && getIncResolutionMinutes\(inc\) > 0; \};/);
  assert.match(frontend, /predicate = function \(inc\) \{ return \(inc\.status === 'Closed' \|\| inc\.status === 'Resolved'\) && !isHistorianIncident\(inc\); \};/);
  assert.match(frontend, /predicate = function \(inc\) \{ return \(inc\.status === 'Closed' \|\| inc\.status === 'Resolved'\) && isHistorianIncident\(inc\); \};/);
  assert.match(frontend, /predicate = function \(inc\) \{ var d = new Date\(inc\.date\); return !isNaN\(d\) && d\.getDay\(\) === extra; \};/);
  assert.match(frontend, /predicate = function \(inc\) \{ return isActiveIncident\(inc\) && \(inc\.area \|\| 'Unspecified'\) === extra; \};/);
  assert.match(frontend, /predicate = function \(inc\) \{ return \(inc\.project \|\| 'Other'\) === extra; \}; \/\/ byProject/);
  // Pre-existing pinned behavior is untouched.
  assert.match(frontend, /var isDashboardDrillDown = Boolean\(dashboardPage && dashboardPage\.classList\.contains\('active'\)\)/);
  assert.match(frontend, /isDashboardDrillDown\s*\? getDashboardFilteredIncidents\(\)/);
  assert.match(frontend, /open: 'Open \/ Active Incidents'/);
  assert.match(frontend, /sla: 'SLA-Breached Active Incidents'/);
  assert.match(frontend, /metric === 'mttr' && !customerName && !reportingCategory && isCustomer360HistorianIncident\(inc\)/);
});

test('a per-card dashboard permission is re-checked inside openMetricDrillDown, not just relied on for card visibility', () => {
  assert.match(frontend, /var METRIC_DRILLDOWN_PERMISSIONS = \{/);
  assert.match(frontend, /open: 'view_dashboard_open_active', sla: 'view_dashboard_sla_breach'/);
  assert.match(frontend, /resolutionAvg: 'view_dashboard_avg_resolution', downtime: 'view_dashboard_total_downtime'/);
  assert.match(frontend, /var requiredCardPermission = METRIC_DRILLDOWN_PERMISSIONS\[metric\];/);
  assert.match(frontend, /if \(requiredCardPermission && !\(hasPermission\('view_dashboard'\) && hasPermission\(requiredCardPermission\)\)\)/);
});

test('drillDownToIncidents carries the active dashboard filters over onto the clicked segment', () => {
  assert.match(frontend, /function drillDownToIncidents\(filters\) \{/);
  assert.match(frontend, /var snapshot = getDashFilterSnapshot\(\);/);
  assert.match(frontend, /filters\.severities = snapshot\.ms\.df_severity;/);
  assert.match(frontend, /filters\.customers = snapshot\.ms\.df_customer;/);
  assert.match(frontend, /filters\.areas = snapshot\.ms\.df_area;/);
  assert.match(frontend, /function dashboardYearMonthToDateRange\(years, months\)/);
  // New plural/date fields are additive — the exact pinned singular-value calls stay.
  assert.match(frontend, /if \(filters\.severities && filters\.severities\.length\) setMsValues\('severityFilter', filters\.severities\);/);
  assert.match(frontend, /if \(filters\.statuses && filters\.statuses\.length\) setMsValues\('statusFilter', filters\.statuses\);/);
  assert.match(frontend, /setMsValues\('severityFilter', \[filters\.severity\]\)/);
  assert.match(frontend, /setMsValues\('customerFilter', \[filters\.customer\]\)/);
  assert.match(frontend, /setMsValues\('areaFilter', \[filters\.area\]\)/);
  assert.match(frontend, /setMsValues\('statusFilter', \[filters\.status\]\)/);
});

test('the SLA Breach chart shares one breach-classification function with its drill-down', () => {
  assert.match(frontend, /function computeSlaBreachBucket\(inc\)/);
  assert.match(frontend, /if \(computeSlaBreachBucket\(i\) === 'breached'\) breached\[i\.severity\]\+\+;/);
  assert.match(frontend, /computeSlaBreachBucket\(inc\) === \(\(extra && extra\.breached\) \? 'breached' : 'onTime'\)/);
});

test('every remaining dashboard chart and downtime list panel gets a click handler', () => {
  const chartClickPairs = [
    ['areaBreakdownChart', /function _drawAreaBreakdown[\s\S]*?el\.onclick = function \(e\) \{/],
    ['dowChart', /function _drawDow[\s\S]*?el\.onclick = function \(e\) \{/],
    ['mttrTrendChart', /function _drawMTTR[\s\S]*?el\.onclick = function \(e\) \{/],
    ['trendChart', /function _drawTrend[\s\S]*?el\.onclick = function \(e\) \{/]
  ];
  chartClickPairs.forEach(([_, re]) => assert.match(frontend, re));
  assert.match(frontend, /openMetricDrillDown\('dow', null, null, hit\.dayIndex\)/);
  assert.match(frontend, /openMetricDrillDown\('byAreaOpen', null, null, hit\.area\)/);
  assert.match(frontend, /openMetricDrillDown\('slaBreachChart', null, null, \{ severity: hit\.severity, breached: hit\.breached \}\)/);
  // Downtime-by-customer/area lists drill into the Incidents page; downtime-by-application
  // (bucketed by project, which has no Incidents-page filter) uses the modal instead.
  assert.match(frontend, /drillDownToIncidents\(\{ customer: sorted\[idx\]\.k, statuses: \['Closed', 'Resolved'\], _label: sorted\[idx\]\.k \+ ' \(Closed\)' \}\);/);
  assert.match(frontend, /drillDownToIncidents\(\{ area: sorted\[idx\]\.k, statuses: \['Closed', 'Resolved'\], _label: sorted\[idx\]\.k \+ ' \(Closed\)' \}\);/);
  assert.match(frontend, /openMetricDrillDown\('byProject', null, null, sorted\[idx\]\.k\);/);
});

test('the customer bar chart preserves both customer and severity when a specific segment is clicked', () => {
  const start = frontend.indexOf('function _drawCustomer(');
  const end = frontend.indexOf('function _drawResolution(', start);
  const impl = frontend.slice(start, end);
  assert.match(impl, /var seg = null;/);
  assert.match(impl, /drillDownToIncidents\(\{ customer: b\.label, severity: seg\.sev, _label: b\.label \+ ' — ' \+ seg\.sev \+ ' \(' \+ seg\.cnt \+ ' incidents\)' \}\);/);
  assert.match(impl, /drillDownToIncidents\(\{ customer: b\.label, _label: b\.label \+ ' \(' \+ b\.total \+ ' incidents\)' \}\);/);
});
