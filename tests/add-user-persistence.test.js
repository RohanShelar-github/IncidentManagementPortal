const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend', 'routes', 'authRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');

test('Add User requires a secure password and submits it to the protected API', () => {
  assert.match(html, /id="u_password"[^>]*maxlength="72"[^>]*placeholder="Minimum 8 characters"/);
  assert.match(frontend, /password\.length < 8 \|\| password\.length > 72/);
  assert.match(frontend, /'\/auth\/users'/);
  assert.match(frontend, /method: 'POST'/);
  assert.match(frontend, /body: JSON\.stringify\(\{ fullName: name, email: email, role: role, department: dept, password: password \}\)/);
});

test('successful user creation reloads users from the database', () => {
  const start = frontend.indexOf('function saveUser()');
  const end = frontend.indexOf('// ─── STATS', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /loadUsersFromBackend\(function \(loadError\)/);
  assert.match(implementation, /populateEngineerDropdowns\(\)/);
  assert.doesNotMatch(implementation, /users\.push/);
});

test('backend creation is admin-only, validates the role, hashes the password, and inserts into MySQL', () => {
  assert.match(routes, /router\.post\('\/users', authenticateToken, createUser\)/);
  assert.match(controller, /Only administrators can add users/);
  assert.match(controller, /SELECT role_key FROM roles WHERE role_key = \? LIMIT 1/);
  assert.match(controller, /if \(!matchingRoles\.length\)/);
  assert.match(controller, /bcrypt\.hash\(password, 12\)/);
  assert.match(controller, /INSERT INTO users \(full_name, email, password, role, department, is_active\)/);
  assert.match(controller, /ER_DUP_ENTRY/);
});
