const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const uiServer = fs.readFileSync(path.join(root, 'server-ui.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config', 'config.js'), 'utf8');

test('browser API traffic stays on the UI origin', () => {
  assert.match(config, /API_BASE_URL:\s*["']\/api["']/);
  assert.doesNotMatch(config, /:4000\/api/);
});

test('UI server proxies API requests to the local backend', () => {
  assert.match(uiServer, /req\.url === '\/api' \|\| req\.url\.startsWith\('\/api\/'\)/);
  assert.match(uiServer, /hostname: API_HOST/);
  assert.match(uiServer, /port: API_PORT/);
  assert.match(uiServer, /req\.pipe\(proxyRequest\)/);
  assert.match(uiServer, /proxyResponse\.pipe\(res\)/);
});

test('API proxy reports backend unavailability without serving the SPA', () => {
  assert.match(uiServer, /res\.writeHead\(502/);
  assert.match(uiServer, /Backend API is unavailable/);
});
