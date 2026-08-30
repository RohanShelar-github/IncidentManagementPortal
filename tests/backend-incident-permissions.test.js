'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('incident write routes enforce server-side role permissions', () => {
  const routes = read('backend/routes/incidentRoutes.js');
  assert.match(routes, /router\.post\('\/', requirePermission\('create_incidents'\), createIncident\)/);
  assert.match(routes, /router\.put\('\/:id', requirePermission\('edit_incidents'\), requireClosePermissionWhenClosing, updateIncident\)/);
  assert.match(routes, /router\.delete\('\/:id', requirePermission\('delete_incidents'\), deleteIncident\)/);
  assert.match(routes, /router\.post\('\/:id\/comments', requirePermission\('edit_incidents'\), addComment\)/);
});

test('JWT verification accepts only the expected HMAC algorithm', () => {
  assert.match(read('backend/middleware/auth.js'), /algorithms: \['HS256'\]/);
});

test('public health response contains no infrastructure or integration configuration', () => {
  const server = read('backend/server.js');
  const start = server.indexOf("app.get('/api/health'");
  const end = server.indexOf('// 404 handler', start);
  const implementation = server.slice(start, end);
  assert.doesNotMatch(implementation, /databaseName|databaseTime|emailConfigured|aiConfigured|error\.message/);
});
