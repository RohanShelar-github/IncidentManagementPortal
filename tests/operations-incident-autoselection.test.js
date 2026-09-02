const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { noHistorianReadIncidentDefaults, operationsIncidentDefaults, subjectContains } = require('../backend/services/operationsMailClassificationService');

test('Operations incident auto-selection maps every Coralogix subject rule in priority order', () => {
  const cases = [
    ['Project License', 'Integration'], ['License IMM', 'License'], ['IMM Local Agent', 'InMemoryMiddleware'],
    ['Local Agent Workspace', 'Local Agent'], ['Workspace MCM', 'Workspace'], ['MCM alert', 'Magic Cloud Manager'], ['unknown alert', 'Infrastructure']
  ];
  for (const [subject, area] of cases) {
    assert.deepEqual(operationsIncidentDefaults('CORALOGIX', subject), { area, product_line: 'Integration', severity: null, rule: operationsIncidentDefaults('coralogix', subject).rule });
  }
});

test('Operations incident auto-selection maps every Azure subject rule in priority order', () => {
  const cases = [
    ['MESInsights MDE', 'NGC - MES', 'Application'], ['MDE Historian', 'NGC - MDE', 'Application'], ['Historian Redis', 'Historian', 'FactoryEye'],
    ['Redis AIML', 'Redis', 'Application'], ['AIML CPU', 'NGC - AIML', 'Application'], ['CPU Workspace', 'Infrastructure', 'Application'],
    ['Workspace Virtual Machine', 'Workspace', 'Integration'], ['Virtual Machine MagicXPI', 'Infrastructure', 'Application'],
    ['MagicXPI XPI_ProjectStatus', 'Integration', 'Application'], ['XPI_ProjectStatus', 'Local Agent', 'Integration']
  ];
  for (const [subject, area, productLine] of cases) {
    const result = operationsIncidentDefaults('azure', subject);
    assert.equal(result.area, area);
    assert.equal(result.product_line, productLine);
    assert.equal(result.severity, null);
  }
  assert.deepEqual(operationsIncidentDefaults('azure', 'unclassified notice'), { area: null, product_line: 'Application', severity: null, rule: 'azure-default' });
});

test('Customer Raised Tickets retain the default area and choose Integration', () => {
  assert.deepEqual(operationsIncidentDefaults('jira', 'A new support issue'), { area: null, product_line: 'Integration', severity: null, rule: 'customer-ticket' });
});

test('No Historian Read alerts use their fixed NGC and Historian incident defaults', () => {
  assert.deepEqual(noHistorianReadIncidentDefaults(), {
    area: 'Historian', product_line: 'Integration', project: 'Historian', severity: null, rule: 'no-historian-read'
  });
  const root = path.resolve(__dirname, '..');
  const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(controller, /isNoHistorianAlert \? noHistorianReadIncidentDefaults\(\)/);
  assert.match(controller, /customer_name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'ngc'/);
  assert.match(ui, /selection\.project/);
});

test('keyword matching is case-insensitive, accepts subject separators, and keeps word boundaries', () => {
  assert.equal(subjectContains('xpi-projectstatus alert', 'XPI_ProjectStatus'), true);
  assert.equal(subjectContains('Virtual_Machine alert', 'Virtual Machine'), true);
  assert.equal(subjectContains('Times service alert', 'MES'), false);
});

test('Operations prefill returns and visibly applies editable auto-selection values', () => {
  const root = path.resolve(__dirname, '..');
  const controller = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '028_operations_incident_area_defaults.sql'), 'utf8');
  assert.match(controller, /operationsIncidentDefaults\(message\.category, message\.subject\)/);
  assert.match(controller, /auto_selection: autoSelection/);
  assert.match(controller, /Operations incident auto-selection/);
  assert.match(ui, /applyOperationsIncidentAutoSelection\(prefill\.auto_selection\)/);
  assert.match(ui, /You can edit these values before creating the incident/);
  assert.match(migration, /INSERT IGNORE INTO area/);
  assert.doesNotMatch(migration, /UPDATE area/);
});
