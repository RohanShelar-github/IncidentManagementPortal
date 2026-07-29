const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.production.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '009_remove_incident_impact_fields.sql'), 'utf8');

test('impact fields are absent from incident user interfaces', () => {
  assert.doesNotMatch(html, /id="f_(components|applications)"/);
  assert.doesNotMatch(html, /id="dp_f_(components|applications)"/);
  assert.doesNotMatch(html, /id="ir_(components|applications)"/);
});

test('incident create and update paths no longer persist impact fields', () => {
  assert.doesNotMatch(controller, /b\.(components|applications)/);
  assert.doesNotMatch(controller, /'components', 'applications'/);
  assert.doesNotMatch(frontend, /document\.getElementById\('f_(components|applications)'\)/);
});

test('baseline schema and migration remove both database columns', () => {
  assert.doesNotMatch(schema, /^\s+(components|applications) TEXT NULL,/m);
  assert.match(migration, /DROP COLUMN components/);
  assert.match(migration, /DROP COLUMN applications/);
});
