const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('backend', 'sql', '014_database_roles.sql');
const controller = read('backend', 'controllers', 'roleController.js');
const routes = read('backend', 'routes', 'roleRoutes.js');
const server = read('backend', 'server.js');
const frontend = read('js', 'app.js');

test('role definitions, permissions, and assignments are relational database data', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS roles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS permissions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS role_permissions/);
  assert.match(migration, /ALTER TABLE users MODIFY COLUMN role VARCHAR\(50\)/);
  assert.match(migration, /FOREIGN KEY \(role\) REFERENCES roles\(role_key\)/);
});

test('authenticated role API reads roles and restricts writes to administrators', () => {
  assert.match(routes, /router\.get\('\/', authenticateToken, getRoles\)/);
  assert.match(routes, /router\.put\('\/', authenticateToken, saveRoles\)/);
  assert.match(controller, /Only administrators can manage roles/);
  assert.match(controller, /beginTransaction/);
  assert.match(server, /app\.use\('\/api\/roles', roleRoutes\)/);
});

test('role management loads and saves the shared database role list', () => {
  assert.match(frontend, /method: 'PUT'/);
  assert.match(frontend, /API_BASE_URL \+ '\/roles'/);
  assert.match(frontend, /roles = data\.data/);
  assert.match(frontend, /localStorage\.removeItem\('mc_roles'\)/);
});
