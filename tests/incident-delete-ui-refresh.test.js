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

test('closed incidents expose delete only to the admin role', () => {
  const renderStart = frontend.indexOf('function renderIncidentTable()');
  const renderEnd = frontend.indexOf('function renderPagination()', renderStart);
  const rendering = frontend.slice(renderStart, renderEnd);
  assert.match(rendering, /i\.status !== 'Closed' \|\| currentRole === 'admin'/);

  const deleteStart = frontend.indexOf('function deleteIncident(id)');
  const deleteEnd = frontend.indexOf('function openDowntimeModal', deleteStart);
  const deletion = frontend.slice(deleteStart, deleteEnd);
  assert.match(deletion, /inc\.status === 'Closed' && currentRole !== 'admin'/);
  assert.match(deletion, /Only administrators can delete closed incidents/);
});

test('backend allows authenticated deletion of open incidents but reserves closed deletion for Admin', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'controllers', 'incidentController.js'), 'utf8');
  const start = controller.indexOf('const deleteIncident =');
  const end = controller.indexOf('const getDashboardStats', start);
  const deletion = controller.slice(start, end);
  assert.doesNotMatch(deletion, /permission_key = 'manage_users'/);
  assert.match(deletion, /deleted\.status === 'closed'/);
  assert.match(deletion, /req\.user\.role[\s\S]*!== 'admin'/);
  assert.match(deletion, /return res\.status\(403\)/);
});

test('open incident delete action is visible to every role', () => {
  const renderStart = frontend.indexOf('function renderIncidentTable()');
  const renderEnd = frontend.indexOf('function renderPagination()', renderStart);
  const rendering = frontend.slice(renderStart, renderEnd);
  assert.match(rendering, /\$\{i\.status !== 'Closed' \|\| currentRole === 'admin' \? `<button[^`]*deleteIncident/);
  assert.doesNotMatch(rendering, /hasPermission\('manage_users'\)[^\n]*deleteIncident/);
});

test('bulk delete action is available for selected incidents', () => {
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8'), /id="bulkDeleteBtn"[^>]*onclick="bulkDeleteSelectedIncidents\(\)"/);
  assert.match(frontend, /async function bulkDeleteSelectedIncidents\(\)/);
  assert.match(frontend, /bulkDeleteBtn/);
  assert.match(frontend, /Only administrators can delete selected closed incidents/);
});
