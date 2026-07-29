const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('incident assignee dropdown refreshes users from the backend when opened', () => {
  const start = source.indexOf('function ensureEngineerDropdownsLoaded(callback)');
  const end = source.indexOf('\nfunction populateAssigneeFilter()', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const implementation = source.slice(start, end);
  assert.match(implementation, /loadUsersFromBackend\(function \(err\)/);
  assert.doesNotMatch(implementation, /users\.some/);
  assert.match(implementation, /Loading assignees\.\.\./);
});
