const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('close incident modal includes the existing Resolved By choices', () => {
  assert.match(html, /id="dtm_resolved_by"/);
  for (const choice of ['By OC Team', 'By Customer', 'By Stakeholder', 'By System']) {
    assert.match(html, new RegExp(choice));
  }
});

test('close incident flow prefills and saves Resolved By', () => {
  assert.match(frontend, /dtm_resolved_by'\)\.value = inc\.resolvedBy \|\| inc\.resolved_by/);
  assert.match(frontend, /resolved_by: resolvedBy/);
  assert.match(frontend, /inc\.resolvedBy = resolvedBy/);
});
