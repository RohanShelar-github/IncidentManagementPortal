const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('incident report comment input provides an @mention dropdown', () => {
  assert.match(html, /id="reportMentionDropdown"/);
  assert.match(html, /handleMentionInput\(this,'reportMentionDropdown'\)/);
});

test('mention suggestions use the database-backed users list', () => {
  assert.match(frontend, /loadUsersFromBackend\(function \(\) \{\}\)/);
  assert.match(frontend, /users\.filter\(function \(u\)/);
  assert.match(frontend, /u\.name\.toLowerCase\(\)\.includes\(query\)/);
});

test('selecting a mention inserts the full database user name', () => {
  assert.match(frontend, /insertMention\(u\.name, el\.id, dropdownId\)/);
  assert.match(frontend, /'@' \+ name \+ ' '/);
});
