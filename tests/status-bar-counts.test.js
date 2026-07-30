const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('status bar excludes closed and resolved incidents from open counts', () => {
  const start = frontend.indexOf('function updateStatusBar()');
  const end = frontend.indexOf('\n}', start) + 2;
  const implementation = frontend.slice(start, end);

  assert.match(
    implementation,
    /i\.status !== 'Closed' && i\.status !== 'Resolved'/
  );
});

test('status bar critical count includes only active critical incidents', () => {
  const start = frontend.indexOf('function updateStatusBar()');
  const end = frontend.indexOf('\n}', start) + 2;
  const implementation = frontend.slice(start, end);

  assert.match(
    implementation,
    /i\.severity === 'Critical' && i\.status !== 'Closed' && i\.status !== 'Resolved'/
  );
});
