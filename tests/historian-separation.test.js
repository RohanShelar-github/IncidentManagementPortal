'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const metrics = require('../js/reportingMetrics');

test('preserves the project-based Historian classifier for dashboard compatibility', () => {
  assert.equal(metrics.isHistorianIncident({ project: 'Historian' }), true);
  assert.equal(metrics.isHistorianIncident({ project: ' historian ' }), true);
  assert.equal(metrics.isHistorianIncident({ project: 'HISTORIAN' }), true);
  assert.equal(metrics.isHistorianIncident({ project: 'MES', area: 'Historian' }), false);
  assert.equal(metrics.isHistorianIncident({ area: 'Historian' }), false);
});

test('Customer 360 identifies Historian incidents from area without using project', () => {
  assert.equal(metrics.isCustomer360HistorianIncident({ area: 'Historian', project: 'MES' }), true);
  assert.equal(metrics.isCustomer360HistorianIncident({ area: ' historian ' }), true);
  assert.equal(metrics.isCustomer360HistorianIncident({ area: 'HISTORIAN' }), true);
  assert.equal(metrics.isCustomer360HistorianIncident({ area: 'Application', project: 'Historian' }), false);
  assert.equal(metrics.isCustomer360HistorianIncident({ project: 'Historian' }), false);
});

test('recognizes only NGC for Customer 360 separation', () => {
  assert.equal(metrics.isNgcCustomer('NGC'), true);
  assert.equal(metrics.isNgcCustomer(' ngc '), true);
  assert.equal(metrics.isNgcCustomer('MGC'), false);
});

test('partitions incident counts and downtime independently without data loss', () => {
  const incidents = [
    { id: 'current-app', project: 'MES', downtimeH: 1, downtimeM: 15 },
    { id: 'historic-historian', project: 'Historian', downtime_h: 3, downtime_m: 5 },
    { id: 'current-historian', project: ' historian ', downtimeH: 0, downtimeM: 40 },
    { id: 'historic-app', project: '', downtime_h: 2, downtime_m: 0 }
  ];

  const split = metrics.partitionHistorianIncidents(incidents);

  assert.deepEqual(split.application.map((incident) => incident.id), ['current-app', 'historic-app']);
  assert.deepEqual(split.historian.map((incident) => incident.id), ['historic-historian', 'current-historian']);
  assert.equal(split.application.length + split.historian.length, incidents.length);
  assert.equal(metrics.sumDowntimeMinutes(split.application), 195);
  assert.equal(metrics.sumDowntimeMinutes(split.historian), 225);
  assert.equal(
    metrics.sumDowntimeMinutes(split.application) + metrics.sumDowntimeMinutes(split.historian),
    metrics.sumDowntimeMinutes(incidents)
  );
});

test('Customer 360 partitions NGC Historian metrics by area', () => {
  const incidents = [
    { id: 'application', area: 'Application', project: 'Historian', downtimeH: 1, downtimeM: 15 },
    { id: 'historian', area: 'Historian', project: 'MES', downtime_h: 3, downtime_m: 5 },
    { id: 'historian-case', area: ' historian ', project: '', downtimeH: 0, downtimeM: 40 },
    { id: 'infrastructure', area: 'Infrastructure', project: '', downtime_h: 2, downtime_m: 0 }
  ];

  const split = metrics.partitionCustomer360HistorianIncidents(incidents);

  assert.deepEqual(split.application.map((incident) => incident.id), ['application', 'infrastructure']);
  assert.deepEqual(split.historian.map((incident) => incident.id), ['historian', 'historian-case']);
  assert.equal(split.application.length + split.historian.length, incidents.length);
  assert.equal(metrics.sumDowntimeMinutes(split.application), 195);
  assert.equal(metrics.sumDowntimeMinutes(split.historian), 225);
});

test('downtime values are clamped to non-negative totals', () => {
  assert.equal(metrics.getDowntimeMinutes({ downtimeH: -2, downtimeM: 10 }), 0);
  assert.equal(metrics.getDowntimeMinutes({ downtime_h: 0, downtime_m: 30 }), 30);
});
