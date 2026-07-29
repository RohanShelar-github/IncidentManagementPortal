'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function main() {
  const [checks] = await pool.query(`
    SELECT 'archive_missing' AS check_name, COUNT(*) AS mismatch_count
    FROM incidents i
    LEFT JOIN incident_legacy_metadata l ON l.incident_id = i.id
    WHERE (i.legacy_month IS NOT NULL OR i.legacy_source IS NOT NULL OR i.legacy_raw IS NOT NULL
        OR i.internal_status IS NOT NULL OR i.project_area IS NOT NULL)
      AND l.incident_id IS NULL
    UNION ALL
    SELECT 'downtime_parts', COUNT(*) FROM incidents
    WHERE downtime_mins <> COALESCE(downtime_hours, 0) * 60 + COALESCE(downtime_minutes, 0)
    UNION ALL
    SELECT 'opened_utc_missing', COUNT(*) FROM incidents
    WHERE date_time_opened IS NOT NULL AND opened_at_utc IS NULL
    UNION ALL
    SELECT 'closed_utc_missing', COUNT(*) FROM incidents
    WHERE date_time_closed IS NOT NULL AND closed_at_utc IS NULL
    UNION ALL
    SELECT 'customer_orphan', COUNT(*) FROM incidents i LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.customer_id IS NOT NULL AND c.id IS NULL
    UNION ALL
    SELECT 'customer_snapshot', COUNT(*) FROM incidents i JOIN customers c ON c.id = i.customer_id
    WHERE i.customer <> c.customer_name
    UNION ALL
    SELECT 'area_orphan', COUNT(*) FROM incidents i LEFT JOIN area a ON a.id = i.area_id
    WHERE i.area_id IS NOT NULL AND a.id IS NULL
    UNION ALL
    SELECT 'area_snapshot', COUNT(*) FROM incidents i JOIN area a ON a.id = i.area_id
    WHERE COALESCE(i.area, '') <> a.area_name
  `);
  const [counts] = await pool.query(`
    SELECT COUNT(*) AS incidents,
      SUM(opened_at_utc IS NOT NULL) AS canonical_opened,
      SUM(closed_at_utc IS NOT NULL) AS canonical_closed,
      SUM(source_timezone IS NOT NULL) AS canonical_timezones,
      (SELECT COUNT(*) FROM incident_legacy_metadata) AS archived_rows
    FROM incidents
  `);
  const report = {
    generatedAt: new Date().toISOString(),
    database: process.env.DB_NAME || 'incident_management_db',
    counts: counts[0],
    checks: Object.fromEntries(checks.map((row) => [row.check_name, Number(row.mismatch_count)]))
  };
  report.passed = Object.values(report.checks).every((value) => value === 0);

  const outputArg = process.argv.indexOf('--output');
  if (outputArg >= 0 && process.argv[outputArg + 1]) {
    const output = path.resolve(process.argv[outputArg + 1]);
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
