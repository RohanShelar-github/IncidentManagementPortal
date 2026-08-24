'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const excel = require('../js/incidentReportExcel');

function sampleIncident() {
  return {
    id: 'INC-283',
    sfCase: '00135421',
    title: 'NGC - Azure: Activated Severity: 0 Memory Usage',
    customer: 'NGC',
    project: 'Historian',
    product_line: 'Azure',
    severity: 'Medium',
    status: 'Closed',
    engineer: 'Babai Chatterjee',
    area: 'Performance',
    timezone: 'GMT',
    startDT: '2026-07-07T09:43:00',
    date_time_closed: '2026-07-07T10:04:00',
    downtimeH: 0,
    downtimeM: 21,
    mttdStr: '4m',
    mttrStr: '21m',
    applications: 'Reporting',
    components: 'NGC Plant',
    desc: 'Memory consumption was above 90%.',
    rca: 'Historian process exhausted available memory.',
    resolution: 'Historian and SAP projects were restarted.',
    resolvedBy: 'AOC Team',
    rdTickets: 'FNP-1125'
  };
}

test('builds the sample-like two-sheet incident report layout', () => {
  const workbook = excel.buildIncidentReportWorkbook(sampleIncident(), { reportCreator: 'Rohan' });

  assert.equal(workbook.filename, 'Incident_Report_INC-283.xlsx');
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ['135421', 'Sheet2']);
  assert.match(workbook.sheets[0].xml, /<dimension ref="A1:C26"\/>/);
  assert.match(workbook.sheets[0].xml, /<mergeCell ref="A1:C1"\/>/);
  assert.match(workbook.sheets[0].xml, /width="31\.5546875"/);
  assert.match(workbook.sheets[0].xml, /width="127\.33203125"/);
  assert.match(workbook.sheets[0].xml, /orientation="portrait"/);
  assert.match(workbook.sheets[1].xml, /<mergeCell ref="A1:J1"\/>/);
  assert.match(workbook.sheets[1].xml, /<mergeCell ref="K1:O1"\/>/);
  assert.match(workbook.sheets[1].xml, /state="frozen"/);
});

test('maps incident values to the template and retains portal-only details', () => {
  const workbook = excel.buildIncidentReportWorkbook(sampleIncident(), { reportCreator: 'Rohan' });
  const values = new Set(workbook.sharedStrings);

  [
    'Incident Report Template',
    'Incident Type',
    'Summary',
    'Details',
    '135421',
    'Medium',
    'NGC - Azure: Activated Severity: 0 Memory Usage',
    'Reporting',
    'NGC Plant',
    'Memory consumption was above 90%.',
    'Historian and SAP projects were restarted.',
    'Rohan',
    'INC-283',
    'NGC',
    'Historian',
    'Azure',
    'Closed',
    'Babai Chatterjee',
    '4m',
    'Historian process exhausted available memory.',
    'AOC Team',
    '00135421',
    'FNP-1125'
  ].forEach((value) => assert.equal(values.has(value), true, `missing workbook value: ${value}`));
  assert.equal(values.has('21m'), false, 'MTTR must not be included in generated Excel reports');

  assert.match(workbook.sheets[0].xml, /<c r="B9" s="7"><v>46210<\/v><\/c>/);
  assert.match(workbook.sheets[0].xml, /<c r="B15" s="9"><v>21<\/v><\/c>/);
});

test('creates an Excel-compatible ZIP package containing both worksheets', () => {
  const workbook = excel.buildIncidentReportWorkbook(sampleIncident(), { reportCreator: 'Rohan' });
  const bytes = excel.createXlsxBytes(workbook);
  const raw = Buffer.from(bytes);
  const text = raw.toString('utf8');

  assert.equal(raw[0], 0x50);
  assert.equal(raw[1], 0x4b);
  assert.ok(raw.length > 5000);
  assert.match(text, /xl\/worksheets\/sheet1\.xml/);
  assert.match(text, /xl\/worksheets\/sheet2\.xml/);
  assert.match(text, /xl\/styles\.xml/);
  assert.match(text, /xl\/sharedStrings\.xml/);
});

test('uses stored downtime minutes and leaves unknown end timestamps blank', () => {
  const incident = sampleIncident();
  delete incident.date_time_closed;
  incident.downtimeH = 0;
  incident.downtimeM = 0;
  incident.downtime_mins = 0;

  const workbook = excel.buildIncidentReportWorkbook(incident, { reportCreator: 'Rohan' });

  assert.equal(workbook.model.downtime, 0);
  assert.equal(workbook.model.end, null);
  assert.match(workbook.sheets[0].xml, /<c r="B11" s="7"\/>/);
  assert.match(workbook.sheets[0].xml, /<c r="B12" s="8"\/>/);
});
