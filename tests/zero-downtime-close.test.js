'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('incident close flow accepts an explicitly recorded zero downtime', () => {
  const start = frontend.indexOf('function confirmCloseIncident');
  const end = frontend.indexOf('\nfunction ', start + 1);
  const implementation = frontend.slice(start, end);

  assert.doesNotMatch(implementation, /h === 0 && m === 0/);
  assert.match(implementation, /zero is allowed/);
  assert.match(implementation, /downtime_mins:\s*h \* 60 \+ m/);
});

test('close modal initializes missing downtime as explicit zero values', () => {
  const start = frontend.indexOf('function openDowntimeModal');
  const end = frontend.indexOf('\nfunction ', start + 1);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /inc\.downtimeH \?\? 0/);
  assert.match(implementation, /inc\.downtimeM \?\? 0/);
});

test('blank or zero downtime fields normalize to zero without blocking closure', () => {
  const start = frontend.indexOf('function confirmCloseIncident');
  const end = frontend.indexOf('\nfunction ', start + 1);
  const implementation = frontend.slice(start, end);

  assert.match(implementation, /value === '' \? 0 : Number/);
  assert.doesNotMatch(implementation, /downtimeHoursRaw === ''|downtimeMinutesRaw === ''/);
});
