'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

function splitSql(sql) {
  const withoutLineComments = sql
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function executeSql(connection, sql) {
  for (const statement of splitSql(sql)) {
    await connection.query(statement);
  }
}

async function main() {
  const testDatabase = `incident_normalization_rollback_test_${process.pid}`;
  assert(/^incident_normalization_rollback_test_\d+$/.test(testDatabase),
    'Refusing to use an unexpected disposable database name.');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false
  });

  try {
    const baselinePath = path.join(__dirname, '..', 'sql', 'schema.production.sql');
    const rollbackPath = path.join(__dirname, '..', 'sql', 'rollback',
      '005_incident_canonical_normalization.rollback.sql');
    const baseline = fs.readFileSync(baselinePath, 'utf8')
      .replaceAll('incident_management_db', testDatabase);
    const rollback = fs.readFileSync(rollbackPath, 'utf8')
      .replaceAll('incident_management_db', testDatabase);

    await executeSql(connection, baseline);
    await executeSql(connection, rollback);

    const [canonicalColumns] = await connection.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ?
          AND table_name = 'incidents'
          AND column_name IN
              ('opened_at_utc', 'closed_at_utc', 'source_timezone', 'sla_minutes', 'mttr_minutes')`,
      [testDatabase]
    );
    const [legacyColumns] = await connection.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ?
          AND table_name = 'incidents'
          AND column_name IN
              ('customer', 'area', 'start_dt', 'end_dt', 'downtime_hours',
               'downtime_minutes', 'downtime_mins', 'mttd_minutes', 'mttr_str',
               'legacy_month', 'legacy_source', 'legacy_raw', 'internal_status', 'project_area')`,
      [testDatabase]
    );
    const [[archiveTable]] = await connection.query(
      `SELECT COUNT(*) AS count
         FROM information_schema.tables
        WHERE table_schema = ?
          AND table_name = 'incident_legacy_metadata'`,
      [testDatabase]
    );

    assert(canonicalColumns.length === 0, 'Rollback left canonical columns behind.');
    assert(legacyColumns.length === 14, 'Rollback removed or altered an existing compatibility column.');
    assert(Number(archiveTable.count) === 0, 'Rollback left the migration archive table behind.');

    console.log(JSON.stringify({
      passed: true,
      disposable_database: testDatabase,
      verified: [
        'production baseline creates successfully',
        'rollback executes successfully',
        'migration 005 additions are removed',
        'all sampled pre-existing compatibility fields remain'
      ]
    }, null, 2));
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
