const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend', 'routes', 'authRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');

test('user management keeps deactivate and adds a distinct delete action', () => {
  assert.match(frontend, /onclick="toggleUser\('\$\{u\.id\}'\)"/);
  assert.match(frontend, /onclick="deleteUser\('\$\{u\.id\}'\)">Delete/);
});

test('deleting a user calls the protected backend endpoint and refreshes assignees', () => {
  assert.match(frontend, /method: 'DELETE'/);
  assert.match(frontend, /users = users\.filter/);
  assert.match(frontend, /populateEngineerDropdowns\(\)/);
  assert.match(routes, /router\.delete\('\/users\/:id', authenticateToken, deleteUser\)/);
});

test('backend user deletion is admin-only and protects referenced history', () => {
  assert.match(controller, /Only administrators can delete users/);
  assert.match(controller, /You cannot delete your own user account/);
  assert.match(controller, /ER_ROW_IS_REFERENCED_2/);
  assert.match(controller, /DELETE FROM users WHERE id = \?/);
});
