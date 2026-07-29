const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('fresh login loads incident data before its final repaint', () => {
  const loginStart = frontend.lastIndexOf('function doLogin()');
  const logoutStart = frontend.indexOf('function doLogout()', loginStart);
  const implementation = frontend.slice(loginStart, logoutStart);
  assert.match(implementation, /loadMasterData\(function \(masterError\)/);
  assert.match(implementation, /loadUsersFromBackend\(function \(usersError\)/);
  assert.match(implementation, /loadIncidentsFromBackend\(function \(incidentsError\)/);
  assert.match(implementation, /renderIncidentTable\(\)/);
  assert.match(implementation, /renderHomePage\(\)/);
});

test('fresh login reports data initialization failures instead of leaving a silent empty list', () => {
  const loginStart = frontend.lastIndexOf('function doLogin()');
  const logoutStart = frontend.indexOf('function doLogout()', loginStart);
  const implementation = frontend.slice(loginStart, logoutStart);
  assert.match(implementation, /incidents could not be loaded/);
  assert.match(implementation, /master data could not be loaded/);
});
