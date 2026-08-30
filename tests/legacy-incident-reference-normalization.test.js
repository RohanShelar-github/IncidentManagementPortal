'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '026_normalize_legacy_incident_references.sql'), 'utf8');

test('legacy Salesforce references remain resolvable after portal ID normalisation', () => {
  assert.match(controller, /sf_case_no = \?/);
  assert.match(controller, /legacy_case_number = \?/);
});

test('reference normalisation is transactional, audited, and preserves Salesforce values', () => {
  assert.match(migration, /START TRANSACTION/);
  assert.match(migration, /COMMIT/);
  assert.match(migration, /incident_ref_normalization_audit/);
  assert.match(migration, /ROW_NUMBER\(\) OVER \(ORDER BY id\)/);
  assert.match(migration, /COALESCE\(NULLIF\(i\.sf_case_no, ''\), m\.previous_incident_ref\)/);
  assert.match(migration, /Rollback procedure/);
});
