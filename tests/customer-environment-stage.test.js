'use strict';

// Tracks each customer's deployment stage — Production ("Live"), UAT,
// Development, or On Hold — as a simple fixed 4-value field on customers
// (not an admin-extensible lookup table like incident Tags, since these
// stages are fixed business categories). Admins can move a customer between
// stages from Data Management. There is no Dashboard card for this — the
// full breakdown, grouped by stage, lives inside the Customer 360 picker
// (every customer, whether or not they have incidents), where clicking any
// customer opens their own Customer 360 profile.

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

test('customerDto exposes environment_stage, and createCustomer accepts + validates an optional environment_stage against the 4 allowed values (production/uat/development/on_hold)', () => {
  assert.match(masterDataController, /environment_stage: row\.environment_stage \|\| null,/);
  assert.match(masterDataController, /const CUSTOMER_ENVIRONMENT_STAGES = new Set\(\['production', 'uat', 'development', 'on_hold'\]\);/);
  assert.match(masterDataController, /const environmentStage = String\(req\.body\.environment_stage \|\| ''\)\.trim\(\)\.toLowerCase\(\);\s*\n\s*if \(environmentStage && !CUSTOMER_ENVIRONMENT_STAGES\.has\(environmentStage\)\) \{/);
  assert.match(masterDataController, /customer_branch, region, timezone, environment_stage, is_internal, inbound_csm_name, outbound_csm_name, created_by, updated_by\)/);
});

