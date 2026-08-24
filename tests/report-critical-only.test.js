'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

test('generated report exports omit MTTR for every incident severity', () => {
  const excel = fs.readFileSync('js/incidentReportExcel.js', 'utf8');
  const exportStart = frontend.indexOf('function _buildXLSX(');
  const exportEnd = frontend.indexOf('function _openExcelPreview', exportStart);
  assert.doesNotMatch(frontend.slice(exportStart, exportEnd), /label: 'MTTR'/);
  assert.doesNotMatch(excel, /'MTTR'/);
});

test('critical report labels remain available without adding MTTR to PDF exports', () => {
  assert.match(frontend, /reportLabels = getCriticalReportLabels\(inc\)/);
  assert.match(frontend, /Critical SLA/);
  const pdfStart = frontend.indexOf('function exportIncidentPDF()');
  const pdfEnd = frontend.indexOf('function exportDetailPDF()', pdfStart);
  assert.doesNotMatch(frontend.slice(pdfStart, pdfEnd), /MTTR|Time to Resolve/);
});
