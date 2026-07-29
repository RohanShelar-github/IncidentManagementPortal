const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('dashboard recent incident rows open their incident detail', () => {
  const start = frontend.indexOf('function renderRecentTable()');
  const end = frontend.indexOf('//', start + 30);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /data-incident-id=/);
  assert.match(implementation, /row\.addEventListener\('click', openRecentIncident\)/);
  assert.match(implementation, /openDetailPanel\(row\.getAttribute\('data-incident-id'\)\)/);
});

test('dashboard recent incident rows support keyboard opening', () => {
  const start = frontend.indexOf('function renderRecentTable()');
  const implementation = frontend.slice(start, frontend.indexOf('//', start + 30));
  assert.match(implementation, /role="button" tabindex="0"/);
  assert.match(implementation, /event\.key === 'Enter' \|\| event\.key === ' '/);
});
