'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const roleController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'roleController.js'), 'utf8');
const masterDataController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'masterDataController.js'), 'utf8');
const masterDataRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'masterDataRoutes.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '036_customer_csm_permission.sql'), 'utf8');

test('manage_customer_csm is a real, validated permission', () => {
  assert.match(roleController, /'manage_data', 'manage_customer_csm'/);
});

test('the CSM update route requires the dedicated permission, not a hardcoded admin check', () => {
  assert.match(masterDataRoutes, /router\.patch\('\/customers\/:id\/csm', requirePermission\('manage_customer_csm'\), updateCustomerCsm\)/);
});

test('updateCustomerCsm persists the inbound CSM name for the given customer', () => {
  assert.match(masterDataController, /const updateCustomerCsm = async \(req, res\) => \{/);
  assert.match(masterDataController, /UPDATE customers SET inbound_csm_name = \?, updated_by = \? WHERE id = \?/);
  assert.match(masterDataController, /module\.exports = \{ getMasterData, createCustomer, updateCustomerCsm, deactivateCustomer, createArea, deactivateArea \};/);
});

test('the permission and an admin-only grant are seeded for fresh installs', () => {
  assert.match(schema, /\('manage_customer_csm','Manage Customer CSM'\)/);
  assert.match(migration, /INSERT IGNORE INTO role_permissions\(role_id, permission_key\)\s*\n\s*SELECT r\.id, 'manage_customer_csm' FROM roles r WHERE r\.role_key = 'admin';/);
});

test('the legacy incident-tags display is removed from Customer 360', () => {
  assert.doesNotMatch(html, /id="c360Tags"/);
  assert.doesNotMatch(frontend, /var tagsEl = document\.getElementById\('c360Tags'\);/);
});

test('Customer 360 shows the Inbound CSM name and gates editing behind the new permission', () => {
  assert.match(html, /id="c360InboundCsm"/);
  assert.match(html, /value="manage_customer_csm"/);
  assert.match(frontend, /function renderC360InboundCsmDisplay\(custName\) \{/);
  assert.match(frontend, /var canEdit = hasPermission\('manage_customer_csm'\);/);
  assert.match(frontend, /function editC360InboundCsm\(custName\) \{/);
  assert.match(frontend, /if \(!hasPermission\('manage_customer_csm'\)\) \{ showToast\('Access denied: you cannot edit the CSM name', 'error'\); return; \}/);
  assert.match(frontend, /function saveC360InboundCsm\(customerId, custName\) \{/);
  assert.match(frontend, /masterDataRequest\('\/master-data\/customers\/' \+ customerId \+ '\/csm', 'PATCH', \{ inbound_csm_name: value \}/);
});

test('manage_customer_csm has a display label and defaults to the admin role only', () => {
  assert.match(frontend, /manage_customer_csm: 'Manage Customer CSM',/);
  assert.match(frontend, /'manage_users', 'manage_roles', 'assign_roles', 'manage_data', 'manage_customer_csm'\]/);
});
