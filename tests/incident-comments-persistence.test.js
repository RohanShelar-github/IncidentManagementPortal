const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'backend', 'sql', 'schema.sql'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('incidents table stores tags and comments as JSON', () => {
  assert.match(schema, /tags JSON NULL,\s+comments JSON NULL/);
});

test('comment API appends comments to the incident row and preserves activity logging', () => {
  assert.match(controller, /SELECT comments FROM incidents WHERE id = \? FOR UPDATE/);
  assert.match(controller, /UPDATE incidents SET comments = \? WHERE id = \?/);
  assert.match(controller, /INSERT INTO activity_logs/);
});

test('frontend posts comments to the backend and reloads stored incident comments', () => {
  assert.match(frontend, /\/comments'/);
  assert.match(frontend, /method: 'POST'/);
  assert.match(frontend, /incidentComments = \{\}/);
  assert.match(frontend, /incident\.comments/);
});
