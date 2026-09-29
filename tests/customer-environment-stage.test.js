'use strict';

// Tracks each customer's deployment stage — Production ("Live"), UAT, or
// Development — as a simple fixed 3-value field on customers (not an
// admin-extensible lookup table like incident Tags, since these three
// stages are fixed business categories). Admins can move a customer between
// stages from Data Management. The Dashboard only ever shows the Production
// ("Live") count; the full breakdown lives in Data Management.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const masterDataController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'masterDataController.js'), 'utf8');
const masterDataRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'masterDataRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '043_customer_environment_stage.sql'), 'utf8');

// ── Migration: simple fixed ENUM column, no backfill ──────────────────────

test('the migration conditionally adds customers.environment_stage as a fixed 3-value ENUM, not a new lookup table', () => {
  assert.match(migration, /SELECT COUNT\(\*\) FROM information_schema\.columns\s*\n\s*WHERE table_schema = DATABASE\(\) AND table_name = 'customers'\s*\n\s*AND column_name = 'environment_stage'/);
  assert.match(migration, /ALTER TABLE customers ADD COLUMN environment_stage ENUM\('production','uat','development'\) NULL AFTER timezone/);
  assert.doesNotMatch(migration, /CREATE TABLE/, 'this must be a simple column, not a new lookup table like incident_tags');
});

test('the migration does not backfill any existing customer\'s stage — there is no reliable way to infer it, so every customer starts unset', () => {
  assert.doesNotMatch(migration, /UPDATE customers/);
});

// ── Backend: DTO, create, and the admin-only stage-change endpoint ────────

test('customerDto exposes environment_stage, and createCustomer accepts + validates an optional environment_stage against the 3 allowed values', () => {
  assert.match(masterDataController, /environment_stage: row\.environment_stage \|\| null,/);
  assert.match(masterDataController, /const CUSTOMER_ENVIRONMENT_STAGES = new Set\(\['production', 'uat', 'development'\]\);/);
  assert.match(masterDataController, /const environmentStage = String\(req\.body\.environment_stage \|\| ''\)\.trim\(\)\.toLowerCase\(\);\s*\n\s*if \(environmentStage && !CUSTOMER_ENVIRONMENT_STAGES\.has\(environmentStage\)\) \{/);
  assert.match(masterDataController, /customer_branch, region, timezone, environment_stage, inbound_csm_name, outbound_csm_name, created_by, updated_by\)/);
});

