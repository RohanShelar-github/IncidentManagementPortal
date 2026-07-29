const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('close incident modal includes optional MTTR hours and minutes', () => {
  assert.match(html, /Mean Time to Resolve \(MTTR\)/);
  assert.match(html, /id="dtm_mttr_hours"/);
  assert.match(html, /id="dtm_mttr_mins"/);
});

test('close incident flow prefills and persists MTTR', () => {
  assert.match(frontend, /dtm_mttr_hours'\)\.value = inc\.mttrH/);
  assert.match(frontend, /dtm_mttr_mins'\)\.value = inc\.mttrM/);
  assert.match(frontend, /mttr_minutes: mttrH \* 60 \+ mttrM/);
});

test('missing MTTR opens the close details modal without making MTTR required', () => {
  assert.match(frontend, /inc\.mttrH > 0 \|\| inc\.mttrM > 0/);
  assert.doesNotMatch(frontend, /Please enter (?:the )?(?:Mean Time to Resolve|MTTR)/i);
});
