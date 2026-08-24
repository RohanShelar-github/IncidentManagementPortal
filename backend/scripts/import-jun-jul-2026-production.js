'use strict';

// Controlled, append-only import for the June/July 2026 authoritative workbook.
// Usage: node scripts/import-jun-jul-2026-production.js <workbook.xlsx> [--execute]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const workbookPath = args.find((arg) => !arg.startsWith('--'));
if (!workbookPath) throw new Error('Usage: node scripts/import-jun-jul-2026-production.js <workbook.xlsx> [--execute]');

const sourcePath = path.resolve(workbookPath);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.resolve(__dirname, '..', '..', 'import-reports', `jun-jul-2026-${runId}`);
const REQUIRED_HEADERS = ['sf_case_no', 'Customer', 'Project Area', 'Area', 'product_line', 'Date/Time Closed', 'case_owner', 'Closed Date', 'Severity', 'Subject', 'Incident Report status', 'Downtime(Mins)', 'Mean Time to Detect (MTTD)', 'Resolution', 'Date/Time Opened', 'Month', 'Account Name', 'Internal Status', 'R&D Tickets'];
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical', 'normal']);
const STATUSES = new Set(['open', 'in_progress', 'tier_1_level_support', 'further_investigation', 'escalated_to_rd', 'escalated_to_cso_devops', 'escalated_to_3rd_party', 'resolved', 'closed']);

function readWorkbook() {
  const reader = path.resolve(__dirname, 'read-incidents-xlsx.ps1');
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', reader, '-WorkbookPath', sourcePath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || 'Workbook reader failed');
  return JSON.parse(result.stdout);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fileHash(file) { return sha256(fs.readFileSync(file)); }
function text(value) { return String(value ?? ''); }
function required(value) { return text(value).trim() !== ''; }
function normalized(value) { return text(value).trim().toLowerCase(); }
function sqlDateTime(value) { return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text(value)) ? value : null; }
function sqlDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? value : null; }
function nonNegativeInteger(value) { return /^\d+$/.test(text(value)) ? Number(value) : null; }
function sourceMonthIsInScope(value) { return ["Jun'26", "Jul'26"].includes(text(value)); }

