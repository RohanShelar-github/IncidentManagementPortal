const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('create incident tags advertise database user tagging', () => {
  assert.match(html, /placeholder="Type a tag or @username/);
  assert.match(html, /showCreateTagSuggestions\(this\.value\)/);
  assert.match(html, /id="f_tag_suggestions"[^>]*bottom:48px/);
});

test('incident description supports controlled rich-text formatting', () => {
  assert.match(html, /id="f_desc"[^>]*contenteditable="true"/);
  assert.match(html, /formatIncidentDescription\('bold'\)/);
  assert.match(html, /formatIncidentDescription\('italic'\)/);
  assert.match(html, /formatIncidentDescription\('underline'\)/);
  assert.match(frontend, /function descriptionEditorValue\(\)/);
});

test('typing @ filters create-incident tag suggestions by database username', () => {
  assert.match(frontend, /q\.charAt\(0\) === '@'/);
  assert.match(frontend, /users\.filter\(function \(u\)/);
  assert.match(frontend, /u\.name\.toLowerCase\(\)\.includes\(userQuery\)/);
});

test('selected user tags retain the @ symbol and full database name', () => {
  assert.match(frontend, /tag = '@' \+ matchedUser\.name/);
  assert.match(frontend, /addCreateTag\('@' \+ u\.name\)/);
});

test('suggestions refresh if users finish loading after @ typing starts', () => {
  assert.match(frontend, /tagInput\.value\.trim\(\)\.charAt\(0\) === '@'/);
  assert.match(frontend, /showCreateTagSuggestions\(tagInput\.value\)/);
});
