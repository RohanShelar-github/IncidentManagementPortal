'use strict';

// SLA policy: Critical = 4 hours, High = 12 hours, Medium/Normal = no SLA at
// all. This constant used to be one identical literal duplicated across ~7
// places; some of those are genuine SLA compliance calculations (breach
// detection, countdowns, the SLA badge) and some are actually an unrelated
// "assumed duration when real downtime data is missing" heuristic reused
// from the same map (report/PDF/Excel exports) — those intentionally keep a
// numeric Medium/Normal fallback (12h/24h) since they can't render "no SLA"
// in an arithmetic duration estimate. Only the compliance-facing call sites
// are required to treat Medium/Normal as having no SLA target (null).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('getIncidentSlaHours (the canonical per-incident SLA helper) only knows Critical (4h) and High (12h) — everything else, including Medium/Normal, returns null ("no SLA"), never a fallback number', () => {
  assert.match(frontend, /function getIncidentSlaHours\(inc\) \{[\s\S]{0,300}return \{ Critical: 4, High: 12 \}\[inc && inc\.severity\] \|\| null;/);
});

test('SLA_HOURS (used by the incident detail panel\'s SLA Met/Breached indicator) also only has Critical/High — Medium/Normal are absent, not zero', () => {
  assert.match(frontend, /const SLA_HOURS = \{ Critical: 4, High: 12 \};/);
});

test('getSLAInfo (the incidents-table SLA badge) returns an explicit "no SLA" state instead of computing a bogus countdown when getIncidentSlaHours is null', () => {
  assert.match(frontend, /const slaH = getIncidentSlaHours\(inc\);\s*\n\s*if \(slaH === null\) return \{ cls: 'sla-na', label: '—', title: 'No SLA applies to this severity' \};/);
});

test('the SLA Breach by Severity chart only tracks Critical/High — Medium/Normal have no bar, no legend entry, and are skipped before ever reaching computeSlaBreachBucket', () => {
  assert.match(frontend, /var sevs = \['Critical', 'High'\];\s*\n\s*var SLA_H = \{ Critical: 4, High: 12 \};\s*\n\s*var colors = \{ Critical: '#f75c7c', High: '#f7b94f' \};\s*\n\s*\n\s*var onTime = \{ Critical: 0, High: 0 \};\s*\n\s*var breached = \{ Critical: 0, High: 0 \};\s*\n\s*\n\s*data\.forEach\(function \(i\) \{\s*\n\s*if \(sevs\.indexOf\(i\.severity\) < 0\) return;/);
});

test('renderSlaCountdown (Dashboard widget) filters out any incident whose severity has no SLA target before building the countdown list', () => {
  assert.match(frontend, /return i\.status !== 'Closed' && i\.status !== 'Resolved' && getIncidentSlaHours\(i\) !== null;/);
});

test('buildC360Metrics (Customer 360) no longer counts a Medium/Normal open incident as "breached" just because getIncidentSlaHours returns null (which would otherwise make slaH \* 3600000 evaluate to 0 and everything look instantly breached)', () => {
  assert.match(frontend, /var slaH = getIncidentSlaHours\(i\);\s*\n\s*if \(slaH === null\) return false;\s*\n\s*return \(Date\.now\(\) - new Date\(i\.startDT \|\| \(i\.date \+ 'T09:00'\)\)\.getTime\(\)\) > slaH \* 3600000;/);
});

test('the dashboard metric drill-down modal (open/sla/byAreaOpen rows) shows "No SLA" in the target column instead of a misleading 0m when the incident\'s severity has no SLA target', () => {
  assert.match(frontend, /var incSlaHours = getIncidentSlaHours\(inc\);\s*\n\s*var hasSlaTarget = metric === 'mttd' \|\| incSlaHours !== null;\s*\n\s*var targetMinutes = metric === 'mttd' \? MTTD_SLA_MINUTES : \(incSlaHours \|\| 0\) \* 60;/);
  assert.match(frontend, /\(hasSlaTarget \? formatMetricDuration\(visibleSlaTargetMinutes\) : 'No SLA'\)/);
});

test('the four report/export "assumed duration when downtime is missing" fallbacks (Excel, incident report view, individual PDF, bulk PDF) update Critical/High to the new SLA values but deliberately keep Medium/Normal\'s existing numeric fallback (12h/24h) since they need a real number, not null, to estimate a missing end time', () => {
  const matches = frontend.match(/\{ Critical: 4, High: 12, Medium: 12, Normal: 24 \}/g) || [];
  assert.equal(matches.length, 4, `expected exactly 4 occurrences of the report-fallback SLA map, found ${matches.length}`);
});

test('no stale 1-hour or old 4-hour-High-as-Critical-duplicate literal remains anywhere in the frontend', () => {
  assert.doesNotMatch(frontend, /\{\s*Critical:\s*1\s*,\s*High:\s*4/, 'a stale 1-hour Critical SLA literal was found');
  assert.doesNotMatch(frontend, /\{ Critical: 4, High: 4, Medium: 12, Normal: 24 \}/, 'a stale High:4 (pre-12h-update) SLA literal was found');
});