test('updateCustomerEnvironmentStage is admin-only, rejects anything outside the 3 allowed values, and is routed under PATCH /customers/:id/environment-stage', () => {
  assert.match(masterDataController, /const updateCustomerEnvironmentStage = async \(req, res\) => \{\s*\n\s*if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(masterDataController, /if \(!CUSTOMER_ENVIRONMENT_STAGES\.has\(environmentStage\)\) \{\s*\n\s*return res\.status\(400\)\.json\(\{ success: false, message: 'Environment stage must be one of production, uat, development' \}\);/);
  assert.match(masterDataController, /UPDATE customers SET environment_stage = \?, updated_by = \? WHERE id = \?/);
  assert.match(masterDataController, /module\.exports = \{ getMasterData, createCustomer, updateCustomerCsm, updateCustomerEnvironmentStage, deactivateCustomer, createArea, deactivateArea, createIncidentTag, deleteIncidentTag \};/);
  assert.match(masterDataRoutes, /router\.patch\('\/customers\/:id\/environment-stage', updateCustomerEnvironmentStage\);/);
});

// ── Frontend: Data Management shows/edits the full breakdown ──────────────

test('Data Management\'s Customers card has a Stage select in the create-customer form, and a breakdown line separate from the plain "N customers" count', () => {
  assert.match(html, /<select id="dmNewCustomerStage"[^>]*>\s*\n<option value="">Stage: Not set<\/option>\s*\n<option value="production">Production \(Live\)<\/option>\s*\n<option value="uat">UAT<\/option>\s*\n<option value="development">Development<\/option>\s*\n<\/select>/);
  assert.match(html, /<div id="dmCustStageBreakdown" style="font-size:11px;color:var\(--text-muted\);margin-bottom:10px"><\/div>/);
});

test('renderDataManagement renders each customer row from customerRecords (not the plain name-only customers array) with a per-row stage control, and computes the full Production/UAT/Development/Not-set breakdown', () => {
  assert.match(frontend, /var CUSTOMER_ENV_STAGE_LABELS = \{ production: 'Production', uat: 'UAT', development: 'Development' \};/);
  assert.match(frontend, /custList\.innerHTML = customerRecords\.map\(function \(c\) \{/);
  assert.match(frontend, /var isAdminUser = \(currentRole \|\| ''\)\.toLowerCase\(\) === 'admin';/);
  assert.match(frontend, /var stageBreakdownEl = document\.getElementById\('dmCustStageBreakdown'\);/);
  assert.match(frontend, /counts\.production \+ ' Production, ' \+ counts\.uat \+ ' UAT, ' \+ counts\.development \+ ' Development, ' \+ counts\.notSet \+ ' Not set';/);
});

test('only an admin sees an editable stage <select> per customer row (calling changeCustomerEnvironmentStage on change) — everyone else sees a read-only label', () => {
  assert.match(frontend, /var stageControl = isAdminUser\s*\n\s*\? '<select onchange="changeCustomerEnvironmentStage\(' \+ c\.id \+ ', this\.value\)"/);
  assert.match(frontend, /: '<span style="font-size:11px;color:var\(--text-muted\)">' \+ \(CUSTOMER_ENV_STAGE_LABELS\[stage\] \|\| 'Not set'\) \+ '<\/span>';/);
});

test('changeCustomerEnvironmentStage is admin-gated (requireAdminMasterData, the same guard addCustomer/removeCustomer already use) and PATCHes the new endpoint', () => {
  assert.match(frontend, /function changeCustomerEnvironmentStage\(id, stage\) \{\s*\n\s*if \(!requireAdminMasterData\(\)\) return;/);
  assert.match(frontend, /masterDataRequest\('\/master-data\/customers\/' \+ id \+ '\/environment-stage', 'PATCH', \{ environment_stage: stage \}, function \(\) \{/);
});

test('addCustomer sends the selected dmNewCustomerStage value along with the new customer, and resets the select back to blank after a successful add', () => {
  assert.match(frontend, /var stageSel = document\.getElementById\('dmNewCustomerStage'\);\s*\n\s*var stage = stageSel \? stageSel\.value : '';\s*\n\s*masterDataRequest\('\/master-data\/customers', 'POST', \{ customer_name: name, environment_stage: stage \|\| undefined \}, function \(\) \{\s*\n\s*inp\.value = '';\s*\n\s*if \(stageSel\) stageSel\.value = '';/);
});

// ── Frontend: Dashboard shows ONLY the Live/Production count ──────────────

test('the Dashboard has exactly one new "Live Customers" KPI card, opening a dedicated read-only modal (not navigating to Data Management, which most roles can\'t access) — no UAT/Development cards on the Dashboard', () => {
  assert.match(html, /<div class="stat-card green metric-kpi-card" id="dashboardCardLiveCustomers" onclick="showLiveCustomersModal\(\)"[^>]*title="View the list of customers currently in Production">/);
  assert.match(html, /<div class="stat-label">Live Customers<\/div>\s*\n<div class="stat-value" id="statLiveCustomers">—<\/div>\s*\n<div class="stat-delta" id="statLiveCustomersSub">in Production<\/div>/);
  assert.doesNotMatch(html, /id="statUatCustomers"|id="statDevelopmentCustomers"|id="dashboardCardUatCustomers"|id="dashboardCardDevelopmentCustomers"/, 'the Dashboard must not show UAT/Development customer counts, only Data Management does');
  assert.doesNotMatch(html, /id="dashboardCardLiveCustomers"[^>]*onclick="navigate\('datamanagement'\)"/, 'must not route to the permission-gated Data Management page');
});

test('showLiveCustomersModal is a self-contained, permission-free list view (reads already-loaded customerRecords client-side, no manage_data check) — since Data Management itself requires manage_data (Admin/PMO/Manager only) and routing every role there would throw an access-denied error for everyone else', () => {
  assert.match(html, /<div id="liveCustomersOverlay" style="display:none;position:fixed;inset:0;z-index:8000;/);
  assert.match(html, /<div id="liveCustomersList" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px"><\/div>/);
  assert.match(frontend, /function showLiveCustomersModal\(\) \{/);
  assert.match(frontend, /var liveCustomers = customerRecords\.filter\(function \(c\) \{ return c\.environment_stage === 'production'; \}\);/);
  assert.match(frontend, /overlay\.style\.display = 'flex';/);
  assert.doesNotMatch(frontend, /function showLiveCustomersModal\(\) \{[\s\S]{0,400}hasPermission/, 'the list view itself must not gate on a permission the current role might lack');
});

test('updateLiveCustomersCard counts only Production-stage customers, and is called every time master data reloads', () => {
  assert.match(frontend, /function updateLiveCustomersCard\(\) \{\s*\n\s*var el = document\.getElementById\('statLiveCustomers'\);\s*\n\s*if \(!el\) return;\s*\n\s*el\.textContent = customerRecords\.filter\(function \(c\) \{ return c\.environment_stage === 'production'; \}\)\.length;/);
  assert.match(frontend, /updateDmCounts\(\);\s*\n\s*updateLiveCustomersCard\(\);\s*\n\s*populateEngineerDropdowns\(\);/);
});
