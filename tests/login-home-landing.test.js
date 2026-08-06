const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('every successful credential-login handler navigates to Home', () => {
  const handlers = source.split('function doLogin() {').slice(1);
  assert.ok(handlers.length >= 1);
  handlers.forEach(function (handler) {
    const implementation = handler.split('\nfunction ')[0];
    assert.match(implementation, /setHash\('home'\)/);
    assert.match(implementation, /navigateInternal\('home', document\.getElementById\('homeNav'\)\)/);
  });
});

test('restored authenticated sessions also land on Home', () => {
  const start = source.indexOf('function verifySessionAndInit()');
  const end = source.indexOf('\ndocument.addEventListener(\'DOMContentLoaded\'', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const implementation = source.slice(start, end);
  assert.match(implementation, /var hash = 'home'/);
  assert.match(implementation, /var navEl = document\.getElementById\('homeNav'\)/);
  assert.match(implementation, /navigate\(hash, navEl\)/);
});

test('normal visits default to Home and only explicit email links open incidents', () => {
  const start = source.indexOf('function openLinkedIncidentIfReady()');
  const end = source.indexOf('\nfunction ', start + 1);
  const implementation = source.slice(start, end);
  assert.match(implementation, /URLSearchParams\(window\.location\.search\)\.get\('incident'\)/);
  assert.match(implementation, /if \(!incidentId/);
  assert.match(implementation, /return false/);
  assert.match(implementation, /openDetailPanel\(incidentId\)/);
});
