'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('Incident Trend uses database-backed monthly opened and closed event counts', () => {
  const start = frontend.indexOf('function _drawTrend(');
  const end = frontend.indexOf('/* ── 2. SEVERITY DONUT', start);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /dOpen\.push\(openCnt\);/);
  assert.match(implementation, /dClosed\.push\(closedCnt\);/);
  assert.match(implementation, /for \(var monthOffset = 7; monthOffset >= 0; monthOffset--\)/);
  assert.match(implementation, /getIncidentOpenedTimestamp\(i\)/);
  assert.match(implementation, /getIncidentClosedTimestamp\(i\)/);
  assert.match(implementation, /status === 'closed' \|\| status === 'resolved'/);
  assert.match(implementation, /\['Opened', '#f75c7c'\]/);
  assert.match(implementation, /ctx\.fillStyle = textC2; ctx\.font = '11px sans-serif'; ctx\.textAlign = 'left';/);
  assert.match(implementation, /_drawTrend\(gridC, textC, textC2, data\)/);
  assert.doesNotMatch(implementation, /Simulate cumulative growth|Math\.sin\(|Math\.cos\(|\bweekInc\b|\bbase\s*=/);
});
