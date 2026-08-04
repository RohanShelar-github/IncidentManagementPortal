const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend', 'routes', 'authRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');

test('User Management action column offers Change Password', () => {
  assert.match(frontend, /onclick="changeUserPassword\('\$\{u\.id\}'\)">Change Password/);
  assert.match(frontend, /function changeUserPassword\(id\)/);
  assert.match(frontend, /id="_adminNewPassword"/);
  assert.match(frontend, /id="_adminConfirmPassword"/);
});

test('admin password dialog validates and calls the selected-user API', () => {
  assert.match(frontend, /Only administrators can change user passwords/);
  assert.match(frontend, /newPassword !== confirmPassword/);
  assert.match(frontend, /'\/auth\/users\/' \+ encodeURIComponent\(id\) \+ '\/password'/);
  assert.match(frontend, /body: JSON\.stringify\(\{ newPassword: newPassword \}\)/);
});

test('selected-user password endpoint is authenticated, admin-only, and hashes before database update', () => {
  assert.match(routes, /router\.patch\('\/users\/:id\/password', authenticateToken, adminChangeUserPassword\)/);
  assert.match(controller, /Only administrators can change user passwords/);
  assert.match(controller, /bcrypt\.hash\(newPassword, 12\)/);
  assert.match(controller, /UPDATE users SET password = \? WHERE id = \?/);
  assert.match(controller, /\[passwordHash, userId\]/);
});
