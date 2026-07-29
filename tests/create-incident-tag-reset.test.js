const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('new incident actions use the clean create-modal entry point', () => {
  assert.doesNotMatch(html, /onclick="openModal\('incidentModal'\)"/);
  assert.match(html, /onclick="openCreateIncidentModal\(\)"/);
});

test('opening a new incident clears prior edit and tag state', () => {
  const start = frontend.indexOf('function openCreateIncidentModal()');
  const end = frontend.indexOf('function closeModal(', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /editingId = null/);
  assert.match(implementation, /createModalTags = \[\]/);
  assert.match(implementation, /tagInput\.value = ''/);
  assert.match(implementation, /closeCreateTagSuggestions\(\)/);
});

test('closing the incident modal also discards unsaved tags', () => {
  const start = frontend.indexOf('function closeModal(id)');
  const end = frontend.indexOf('function editIncident(', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /id === 'incidentModal'/);
  assert.match(implementation, /createModalTags = \[\]/);
});
