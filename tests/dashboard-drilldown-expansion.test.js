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
  assert.match(frontend, /predicate = function \(inc\) \{ return \(inc\.status === 'Closed' \|\| inc\.status === 'Resolved'\) && getIncDowntimeMinutes\(inc\) > 0 && \(dashboardAvgDowntimeCategory === 'historian' \? isHistorianIncident\(inc\) : !isHistorianIncident\(inc\)\); \};/);
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

// computeSlaBreachBucket used to classify a CLOSED incident by re-deriving
// an opened-to-closed TIMESTAMP gap, which measures something different
// from the recorded MTTR/downtime duration (getIncResolutionMinutes) shown
// in the very same drill-down's Actual/Breach Duration columns — e.g. a
// ticket closed within an hour but with 16+ recorded hours of downtime
// showed as "on time", while one left open for days but with only minutes
// of recorded downtime showed as "breached", both contradicting their own
// displayed duration.
test('computeSlaBreachBucket classifies a closed incident using getIncResolutionMinutes (the same recorded MTTR/downtime value its own drill-down displays as Actual/Breach Duration), not a re-derived opened-to-closed timestamp gap', () => {
  assert.match(frontend, /var isClosed = inc\.status === 'Closed' \|\| inc\.status === 'Resolved';/);
  assert.match(frontend, /return getIncResolutionMinutes\(inc\) > slaH \* 60 \? 'breached' : 'onTime';/);
  assert.doesNotMatch(frontend, /var endMs = isClosed \? getIncidentClosedTimestamp\(inc\) : Date\.now\(\);/, 'must not classify closed incidents via a re-derived opened-to-closed timestamp gap');
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

// ── Requirement: the "Avg Resolution" card now shows Avg Downtime, with a ──
// ── dropdown to view it separately for Application vs Historian incidents ──
test('the Avg Downtime card has its own Application/Historian dropdown, independent of the card\'s own onclick drill-down', () => {
  assert.match(html, /id="avgDowntimeCategorySelect" onclick="event\.stopPropagation\(\)" onchange="event\.stopPropagation\(\);changeAvgDowntimeCategory\(this\.value\)"/);
  assert.match(html, /<option value="application">Application<\/option>\s*\n<option value="historian">Historian<\/option>/);
  assert.match(frontend, /function changeAvgDowntimeCategory\(value\) \{\s*\n\s*dashboardAvgDowntimeCategory = \(value === 'historian'\) \? 'historian' : 'application';\s*\n\s*updateStats\(\);\s*\n\}/);
});

test('updateStats computes Avg Downtime from the same downtimeCategories partition as Total/Historian Downtime (never a separate classification), and disables the Historian option (falling back to Application) whenever the Historian Downtime card itself is hidden', () => {
  const start = frontend.indexOf('function updateStats()');
  const end = frontend.indexOf('function ', frontend.indexOf('var dashboardMttrIncidents', start));
  const impl = frontend.slice(start, end);
  assert.match(impl, /var avgDowntimeIncidents = dashboardAvgDowntimeCategory === 'historian' \? downtimeCategories\.historian : downtimeCategories\.application;/);
  assert.match(impl, /var withDowntime = avgDowntimeIncidents\.filter\(function \(i\) \{ return getIncDowntimeMinutes\(i\) > 0; \}\);/);
  assert.match(impl, /if \(historianOption\) historianOption\.disabled = !showHistorianCard;/);
  assert.match(impl, /if \(!showHistorianCard\) dashboardAvgDowntimeCategory = 'application';/);
  assert.doesNotMatch(impl, /getIncResolutionMinutes/, 'Avg Downtime must no longer be based on MTTR/recorded resolution time');
});

test('the resolutionAvg drill-down shows "Actual Downtime" (via getIncDowntimeMinutes) and a category-aware title, matching the card\'s own dropdown selection', () => {
  assert.match(frontend, /\(metric === 'downtime' \|\| metric === 'historianDowntime' \|\| metric === 'resolutionAvg'\) \? 'Actual Downtime' : 'Actual Duration';/);
  assert.match(frontend, /\(metric === 'downtime' \|\| metric === 'historianDowntime' \|\| metric === 'resolutionAvg'\) \? getIncDowntimeMinutes\(inc\)\s*\n\s*: getIncResolutionMinutes\(inc\);/);
  assert.match(frontend, /metric === 'resolutionAvg' \? 'Average Downtime \(' \+ \(dashboardAvgDowntimeCategory === 'historian' \? 'Historian' : 'Application'\) \+ '\) — Contributing Incidents'/);
});
