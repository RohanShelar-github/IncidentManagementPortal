'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');

test('incident filter bar no longer displays or applies a tag filter', () => {
  assert.doesNotMatch(html, /id="tagFilter"/);
  const start = frontend.indexOf('function applyFilters()');
  const end = frontend.indexOf('\nfunction ', start + 1);
  assert.doesNotMatch(frontend.slice(start, end), /tagFilter|\bi\.tags\b/);
});

test('Clear remains hidden until an Incident filter is active', () => {
  assert.match(html, /id="incidentClearFiltersBtn"[^>]*display:none/);
  assert.match(html, /class="filter-clear-icon" id="incidentClearFiltersBtn"[^>]*aria-label="Clear filters"><svg/);
  assert.match(frontend, /function updateIncidentClearButton\(\)/);
  assert.match(frontend, /hasSelection \|\| hasSearch \|\| hasDate \? '' : 'none'/);
  assert.match(frontend, /renderIncidentTable\(\);\s*updateIncidentClearButton\(\);/);
});
