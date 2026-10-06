'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('Incident Trend uses database-backed monthly opened and closed event counts', () => {
  const start = frontend.indexOf('function _drawTrend(');
  const end = frontend.indexOf('/* ── 2. SEVERITY DONUT', start);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /dOpen\.push\(openCnt\);/);
  assert.match(implementation, /dClosed\.push\(closedCnt\);/);
  assert.match(implementation, /for \(var monthOffset = 7; monthOffset >= 0; monthOffset--\)/);
  assert.match(implementation, /status === 'closed' \|\| status === 'resolved'/);
  assert.match(implementation, /\['Opened', '#f75c7c'\]/);
  assert.match(implementation, /ctx\.fillStyle = textC2; ctx\.font = '11px sans-serif'; ctx\.textAlign = 'left';/);
  assert.match(implementation, /_drawTrend\(gridC, textC, textC2, data\)/);
  assert.doesNotMatch(implementation, /Simulate cumulative growth|Math\.sin\(|Math\.cos\(|\bweekInc\b|\bbase\s*=/);
});

// An incident's opened/closed UTC instant, converted to the VIEWER's own
// browser timezone, can land on a different calendar day than the SAME
// instant converted to that incident's own recorded timezone — e.g. 9:44 PM
// GMT reads as past midnight (the next day) to a viewer on IST. Bucketing by
// that converted instant disagreed with every other Dashboard figure (the
// KPI tiles, the date-range filter), which all go by each incident's own
// recorded wall-clock date instead — so an incident genuinely opened on the
// last day of a month could silently vanish from that month's "Opened"
// count depending on which timezone happened to be viewing the chart.
test('Incident Trend buckets by each incident\'s own recorded wall-clock date (i.date / i.endDT), not by converting the UTC instant into the viewer\'s own browser timezone', () => {
  const start = frontend.indexOf('function _drawTrend(');
  const end = frontend.indexOf('/* ── 2. SEVERITY DONUT', start);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /var monthKey = monthStart\.getFullYear\(\) \+ '-' \+ String\(monthStart\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\);/);
  assert.match(implementation, /var openCnt = data\.filter\(function \(i\) \{ return String\(i\.date \|\| ''\)\.slice\(0, 7\) === monthKey; \}\)\.length;/);
  assert.match(implementation, /return \(status === 'closed' \|\| status === 'resolved'\) && String\(i\.endDT \|\| ''\)\.slice\(0, 7\) === monthKey;/);
  assert.doesNotMatch(implementation, /getIncidentOpenedTimestamp\(i\)/, 'must not re-derive opened via a UTC instant compared against a browser-local month boundary');
  assert.doesNotMatch(implementation, /getIncidentClosedTimestamp\(i\)/, 'must not re-derive closed via a UTC instant compared against a browser-local month boundary');
});

test('monthBounds (start/end Date objects, used only by the click-to-drill-down handler) are unchanged by the wall-clock bucketing fix', () => {
  const start = frontend.indexOf('function _drawTrend(');
  const end = frontend.indexOf('/* ── 2. SEVERITY DONUT', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /monthBounds\.push\(\{ start: monthStart, end: monthEnd \}\);/);
  assert.match(implementation, /if \(best < 0 \|\| bestDist >= cW \/ \(labels\.length - 1\) \* 0\.65 \|\| !monthBounds\[best\]\) return;/);
});
