'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

// Dashboard charts are hand-drawn once against their container's size at
// render time (many _draw* functions read el.getBoundingClientRect()) and
// are never redrawn afterward. Browser zoom changes the effective CSS pixel
// size of those containers without reloading the page, so without a resize
// redraw the charts become stale-sized relative to their container —
// visually overlapping/overflowing content. A debounced, dashboard-page-only
// resize listener that re-invokes applyDashFilters() fixes this.
test('a debounced window resize listener redraws dashboard charts, only while the Dashboard page is active', () => {
  assert.match(frontend, /window\.addEventListener\('resize', function \(\) \{\s*var page = document\.getElementById\('page-dashboard'\);\s*if \(!page \|\| !page\.classList\.contains\('active'\)\) return;\s*clearTimeout\(dashboardResizeRedrawTimer\);\s*dashboardResizeRedrawTimer = setTimeout\(applyDashFilters, 200\);\s*\}\);/);
  assert.match(frontend, /var dashboardResizeRedrawTimer = null;/);
});
