const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('authentication views are hidden before session restoration', () => {
  assert.match(html, /<body class="auth-pending">/);
  assert.match(css, /body\.auth-pending #loginScreen,\s+body\.auth-pending #portalApp/);
  assert.match(css, /display: none !important/);
});

test('session restoration reveals only after the destination page is selected', () => {
  const navigateIndex = frontend.indexOf("navigate(hash, navEl)");
  const revealIndex = frontend.indexOf("document.body.classList.remove('auth-pending')", navigateIndex);
  assert.ok(navigateIndex >= 0);
  assert.ok(revealIndex > navigateIndex);
});

test('missing or invalid sessions reveal the login screen after resolution', () => {
  assert.ok((frontend.match(/classList\.remove\('auth-pending'\)/g) || []).length >= 4);
});
