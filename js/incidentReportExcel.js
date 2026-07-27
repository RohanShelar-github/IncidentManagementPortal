(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IncidentReportExcel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function normalizeText(value, fallback) {
    var text = String(value == null ? '' : value).trim();
    return text || (fallback == null ? '' : String(fallback));
  }

  function downtimeMinutes(incident) {
    var stored = Number(incident && (incident.downtime_mins ?? incident.downtimeMinutes));
    if (Number.isFinite(stored) && stored >= 0) return Math.round(stored);
    var hours = Number(incident && (incident.downtimeH ?? incident.downtime_h)) || 0;
    var minutes = Number(incident && (incident.downtimeM ?? incident.downtime_m)) || 0;
    return Math.max(0, Math.round(hours * 60 + minutes));
  }

  function parseDateParts(value) {
    if (!value) return null;
    var match = String(value).trim().match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4] || 0),
        minute: Number(match[5] || 0),
        second: Number(match[6] || 0)
      };
    }
    var parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
      hour: parsed.getHours(),
      minute: parsed.getMinutes(),
      second: parsed.getSeconds()
    };
  }

  function excelSerial(parts) {
    if (!parts) return null;
    var epochDays = Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000;
    var dateSerial = epochDays + 25569;
    var timeSerial = (parts.hour * 3600 + parts.minute * 60 + parts.second) / 86400;
    return dateSerial + timeSerial;
  }

  function dateOnlySerial(parts) {
    var serial = excelSerial(parts);
    return serial == null ? null : Math.floor(serial);
  }

  function timeOnlySerial(parts) {
    if (!parts) return null;
    return (parts.hour * 3600 + parts.minute * 60 + parts.second) / 86400;
  }

  function addMinutes(parts, minutes) {
    if (!parts || !minutes) return parts;
    var time = Date.UTC(
      parts.year, parts.month - 1, parts.day,
      parts.hour, parts.minute + minutes, parts.second
    );
    var date = new Date(time);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }

  function reportIdentifier(incident) {
    var caseNumber = normalizeText(
      incident && (incident.sfCase || incident.sf_case || incident.sf_case_no || incident.legacy_case_number)
    );
    if (caseNumber) return caseNumber.replace(/^0+/, '') || '0';
    return normalizeText(incident && (incident.id || incident.incident_ref), 'Incident')
      .replace(/^INC[-\s]*/i, '');
  }

  function fileIdentifier(incident) {
    return normalizeText(incident && (incident.id || incident.incident_ref), 'Incident');
  }

  function buildReportModel(incident, context) {
    incident = incident || {};
    context = context || {};
    var start = parseDateParts(
      incident.date_time_opened || incident.startDT || incident.date_created || incident.date
    );
    var end = parseDateParts(
      incident.date_time_closed || incident.endDT || incident.downtimeEnd || incident.closed_date
    );
    var totalDowntime = downtimeMinutes(incident);
    if (!end && start && totalDowntime > 0) end = addMinutes(start, totalDowntime);
    var timezone = normalizeText(incident.timezone, 'IST');
    var internalId = normalizeText(incident.id || incident.incident_ref);
    var title = normalizeText(incident.title || incident.summary, 'No summary provided');
    var description = normalizeText(incident.desc || incident.description, 'No issue details provided');
    var resolution = normalizeText(incident.resolution, 'Not provided');
    var applications = normalizeText(incident.applications || incident.project, 'Not specified');
    var components = normalizeText(
      incident.impacted_plants || incident.impactedPlants || incident.components,
      'Not specified'
    );
    var instructions = normalizeText(
      incident.instructions_for_users || incident.instructionsForUsers || incident.instructions,
      'None'
    );
    var reporter = normalizeText(incident.reporter || incident.case_owner || incident.engineer, 'Not specified');
    var creator = normalizeText(context.reportCreator, reporter);
    var resolvedBy = normalizeText(incident.resolvedBy || incident.resolved_by, 'Not specified');
    var sfCase = normalizeText(
      incident.sfCase || incident.sf_case || incident.sf_case_no || incident.legacy_case_number
    );
    var mttd = normalizeText(incident.mttdStr || incident.mttd_str);
    var mttr = normalizeText(incident.mttrStr || incident.mttr_str);
    if (!mttd) {
      var mttdMinutes = Number(incident.mttd_minutes ?? incident.mttdMinutes);
      if (Number.isFinite(mttdMinutes) && mttdMinutes >= 0) mttd = Math.round(mttdMinutes) + 'm';
    }
    if (!mttr) {
      var mttrHours = Number(incident.mttrH ?? incident.mttr_h) || 0;
      var mttrMinutes = Number(incident.mttrM ?? incident.mttr_m) || 0;
      if (mttrHours || mttrMinutes) mttr = (mttrHours ? mttrHours + 'h ' : '') + (mttrMinutes ? mttrMinutes + 'm' : '');
    }
    return {
      reportId: reportIdentifier(incident),
      fileId: fileIdentifier(incident),
      internalId: internalId,
      incidentType: normalizeText(incident.incident_type || incident.incidentType || incident.area || incident.project, 'Incident'),
      severity: normalizeText(incident.severity, 'Normal'),
      status: normalizeText(incident.status),
      title: title,
      notificationDate: parseDateParts(incident.date_created || incident.date_time_opened || incident.startDT || incident.date),
      start: start,
      end: end,
      timezone: timezone,
      applications: applications,
      components: components,
      downtime: totalDowntime,
      description: description,
      rca: normalizeText(incident.rca, 'Not provided'),
      resolution: resolution,
      instructions: instructions,
      reporter: reporter,
      creator: creator,
      customer: normalizeText(incident.customer),
      project: normalizeText(incident.project),
      productLine: normalizeText(incident.product_line || incident.productLine),
      engineer: normalizeText(incident.engineer),
      area: normalizeText(incident.area),
      mttd: mttd || 'Not recorded',
      mttr: mttr || 'Not recorded',
      resolvedBy: resolvedBy,
      sfCase: sfCase,
      rdTickets: normalizeText(incident.rd_tickets || incident.rdTickets),
      notificationSentTo: normalizeText(
        incident.notification_sent_to || incident.notificationSentTo || incident.account_name,
        'Not specified'
      ),
      contact: normalizeText(incident.magic_software_contact || incident.magicSoftwareContact, resolvedBy)
    };
  }

  function sharedStringStore() {
    var values = [];
    var indexes = Object.create(null);
    return {
      value: function (input) {
        var text = String(input == null ? '' : input);
        if (indexes[text] === undefined) {
          indexes[text] = values.length;
          values.push(text);
        }
        return indexes[text];
      },
      values: values
    };
  }

  function stringCell(ref, value, style, store) {
    return '<c r="' + ref + '" t="s" s="' + style + '"><v>' + store.value(value) + '</v></c>';
  }

  function numberCell(ref, value, style) {
    if (value == null || !Number.isFinite(Number(value))) return '<c r="' + ref + '" s="' + style + '"/>';
    return '<c r="' + ref + '" s="' + style + '"><v>' + Number(value) + '</v></c>';
  }

  function emptyCell(ref, style) {
    return '<c r="' + ref + '" s="' + style + '"/>';
  }

  function rowXml(number, cells, height) {
    return '<row r="' + number + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>'
      + cells.join('') + '</row>';
  }

  function buildPrimarySheet(model, store) {
    var rows = [];
    function formRow(row, label, value, valueStyle, unit, type) {
      var valueCell = type === 'number'
        ? numberCell('B' + row, value, valueStyle || 1)
        : stringCell('B' + row, value, valueStyle || 1, store);
      rows.push(rowXml(row, [
        stringCell('A' + row, label, 1, store),
        valueCell,
        unit ? stringCell('C' + row, unit, 1, store) : emptyCell('C' + row, 1)
      ]));
    }
    rows.push(rowXml(1, [
      stringCell('A1', 'Incident Report Template', 12, store),
      emptyCell('B1', 13),
      emptyCell('C1', 13)
    ]));
    rows.push(rowXml(2, [emptyCell('A2', 1), emptyCell('B2', 1), emptyCell('C2', 1)]));
    rows.push(rowXml(3, [
      stringCell('A3', 'Incident Type', 2, store),
      stringCell('B3', model.incidentType, 1, store),
      emptyCell('C3', 1)
    ]));
    rows.push(rowXml(4, [emptyCell('A4', 1), emptyCell('B4', 1), emptyCell('C4', 1)]));
    rows.push(rowXml(5, [
      stringCell('A5', 'Summary', 2, store),
      emptyCell('B5', 1),
      emptyCell('C5', 1)
    ]));
    formRow(6, 'Incident ID', model.reportId, 10);
    formRow(7, 'Severity', model.severity, 1);
    formRow(8, 'Summary', model.title, 11);
    formRow(9, 'Incident Start Date', dateOnlySerial(model.start), 7, '', 'number');
    formRow(10, 'Incident Start Time', timeOnlySerial(model.start), 8, model.timezone, 'number');
    formRow(11, 'Incident End Date (Actual/Estimated)', dateOnlySerial(model.end), 7, '', 'number');
    formRow(12, 'Incident End Time (Actual/Estimated)', timeOnlySerial(model.end), 8, model.timezone, 'number');
    formRow(13, 'Impacted Applications', model.applications, 11);
    formRow(14, 'Impacted Plants', model.components, 11);
    formRow(15, 'Downtime', model.downtime, 9, 'Minutes', 'number');
    rows.push(rowXml(16, [emptyCell('A16', 1), emptyCell('B16', 9), emptyCell('C16', 1)]));
    rows.push(rowXml(17, [
      stringCell('A17', 'Details', 2, store),
      emptyCell('B17', 1),
      emptyCell('C17', 1)
    ]));
    formRow(18, 'Issue Details', model.description, 11);
    formRow(19, 'Resolution Details', model.resolution, 11);
    formRow(20, 'Instructions for Users', model.instructions, 11);
    formRow(21, 'Reporter', model.reporter, 3);
    formRow(22, 'incident report creator', model.creator, 3);
    rows.push(rowXml(26, [emptyCell('B26', 6)]));
    return '<?xml version="1.0" encoding="UTF-8"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<dimension ref="A1:C26"/>'
      + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="B6" sqref="B6"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="14.4"/>'
      + '<cols><col min="1" max="1" width="31.5546875" customWidth="1"/>'
      + '<col min="2" max="2" width="127.33203125" customWidth="1"/>'
      + '<col min="3" max="3" width="9.5546875" customWidth="1"/></cols>'
      + '<sheetData>' + rows.join('') + '</sheetData>'
      + '<mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>'
      + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
      + '<pageSetup orientation="portrait" paperSize="9" fitToWidth="1" fitToHeight="1"/>'
      + '</worksheet>';
  }

  function buildDetailSheet(model, store) {
    var sampleHeaders = [
      'Incident ID', 'Severity', 'Summary', 'Date of Notification', 'Date of Incident',
      'Incident Start Time', 'Incident End Time (Actual/Estimated)', 'Impacted Applications',
      'Impacted Plants', 'Downtime', 'Issue Details', 'Resolution Details',
      'Instructions for Users', 'Notification Sent To', 'Magic Software Contact'
    ];
    var portalHeaders = [
      'Portal Incident ID', 'Customer', 'Project', 'Product Line', 'Status', 'Assigned Engineer',
      'Area', 'Timezone', 'MTTD', 'MTTR', 'Root Cause Analysis', 'Resolved By',
      'Salesforce Case No.', 'R&D Tickets'
    ];
    var sampleValues = [
      model.reportId, model.severity, model.title, dateOnlySerial(model.notificationDate),
      dateOnlySerial(model.start), timeOnlySerial(model.start), timeOnlySerial(model.end),
      model.applications, model.components, model.downtime, model.description, model.resolution,
      model.instructions, model.notificationSentTo, model.contact
    ];
    var portalValues = [
      model.internalId, model.customer, model.project, model.productLine, model.status, model.engineer,
      model.area, model.timezone, model.mttd, model.mttr, model.rca, model.resolvedBy,
      model.sfCase, model.rdTickets
    ];
    var widths = [12, 10, 36, 18, 16, 18, 28, 22, 18, 12, 42, 42, 24, 22, 22]
      .concat([16, 18, 24, 18, 18, 22, 16, 12, 12, 12, 42, 20, 20, 18]);
    var rows = [];
    var lastColumn = columnName(widths.length - 1);
    var groupCells = [];
    for (var ci = 0; ci < widths.length; ci++) {
      var letter = columnName(ci);
      var groupStyle = ci < 10 ? 15 : ci < 15 ? 14 : 16;
      var title = ci === 0 ? 'Summary' : ci === 10 ? 'Detail' : ci === 15 ? 'Portal Details' : '';
      groupCells.push(title ? stringCell(letter + '1', title, groupStyle, store) : emptyCell(letter + '1', groupStyle));
    }
    rows.push(rowXml(1, groupCells));
    rows.push(rowXml(2, sampleHeaders.concat(portalHeaders).map(function (header, index) {
      return stringCell(columnName(index) + '2', header, index < 10 ? 4 : index < 15 ? 5 : 12, store);
    }), 30));
    rows.push(rowXml(3, sampleValues.concat(portalValues).map(function (value, index) {
      var ref = columnName(index) + '3';
      if ([3, 4].indexOf(index) >= 0) return numberCell(ref, value, 7);
      if ([5, 6].indexOf(index) >= 0) return numberCell(ref, value, 8);
      if (index === 9) return numberCell(ref, value, 9);
      return stringCell(ref, value, index >= 10 ? 11 : 1, store);
    }), 45));
    var colXml = widths.map(function (width, index) {
      return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<dimension ref="A1:' + lastColumn + '3"/>'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="14.4"/>'
      + '<cols>' + colXml + '</cols>'
      + '<sheetData>' + rows.join('') + '</sheetData>'
      + '<autoFilter ref="A2:' + lastColumn + '3"/>'
      + '<mergeCells count="3"><mergeCell ref="A1:J1"/><mergeCell ref="K1:O1"/><mergeCell ref="P1:' + lastColumn + '1"/></mergeCells>'
      + '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
      + '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>'
      + '</worksheet>';
  }

  function columnName(index) {
    var name = '';
    for (var value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
      name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    }
    return name;
  }

  function buildStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="2"><numFmt numFmtId="164" formatCode="[$-F400]h:mm:ss\\ AM/PM"/>'
      + '<numFmt numFmtId="165" formatCode="0;[Red]0"/></numFmts>'
      + '<fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'
      + '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>'
      + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'
      + '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'
      + '<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="17">'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
      + '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>'
      + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>'
      + '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="3" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="2" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>'
      + '</cellXfs></styleSheet>';
  }

  function buildIncidentReportWorkbook(incident, context) {
    var model = buildReportModel(incident, context);
    var store = sharedStringStore();
    var primary = buildPrimarySheet(model, store);
    var detail = buildDetailSheet(model, store);
    var sharedStringsXml = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + store.values.length
      + '" uniqueCount="' + store.values.length + '">'
      + store.values.map(function (value) {
        return '<si><t xml:space="preserve">' + xmlEscape(value) + '</t></si>';
      }).join('') + '</sst>';
    var safeSheetName = model.reportId.replace(/[\\/*?:[\]]/g, '_').substring(0, 31) || 'Incident';
    return {
      filename: 'Incident_Report_' + model.fileId.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx',
      model: model,
      sharedStrings: store.values.slice(),
      sharedStringsXml: sharedStringsXml,
      stylesXml: buildStylesXml(),
      sheets: [
        { name: safeSheetName, xml: primary },
        { name: 'Sheet2', xml: detail }
      ]
    };
  }

  function createXlsxBytes(workbook) {
    var contentTypes = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + workbook.sheets.map(function (_, index) {
        return '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('')
      + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';
    var rootRels = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    var workbookXml = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView/></bookViews><sheets>'
      + workbook.sheets.map(function (sheet, index) {
        return '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
      }).join('') + '</sheets></workbook>';
    var workbookRels = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + workbook.sheets.map(function (_, index) {
        return '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>';
      }).join('')
      + '<Relationship Id="rId' + (workbook.sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
      + '<Relationship Id="rId' + (workbook.sheets.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    var files = [
      ['[Content_Types].xml', contentTypes],
      ['_rels/.rels', rootRels],
      ['xl/workbook.xml', workbookXml],
      ['xl/_rels/workbook.xml.rels', workbookRels]
    ];
    workbook.sheets.forEach(function (sheet, index) {
      files.push(['xl/worksheets/sheet' + (index + 1) + '.xml', sheet.xml]);
    });
    files.push(['xl/sharedStrings.xml', workbook.sharedStringsXml]);
    files.push(['xl/styles.xml', workbook.stylesXml]);
    return zipStored(files);
  }

  function zipStored(files) {
    var encoder = new TextEncoder();
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var seed = i;
      for (var bit = 0; bit < 8; bit++) seed = seed & 1 ? (0xEDB88320 ^ (seed >>> 1)) : (seed >>> 1);
      table[i] = seed;
    }
    function crc32(bytes) {
      var crc = 0xFFFFFFFF;
      for (var index = 0; index < bytes.length; index++) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function u16(value) { return [value & 0xff, (value >> 8) & 0xff]; }
    function u32(value) { return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]; }
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    files.forEach(function (entry) {
      var nameBytes = encoder.encode(entry[0]);
      var contentBytes = encoder.encode(entry[1]);
      var crc = crc32(contentBytes);
      var size = contentBytes.length;
      var local = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), 0, 0, 0, 0,
        ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0)
      ]);
      localParts.push(local, nameBytes, contentBytes);
      var central = new Uint8Array([
        0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), 0, 0, 0, 0,
        ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
        ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      centralParts.push(central, nameBytes);
      offset += local.length + nameBytes.length + size;
    });
    var centralOffset = offset;
    var centralSize = centralParts.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new Uint8Array([
      0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(centralOffset), ...u16(0)
    ]);
    var parts = localParts.concat(centralParts, [end]);
    var total = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
    var output = new Uint8Array(total);
    var position = 0;
    parts.forEach(function (part) {
      output.set(part, position);
      position += part.length;
    });
    return output;
  }

  return {
    buildReportModel: buildReportModel,
    buildIncidentReportWorkbook: buildIncidentReportWorkbook,
    createXlsxBytes: createXlsxBytes,
    excelSerial: excelSerial,
    parseDateParts: parseDateParts,
    downtimeMinutes: downtimeMinutes
  };
}));
