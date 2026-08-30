const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'backend', 'middleware', 'auth.js'), 'utf8');
const security = fs.readFileSync(path.join(root, 'backend', 'config', 'security.js'), 'utf8');

test('authentication requires a configured strong JWT secret and has no predictable fallback', () => {
  assert.match(security, /JWT_SECRET must be configured/);
  assert.match(auth, /jwtSecret\(\)/);
  assert.match(middleware, /jwtSecret\(\)/);
  assert.doesNotMatch(auth, /your-secret-key-change-this-in-production/);
  assert.doesNotMatch(middleware, /your-secret-key-change-this-in-production/);
});

test('login responses do not enumerate accounts and rate limit repeated failures', () => {
  assert.match(auth, /Invalid email or password/);
  assert.match(auth, /LOGIN_MAX_FAILURES = 5/);
  assert.match(auth, /Too many login attempts/);
  assert.doesNotMatch(auth, /No account found with this email address/);
  assert.doesNotMatch(auth, /Incorrect password\. Please try again/);
});

test('user management data is admin-only, while incident creators receive a limited assignee directory', () => {
  assert.match(auth, /Only administrators can view user accounts/);
  assert.match(auth, /hasRolePermission\(req\.user\.role, 'create_incidents'\)/);
  assert.match(auth, /SELECT id, full_name, role, is_active/);
  assert.match(auth, /users\.map\(assigneeDto\)/);
  assert.match(auth, /SELECT u\.id, u\.email, u\.full_name, u\.role, u\.is_active, u\.created_at/);
  assert.doesNotMatch(auth, /return \{[\s\S]{0,400}password:/);
});

test('a successful legacy login upgrades storage to bcrypt without changing the user password', () => {
  assert.match(auth, /if \(!storedPassword\.startsWith\('\$2'\)\)/);
  assert.match(auth, /bcrypt\.hash\(password, 12\)/);
  assert.match(auth, /UPDATE users SET password = \? WHERE id = \? AND password = \?/);
});
