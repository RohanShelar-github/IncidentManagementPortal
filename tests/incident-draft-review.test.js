'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const draftController = fs.readFileSync('backend/controllers/incidentDraftController.js', 'utf8');
const incidentController = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');
const routes = fs.readFileSync('backend/routes/incidentRoutes.js', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const migration = fs.readFileSync('backend/sql/031_incident_drafts.sql', 'utf8');
const permissionsMigration = fs.readFileSync('backend/sql/032_draft_role_permissions.sql', 'utf8');

test('draft review is stored outside real incidents and its deadline uses the email received time', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incident_drafts/);
  assert.match(migration, /source_received_at DATETIME NOT NULL/);
  assert.match(migration, /review_deadline_at DATETIME NOT NULL/);
  assert.match(draftController, /REVIEW_MINUTES = 10/);
  assert.match(draftController, /new Date\(received\.getTime\(\) \+ REVIEW_MINUTES \* 60 \* 1000\)/);
  assert.match(draftController, /INSERT INTO incident_drafts/);
  assert.doesNotMatch(draftController, /INSERT INTO incidents/);
});

test('a draft must be ready before the established incident and email flow can run', () => {
  assert.match(draftController, /This draft is still in its 10-minute review period/);
  assert.match(incidentController, /getReadyDraftForFinalization\(draftId, req\.user\)/);
  assert.match(incidentController, /finalizeIncidentDraft\(draftForFinalization\.id, created\[0\]\.id\)/);
  assert.ok(incidentController.indexOf('getReadyDraftForFinalization') < incidentController.indexOf('INSERT INTO incidents'));
});

test('Draft Review exposes concise actions and Operations status', () => {
  assert.match(routes, /router\.post\('\/drafts'/);
  assert.match(routes, /router\.delete\('\/drafts\/:id'/);
  assert.match(html, /id="draftsNav"/);
  assert.match(html, /id="page-drafts"/);
  assert.match(html, /id="saveDraftBtn"/);
  assert.match(html, /id="draftsRefreshIcon"/);
  assert.match(frontend, /Save Draft/);
  assert.match(frontend, />Email and Create Incident<\/button>/);
  assert.match(frontend, /Mark Resolved/);
  assert.match(frontend, /Delete Draft/);
  assert.match(frontend, /function mailboxIncidentDraftAction/);
  assert.match(frontend, /source_received_at: manualDraft \? null : pendingOperationsEmailSource\.receivedAt/);
});

test('manual incident creation can save an immediately ready draft, and every active draft can be deleted', () => {
  assert.match(draftController, /const manualDraft = Boolean\(body\.manual_draft\)/);
  assert.match(draftController, /manualDraft \? 'ready' : 'reviewing'/);
  assert.match(frontend, /var manualDraft = !pendingOperationsEmailSource/);
  assert.match(frontend, /manual_draft: manualDraft/);
  assert.match(frontend, /effectiveStatus !== 'finalized'/);
  assert.match(frontend, /ensureEngineerDropdownsLoaded\(function \(\) \{ var engineerSelect/);
  assert.match(frontend, /async function deleteIncidentDraft/);
  assert.match(frontend, /await showConfirm\(\{[\s\S]*?Delete Draft/);
});

test('Draft Review opens a draft from its card and reserves deletion for the separate admin permission', () => {
  assert.match(frontend, /data-draft-card/);
  assert.match(frontend, /viewIncidentDraft\(Number\(card\.dataset\.draftCard\)\)/);
  assert.doesNotMatch(frontend, /onclick="viewIncidentDraft\(/);
  assert.match(frontend, /data-draft-select/);
  assert.match(frontend, /async function deleteSelectedIncidentDrafts/);
  assert.match(frontend, /hasPermission\('delete_drafts'\)/);
  assert.match(routes, /router\.get\('\/drafts', requirePermission\('view_drafts'\)/);
  assert.match(routes, /router\.delete\('\/drafts\/:id', requirePermission\('delete_drafts'\)/);
  assert.match(permissionsMigration, /\('view_drafts', 'View Drafts'\)/);
  assert.match(permissionsMigration, /\('delete_drafts', 'Delete Drafts'\)/);
  assert.match(permissionsMigration, /WHERE r\.role_key = 'admin'/);
});

test('View Drafts exposes the shared operational queue while create actions remain permission-checked', () => {
  assert.match(draftController, /WHERE d\.deleted_at IS NULL AND d\.status <> 'finalized'/);
  assert.doesNotMatch(draftController, /d\.status <> 'finalized' \$\{includeAll/);
  assert.match(draftController, /getOwnedDraft\(req\.params\.id, req\.user\.id, true\)/);
  assert.match(draftController, /hasRolePermission\(user\?\.role, 'create_incidents'\)/);
  assert.doesNotMatch(frontend, /incidents\/drafts' \+ scope/);
});

test('Operations emails older than ten minutes proceed directly to email preparation', () => {
  assert.match(frontend, /function isOperationsEmailReviewElapsed/);
  assert.match(frontend, /var reviewElapsed = isOperationsEmailReviewElapsed\(pendingOperationsEmailSource\)/);
  assert.match(frontend, /draftButton\.style\.display = reviewElapsed \? 'none' : ''/);
  assert.match(frontend, /createButton\.textContent = 'Create Incident'/);
  assert.match(frontend, /pendingOperationsEmailSource && isOperationsEmailReviewElapsed\(pendingOperationsEmailSource\)/);
});
