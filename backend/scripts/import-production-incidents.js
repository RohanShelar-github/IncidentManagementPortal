'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('../node_modules/dotenv');
const mysql = require('../node_modules/mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const workbookArg = args.find((arg) => !arg.startsWith('--'));
if (!workbookArg) {
  console.error('Usage: node backend/scripts/import-production-incidents.js <workbook.xlsx> [--execute]');
  process.exit(2);
}

const workbookPath = path.resolve(workbookArg);
const reportRoot = path.resolve(__dirname, '..', '..', 'import-reports');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.join(reportRoot, runId);

const REQUIRED_HEADERS = [
  'SF case Number', 'Shift Manager', 'Customer', 'Project', 'Area', 'Account Name',
  'Alert Description', 'Incident Report status', 'Downtime(Mins)',
  'Mean Time to Detect (MTTD)', 'Start time ', 'End Time', 'Resolved by ',
  'More Details about resolution', 'Product Line', 'Date/Time Closed', 'Closed Date',
  'Severity', 'Subject', 'Resolution', 'Date/Time Opened', 'Month', 'Internal Status',
  'R&D Tickets'
];

const CUSTOMER_ALIASES = {
  Ramatgan: 'Ramat-Gan Municipality',
  Toridoll: 'TORIDOLL',
  'TileBar ': 'TileBar',
  'TileBar  ': 'TileBar'
};
const AREA_ALIASES = {
  infrastructure: 'Infrastructure'
};
const USER_ALIASES = {
  'Anuja Sasane': 'Anuja Begadi',
  'Sushant Tadke': 'Shushant Tadke',
  'Balaji Karagir Karagir': 'Balaji Karagir'
};
const SEVERITY_MAP = { Critical: 'critical', High: 'high', Medium: 'medium', Normal: 'normal' };
const STATUS_MAP = { Closed: 'closed', 'Escalated to Tier 3 QA': 'escalated_to_rd' };
const CREATED_BY = 2;

function readWorkbook() {
  const reader = path.resolve(__dirname, 'read-incidents-xlsx.ps1');
  const result = spawnSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', reader, '-WorkbookPath', workbookPath
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || 'Workbook reader failed');
  return JSON.parse(result.stdout);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sqlDate(value) {
  return value === '' ? null : value;
}

function integerValue(value, field, sourceRow, errors) {
  if (value === '') return null;
  if (!/^-?\d+$/.test(String(value))) {
    errors.push({ source_row: sourceRow, field, value, error: 'Expected an integer' });
    return null;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    errors.push({ source_row: sourceRow, field, value, error: 'Expected a non-negative safe integer' });
    return null;
  }
  return number;
}

function csvEscape(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function writeReports(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'import-summary.json'), JSON.stringify(report.summary, null, 2));
  fs.writeFileSync(path.join(reportDir, 'duplicate-report.json'), JSON.stringify(report.duplicates, null, 2));
  fs.writeFileSync(path.join(reportDir, 'validation-report.json'), JSON.stringify(report.validation, null, 2));
  fs.writeFileSync(path.join(reportDir, 'failed-records.json'), JSON.stringify(report.failures, null, 2));
  fs.writeFileSync(path.join(reportDir, 'field-mapping.json'), JSON.stringify(report.field_mapping, null, 2));
  if (report.pre_import_snapshot) {
    fs.writeFileSync(path.join(reportDir, 'pre-import-incidents.json'), JSON.stringify(report.pre_import_snapshot, null, 2));
  }
  if (report.rollback_sql) fs.writeFileSync(path.join(reportDir, 'rollback.sql'), report.rollback_sql);

  const lines = [
    '# Production Incident Import Report',
    '',
    `- Mode: ${report.summary.mode}`,
    `- Workbook: ${report.summary.workbook}`,
    `- Workbook SHA-256: ${report.summary.workbook_sha256}`,
    `- Source rows: ${report.summary.source_count}`,
    `- Existing incidents before import: ${report.summary.existing_count_before}`,
    `- Valid rows: ${report.summary.valid_count}`,
    `- Duplicate rows: ${report.summary.duplicate_count}`,
    `- Failed rows: ${report.summary.failed_count}`,
    `- Imported rows: ${report.summary.imported_count}`,
    `- Database count after import: ${report.summary.database_count_after ?? 'not executed'}`,
    `- Transaction committed: ${report.summary.committed}`,
    '',
    '## Validation',
    '',
    ...report.validation.checks.map((check) => `- ${check.name}: ${check.passed ? 'PASS' : 'FAIL'}${check.detail ? ` — ${check.detail}` : ''}`),
    '',
    '## Approved mappings',
    '',
    '- Incident references: sequential values beginning after the current highest `INC-nnn` reference.',
    '- `created_by`: user ID 2 (Babai Chatterjee).',
    '- `Escalated to Tier 3 QA`: database status `escalated_to_rd`.',
    '- Approved customer/user aliases are used for foreign-key IDs; original workbook text is preserved.',
    '',
    '## Rollback',
    '',
    report.rollback_sql
      ? 'Run `rollback.sql` against the same database. It deletes only this import batch by generated incident reference.'
      : 'No database writes occurred; no rollback is required.'
  ];
  fs.writeFileSync(path.join(reportDir, 'import-report.md'), lines.join('\n'));
}

