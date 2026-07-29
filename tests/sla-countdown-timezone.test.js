const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('SLA timing prefers the canonical UTC incident opening timestamp', () => {
  const start = frontend.indexOf('function getIncidentOpenedTimestamp(inc)');
  const end = frontend.indexOf('// A Missed MTTR', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /inc && inc\.opened_at_utc/);
  assert.match(implementation, /new Date\(canonicalUtc\)\.getTime\(\)/);
});

test('live SLA countdown uses the timezone-safe opening timestamp and applicable SLA', () => {
  const start = frontend.indexOf('function renderSlaCountdown()');
  const end = frontend.indexOf('function renderHealthGrid()', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /getIncidentSlaHours\(i\) \* 3600000/);
  assert.match(implementation, /getIncidentOpenedTimestamp\(i\)/);
  assert.doesNotMatch(implementation, /new Date\(i\.startDT/);
});

test('resolved incidents are excluded from the live SLA countdown', () => {
  const start = frontend.indexOf('function renderSlaCountdown()');
  const end = frontend.indexOf('function renderHealthGrid()', start);
  assert.match(frontend.slice(start, end), /i\.status !== 'Closed' && i\.status !== 'Resolved'/);
});
