'use strict';

// The Critical SLA target moved from 1 hour to 4 hours. This constant is
// duplicated (not shared) across ~7 places in the frontend — getIncidentSlaHours
// (the canonical helper other functions call), the SLA_HOURS constant, the SLA
// breach donut chart, the Excel report export, the individual incident report
// view, the individual incident PDF export, and the bulk PDF report — so every
// one of them needs to actually agree, not just the "main" helper.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('no literal Critical SLA map anywhere in the frontend still says 1 hour', () => {
  assert.doesNotMatch(frontend, /\{\s*Critical:\s*1\s*,\s*High:\s*4/, 'a stale 1-hour Critical SLA literal was found');
});

test('every one of the 7 known SLA-map call sites now reads Critical: 4 (High stays 4, Medium 12, Normal 24 — unchanged)', () => {
  const matches = frontend.match(/\{ Critical: 4, High: 4, Medium: 12, Normal: 24 \}/g) || [];
  assert.equal(matches.length, 7, `expected exactly 7 occurrences of the updated SLA map, found ${matches.length}`);
});

test('getIncidentSlaHours (the canonical per-incident SLA helper, used by isActiveSlaBreached, getSLAInfo, and the dashboard KPI drill-downs) resolves Critical to 4 hours', () => {
  assert.match(frontend, /function getIncidentSlaHours\(inc\) \{[\s\S]{0,300}return \{ Critical: 4, High: 4, Medium: 12, Normal: 24 \}\[inc && inc\.severity\] \|\| 24;/);
});

test('the documentation comment above SLA_HOURS reflects the new value too, not just the code', () => {
  assert.match(frontend, /\/\/ SLA_MAP removed — use SLA_HOURS = \{Critical:4,High:4,Medium:12,Normal:24\}/);
});
