'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const excel = require('../js/incidentReportExcel');

test('emits worksheet elements in Microsoft Excel-compatible order', () => {
  const workbook = excel.buildIncidentReportWorkbook({
    id: 'INC-1',
    title: 'Compatibility check',
    severity: 'High',
    status: 'Closed',
    startDT: '2026-07-07T09:43:00',
    date_time_closed: '2026-07-07T10:04:00'
  });
  const detailXml = workbook.sheets[1].xml;

  assert.ok(detailXml.indexOf('<sheetData>') < detailXml.indexOf('<autoFilter '));
  assert.ok(detailXml.indexOf('<autoFilter ') < detailXml.indexOf('<mergeCells '));
  assert.ok(detailXml.indexOf('<mergeCells ') < detailXml.indexOf('<pageMargins '));
  assert.ok(detailXml.indexOf('<pageMargins ') < detailXml.indexOf('<pageSetup '));
});
