const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('confirmed incident deletion immediately removes the row from all UI collections', () => {
  const start = frontend.indexOf('function removeDeletedIncidentFromUi(id)');
  const end = frontend.indexOf('function confirmDeleteIncident(id)', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /incidents = incidents\.filter/);
  assert.match(implementation, /filteredIncidents = filteredIncidents\.filter/);
  assert.match(implementation, /selectedIncidents\.delete\(id\)/);
  assert.match(implementation, /renderIncidentTable\(\)/);
  assert.match(implementation, /renderKanban/);
  assert.match(implementation, /renderHomePage\(\)/);
});

test('UI removal happens only after backend confirms successful deletion', () => {
  const start = frontend.indexOf('function confirmDeleteIncident(id)');
  const end = frontend.indexOf('function openDowntimeModal', start);
  const implementation = frontend.slice(start, end);
  const success = implementation.indexOf('if (data && data.success)');
  const removal = implementation.indexOf('removeDeletedIncidentFromUi(id)', success);
  assert.ok(success >= 0);
  assert.ok(removal > success);
});
