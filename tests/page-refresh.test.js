const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('every application page exposes a refresh control', () => {
  const pages = ['home', 'incidents', 'reports', 'users', 'datamanagement', 'roles', 'customer360'];
  for (const page of pages) {
    assert.match(html, new RegExp(`id="${page}RefreshBtn"`));
    assert.match(html, new RegExp(`refreshPageContent\\(event,'${page}'\\)`));
  }
  assert.match(html, /id="dashRefreshBtn"/);
  assert.match(html, /refreshDashboard\(event\)/);
});

test('page refresh reloads all shared backend datasets before rendering', () => {
  const start = frontend.indexOf('function refreshPageContent(event, page)');
  const end = frontend.indexOf('window.refreshPageContent = refreshPageContent', start);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /loadMasterData\(function \(masterErr\)/);
  assert.match(implementation, /loadUsersFromBackend\(function \(usersErr\)/);
  assert.match(implementation, /loadIncidentsFromBackend\(function \(incidentErr\)/);
});

test('refresh repaint covers every non-dashboard page', () => {
  const start = frontend.indexOf('function renderPageAfterRefresh(page)');
  const end = frontend.indexOf('function refreshPageContent', start);
  const implementation = frontend.slice(start, end);

  for (const page of ['home', 'incidents', 'reports', 'users', 'roles', 'datamanagement', 'customer360']) {
    assert.match(implementation, new RegExp(`page === '${page}'`));
  }
});

test('dashboard refresh reloads master data and incidents', () => {
  const start = frontend.indexOf('function refreshDashboardData(options)');
  const end = frontend.indexOf('function updateStats()', start);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /loadMasterData\(function \(masterErr\)/);
  assert.match(implementation, /loadIncidentsFromBackend\(finish\)/);
});
