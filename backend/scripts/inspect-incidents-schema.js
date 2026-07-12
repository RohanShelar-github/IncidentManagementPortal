require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/database');

async function main() {
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
    ['incidents']
  );
  console.log(JSON.stringify(cols, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});