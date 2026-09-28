'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const incidentController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const masterDataController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'masterDataController.js'), 'utf8');
const masterDataRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'masterDataRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '042_incident_classification_tags.sql'), 'utf8');

// ── Migration: incident_tags table, seed rows, tag_id column, backfill ────

test('the migration creates incident_tags (name UNIQUE), seeds Customer and Internal', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incident_tags \(/);
  assert.match(migration, /UNIQUE KEY uq_incident_tags_name \(name\)/);
  assert.match(migration, /INSERT INTO incident_tags \(name\) VALUES \('Customer'\), \('Internal'\)/);
});

test('the migration conditionally adds incidents.tag_id with a FK to incident_tags, only if the column does not already exist', () => {
  assert.match(migration, /SELECT COUNT\(\*\) FROM information_schema\.columns\s*\n\s*WHERE table_schema = DATABASE\(\) AND table_name = 'incidents' AND column_name = 'tag_id'/);
  assert.match(migration, /ALTER TABLE incidents ADD COLUMN tag_id INT NULL AFTER tags, ADD CONSTRAINT fk_incidents_tag FOREIGN KEY \(tag_id\) REFERENCES incident_tags\(id\) ON DELETE SET NULL/);
});

test('the migration backfills every existing incident: MIS Cloud/Matrix/Demo get Internal, everything else (including anything left NULL) gets Customer', () => {
  assert.match(migration, /UPDATE incidents i\s*\n\s*JOIN incident_tags t ON t\.name = 'Internal'\s*\n\s*SET i\.tag_id = t\.id\s*\n\s*WHERE i\.customer IN \('MIS Cloud', 'Matrix', 'Demo'\);/);
  assert.match(migration, /UPDATE incidents i\s*\n\s*JOIN incident_tags t ON t\.name = 'Customer'\s*\n\s*SET i\.tag_id = t\.id\s*\n\s*WHERE i\.tag_id IS NULL;/);
  // The Customer backfill must run after the Internal one, so it only ever
  // catches what Internal didn't already claim.
  const internalIdx = migration.indexOf("t.name = 'Internal'");
  const customerIdx = migration.indexOf("t.name = 'Customer'", migration.indexOf('Backfill'));
  assert.ok(internalIdx > -1 && customerIdx > -1 && internalIdx < customerIdx);
});

// ── Backend: master data (Data Management "create tag" section) ──────────

