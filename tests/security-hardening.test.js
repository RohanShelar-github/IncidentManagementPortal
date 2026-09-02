const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('UI server serves only explicit browser assets and applies browser security headers', () => {
  const server = read('server-ui.js');
  assert.match(server, /function isPublicFilePath/);
  assert.match(server, /requestPath === '\/config\/config\.js'/);
  assert.match(server, /css\|js/);
  assert.match(server, /Content-Security-Policy/);
  assert.match(server, /https:\/\/fonts\.googleapis\.com/);
  assert.match(server, /https:\/\/fonts\.gstatic\.com/);
  assert.match(server, /img-src 'self' data: https:/);
  assert.match(server, /X-Content-Type-Options/);
  assert.match(server, /if \(!isPublicFilePath\(req\.url \|\| ''\)\)/);
});

test('incident reference insertion retries a duplicate-reference race', () => {
  const controller = read('backend/controllers/incidentController.js');
  assert.match(controller, /for \(let attempt = 0; attempt < 3 && !inserted/);
  assert.match(controller, /error\?\.code !== 'ER_DUP_ENTRY'/);
  assert.match(controller, /incidentRef = await generateIncidentRef\(\)/);
});

test('master-data creation never reactivates or overwrites duplicate records', () => {
  const controller = read('backend/controllers/masterDataController.js');
  assert.doesNotMatch(controller, /ON DUPLICATE KEY UPDATE/);
  assert.match(controller, /Existing master data was not changed/);
});

test('main incident and search renderers escape persisted values', () => {
  const ui = read('js/app.js');
  assert.match(ui, /<td class="title-cell">\$\{escapeMetricHtml\(i\.title\)\}<\/td>/);
  assert.match(ui, /No results for .*escapeMetricHtml\(q\)/);
});