function writeJson(name, value) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, name), JSON.stringify(value, null, 2));
}
function makeRollbackSql(refs) {
  if (!refs.length) return '-- No records were inserted.\n';
  const quoted = refs.map((ref) => "'" + String(ref).replace(/'/g, "''") + "'").join(', ');
  return `-- Deletes only the June/July 2026 import rows by their source SF case number.\nSTART TRANSACTION;\nDELETE FROM incidents WHERE incident_ref IN (${quoted}) AND legacy_source = 'Cloud Incidents from Jun\'26 to Jul\'26.xlsx';\nSELECT ROW_COUNT() AS deleted_incidents;\nCOMMIT;\n`;
}
function writeReport(report) {
  writeJson('import-summary.json', report.summary);
  writeJson('duplicate-report.json', report.duplicates);
  writeJson('validation-reconciliation-report.json', report.validation);
  writeJson('failed-records.json', report.failures);
  writeJson('field-mapping.json', report.fieldMapping);
  writeJson('existing-data-impact-analysis.json', report.impact);
  if (report.rollbackSql) fs.writeFileSync(path.join(reportDir, 'rollback.sql'), report.rollbackSql);
  const checks = report.validation.checks.map((check) => `- ${check.name}: ${check.passed ? 'PASS' : 'FAIL'}${check.detail ? ` — ${check.detail}` : ''}`);
  fs.writeFileSync(path.join(reportDir, 'import-report.md'), [
    '# June & July 2026 Production Incident Import', '',
    `- Mode: ${report.summary.mode}`,
    `- Source: ${report.summary.workbook}`,
    `- Source SHA-256: ${report.summary.source_sha256}`,
    `- Source records: ${report.summary.source_count}`,
    `- Imported records: ${report.summary.imported_count}`,
    `- Duplicate records: ${report.summary.duplicate_count}`,
    `- Failed records: ${report.summary.failed_count}`,
    `- Transaction committed: ${report.summary.committed}`,
    '', '## Validation', '', ...checks, '',
    '## Integrity notes', '',
    '- All source row values and original Excel date serials are retained in `legacy_raw`.',
    '- `date_time_opened`, `date_time_closed`, and `closed_date` are written as the IST wall-clock values in the workbook; no UTC conversion fields are populated.',
    '- The database enum stores severity/status in its required lowercase representation; the exact workbook spellings remain in `legacy_raw` and `internal_status`.',
    '- No existing incident, customer, area, or user record is updated or deleted.',
    '', '## Recovery', '',
    report.rollbackSql ? 'Use `rollback.sql` to delete only this import batch. The pre-import incident snapshot is in `backup/pre-import-incidents.json`.' : 'Dry run only: no rollback is required.', ''
  ].join('\n'));
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return "'" + stringValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
}
async function createBackup(connection, preExisting) {
  const backupDir = path.join(reportDir, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'pre-import-incidents.json'), JSON.stringify(preExisting, null, 2));
  const dump = spawnSync('mysqldump', ['--single-transaction', '--skip-lock-tables', '--no-create-info', '--skip-triggers', '-h', process.env.DB_HOST || 'localhost', '-P', String(process.env.DB_PORT || 3306), '-u', process.env.DB_USER, process.env.DB_NAME, 'incidents'], {
    encoding: 'utf8', env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, maxBuffer: 100 * 1024 * 1024
  });
  if (dump.status === 0) {
    fs.writeFileSync(path.join(backupDir, 'pre-import-incidents.sql'), dump.stdout);
    return { method: 'mysqldump' };
  }
  // Some Windows installs expose MySQL through a service but do not place
  // mysqldump on PATH. Preserve an SQL re-insertion export rather than
  // weakening the safety gate or proceeding without a backup.
  const [columns] = await connection.query('SHOW COLUMNS FROM incidents');
  const fields = columns.map((column) => column.Field);
  const statements = preExisting.map((row) => `INSERT INTO incidents (${fields.map((field) => '`' + field + '`').join(', ')}) VALUES (${fields.map((field) => sqlLiteral(row[field])).join(', ')});`);
  fs.writeFileSync(path.join(backupDir, 'pre-import-incidents.sql'), [
    '-- Fallback pre-import incident snapshot. mysqldump was not available on PATH.',
    '-- This file is an append/recovery export; use the batch rollback first for this import.',
    'SET NAMES utf8mb4;', ...statements, ''
  ].join('\n'));
  return { method: 'application-generated SQL snapshot', mysqldump_error: (dump.stderr || 'mysqldump unavailable').trim() };
}

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error('Source workbook not found: ' + sourcePath);
  const workbook = readWorkbook();
  const failures = [];
  const duplicates = [];
  const sourceHash = fileHash(sourcePath);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !workbook.headers.includes(header));
  if (missingHeaders.length) failures.push({ type: 'workbook_headers', error: 'Missing required headers', fields: missingHeaders });

  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true, charset: 'utf8mb4' });
  let locked = false;
  let transaction = false;
  try {
    const [existingRows] = await connection.query('SELECT * FROM incidents ORDER BY id');
    const preExistingHash = sha256(JSON.stringify(existingRows));
    const [periodRows] = await connection.query("SELECT COUNT(*) AS total, SUM(date_time_opened >= '2026-01-01' AND date_time_opened < '2026-06-01') AS jan_may, SUM(date_time_opened >= '2026-08-01' AND date_time_opened < '2026-09-01') AS august, SUM(date_time_opened >= '2026-06-01' AND date_time_opened < '2026-08-01') AS jun_jul FROM incidents");
    const [customers] = await connection.query('SELECT id, customer_name FROM customers');
    const [areas] = await connection.query('SELECT id, area_name FROM area');
    const [auditUsers] = await connection.query("SELECT id, full_name FROM users WHERE is_active = 1 AND role = 'admin' ORDER BY id LIMIT 1");
    if (!auditUsers.length) failures.push({ type: 'audit_user', error: 'No active admin exists for required imported-row audit metadata' });
    const customerIds = new Map(customers.map((row) => [normalized(row.customer_name), row]));
    const areaIds = new Map(areas.map((row) => [normalized(row.area_name), row]));
    const sourceRefs = new Map();
    workbook.records.forEach((record) => {
      const ref = text(record.values.sf_case_no);
      if (!ref) return;
      sourceRefs.set(ref, (sourceRefs.get(ref) || 0) + 1);
    });
    for (const [ref, count] of sourceRefs) if (count > 1) duplicates.push({ type: 'source_identifier', identifier: 'sf_case_no', value: ref, count });
    const refs = [...sourceRefs.keys()];
    if (refs.length) {
      const marks = refs.map(() => '?').join(',');
      const [matches] = await connection.query(`SELECT id, incident_ref, legacy_case_number, sf_case_no FROM incidents WHERE incident_ref IN (${marks}) OR legacy_case_number IN (${marks}) OR sf_case_no IN (${marks})`, [...refs, ...refs, ...refs]);
      matches.forEach((row) => duplicates.push({ type: 'database_identifier', ...row }));
    }

    const prepared = workbook.records.map((record) => {
      const values = record.values;
      const rowFailures = [];
      const sourceRow = record.source_row;
      ['sf_case_no', 'Customer', 'Area', 'Severity', 'Subject', 'Date/Time Opened', 'Internal Status'].forEach((field) => {
        if (!required(values[field])) rowFailures.push({ source_row: sourceRow, field, value: values[field], error: 'Required source value is blank' });
      });
      if (!sourceMonthIsInScope(values.Month)) rowFailures.push({ source_row: sourceRow, field: 'Month', value: values.Month, error: 'Not a June or July 2026 source row' });
      const opened = sqlDateTime(values['Date/Time Opened']);
      const closed = sqlDateTime(values['Date/Time Closed']);
      const closedDate = sqlDate(values['Closed Date']);
      if (!opened) rowFailures.push({ source_row: sourceRow, field: 'Date/Time Opened', value: values['Date/Time Opened'], error: 'Invalid timestamp' });
      if (values['Date/Time Closed'] !== '' && !closed) rowFailures.push({ source_row: sourceRow, field: 'Date/Time Closed', value: values['Date/Time Closed'], error: 'Invalid timestamp' });
      if (values['Closed Date'] !== '' && !closedDate) rowFailures.push({ source_row: sourceRow, field: 'Closed Date', value: values['Closed Date'], error: 'Invalid date' });
      const downtime = nonNegativeInteger(values['Downtime(Mins)']);
      const mttd = nonNegativeInteger(values['Mean Time to Detect (MTTD)']);
      if (values['Downtime(Mins)'] !== '' && downtime === null) rowFailures.push({ source_row: sourceRow, field: 'Downtime(Mins)', value: values['Downtime(Mins)'], error: 'Expected non-negative integer' });
      if (values['Mean Time to Detect (MTTD)'] !== '' && mttd === null) rowFailures.push({ source_row: sourceRow, field: 'Mean Time to Detect (MTTD)', value: values['Mean Time to Detect (MTTD)'], error: 'Expected non-negative integer' });
      const severity = normalized(values.Severity);
      const status = normalized(values['Internal Status']).replace(/\s+/g, '_');
      if (!SEVERITIES.has(severity)) rowFailures.push({ source_row: sourceRow, field: 'Severity', value: values.Severity, error: 'No compatible incidents.severity enum value' });
      if (!STATUSES.has(status)) rowFailures.push({ source_row: sourceRow, field: 'Internal Status', value: values['Internal Status'], error: 'No compatible incidents.status enum value' });
      const customer = customerIds.get(normalized(values.Customer));
      const area = areaIds.get(normalized(values.Area));
      if (!customer) rowFailures.push({ source_row: sourceRow, field: 'Customer', value: values.Customer, error: 'No existing customer master mapping' });
      if (!area) rowFailures.push({ source_row: sourceRow, field: 'Area', value: values.Area, error: 'No existing area master mapping' });
      failures.push(...rowFailures);
      return {
        source_row: sourceRow, incident_ref: text(values.sf_case_no), sf_case_no: text(values.sf_case_no), title: text(values.Subject),
        description: null, severity, status, case_owner: text(values.case_owner) || null, customer: text(values.Customer), customer_id: customer?.id || null,
        project: text(values['Project Area']) || null, project_area: text(values['Project Area']) || null, area: text(values.Area) || null, area_id: area?.id || null,
        product_line: text(values.product_line) || null, date_time_opened: opened, start_dt: opened, date_time_closed: closed, end_dt: closed,
        closed_date: closedDate, timezone: 'IST', source_timezone: 'Asia/Kolkata', downtime_mins: downtime, mttd_minutes: mttd,
        resolution: text(values.Resolution) || null, sf_case_no: text(values.sf_case_no), incident_report_status: text(values['Incident Report status']) || null,
        legacy_month: text(values.Month) || null, account_name: text(values['Account Name']) || null, internal_status: text(values['Internal Status']) || null,
        rd_tickets: text(values['R&D Tickets']) || null, legacy_source: path.basename(sourcePath), legacy_raw: JSON.stringify({ source_row: sourceRow, values, excel_serials: record.excel_serials, source_sha256: sourceHash })
      };
    });

    const validation = { checks: [
      { name: 'Required source headers are present', passed: missingHeaders.length === 0, detail: `${missingHeaders.length} missing` },
      { name: 'Source contains only June and July 2026 rows', passed: prepared.length === workbook.row_count && failures.filter((x) => x.field === 'Month').length === 0, detail: `${workbook.row_count} rows` },
      { name: 'No source or database identifier duplicates', passed: duplicates.length === 0, detail: `${duplicates.length} duplicates` },
      { name: 'All values and foreign-key mappings are valid', passed: failures.length === 0, detail: `${failures.length} failures` },
      { name: 'All timestamps retain their IST wall-clock value', passed: true, detail: 'No timezone conversion or UTC population is performed' }
    ] };
    const report = {
      summary: { mode: execute ? 'EXECUTE' : 'DRY RUN', workbook: sourcePath, source_sha256: sourceHash, source_count: workbook.row_count, valid_count: failures.length || duplicates.length ? 0 : prepared.length, duplicate_count: duplicates.length, failed_count: failures.length, imported_count: 0, committed: false },
      duplicates, failures, validation,
      fieldMapping: {
        sf_case_no: ['incident_ref', 'sf_case_no'], Customer: ['customer (exact source text)', 'customer_id (case-insensitive existing-master lookup)'],
        'Project Area': ['project', 'project_area'], Area: ['area (exact source text)', 'area_id (existing-master lookup)'], product_line: ['product_line'],
        'Date/Time Opened': ['date_time_opened', 'start_dt'], 'Date/Time Closed': ['date_time_closed', 'end_dt'], 'Closed Date': ['closed_date'],
        Severity: ['severity (required database enum encoding)', 'legacy_raw (exact source spelling)'], 'Internal Status': ['status (required database enum encoding)', 'internal_status (exact source spelling)', 'legacy_raw'],
        case_owner: ['case_owner'], 'Downtime(Mins)': ['downtime_mins'], 'Mean Time to Detect (MTTD)': ['mttd_minutes'], Resolution: ['resolution'],
        'Incident Report status': ['incident_report_status'], Month: ['legacy_month'], 'Account Name': ['account_name'], 'R&D Tickets': ['rd_tickets'],
        'All source columns': ['legacy_raw (exact values and Excel serials)']
      },
      impact: { pre_import_count: existingRows.length, pre_import_hash: preExistingHash, periods_before: periodRows[0], changes_to_existing_rows: 0 }, rollbackSql: ''
    };
    if (!validation.checks.every((check) => check.passed)) { writeReport(report); console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, validation: validation.checks }, null, 2)); return; }
    if (!execute) { writeReport(report); console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, validation: validation.checks }, null, 2)); return; }

    const backup = await createBackup(connection, existingRows);
    report.impact.backup = backup;
    const [lockRows] = await connection.query("SELECT GET_LOCK('jun_jul_2026_production_incident_import', 30) AS acquired");
    locked = Number(lockRows[0].acquired) === 1;
    if (!locked) throw new Error('Could not acquire exclusive import lock');
    await connection.beginTransaction(); transaction = true;
    const [recheck] = await connection.query(`SELECT incident_ref FROM incidents WHERE incident_ref IN (${refs.map(() => '?').join(',')}) OR sf_case_no IN (${refs.map(() => '?').join(',')}) FOR UPDATE`, [...refs, ...refs]);
    if (recheck.length) throw new Error('Duplicate appeared after pre-import validation; transaction rolled back');
    const auditUser = auditUsers[0].id;
    const columns = ['incident_ref', 'title', 'description', 'severity', 'status', 'assigned_to', 'case_owner', 'created_by', 'customer', 'customer_id', 'project', 'project_area', 'area', 'area_id', 'product_line', 'start_dt', 'date_time_opened', 'opened_at_utc', 'end_dt', 'date_time_closed', 'closed_at_utc', 'closed_date', 'timezone', 'source_timezone', 'downtime_mins', 'mttd_minutes', 'resolution', 'sf_case_no', 'incident_report_status', 'legacy_month', 'account_name', 'internal_status', 'rd_tickets', 'legacy_source', 'legacy_raw'];
    for (const row of prepared) {
      const values = columns.map((column) => {
        if (column === 'assigned_to' || column === 'opened_at_utc' || column === 'closed_at_utc') return null;
        if (column === 'created_by') return auditUser;
        return row[column] ?? null;
      });
      await connection.query(`INSERT INTO incidents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
    }
    const [imported] = await connection.query(`SELECT incident_ref, sf_case_no, title, description, severity, status, case_owner, customer, project, project_area, area, product_line, DATE_FORMAT(date_time_opened, '%Y-%m-%d %H:%i:%s') AS date_time_opened, start_dt, DATE_FORMAT(date_time_closed, '%Y-%m-%d %H:%i:%s') AS date_time_closed, end_dt, DATE_FORMAT(closed_date, '%Y-%m-%d') AS closed_date, timezone, source_timezone, downtime_mins, mttd_minutes, resolution, incident_report_status, legacy_month, account_name, internal_status, rd_tickets, opened_at_utc, closed_at_utc FROM incidents WHERE incident_ref IN (${refs.map(() => '?').join(',')}) ORDER BY FIELD(incident_ref, ${refs.map(() => '?').join(',')})`, [...refs, ...refs]);
    const mismatches = [];
    prepared.forEach((source, index) => {
      const actual = imported[index];
      if (!actual) { mismatches.push({ incident_ref: source.incident_ref, error: 'Missing imported record' }); return; }
      ['incident_ref', 'sf_case_no', 'title', 'description', 'severity', 'status', 'case_owner', 'customer', 'project', 'project_area', 'area', 'product_line', 'date_time_opened', 'start_dt', 'date_time_closed', 'end_dt', 'closed_date', 'timezone', 'source_timezone', 'downtime_mins', 'mttd_minutes', 'resolution', 'incident_report_status', 'legacy_month', 'account_name', 'internal_status', 'rd_tickets'].forEach((field) => {
        if (String(actual[field] ?? '') !== String(source[field] ?? '')) mismatches.push({ incident_ref: source.incident_ref, field, expected: source[field] ?? null, actual: actual[field] ?? null });
      });
      if (actual.opened_at_utc !== null || actual.closed_at_utc !== null) mismatches.push({ incident_ref: source.incident_ref, field: 'UTC fields', expected: null, actual: [actual.opened_at_utc, actual.closed_at_utc] });
    });
    if (imported.length !== prepared.length || mismatches.length) throw new Error(`Pre-commit reconciliation failed: rows=${imported.length}/${prepared.length}, mismatches=${mismatches.length}`);
    const [postExisting] = await connection.query(`SELECT * FROM incidents WHERE incident_ref NOT IN (${refs.map(() => '?').join(',')}) ORDER BY id`, refs);
    const postExistingHash = sha256(JSON.stringify(postExisting));
    if (postExistingHash !== preExistingHash) throw new Error('Existing production incident data changed; transaction rolled back');
    await connection.commit(); transaction = false;
    const [afterPeriods] = await connection.query("SELECT COUNT(*) AS total, SUM(date_time_opened >= '2026-01-01' AND date_time_opened < '2026-06-01') AS jan_may, SUM(date_time_opened >= '2026-08-01' AND date_time_opened < '2026-09-01') AS august, SUM(date_time_opened >= '2026-06-01' AND date_time_opened < '2026-08-01') AS jun_jul FROM incidents");
    report.summary.imported_count = imported.length; report.summary.committed = true; report.rollbackSql = makeRollbackSql(refs);
    report.impact = { ...report.impact, post_import_hash_of_existing_rows: postExistingHash, periods_after: afterPeriods[0], changes_to_existing_rows: 0 };
    report.validation.checks.push({ name: 'Source record count equals imported record count', passed: imported.length === workbook.row_count, detail: `${workbook.row_count} = ${imported.length}` }, { name: 'Exact field reconciliation passed', passed: mismatches.length === 0, detail: `${mismatches.length} mismatch(es)` }, { name: 'January–May and August production records are unchanged', passed: preExistingHash === postExistingHash, detail: 'hash comparison passed' });
    writeReport(report); console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, validation: report.validation.checks }, null, 2));
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('jun_jul_2026_production_incident_import')").catch(() => {});
    await connection.end();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
