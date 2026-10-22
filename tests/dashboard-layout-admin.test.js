'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const server = fs.readFileSync('backend/server.js', 'utf8');
const roleController = fs.readFileSync('backend/controllers/roleController.js', 'utf8');
const dashboardLayoutController = fs.readFileSync('backend/controllers/dashboardLayoutController.js', 'utf8');
const dashboardLayoutRoutes = fs.readFileSync('backend/routes/dashboardLayoutRoutes.js', 'utf8');
const migrationPermission = fs.readFileSync('backend/sql/047_customize_dashboard_layout_permission.sql', 'utf8');
const migrationSettings = fs.readFileSync('backend/sql/048_app_settings.sql', 'utf8');
const css = fs.readFileSync('css/styles.css', 'utf8');

function slice(fnStart, fnEnd) {
  const start = frontend.indexOf(fnStart);
  const end = frontend.indexOf(fnEnd, start);
  return frontend.slice(start, end);
}

// ── Migrations ────────────────────────────────────────────────────────────

test('the migration adds customize_dashboard_layout and grants it to admin only', () => {
  assert.match(migrationPermission, /INSERT INTO permissions\(permission_key, permission_name\) VALUES\s*\n\('customize_dashboard_layout', 'Customize Dashboard Layout'\)/);
  assert.match(migrationPermission, /SELECT r\.id, 'customize_dashboard_layout' FROM roles r WHERE r\.role_key IN \('admin'\);/);
  assert.doesNotMatch(migrationPermission, /'admin', '(cso|pmo|aoc|engineer|stakeholder)'/, 'must be admin-only, not also granted to another role');
});