test('updateCustomerEnvironmentStage is admin-only, rejects anything outside the 4 allowed values, and is routed under PATCH /customers/:id/environment-stage', () => {
  assert.match(masterDataController, /const updateCustomerEnvironmentStage = async \(req, res\) => \{\s*\n\s*if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(masterDataController, /if \(!CUSTOMER_ENVIRONMENT_STAGES\.has\(environmentStage\)\) \{\s*\n\s*return res\.status\(400\)\.json\(\{ success: false, message: 'Environment stage must be one of production, uat, development, on_hold' \}\);/);
  assert.match(masterDataController, /UPDATE customers SET environment_stage = \?, updated_by = \? WHERE id = \?/);
  assert.match(masterDataController, /module\.exports = \{ getMasterData, createCustomer, updateCustomerCsm, updateCustomerEnvironmentStage, updateCustomerInternalFlag, deactivateCustomer, createArea, deactivateArea, createIncidentTag, deleteIncidentTag \};/);
  assert.match(masterDataRoutes, /router\.patch\('\/customers\/:id\/environment-stage', updateCustomerEnvironmentStage\);/);
});

test('the migration adding On Hold uses an idempotent MODIFY COLUMN (not the conditional ADD COLUMN pattern used to create the column originally) and does not touch any existing customer\'s stage', () => {
  const onHoldMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '044_customer_environment_stage_on_hold.sql'), 'utf8');
  assert.match(onHoldMigration, /ALTER TABLE customers\s*\n\s*MODIFY COLUMN environment_stage ENUM\('production','uat','development','on_hold'\) NULL;/);
  assert.doesNotMatch(onHoldMigration, /UPDATE customers/);
});

// ── Frontend: Data Management shows/edits the full breakdown ──────────────

test('Data Management\'s Customers card has a Stage select in the create-customer form (including On Hold), and a breakdown line separate from the plain "N customers" count', () => {
  assert.match(html, /<select id="dmNewCustomerStage"[^>]*>\s*\n<option value="">Stage: Not set<\/option>\s*\n<option value="production">Production \(Live\)<\/option>\s*\n<option value="uat">UAT<\/option>\s*\n<option value="development">Development<\/option>\s*\n<option value="on_hold">On Hold<\/option>\s*\n<\/select>/);
  assert.match(html, /<div id="dmCustStageBreakdown" style="font-size:11px;color:var\(--text-muted\);margin-bottom:10px"><\/div>/);
});

test('renderDataManagement renders each customer row from customerRecords (not the plain name-only customers array) with a per-row stage control (including an On Hold option), and computes the full Production/UAT/Development/On Hold/Not-set breakdown', () => {
  assert.match(frontend, /var CUSTOMER_ENV_STAGE_LABELS = \{ production: 'Production', uat: 'UAT', development: 'Development', on_hold: 'On Hold' \};/);
  assert.match(frontend, /custList\.innerHTML = customerRecords\.map\(function \(c\) \{/);
  assert.match(frontend, /var isAdminUser = \(currentRole \|\| ''\)\.toLowerCase\(\) === 'admin';/);
  assert.match(frontend, /<option value="on_hold"' \+ \(stage === 'on_hold' \? ' selected' : ''\) \+ '>On Hold<\/option>'/);
  assert.match(frontend, /var stageBreakdownEl = document\.getElementById\('dmCustStageBreakdown'\);/);
  assert.match(frontend, /var counts = \{ production: 0, uat: 0, development: 0, onHold: 0, notSet: 0 \};/);
  assert.match(frontend, /else if \(c\.environment_stage === 'on_hold'\) counts\.onHold\+\+;/);
  assert.match(frontend, /counts\.production \+ ' Production, ' \+ counts\.uat \+ ' UAT, ' \+ counts\.development \+ ' Development, ' \+ counts\.onHold \+ ' On Hold, ' \+ counts\.notSet \+ ' Not set';/);
});

test('only an admin sees an editable stage <select> per customer row (calling changeCustomerEnvironmentStage on change) — everyone else sees a read-only label', () => {
  assert.match(frontend, /var stageControl = isAdminUser\s*\n\s*\? '<select onchange="changeCustomerEnvironmentStage\(' \+ c\.id \+ ', this\.value\)"/);
  assert.match(frontend, /: '<span style="font-size:11px;color:var\(--text-muted\)">' \+ \(CUSTOMER_ENV_STAGE_LABELS\[stage\] \|\| 'Not set'\) \+ '<\/span>';/);
});

test('changeCustomerEnvironmentStage is admin-gated (requireAdminMasterData, the same guard addCustomer/removeCustomer already use) and PATCHes the new endpoint', () => {
  assert.match(frontend, /function changeCustomerEnvironmentStage\(id, stage\) \{\s*\n\s*if \(!requireAdminMasterData\(\)\) return;/);
  assert.match(frontend, /masterDataRequest\('\/master-data\/customers\/' \+ id \+ '\/environment-stage', 'PATCH', \{ environment_stage: stage \}, function \(\) \{/);
});

test('addCustomer sends the selected dmNewCustomerStage value and the dmNewCustomerInternal checkbox along with the new customer, and resets both back to blank/unchecked after a successful add', () => {
  assert.match(frontend, /var stageSel = document\.getElementById\('dmNewCustomerStage'\);\s*\n\s*var stage = stageSel \? stageSel\.value : '';\s*\n\s*var internalChk = document\.getElementById\('dmNewCustomerInternal'\);\s*\n\s*var isInternal = internalChk \? internalChk\.checked : false;\s*\n\s*masterDataRequest\('\/master-data\/customers', 'POST', \{ customer_name: name, environment_stage: stage \|\| undefined, is_internal: isInternal \}, function \(\) \{\s*\n\s*inp\.value = '';\s*\n\s*if \(stageSel\) stageSel\.value = '';\s*\n\s*if \(internalChk\) internalChk\.checked = false;/);
});

// ── Frontend: no Dashboard card — the breakdown lives in Customer 360 ─────

test('there is no Dashboard "Live Customers" KPI card or standalone Live Customers modal — that surface was removed in favor of the Customer 360 grouped picker', () => {
  assert.doesNotMatch(html, /id="dashboardCardLiveCustomers"/, 'the Dashboard KPI card must be removed');
  assert.doesNotMatch(html, /id="liveCustomersOverlay"|id="liveCustomersList"/, 'the standalone Live Customers modal must be removed');
  assert.doesNotMatch(frontend, /function showLiveCustomersModal\(|function updateLiveCustomersCard\(|function openCustomer360FromLiveList\(/, 'the now-orphaned Live Customers functions must be removed');
});

// ── Frontend: Customer 360 picker groups every customer by stage ──────────

test('the Customer 360 picker list container is a flex column (not a fixed 2-col grid), so it can hold a labeled section per stage', () => {
  assert.match(html, /<div id="c360PickerList" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:18px"><\/div>/);
});

test('filterC360Picker sources the full customer list from customerRecords (not just customers with incidents), merging in incident-derived health stats and defaulting missing ones to zero', () => {
  assert.match(frontend, /var stageByName = \{\};\s*\n\s*customerRecords\.forEach\(function \(c\) \{ stageByName\[c\.customer_name\] = c\.environment_stage \|\| ''; \}\);/);
  assert.match(frontend, /var allNames = Object\.keys\(custMap\);\s*\n\s*customerRecords\.forEach\(function \(c\) \{ if \(allNames\.indexOf\(c\.customer_name\) < 0\) allNames\.push\(c\.customer_name\); \}\);/);
});

test('filterC360Picker groups the filtered customers into Production/UAT/Development/On Hold/Not Set sections, in that order, each with a labeled header showing the count', () => {
  assert.match(frontend, /var C360_STAGE_GROUPS = \[\s*\n\s*\{ key: 'production', label: 'Production \(Live\)' \},\s*\n\s*\{ key: 'uat', label: 'UAT' \},\s*\n\s*\{ key: 'development', label: 'Development' \},\s*\n\s*\{ key: 'on_hold', label: 'On Hold' \},\s*\n\s*\{ key: 'notSet', label: 'Not Set' \}\s*\n\s*\];/);
  assert.match(frontend, /var groups = \{ production: \[\], uat: \[\], development: \[\], on_hold: \[\], notSet: \[\] \};/);
  assert.match(frontend, /header\.textContent = group\.label \+ ' \(' \+ names\.length \+ '\)';/);
});

test('a section is only rendered when it has customers, and only non-empty groups get appended to the list', () => {
  assert.match(frontend, /var names = groups\[group\.key\];\s*\n\s*if \(!names\.length\) return;/);
});

test('each customer card in the grouped picker still hands off to the existing openCustomer360 flow, closing the picker overlay first, unchanged from before the grouping was added', () => {
  assert.match(frontend, /function buildC360PickerCard\(name, health\) \{/);
  assert.match(frontend, /card\.onclick = function \(\) \{\s*\n\s*document\.getElementById\('c360PickerOverlay'\)\.style\.display = 'none';\s*\n\s*openCustomer360\(name\);\s*\n\s*\};/);
});

// ── Requirement: an admin-editable "Internal" flag per customer, shown as ──
// ── an INTERNAL tag on its Customer 360 picker card                       ──

test('the migration adds customers.is_internal as a boolean, defaulting to 0 (not internal) for every existing customer, using the same idempotent conditional-ADD-COLUMN pattern as environment_stage', () => {
  const internalMigration = fs.readFileSync(path.join(root, 'backend', 'sql', '045_customer_internal_flag.sql'), 'utf8');
  assert.match(internalMigration, /SELECT COUNT\(\*\) FROM information_schema\.columns\s*\n\s*WHERE table_schema = DATABASE\(\) AND table_name = 'customers'\s*\n\s*AND column_name = 'is_internal'/);
  assert.match(internalMigration, /ALTER TABLE customers ADD COLUMN is_internal TINYINT\(1\) NOT NULL DEFAULT 0 AFTER environment_stage/);
  assert.doesNotMatch(internalMigration, /UPDATE customers/);
});

test('customerDto exposes is_internal as a boolean, createCustomer accepts an optional is_internal, and the new admin-only update endpoint is wired and exported', () => {
  assert.match(masterDataController, /is_internal: row\.is_internal === 1 \|\| row\.is_internal === true,/);
  assert.match(masterDataController, /const isInternal = Boolean\(req\.body\.is_internal\);\s*\n\s*const \[result\] = await pool\.query\(/);
  assert.match(masterDataController, /const updateCustomerInternalFlag = async \(req, res\) => \{\s*\n\s*if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(masterDataController, /UPDATE customers SET is_internal = \?, updated_by = \? WHERE id = \?/);
  assert.match(masterDataRoutes, /router\.patch\('\/customers\/:id\/internal-flag', updateCustomerInternalFlag\);/);
});

test('only an admin sees an editable Internal checkbox per customer row in Data Management (calling changeCustomerInternalFlag on change) — everyone else sees an INTERNAL badge or nothing', () => {
  assert.match(frontend, /var isInternal = Boolean\(c\.is_internal\);\s*\n\s*var internalControl = isAdminUser\s*\n\s*\? '<label[^']*><input type="checkbox" onchange="changeCustomerInternalFlag\(' \+ c\.id \+ ', this\.checked\)"/);
  assert.match(frontend, /: \(isInternal \? '<span class="badge badge-medium" style="font-size:10px;flex:0 0 auto">Internal<\/span>' : '<span style="flex:0 0 auto"><\/span>'\);/);
});

test('changeCustomerInternalFlag is admin-gated (requireAdminMasterData) and PATCHes the new endpoint', () => {
  assert.match(frontend, /function changeCustomerInternalFlag\(id, isInternal\) \{\s*\n\s*if \(!requireAdminMasterData\(\)\) return;\s*\n\s*masterDataRequest\('\/master-data\/customers\/' \+ id \+ '\/internal-flag', 'PATCH', \{ is_internal: isInternal \}, function \(\) \{/);
});

test('the Customer 360 picker card shows an INTERNAL badge next to the name when that customer record has is_internal set, looked up from customerRecords by name', () => {
  assert.match(frontend, /var record = customerRecords\.find\(function \(c\) \{ return c\.customer_name === name; \}\);\s*\n\s*var isInternal = Boolean\(record && record\.is_internal\);\s*\n\s*var internalBadge = isInternal \? ' <span class="badge badge-medium" style="font-size:9px;padding:1px 6px;vertical-align:middle">INTERNAL<\/span>' : '';/);
  assert.match(frontend, /'<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var\(--text\);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' \+ name \+ internalBadge \+ '<\/div>'/);
});
