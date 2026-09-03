'use strict';

// Repairs canonical timestamps for existing incidents whose legacy `EST`
// timezone value now represents Eastern Time (America/New_York). The stored
// wall-clock fields remain unchanged; only their UTC representation is rebuilt.
const path = require('node:path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { localDateTimeToUtc } = require('../services/incidentNormalization');

const backendDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });
dotenv.config({ path: path.join(backendDir, '.env.local'), override: true });

const APPLY = process.argv.includes('--apply');
const MIGRATION = '031_repair_est_to_et_canonical_timestamps';

function sameSqlDate(left, right) {
  return String(left || '').replace('T', ' ').slice(0, 19) === String(right || '').replace('T', ' ').slice(0, 19);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'incident_management_db',
    dateStrings: true
  });

  try {
    const [rows] = await connection.query(
      `SELECT id, date_time_opened, start_dt, date_time_closed, end_dt,
              opened_at_utc, closed_at_utc
         FROM incidents
        WHERE UPPER(COALESCE(timezone, '')) = 'EST'
        ORDER BY id`
    );
    const repairs = rows.map((row) => ({
      id: row.id,
      openedAtUtc: localDateTimeToUtc(row.date_time_opened || row.start_dt, 'EST'),
      closedAtUtc: localDateTimeToUtc(row.date_time_closed || row.end_dt, 'EST'),
      changed: !sameSqlDate(row.opened_at_utc, localDateTimeToUtc(row.date_time_opened || row.start_dt, 'EST'))
        || !sameSqlDate(row.closed_at_utc, localDateTimeToUtc(row.date_time_closed || row.end_dt, 'EST'))
    }));
    const changed = repairs.filter((repair) => repair.changed);

    console.log(`Eastern Time repair: ${rows.length} EST incident(s) found; ${changed.length} canonical timestamp record(s) need updating.`);
    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to update the canonical UTC timestamps.');
      return;
    }

    await connection.beginTransaction();
    for (const repair of changed) {
      await connection.query(
        `UPDATE incidents
            SET opened_at_utc = COALESCE(?, opened_at_utc),
                closed_at_utc = COALESCE(?, closed_at_utc),
                source_timezone = 'America/New_York'
          WHERE id = ?`,
        [repair.openedAtUtc, repair.closedAtUtc, repair.id]
      );
    }
    await connection.query(
      `INSERT INTO schema_migrations(version) VALUES (?)
       ON DUPLICATE KEY UPDATE applied_at = applied_at`,
      [MIGRATION]
    );
    await connection.commit();
    console.log(`Applied Eastern Time repair to ${changed.length} incident(s).`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Eastern Time repair failed:', error.message);
  process.exit(1);
});
