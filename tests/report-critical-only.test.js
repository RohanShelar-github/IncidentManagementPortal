'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('report output hides MTTR values for non-Critical incidents', () => {
  assert.match(frontend, /function isCriticalSeverity\(inc\)/);
  assert.match(frontend, /function getCriticalOnlyReportValue\(inc, value\)/);
  assert.match(frontend, /function getCriticalReportLabels\(inc\)/);
  assert.match(frontend, /getCriticalOnlyReportValue\(inc, inc\.mttrStr/);
  assert.match(frontend, /const mttrStr2 = getCriticalOnlyReportValue\(inc, /);
});

test('critical report labels are explicit in the report view and PDF output', () => {
  assert.match(frontend, /reportLabels = getCriticalReportLabels\(inc\)/);
  assert.match(frontend, /Critical SLA/);
  assert.match(frontend, /Critical MTTR/);
  assert.match(frontend, /Mean Time to Resolve \(MTTR\)/);
});
