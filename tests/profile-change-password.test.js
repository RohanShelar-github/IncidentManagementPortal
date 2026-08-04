const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend', 'routes', 'authRoutes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'authController.js'), 'utf8');
const profileMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '013_user_profile_fields.sql'), 'utf8');

test('profile provides current, new, and confirmation password fields', () => {
  assert.match(html, /id="pf_current_password"[^>]*type="password"/);
  assert.match(html, /id="pf_new_password"[^>]*type="password"/);
  assert.match(html, /id="pf_confirm_password"[^>]*type="password"/);
  assert.match(html, /onclick="changeProfilePassword\(\)"/);
});

test('profile password change validates before calling the authenticated API', () => {
  assert.match(frontend, /function changeProfilePassword\(\)/);
  assert.match(frontend, /newPassword !== confirmPassword/);
  assert.match(frontend, /newPassword\.length < 8 \|\| newPassword\.length > 72/);
  assert.match(frontend, /'\/auth\/password'/);
  assert.match(frontend, /method: 'PATCH'/);
  assert.match(frontend, /Authorization': `Bearer \$\{token\}`/);
});

test('password endpoint verifies the current password and stores a bcrypt hash in MySQL', () => {
  assert.match(routes, /router\.patch\('\/password', authenticateToken, changePassword\)/);
  assert.match(controller, /SELECT id, password FROM users WHERE id = \? LIMIT 1/);
  assert.match(controller, /bcrypt\.compare\(currentPassword, storedPassword\)/);
  assert.match(controller, /bcrypt\.hash\(newPassword, 12\)/);
  assert.match(controller, /UPDATE users SET password = \? WHERE id = \?/);
  assert.doesNotMatch(controller, /UPDATE users SET password = newPassword/);
});

test('editable profile fields persist through the authenticated profile endpoint', () => {
  assert.match(routes, /router\.patch\('\/profile', authenticateToken, updateProfile\)/);
  assert.match(frontend, /body: JSON\.stringify\(\{ fullName: fullName, phone: phone, department: department, location: location, bio: bio \}\)/);
  assert.match(controller, /UPDATE users SET full_name = \?, phone = \?, department = \?, location = \?, bio = \? WHERE id = \?/);
  assert.match(controller, /phone: user\.phone \|\| ''/);
  assert.match(frontend, /applyCurrentUserProfile\(data\.data\)/);
});

test('profile migration adds every editable profile column idempotently', () => {
  for (const column of ['phone', 'department', 'location', 'bio']) {
    assert.match(profileMigration, new RegExp(`column_name = '${column}'`));
  }
  assert.match(profileMigration, /013_user_profile_fields/);
});