test('getMasterData now also returns tags (id, name, created_at) alongside customers and areas', () => {
  assert.match(masterDataController, /function tagDto\(row\) \{/);
  assert.match(masterDataController, /SELECT \* FROM incident_tags ORDER BY name/);
  assert.match(masterDataController, /tags: tagRows\.map\(tagDto\)/);
});

test('createIncidentTag is admin-only, requires a non-empty name, and handles duplicate names with a 409', () => {
  assert.match(masterDataController, /const createIncidentTag = async \(req, res\) => \{\s*\n\s*if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(masterDataController, /if \(!name\) return res\.status\(400\)\.json\(\{ success: false, message: 'Tag name is required' \}\);/);
  assert.match(masterDataController, /if \(error\?\.code === 'ER_DUP_ENTRY'\) return res\.status\(409\)/);
  assert.match(masterDataController, /module\.exports = \{ getMasterData, createCustomer, updateCustomerCsm, deactivateCustomer, createArea, deactivateArea, createIncidentTag, deleteIncidentTag \};/);
  assert.match(masterDataRoutes, /router\.post\('\/tags', createIncidentTag\);/);
});

test('deleteIncidentTag is admin-only, blocks deleting the two system tags (Customer/Internal) required for auto-classification, blocks deleting a tag still applied to incidents, and otherwise hard-deletes it', () => {
  assert.match(masterDataController, /const CORE_INCIDENT_TAGS = new Set\(\['Customer', 'Internal'\]\);/);
  assert.match(masterDataController, /const deleteIncidentTag = async \(req, res\) => \{\s*\n\s*if \(!isAdmin\(req\)\) return res\.status\(403\)/);
  assert.match(masterDataController, /if \(CORE_INCIDENT_TAGS\.has\(rows\[0\]\.name\)\) \{\s*\n\s*return res\.status\(409\)\.json\(\{ success: false, message: `"\$\{rows\[0\]\.name\}" is a system tag required for auto-classification and cannot be deleted\.` \}\);/);
  assert.match(masterDataController, /SELECT COUNT\(\*\) AS count FROM incidents WHERE tag_id = \?/);
  assert.match(masterDataController, /if \(refs\[0\]\.count > 0\) return res\.status\(409\)\.json\(\{ success: false, message: 'Tag is applied to incidents and was not deleted' \}\);/);
  assert.match(masterDataController, /await pool\.query\('DELETE FROM incident_tags WHERE id = \?', \[req\.params\.id\]\);/);
  assert.match(masterDataRoutes, /router\.delete\('\/tags\/:id', deleteIncidentTag\);/);
});

// ── Backend: auto-tagging incidents by customer ───────────────────────────

test('INTERNAL_TAG_CUSTOMERS is exactly MIS Cloud, Matrix, Demo, and resolveAutoTagId looks up the Internal/Customer tag id by name', () => {
  assert.match(incidentController, /const INTERNAL_TAG_CUSTOMERS = new Set\(\['MIS Cloud', 'Matrix', 'Demo'\]\);/);
  assert.match(incidentController, /const resolveAutoTagId = async \(customerName\) => \{/);
  assert.match(incidentController, /const tagName = INTERNAL_TAG_CUSTOMERS\.has\(String\(customerName \|\| ''\)\.trim\(\)\) \? 'Internal' : 'Customer';/);
  assert.match(incidentController, /SELECT id FROM incident_tags WHERE name = \? LIMIT 1/);
});

test('createIncident honors an explicit tag_id from the (optional) create-form field, validating it against incident_tags; leaving it blank falls back to resolveAutoTagId from the resolved customer', () => {
  assert.match(incidentController, /if \(b\.tag_id !== undefined && b\.tag_id !== null && b\.tag_id !== ''\) \{\s*\n\s*const \[tagRows\] = await pool\.query\('SELECT id FROM incident_tags WHERE id = \? LIMIT 1', \[Number\(b\.tag_id\)\]\);\s*\n\s*if \(!tagRows\.length\) return res\.status\(400\)\.json\(\{ success: false, message: 'Invalid tag' \}\);\s*\n\s*tagId = tagRows\[0\]\.id;\s*\n\s*\} else \{\s*\n\s*tagId = await resolveAutoTagId\(resolvedCustomer\.name \|\| b\.customer\);/);
  assert.match(incidentController, /'sla_hours', 'tags', 'tag_id', 'start_dt',/);
  assert.match(incidentController, /JSON\.stringify\(Array\.isArray\(b\.tags\) \? b\.tags : \[\]\), tagId, start, b\.date_time_opened \|\| start \|\| null,/);
});

test('updateIncident lets tag_id be changed manually, validating it against a real incident_tags row — blank/null now means "Auto", recomputing from whichever customer applies after the update, not clearing the tag (there is no legitimate untagged state)', () => {
  assert.match(incidentController, /let effectiveCustomerName = current\.customer;/);
  assert.match(incidentController, /effectiveCustomerName = resolvedCustomer\.name \|\| b\.customer \|\| null;/);
  assert.match(incidentController, /if \(b\.tag_id !== undefined\) \{\s*\n\s*if \(b\.tag_id === null \|\| b\.tag_id === ''\) \{/);
  assert.match(incidentController, /add\('tag_id', await resolveAutoTagId\(effectiveCustomerName\)\);/);
  assert.match(incidentController, /const \[tagRows\] = await pool\.query\('SELECT id FROM incident_tags WHERE id = \? LIMIT 1', \[Number\(b\.tag_id\)\]\);/);
  assert.match(incidentController, /if \(!tagRows\.length\) return res\.status\(400\)\.json\(\{ success: false, message: 'Invalid tag' \}\);/);
});

test('the incident SELECT joins incident_tags so every incident row carries its tag name, and mapIncident exposes it as tagId/tag', () => {
  assert.match(incidentController, /LEFT JOIN incident_tags classification_tag ON classification_tag\.id = i\.tag_id/);
  assert.match(incidentController, /customer_master\.customer_name, area_master\.area_name, classification_tag\.name AS classification_tag_name/);
  assert.match(incidentController, /tagId: row\.tag_id \|\| null,\s*\n\s*tag: row\.classification_tag_name \|\| null,/);
});

// ── Frontend: existing free-text tags feature relabeled "User Tagging" ───
// ── so it's never confused with the new Customer/Internal classification ──

test('the existing free-text multi-tag chips feature is now labeled "User Tagging" in both the create form and the detail view, not "Tags"', () => {
  assert.match(html, /<label class="form-label">User Tagging<\/label>/);
  assert.match(html, /letter-spacing:\.7px;margin-bottom:8px">User Tagging<\/div>\s*\n<div id="dp_tags_view"/);
  assert.doesNotMatch(html, /<label class="form-label">Tags<\/label>/);
  assert.match(frontend, /No user tags<\/span>/);
  assert.match(frontend, /No user tags yet<\/span>/);
});

// ── Frontend: Data Management "create tag" section ────────────────────────

test('Data Management has a Tags card with a name input, an Add button, a list, and a count — mirroring the Customers/Areas cards', () => {
  assert.match(html, /<input id="dmNewTag" onkeydown="if\(event\.key==='Enter'\) addIncidentTag\(\)" placeholder="New tag name…"/);
  assert.match(html, /<button class="btn btn-primary btn-sm" onclick="addIncidentTag\(\)" style="white-space:nowrap">\+ Add<\/button>\s*\n<\/div>\s*\n<div id="dmTagList"/);
  assert.match(html, /<div id="dmTagCount" style="font-size:11px;color:var\(--text-muted\)"><\/div>/);
});

test('addIncidentTag is admin-gated, prevents duplicate names client-side, and posts to /master-data/tags', () => {
  assert.match(frontend, /function addIncidentTag\(\) \{\s*\n\s*if \(!requireAdminMasterData\(\)\) return;/);
  assert.match(frontend, /if \(tagRecords\.some\(function \(t\) \{ return t\.name === name; \}\)\) \{ showToast\('Tag already exists', 'error'\); return; \}/);
  assert.match(frontend, /masterDataRequest\('\/master-data\/tags', 'POST', \{ name: name \}, function \(\) \{/);
});

test('loadMasterData parses tags into tagRecords and calls populateTagDropdowns; renderDataManagement renders dmTagList with an in-use indicator', () => {
  assert.match(frontend, /tagRecords = Array\.isArray\(data\.data\.tags\) \? data\.data\.tags : \[\];/);
  assert.match(frontend, /populateTagDropdowns\(\);/);
  assert.match(frontend, /var tagList = document\.getElementById\('dmTagList'\);/);
  assert.match(frontend, /var inUse = incidents\.some\(function \(i\) \{ return i\.tagId === t\.id; \}\);/);
});

test('dmTagList shows a delete icon only for non-core, unused tags — Customer/Internal show "System tag" and in-use tags show "In use", both without a delete option', () => {
  assert.match(frontend, /var isCore = t\.name === 'Customer' \|\| t\.name === 'Internal';/);
  assert.match(frontend, /'<span style="font-size:11px;color:var\(--text-muted\)">System tag<\/span>'/);
  assert.match(frontend, /'<span style="font-size:11px;color:var\(--text-muted\)">In use<\/span>'/);
  assert.match(frontend, /'<button onclick="removeIncidentTag\(' \+ t\.id \+ '\)" style="background:transparent;color:#f75c7c;border:none;font-size:15px;padding:3px 7px;cursor:pointer" title="Remove tag" aria-label="Remove tag">&#128465;<\/button>'/);
});

test('removeIncidentTag only embeds the tag id in its onclick (never the raw tag name, which could contain a quote and break the generated JS), looking the name up internally from tagRecords for the confirmation/audit text', () => {
  assert.match(frontend, /function removeIncidentTag\(id\) \{\s*\n\s*if \(!requireAdminMasterData\(\)\) return;\s*\n\s*var rec = tagRecords\.find\(function \(t\) \{ return t\.id === id; \}\);/);
  assert.match(frontend, /masterDataRequest\('\/master-data\/tags\/' \+ id, 'DELETE', null, function \(\) \{/);
  assert.doesNotMatch(frontend, /removeIncidentTag\(' \+ t\.id \+ ', \\''/, 'must not take a second inline argument built from the raw tag name');
});

// ── Frontend: Tag filter on Dashboard and Incidents, differentiating ─────
// ── Customer vs Internal incidents                                       ──

test('the Incidents page filter bar has a Tag multi-select dropdown (classificationTagFilter — deliberately NOT tagFilter, see below), and the Dashboard filter bar has its own (df_tag)', () => {
  assert.match(html, /<div class="filter-label">Tag<\/div>\s*\n<div class="ms-wrap" id="classificationTagFilter_wrap">\s*\n<div class="ms-box" id="classificationTagFilter" onclick="toggleMsDropdown\('classificationTagFilter'\)">\s*\n<span class="ms-placeholder" id="classificationTagFilter_ph">All Tags<\/span>/);
  assert.match(html, /<div class="ms-wrap" id="df_tag_wrap">\s*\n<div class="ms-box" id="df_tag" onclick="toggleMsDropdown\('df_tag'\)">\s*\n<span class="ms-placeholder" id="df_tag_ph">All Tags<\/span>/);
});

test('the new Tag filter deliberately avoids the id/concept "tagFilter" — that was explicitly removed previously (tests/incident-tag-filter-removal.test.js) as a filter over the old free-text tags array, and its dead updateTagFilter()/#tagFilter lookup must stay inert rather than accidentally binding to this new, unrelated classification filter', () => {
  assert.doesNotMatch(html, /id="tagFilter"/);
  const start = frontend.indexOf('function applyFilters()');
  const end = frontend.indexOf('\nfunction ', start + 1);
  assert.doesNotMatch(frontend.slice(start, end), /'tagFilter'|\bi\.tags\b/);
});

test('populateTagDropdowns populates classificationTagFilter/df_tag by tag NAME (ms-dropdowns), and both f_tag_id (create form) and dp_f_tag_id (detail edit) by tag ID with an "Auto (based on customer)" default option', () => {
  assert.match(frontend, /function populateTagDropdowns\(\) \{/);
  assert.match(frontend, /populateMsDropdown\('classificationTagFilter', tagNames, 'All Tags'\);/);
  assert.match(frontend, /populateMsDropdown\('df_tag', tagNames, 'All Tags'\);/);
  assert.match(frontend, /var tagOptionsHtml = tagRecords\.map\(function \(t\) \{ return '<option value="' \+ t\.id \+ '">' \+ escapeMetricHtml\(t\.name\) \+ '<\/option>'; \}\)\.join\(''\);/);
  assert.match(frontend, /\['dp_f_tag_id', 'f_tag_id'\]\.forEach\(function \(id\) \{/);
  assert.match(frontend, /sel\.innerHTML = '<option value="">Auto \(based on customer\)<\/option>' \+ tagOptionsHtml;/);
});

test('applyFilters (Incidents page) filters by classificationTagFilter against i.tag, and classificationTagFilter participates in the clear-filters button/logic', () => {
  assert.match(frontend, /var tags = getMsValues\('classificationTagFilter'\);/);
  assert.match(frontend, /if \(tags\.length && tags\.indexOf\(i\.tag \|\| ''\) < 0\) return false;/);
  assert.match(frontend, /\['severityFilter', 'statusFilter', 'customerFilter', 'classificationTagFilter', 'areaFilter', 'assigneeFilter'\]\.some\(function \(id\) \{ return getMsValues\(id\)\.length > 0; \}\);/);
  assert.match(frontend, /\['severityFilter', 'statusFilter', 'customerFilter', 'classificationTagFilter', 'areaFilter', 'assigneeFilter'\]\.forEach\(function \(id\) \{\s*\n\s*clearMsFilter\(id\);/);
});

test('getDashboardFilteredIncidents filters by df_tag against i.tag, and df_tag participates in the active-filter count and clear-filters logic', () => {
  assert.match(frontend, /var tags = getMsValues\('df_tag'\);/);
  assert.match(frontend, /if \(tags\.length\) result = result\.filter\(function \(i\) \{ return tags\.indexOf\(i\.tag \|\| ''\) >= 0; \}\);/);
  assert.match(frontend, /var msIds = \['df_customer', 'df_tag', 'df_area', 'df_severity', 'df_year', 'df_month'\];/);
  assert.match(frontend, /\['df_customer', 'df_tag', 'df_area', 'df_severity', 'df_year', 'df_month'\]\.forEach\(function \(id\) \{ clearMsFilter\(id\); \}\);/);
});

// ── Frontend: Tag is shown/editable when viewing an incident, AND is an ──
// ── optional field on the Create New Incident form (defaults to Auto)   ──

test('the incident detail view/edit panel has the Tag field (view-mode dp_tag cell + edit-mode dp_f_tag_id select)', () => {
  assert.match(html, /<div id="dp_tag" style="font-size:14px;font-weight:600;color:var\(--text\)">—<\/div>/);
  assert.match(html, /<select id="dp_f_tag_id" style="width:100%[^"]*"><option value="">Auto \(based on customer\)<\/option><\/select>/);
});

test('the Create New Incident form has an optional Tag field (f_tag_id) defaulting to "Auto (based on customer)", with a hint explaining that default', () => {
  assert.match(html, /<label class="form-label">Tag<\/label>\s*\n<select id="f_tag_id"><option value="">Auto \(based on customer\)<\/option><\/select>/);
  assert.match(html, /Leave as Auto to apply Customer\/Internal automatically/);
  // It must not be marked required, unlike Customer/Project/Severity/etc.
  assert.doesNotMatch(html, /<label class="form-label required">Tag<\/label>/);
});

test('openDetailPanel populates dp_tag from inc.tag when viewing, and populateEditForm populates dp_f_tag_id from inc.tagId when editing', () => {
  assert.match(frontend, /const dpTagEl = document\.getElementById\('dp_tag'\);\s*\n\s*if \(dpTagEl\) dpTagEl\.textContent = inc\.tag \|\| '—';/);
  assert.match(frontend, /var dpTagSel = document\.getElementById\('dp_f_tag_id'\); if \(dpTagSel\) dpTagSel\.value = inc\.tagId \|\| '';/);
});

test('saveDetailEdit sends the selected dp_f_tag_id back to the server as tag_id', () => {
  assert.match(frontend, /tag_id: document\.getElementById\('dp_f_tag_id'\)\?\.value \|\| null/);
});

test('editIncident (the shared Create/Edit modal) pre-fills f_tag_id from the incident\'s current tagId, and opening the modal fresh for a NEW incident resets f_tag_id back to blank (Auto)', () => {
  assert.match(frontend, /var ftag = document\.getElementById\('f_tag_id'\); if \(ftag\) ftag\.value = inc\.tagId \|\| '';/);
  assert.match(frontend, /\['f_title', 'f_customer', 'f_project', 'f_product_line', 'f_severity', 'f_status', 'f_engineer', 'f_sf_case', 'f_rd_tickets', 'f_area', 'f_tag_id'\]\.forEach\(f => \{/);
});

test('saveIncident sends f_tag_id as tag_id on both the create (POST) and edit (PUT) payloads', () => {
  assert.match(frontend, /sf_case: sfCase,\s*\n\s*rd_tickets: rdTickets,\s*\n\s*description: desc,\s*\n\s*sla_hours: null,\s*\n\s*area,\s*\n\s*tags: createModalTags\.slice\(\),\s*\n\s*tag_id: document\.getElementById\('f_tag_id'\)\?\.value \|\| null\s*\n\s*\};/, 'edit (PUT) payload must include tag_id');
  assert.match(frontend, /description: desc,\s*\n\s*area,\s*\n\s*tags: createModalTags\.slice\(\),\s*\n\s*tag_id: document\.getElementById\('f_tag_id'\)\?\.value \|\| null,\s*\n\s*operations_email_audit_id: pendingOperationsEmailAuditId,/, 'create (POST) payload must include tag_id');
});

// ── Requirement: the tag must never appear in the individual or bulk report ──

test('neither exportIncidentPDF (individual report) nor generatePDFReport (bulk report) reference the incident tag/tagId fields', () => {
  function functionBody(name) {
    const start = frontend.indexOf('function ' + name);
    assert.ok(start > -1, name + ' not found');
    return frontend.slice(start, start + 6000);
  }
  assert.doesNotMatch(functionBody('exportIncidentPDF'), /inc\.tag\b|inc\.tagId\b/, 'the individual incident report must not include the classification tag');
  assert.doesNotMatch(functionBody('generatePDFReport'), /i\.tag\b|i\.tagId\b|inc\.tag\b|inc\.tagId\b/, 'the bulk report must not include the classification tag');
});
