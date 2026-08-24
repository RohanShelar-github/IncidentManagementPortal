const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');

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

test('root cause, resolution steps, and resolved by are required before an incident can close', () => {
  assert.match(frontend, /if \(!rca\) \{ showToast\('Please enter the Root Cause Analysis'/);
  assert.match(frontend, /if \(!res\) \{ showToast\('Please enter the Resolution Steps'/);
  assert.match(frontend, /if \(!resolvedBy\) \{ showToast\('Please select who resolved the incident'/);
  assert.match(controller, /isClosingTransition/);
  assert.match(controller, /Root Cause Analysis, Resolution Steps, and Resolved By are required before closing an incident/);
});