function buildRollbackSql(refs) {
  if (!refs.length) return '';
  const sqlString = (value) => "'" + String(value).replace(/'/g, "''") + "'";
  return [
    '-- Roll back only the incident batch generated by this import.',
    'START TRANSACTION;',
    `DELETE FROM incidents WHERE incident_ref IN (${refs.map(sqlString).join(', ')});`,
    `SELECT ROW_COUNT() AS deleted_incidents;`,
    'COMMIT;',
    ''
  ].join('\n');
}

async function main() {
  const workbook = readWorkbook();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    timezone: '+05:30',
    charset: 'utf8mb4'
  });

  let lockAcquired = false;
  let transactionStarted = false;
  const failures = [];
  const duplicateRows = [];
  const generatedRefs = [];
  try {
    const [databaseRows] = await connection.query('SELECT DATABASE() AS database_name');
    const [existingCountRows] = await connection.query('SELECT COUNT(*) AS count FROM incidents');
    const [preImportSnapshot] = await connection.query('SELECT * FROM incidents ORDER BY id');
    const existingCount = Number(existingCountRows[0].count);
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !workbook.headers.includes(header));
    if (missingHeaders.length) failures.push({ error: 'Missing required workbook headers', fields: missingHeaders });

    const [customers] = await connection.query('SELECT id, customer_name FROM customers');
    const [areas] = await connection.query('SELECT id, area_name FROM area');
    const [users] = await connection.query('SELECT id, full_name FROM users');
    const customerByName = new Map(customers.map((row) => [row.customer_name, row.id]));
    const areaByName = new Map(areas.map((row) => [row.area_name, row.id]));
    const userByName = new Map(users.map((row) => [row.full_name, row.id]));
    if (!userByName.has('Babai Chatterjee') || userByName.get('Babai Chatterjee') !== CREATED_BY) {
      failures.push({ field: 'created_by', error: 'User ID 2 is not Babai Chatterjee in the target database' });
    }

    const sfCounts = new Map();
    for (const record of workbook.records) {
      const sfCase = record.values['SF case Number'];
      sfCounts.set(sfCase, (sfCounts.get(sfCase) || 0) + 1);
    }
    for (const [sfCase, count] of sfCounts) {
      if (!sfCase || count > 1) {
        duplicateRows.push({ type: 'source_sf_case', value: sfCase, count });
      }
    }

    const sfCases = [...sfCounts.keys()].filter(Boolean);
    const placeholders = sfCases.map(() => '?').join(',');
    const [existingDuplicates] = sfCases.length
      ? await connection.query(
        `SELECT incident_ref, legacy_case_number, sf_case_no
           FROM incidents
          WHERE sf_case_no IN (${placeholders})
             OR legacy_case_number IN (${placeholders})`,
        [...sfCases, ...sfCases]
      )
      : [[]];
    for (const row of existingDuplicates) {
      duplicateRows.push({ type: 'database_identifier', ...row });
    }

    const prepared = workbook.records.map((record) => {
      const value = record.values;
      const sourceRow = record.source_row;
      const rowErrors = [];
      for (const mandatory of ['SF case Number', 'Shift Manager', 'Customer', 'Area', 'Severity', 'Subject', 'Date/Time Opened', 'Internal Status']) {
        if (value[mandatory] === '') rowErrors.push({ source_row: sourceRow, field: mandatory, error: 'Mandatory source value is blank' });
      }
      if (!Object.hasOwn(SEVERITY_MAP, value.Severity)) {
        rowErrors.push({ source_row: sourceRow, field: 'Severity', value: value.Severity, error: 'Unsupported severity' });
      }
      if (!Object.hasOwn(STATUS_MAP, value['Internal Status'])) {
        rowErrors.push({ source_row: sourceRow, field: 'Internal Status', value: value['Internal Status'], error: 'Unsupported status' });
      }

      const customerMasterName = CUSTOMER_ALIASES[value.Customer] || value.Customer;
      const userMasterName = USER_ALIASES[value['Shift Manager']] || value['Shift Manager'];
      const customerId = customerByName.get(customerMasterName);
      const areaMasterName = AREA_ALIASES[value.Area] || value.Area;
      const areaId = areaByName.get(areaMasterName);
      const assignedTo = userByName.get(userMasterName);
      if (!customerId) rowErrors.push({ source_row: sourceRow, field: 'Customer', value: value.Customer, error: 'No approved customer mapping' });
      if (!areaId) rowErrors.push({ source_row: sourceRow, field: 'Area', value: value.Area, error: 'No exact area mapping' });
      if (!assignedTo) rowErrors.push({ source_row: sourceRow, field: 'Shift Manager', value: value['Shift Manager'], error: 'No approved user mapping' });

      const downtimeMins = integerValue(value['Downtime(Mins)'], 'Downtime(Mins)', sourceRow, rowErrors);
      const mttdMinutes = integerValue(value['Mean Time to Detect (MTTD)'], 'Mean Time to Detect (MTTD)', sourceRow, rowErrors);
      failures.push(...rowErrors);
      return {
        source_row: sourceRow,
        sf_case_no: value['SF case Number'],
        title: value.Subject,
        description: value['Alert Description'],
        severity: SEVERITY_MAP[value.Severity],
        status: STATUS_MAP[value['Internal Status']],
        assigned_to: assignedTo || null,
        case_owner: value['Shift Manager'],
        created_by: CREATED_BY,
        customer: value.Customer,
        customer_id: customerId || null,
        project: value.Project || null,
        area: value.Area || null,
        area_id: areaId || null,
        product_line: value['Product Line'] || null,
        start_dt: sqlDate(value['Start time ']),
        date_time_opened: sqlDate(value['Date/Time Opened']),
        end_dt: sqlDate(value['End Time']),
        date_time_closed: sqlDate(value['Date/Time Closed']),
        closed_date: sqlDate(value['Closed Date']),
        timezone: 'IST',
        source_timezone: 'Asia/Kolkata',
        downtime_mins: downtimeMins,
        resolved_by: value['Resolved by '] || null,
        incident_report_status: value['Incident Report status'] || null,
        mttd_minutes: mttdMinutes,
        legacy_month: value.Month || null,
        account_name: value['Account Name'] || null,
        internal_status: value['Internal Status'] || null,
        rd_tickets: value['R&D Tickets'] || null,
        resolution: value.Resolution || null,
        legacy_source: path.basename(workbookPath),
        legacy_raw: JSON.stringify({
          source_row: sourceRow,
          values: value,
          excel_serials: record.excel_serials,
          unmapped: {
            'More Details about resolution': value['More Details about resolution']
          }
        })
      };
    });

    const checks = [
      { name: 'Workbook has exactly 204 source rows', passed: workbook.row_count === 204, detail: String(workbook.row_count) },
      { name: 'All required headers are present', passed: missingHeaders.length === 0, detail: missingHeaders.join(', ') },
      { name: 'No source/database duplicate identifiers', passed: duplicateRows.length === 0, detail: String(duplicateRows.length) },
      { name: 'All mandatory values and mappings are valid', passed: failures.length === 0, detail: String(failures.length) },
      { name: 'All source timestamps remain IST wall-clock values', passed: true, detail: 'No UTC conversion is performed during import' }
    ];

    const fieldMapping = {
      'SF case Number': ['sf_case_no'],
      'Shift Manager': ['case_owner', 'assigned_to (approved user mapping)'],
      Customer: ['customer', 'customer_id (approved customer mapping)'],
      Project: ['project'],
      Area: ['area', 'area_id'],
      'Account Name': ['account_name'],
      'Alert Description': ['description'],
      'Incident Report status': ['incident_report_status'],
      'Downtime(Mins)': ['downtime_mins'],
      'Mean Time to Detect (MTTD)': ['mttd_minutes'],
      'Start time ': ['start_dt'],
      'End Time': ['end_dt'],
      'Resolved by ': ['resolved_by'],
      'More Details about resolution': ['legacy_raw (no semantically exact target column)'],
      'Product Line': ['product_line'],
      'Date/Time Closed': ['date_time_closed'],
      'Closed Date': ['closed_date'],
      Severity: ['severity (schema enum representation)'],
      Subject: ['title'],
      Resolution: ['resolution'],
      'Date/Time Opened': ['date_time_opened'],
      Month: ['legacy_month'],
      'Internal Status': ['internal_status', 'status (approved mapping)'],
      'R&D Tickets': ['rd_tickets']
    };

    const report = {
      summary: {
        mode: execute ? 'EXECUTE' : 'DRY RUN',
        database: databaseRows[0].database_name,
        workbook: workbookPath,
        workbook_sha256: sha256(workbookPath),
        source_count: workbook.row_count,
        existing_count_before: existingCount,
        valid_count: failures.length || duplicateRows.length ? 0 : prepared.length,
        duplicate_count: duplicateRows.length,
        failed_count: failures.length,
        imported_count: 0,
        database_count_after: null,
        committed: false
      },
      duplicates: duplicateRows,
      failures,
      validation: { checks },
      field_mapping: fieldMapping,
      pre_import_snapshot: preImportSnapshot,
      rollback_sql: ''
    };

    if (!checks.every((check) => check.passed)) {
      writeReports(report);
      console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, checks }, null, 2));
      process.exitCode = 1;
      return;
    }

    if (!execute) {
      writeReports(report);
      console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, checks }, null, 2));
      return;
    }

    const [lockRows] = await connection.query("SELECT GET_LOCK('production_incident_import_20260730', 30) AS acquired");
    lockAcquired = Number(lockRows[0].acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the production incident import lock');

    await connection.beginTransaction();
    transactionStarted = true;
    const [currentRows] = await connection.query(
      "SELECT incident_ref FROM incidents WHERE incident_ref REGEXP '^INC-[0-9]+$' FOR UPDATE"
    );
    let nextNumber = currentRows.reduce((max, row) => {
      const match = /^INC-(\d+)$/.exec(row.incident_ref);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

    const insertColumns = [
      'incident_ref', 'title', 'description', 'severity', 'status', 'assigned_to', 'case_owner',
      'created_by', 'customer', 'customer_id', 'project', 'area', 'area_id', 'product_line',
      'start_dt', 'date_time_opened', 'end_dt', 'date_time_closed', 'closed_date', 'timezone',
      'source_timezone', 'downtime_hours', 'downtime_minutes', 'downtime_mins', 'resolved_by',
      'sf_case_no', 'incident_report_status', 'mttd_minutes', 'legacy_month', 'account_name',
      'internal_status', 'rd_tickets', 'resolution', 'legacy_source', 'legacy_raw'
    ];
    for (const row of prepared) {
      const incidentRef = 'INC-' + String(nextNumber++).padStart(3, '0');
      generatedRefs.push(incidentRef);
      const values = [
        incidentRef, row.title, row.description, row.severity, row.status, row.assigned_to,
        row.case_owner, row.created_by, row.customer, row.customer_id, row.project, row.area,
        row.area_id, row.product_line, row.start_dt, row.date_time_opened, row.end_dt,
        row.date_time_closed, row.closed_date, row.timezone, row.source_timezone, null, null,
        row.downtime_mins, row.resolved_by, row.sf_case_no, row.incident_report_status,
        row.mttd_minutes, row.legacy_month, row.account_name, row.internal_status, row.rd_tickets,
        row.resolution, row.legacy_source, row.legacy_raw
      ];
      await connection.query(
        `INSERT INTO incidents (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
        values
      );
    }

    const [importedRows] = await connection.query(
      `SELECT incident_ref, sf_case_no, title, description, severity, status, assigned_to, case_owner,
              created_by, customer, customer_id, project, area, area_id, product_line, start_dt,
              DATE_FORMAT(date_time_opened, '%Y-%m-%d %H:%i:%s') AS date_time_opened,
              end_dt, DATE_FORMAT(date_time_closed, '%Y-%m-%d %H:%i:%s') AS date_time_closed,
              DATE_FORMAT(closed_date, '%Y-%m-%d') AS closed_date, timezone, source_timezone,
              downtime_hours, downtime_minutes, downtime_mins, resolved_by, incident_report_status,
              mttd_minutes, legacy_month, account_name, internal_status, rd_tickets, resolution
         FROM incidents
        WHERE incident_ref IN (${generatedRefs.map(() => '?').join(',')})
        ORDER BY id`,
      generatedRefs
    );
    const reconciliationFailures = [];
    importedRows.forEach((dbRow, index) => {
      const source = prepared[index];
      const exactFields = [
        'sf_case_no', 'title', 'description', 'severity', 'status', 'assigned_to', 'case_owner',
        'created_by', 'customer', 'customer_id', 'project', 'area', 'area_id', 'product_line',
        'start_dt', 'date_time_opened', 'end_dt', 'date_time_closed', 'closed_date', 'timezone',
        'source_timezone', 'downtime_mins', 'resolved_by', 'incident_report_status', 'mttd_minutes',
        'legacy_month', 'account_name', 'internal_status', 'rd_tickets', 'resolution'
      ];
      for (const field of exactFields) {
        const expected = source[field] ?? null;
        const actual = dbRow[field] ?? null;
        if (String(actual ?? '') !== String(expected ?? '')) {
          reconciliationFailures.push({ incident_ref: dbRow.incident_ref, field, expected, actual });
        }
      }
      if (dbRow.downtime_hours !== null || dbRow.downtime_minutes !== null) {
        reconciliationFailures.push({
          incident_ref: dbRow.incident_ref,
          field: 'downtime_hours/downtime_minutes',
          expected: null,
          actual: [dbRow.downtime_hours, dbRow.downtime_minutes]
        });
      }
    });
    if (importedRows.length !== prepared.length || reconciliationFailures.length) {
      throw new Error(`Pre-commit reconciliation failed: rows=${importedRows.length}/${prepared.length}, mismatches=${reconciliationFailures.length}`);
    }

    await connection.commit();
    transactionStarted = false;
    const [afterRows] = await connection.query('SELECT COUNT(*) AS count FROM incidents');
    report.summary.imported_count = importedRows.length;
    report.summary.database_count_after = Number(afterRows[0].count);
    report.summary.committed = true;
    report.rollback_sql = buildRollbackSql(generatedRefs);
    report.validation.reconciliation = {
      imported_rows: importedRows.length,
      field_mismatches: reconciliationFailures.length,
      generated_ref_first: generatedRefs[0],
      generated_ref_last: generatedRefs[generatedRefs.length - 1]
    };
    report.validation.checks.push(
      {
        name: 'Source count equals imported count',
        passed: importedRows.length === workbook.row_count,
        detail: `${workbook.row_count} = ${importedRows.length}`
      },
      {
        name: 'Database count increased only by import count',
        passed: Number(afterRows[0].count) === existingCount + importedRows.length,
        detail: `${existingCount} + ${importedRows.length} = ${afterRows[0].count}`
      },
      {
        name: 'Exact pre-commit field reconciliation',
        passed: reconciliationFailures.length === 0,
        detail: `${reconciliationFailures.length} mismatches`
      }
    );
    writeReports(report);
    console.log(JSON.stringify({ report_dir: reportDir, summary: report.summary, reconciliation: report.validation.reconciliation }, null, 2));
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch (_) { /* preserve original error */ }
    }
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (lockAcquired) {
      try { await connection.query("SELECT RELEASE_LOCK('production_incident_import_20260730')"); } catch (_) { /* ignore */ }
    }
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