test('the migration creates a generic app_settings singleton table (setting_key/setting_value JSON), not a dashboard-layout-specific one', () => {
  assert.match(migrationSettings, /CREATE TABLE IF NOT EXISTS app_settings \(/);
  assert.match(migrationSettings, /setting_key VARCHAR\(100\) NOT NULL PRIMARY KEY,/);
  assert.match(migrationSettings, /setting_value JSON NOT NULL,/);
  assert.match(migrationSettings, /CONSTRAINT fk_app_settings_user FOREIGN KEY \(updated_by\) REFERENCES users\(id\) ON DELETE SET NULL/);
});

// ── Backend wiring ────────────────────────────────────────────────────────

test('roleController validates customize_dashboard_layout as a real permission key', () => {
  assert.match(roleController, /'customize_dashboard_layout'/);
});

test('dashboardLayoutController reads/writes the dashboard_layout row in app_settings, validating the saved order is a non-empty array of strings', () => {
  assert.match(dashboardLayoutController, /const SETTING_KEY = 'dashboard_layout';/);
  assert.match(dashboardLayoutController, /SELECT setting_value FROM app_settings WHERE setting_key = \? LIMIT 1/);
  assert.match(dashboardLayoutController, /if \(!order \|\| !order\.length\) \{/);
  assert.match(dashboardLayoutController, /order\.every\(\(id\) => typeof id === 'string' && id\.trim\(\) && id\.length <= 100\)/);
  assert.match(dashboardLayoutController, /INSERT INTO app_settings \(setting_key, setting_value, updated_by\) VALUES \(\?, \?, \?\)\s*\n\s*ON DUPLICATE KEY UPDATE setting_value = VALUES\(setting_value\), updated_by = VALUES\(updated_by\)/);
  assert.match(dashboardLayoutController, /module\.exports = \{ getDashboardLayout, saveDashboardLayout \};/);
});

test('dashboardLayoutRoutes requires authentication for both routes, view_dashboard to read and customize_dashboard_layout to write', () => {
  assert.match(dashboardLayoutRoutes, /router\.use\(authenticateToken\);/);
  assert.match(dashboardLayoutRoutes, /router\.get\('\/', requirePermission\('view_dashboard'\), getDashboardLayout\);/);
  assert.match(dashboardLayoutRoutes, /router\.post\('\/', requirePermission\('customize_dashboard_layout'\), saveDashboardLayout\);/);
});

test('server.js mounts the new route at /api/dashboard-layout', () => {
  assert.match(server, /const dashboardLayoutRoutes = require\('\.\/routes\/dashboardLayoutRoutes'\);/);
  assert.match(server, /app\.use\('\/api\/dashboard-layout', dashboardLayoutRoutes\);/);
});

// ── Frontend permission plumbing ─────────────────────────────────────────

test('the Role Management grid has a checkbox for Customize Dashboard Layout, and PERM_LABELS includes it', () => {
  assert.match(html, /<input type="checkbox" value="customize_dashboard_layout"\/> Customize Dashboard Layout/);
  assert.match(frontend, /customize_dashboard_layout: 'Customize Dashboard Layout',/);
});

test('only the admin role\'s default perms array includes customize_dashboard_layout, not cso/pmo/aoc/engineer/stakeholder', () => {
  const rolesStart = frontend.indexOf('let roles = [');
  const rolesEnd = frontend.indexOf('\n];', rolesStart);
  const rolesBlock = frontend.slice(rolesStart, rolesEnd);
  const occurrences = (rolesBlock.match(/'customize_dashboard_layout'/g) || []).length;
  assert.equal(occurrences, 1, 'customize_dashboard_layout must appear in exactly one role\'s default perms (admin)');
});

// ── Frontend: the flattened, admin-reorderable card flow ────────────────

test('every Dashboard card lives inside #dashboardCardsFlow with a unique data-card-id and a size class matching its current width, except the permanently-hidden Avg MTTR tile which stays excluded', () => {
  const flowStart = html.indexOf('<div id="dashboardCardsFlow">');
  assert.ok(flowStart > -1, '#dashboardCardsFlow must exist');
  const flowEnd = html.indexOf('<!-- ─── INCIDENTS', flowStart);
  const flow = html.slice(flowStart, flowEnd);
  const ids = [...flow.matchAll(/data-card-id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 28, 'expected exactly 28 draggable cards');
  assert.equal(new Set(ids).size, 28, 'every data-card-id must be unique');
  assert.ok(ids.includes('statTotalIncidents') && ids.includes('chartLiveSlaCountdown'));
  assert.doesNotMatch(flow.slice(0, flow.indexOf('dashboardAvgMttrCard') === -1 ? 0 : flow.indexOf('dashboardAvgMttrCard') + 1), /dashboardAvgMttrCard/);
  // Each lc-* size class actually appears on at least one card.
  ['lc-tile', 'lc-full', 'lc-wide', 'lc-narrow', 'lc-half', 'lc-third'].forEach((cls) => {
    assert.match(flow, new RegExp('class="[^"]*\\b' + cls + '\\b'), cls + ' must be used on at least one card');
  });
});

test('dashboardAvgMttrCard (permanently hidden) sits outside #dashboardCardsFlow and was not given a data-card-id', () => {
  const cardStart = html.indexOf('id="dashboardAvgMttrCard"');
  assert.ok(cardStart > -1);
  const cardTagStart = html.lastIndexOf('<div', cardStart);
  const cardTag = html.slice(cardTagStart, html.indexOf('>', cardStart) + 1);
  assert.doesNotMatch(cardTag, /data-card-id/);
  const flowOpenIdx = html.indexOf('<div id="dashboardCardsFlow">');
  assert.ok(cardStart < flowOpenIdx, 'the hidden Avg MTTR tile must be declared before (outside) the flow container');
});

test('the Edit Layout / Save Layout / Cancel control row exists, hidden by default', () => {
  assert.match(html, /<div id="dashboardLayoutControls" style="display:none;flex-wrap:wrap;[^"]*">/);
  assert.match(html, /<button class="btn btn-secondary btn-sm" id="btnEditDashboardLayout" onclick="toggleDashboardLayoutEditMode\(\)"[^>]*>/);
  assert.match(html, /<button class="btn btn-primary btn-sm" id="btnSaveDashboardLayout" onclick="saveDashboardLayout\(\)" style="display:none;[^"]*">/);
  assert.match(html, /<button class="btn btn-secondary btn-sm" id="btnCancelDashboardLayout" onclick="cancelDashboardLayoutEdit\(\)" style="display:none;[^"]*">/);
});

// Regression test: a flex row with no wrap and a long, unconstrained hint
// span doesn't reflow at browser zoom levels that shrink the effective
// viewport — it overflows instead, pushing Save/Cancel outside the visible
// row. flex-wrap + a shrinkable, min-width:0 hint span let the row wrap
// cleanly at any zoom level instead of overflowing.
test('the Edit Layout control row wraps at narrow effective widths instead of overflowing (zoom-safe)', () => {
  assert.match(html, /<div id="dashboardLayoutControls" style="display:none;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px">/);
  assert.match(html, /<span id="dashboardLayoutHint" style="display:none;flex:1 1 220px;min-width:0;[^"]*">/);
});

// ── Frontend: drag-and-drop + save/load/permission-gating logic ─────────

test('initDashboardLayoutControls shows the control row only when hasPermission(customize_dashboard_layout)', () => {
  const impl = slice('function initDashboardLayoutControls()', 'function applyDashboardCardOrder(');
  assert.match(impl, /bar\.style\.display = hasPermission\('customize_dashboard_layout'\) \? 'flex' : 'none';/);
});

test('loadDashboardLayout fetches the saved order and applies it, but never while an admin is mid-edit', () => {
  const impl = slice('function loadDashboardLayout()', 'function toggleDashboardLayoutEditMode(');
  assert.match(impl, /if \(dashboardLayoutEditModeActive\) return;/);
  assert.match(impl, /fetch\(window\.APP_CONFIG\.API_BASE_URL \+ '\/dashboard-layout', \{/);
  assert.match(impl, /applyDashboardCardOrder\(result\.data\);/);
});

test('renderDashboardWidgets calls loadDashboardLayout on every Dashboard refresh', () => {
  const impl = slice('function renderDashboardWidgets()', '\nfunction ');
  assert.match(impl, /loadDashboardLayout\(\);/);
});

test('toggleDashboardLayoutEditMode is gated by the permission, snapshots the current order for Cancel, and wires native HTML5 drag handlers to every card', () => {
  const impl = slice('function toggleDashboardLayoutEditMode()', 'function exitDashboardLayoutEditMode(');
  assert.match(impl, /if \(!hasPermission\('customize_dashboard_layout'\)\) \{ showToast\('Your role cannot customize the dashboard layout\.', 'error'\); return; \}/);
  assert.match(impl, /el\.draggable = true;/);
  assert.match(impl, /el\.addEventListener\('dragstart', handleDashboardCardDragStart\);/);
  assert.match(impl, /el\.addEventListener\('drop', handleDashboardCardDrop\);/);
});

test('saveDashboardLayout POSTs the live DOM order of [data-card-id] and only exits edit mode on success', () => {
  const impl = slice('function saveDashboardLayout()', 'function cancelDashboardLayoutEdit(');
  assert.match(impl, /var order = Array\.prototype\.map\.call\(flow\.querySelectorAll\('\[data-card-id\]'\), function \(el\) \{ return el\.getAttribute\('data-card-id'\); \}\);/);
  assert.match(impl, /method: 'POST',/);
  assert.match(impl, /body: JSON\.stringify\(\{ order: order \}\)/);
  assert.match(impl, /exitDashboardLayoutEditMode\(\);\s*\n\s*showToast\('Dashboard layout saved for all users', 'success'\);/);
});

test('cancelDashboardLayoutEdit re-applies the last-saved order (discarding in-progress drags) before exiting edit mode', () => {
  const start = frontend.indexOf('function cancelDashboardLayoutEdit()');
  const impl = frontend.slice(start, start + 300);
  assert.match(impl, /if \(dashboardLayoutSavedOrder\) applyDashboardCardOrder\(dashboardLayoutSavedOrder\);/);
  assert.match(impl, /exitDashboardLayoutEditMode\(\);/);
});

// ── Regression: wrapping all cards in #dashboardCardsFlow added a new
// ── nesting level, so the closing </div> count at the end of the Dashboard
// ── page had to grow by one too (chart-card -> #dashboardCardsFlow ->
// ── #page-dashboard). Missing that extra closing tag left every later page
// ── in the document (#page-mailbox, #page-incidents, #page-drafts, ...)
// ── nested INSIDE the still-open #page-dashboard — invisible, since .page
// ── is display:none unless .active, and a hidden ancestor overrides its own
// ── .active descendant's display:block.
test('index.html has balanced <div> tags overall, and #page-dashboard closes before #page-mailbox begins (no later page is nested inside it)', () => {
  const opens = (html.match(/<div\b/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  assert.equal(opens, closes, 'every <div> in the file must have a matching closing tag');

  const start = html.indexOf('<div class="page" id="page-dashboard">');
  const mailboxStart = html.indexOf('<div class="page" id="page-mailbox">');
  assert.ok(start > -1 && mailboxStart > start);
  const region = html.slice(start, mailboxStart);
  const regionOpens = (region.match(/<div\b/g) || []).length;
  const regionCloses = (region.match(/<\/div>/g) || []).length;
  assert.equal(regionOpens, regionCloses, '#page-dashboard itself must be closed before #page-mailbox begins');
});

// ── Regression: flex-grow:1 on stat tiles stretched whichever tiles ended
// ── up alone in an incomplete last row (e.g. 3 leftover tiles filling a
// ── full row's width each) instead of staying a uniform size like the
// ── original .stats-grid's auto-fill grid did. Dragging cards into a new
// ── order routinely produces incomplete last rows, so this was reliably
// ── triggered by the very feature it ships with.
test('stat tiles do not grow to fill leftover space in an incomplete last row (flex-grow:0, not 1), and opt out of row-based height-stretching (align-self:flex-start + a shared min-height) so every tile is the same height regardless of which row a drag puts it in', () => {
  assert.match(css, /#dashboardCardsFlow > \.lc-tile \{ flex: 0 1 220px; min-height: 170px; align-self: flex-start; \}/);
  assert.doesNotMatch(css, /#dashboardCardsFlow > \.lc-tile \{ flex: 1 1 220px/);
});
