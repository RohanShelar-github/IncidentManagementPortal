'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('dashboard resolution rate displays one decimal without changing its population', () => {
  const total = 209;
  const closed = 208;
  const rate = Math.round(closed / total * 1000) / 10;
  assert.equal(rate, 99.5);

  const start = frontend.indexOf('// Resolution rate');
  const end = frontend.indexOf('\n\n', start);
  const implementation = frontend.slice(start, end);
  assert.match(implementation, /data\.length > 0 \? Math\.round\(closed \/ data\.length \* 1000\) \/ 10 : 0/);
  assert.match(implementation, /rrEl\.textContent = resRate \+ '%'/);
});
