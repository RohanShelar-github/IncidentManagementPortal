const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config', 'config.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');

test('frontend API URL follows the hostname used to open the UI', () => {
  assert.match(config, /window\.location\.hostname/);
  assert.match(config, /`\$\{window\.location\.protocol\}\/\/\$\{apiHostname\}:4000\/api`/);
  assert.doesNotMatch(config, /API_BASE_URL:\s*["']http:\/\/localhost/);
});

test('backend explicitly listens on all configured network interfaces', () => {
  assert.match(server, /const HOST = process\.env\.HOST \|\| '0\.0\.0\.0'/);
  assert.match(server, /app\.listen\(PORT, HOST,/);
});

test('backend accepts a comma-separated CORS origin allowlist', () => {
  assert.match(server, /process\.env\.CORS_ORIGIN/);
  assert.match(server, /\.split\(','\)/);
  assert.match(server, /allowedOrigins\.includes\(origin\)/);
});
