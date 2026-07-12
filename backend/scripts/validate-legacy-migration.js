require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/database');

async function main() {
  const [tables] = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('customers', 'area', 'schema_migrations') ORDER BY table_name"
  );
  const [incidentCols] = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'incidents' AND column_name IN ('customer_id', 'area_id', 'legacy_case_number', 'product_line', 'case_owner', 'mttd_minutes') ORDER BY column_name"
  );
  const [counts] = await pool.query(
    "SELECT (SELECT COUNT(*) FROM incidents) AS incidents_count"
  );
  console.log(JSON.stringify({
    tables: tables.map((r) => r.TABLE_NAME || r.table_name),
    incidentColumns: incidentCols.map((r) => r.COLUMN_NAME || r.column_name),
    counts: counts[0]
  }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
