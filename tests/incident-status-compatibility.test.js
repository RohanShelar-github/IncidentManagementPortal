const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.production.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '007_expand_incident_statuses.sql'), 'utf8');
const migrationRunner = fs.readFileSync(path.join(root, 'backend', 'scripts', 'run-sql-file.js'), 'utf8');

test('all incident statuses exposed by the UI map to canonical database values', () => {
  assert.match(controller, /'Tier 1 Level Support': 'tier_1_level_support'/);
  assert.match(controller, /'Escalated to CSO Devops': 'escalated_to_cso_devops'/);
  assert.match(controller, /tier_1_level_support: 'Tier 1 Level Support'/);
  assert.match(controller, /escalated_to_cso_devops: 'Escalated to CSO Devops'/);
});

test('incident status normalization accepts case variations from network clients', () => {
  assert.match(controller, /STATUS_TO_DB_LOWER\[status\.toLowerCase\(\)\]/);
});

test('frontend converts canonical database statuses to display labels', () => {
  assert.match(frontend, /function normalizeIncidentStatusLabel\(value\)/);
  assert.match(frontend, /escalated_to_cso_devops: 'Escalated to CSO Devops'/);
  assert.match(frontend, /status: normalizeIncidentStatusLabel\(incident\.status\)/);
});

test('production schema and additive migration allow the complete status workflow', () => {
  for (const value of ['tier_1_level_support', 'escalated_to_cso_devops']) {
    assert.match(schema, new RegExp(`'${value}'`));
    assert.match(migration, new RegExp(`'${value}'`));
  }
});

test('SQL migration runner selects the configured application database', () => {
  assert.match(migrationRunner, /database: process\.env\.DB_NAME \|\| 'incident_management_db'/);
});
