const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend', 'routes', 'authRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');
const authMiddleware = fs.readFileSync(path.join(root, 'backend', 'middleware', 'auth.js'), 'utf8');
const userActivationMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '011_user_activation.sql'), 'utf8');
const roleAlignmentMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '012_align_user_roles.sql'), 'utf8');

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

test('changing a user role persists through the protected backend endpoint', () => {
  assert.match(frontend, /function editUserRole\(id\)/);
  assert.match(frontend, /String\(u\.id\) === String\(id\)/);
  assert.match(frontend, /method: 'PATCH'/);
  assert.match(frontend, /body: JSON\.stringify\(\{ role: newRole \}\)/);
  assert.match(routes, /router\.patch\('\/users\/:id\/role', authenticateToken, updateUserRole\)/);
  assert.match(controller, /Only administrators can change user roles/);
  assert.match(controller, /UPDATE users SET role = \? WHERE id = \?/);
});

test('user list supplies assigned incident and activity display defaults', () => {
  assert.match(controller, /COUNT\(i\.id\) AS incidents/);
  assert.match(controller, /lastActive: user\.last_active \|\| 'Not tracked'/);
  assert.match(controller, /incidents: Number\(user\.incidents \|\| 0\)/);
});

test('user activation persists through an admin-only backend endpoint', () => {
  assert.match(frontend, /function toggleUser\(id\)/);
  assert.match(frontend, /body: JSON\.stringify\(\{ active: nextActive \}\)/);
  assert.match(routes, /router\.patch\('\/users\/:id\/active', authenticateToken, updateUserActivation\)/);
  assert.match(controller, /Only administrators can activate or deactivate users/);
  assert.match(controller, /UPDATE users SET is_active = \? WHERE id = \?/);
  assert.match(controller, /You cannot deactivate your own user account/);
});

test('inactive users cannot log in or continue using an existing token', () => {
  assert.match(controller, /if \(!user\.is_active\)/);
  assert.match(authMiddleware, /SELECT id, email, full_name, role, is_active FROM users/);
  assert.match(authMiddleware, /This user account is inactive/);
});

test('user activation migration adds an active database flag idempotently', () => {
  assert.match(userActivationMigration, /column_name = 'is_active'/);
  assert.match(userActivationMigration, /ALTER TABLE users ADD COLUMN is_active TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(userActivationMigration, /011_user_activation/);
});

test('change-role choices match the portal and database role model', () => {
  assert.match(frontend, /allowedRoleKeys = \['admin', 'cso', 'pmo', 'aoc', 'engineer', 'stakeholder'\]/);
  assert.doesNotMatch(frontend, /allowedRoleKeys = \[[^\]]*'viewer'/);
  assert.match(controller, /allowedRoles = \['admin', 'cso', 'pmo', 'aoc', 'engineer', 'stakeholder'\]/);
  assert.match(roleAlignmentMigration, /UPDATE users SET role = 'stakeholder' WHERE role = 'viewer'/);
  assert.match(roleAlignmentMigration, /ENUM\('admin','cso','pmo','aoc','engineer','stakeholder'\)/);
});
