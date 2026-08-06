'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('duplicate export-card date controls are removed', () => {
  assert.doesNotMatch(html, /id="pdfPeriod"/);
  assert.doesNotMatch(html, /id="xlsFrom"/);
  assert.doesNotMatch(html, /id="xlsTo"/);
});

test('PDF and Excel exports both use the existing Reports filters', () => {
  const calls = frontend.match(/const data = getReportFilteredIncidents\(\)/g) || [];
  assert.ok(calls.length >= 2);
  assert.match(frontend, /document\.getElementById\('reportDateFrom'\)/);
  assert.match(frontend, /document\.getElementById\('reportDateTo'\)/);
  assert.match(frontend, /if \(from && i\.date < from\) return false/);
  assert.match(frontend, /if \(to && i\.date > to\) return false/);
});

test('existing customer, severity, status, and area report filters remain intact', () => {
  assert.match(frontend, /if \(cust && i\.customer !== cust\) return false/);
  assert.match(frontend, /if \(sev && i\.severity !== sev\) return false/);
  assert.match(frontend, /if \(stat && i\.status !== stat\) return false/);
  assert.match(frontend, /if \(area && i\.area !== area\) return false/);
});
