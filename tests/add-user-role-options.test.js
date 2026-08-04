const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('Add User exposes every role supported by the database model', () => {
  for (const [key, label] of [
    ['admin', 'Admin'], ['cso', 'CSO'], ['pmo', 'PMO'], ['aoc', 'AOC'],
    ['engineer', 'Engineer'], ['stakeholder', 'Stakeholder']
  ]) {
    assert.match(html, new RegExp(`<option value="${key}">${label}</option>`));
  }
});

test('Add User rebuilds its dropdown from the authoritative supported-role list', () => {
  assert.match(frontend, /const SUPPORTED_USER_ROLES = \[/);
  assert.match(frontend, /SUPPORTED_USER_ROLES\.map\(function \(supportedRole\)/);
  assert.doesNotMatch(frontend.slice(frontend.indexOf('function openAddUserModal'), frontend.indexOf('function saveUser')), /roles\.map/);
  assert.doesNotMatch(frontend, /SUPPORTED_USER_ROLES[^;]*viewer/);
});

test('User Management filters expose every supported role', () => {
  for (const [key, label] of [
    ['admin', 'Admin'], ['cso', 'CSO'], ['pmo', 'PMO'], ['aoc', 'AOC'],
    ['engineer', 'Engineer'], ['stakeholder', 'Stakeholder']
  ]) {
    assert.match(html, new RegExp(`onclick="filterUsers\\('${key}', this\\)">${label}</div>`));
  }
});
