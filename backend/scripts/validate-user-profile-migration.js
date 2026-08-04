require('dotenv').config();
const pool = require('../config/database');

async function validate() {
  const [columns] = await pool.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name IN ('phone', 'department', 'location', 'bio')
      ORDER BY ordinal_position`
  );
  const [migrations] = await pool.query(
    "SELECT version FROM schema_migrations WHERE version = '013_user_profile_fields'"
  );
  const names = columns.map((row) => row.columnName);
  const expected = ['phone', 'department', 'location', 'bio'];
  const missing = expected.filter((name) => !names.includes(name));
  if (missing.length || !migrations.length) {
    throw new Error(`Profile migration validation failed; missing: ${missing.join(', ') || 'migration record'}`);
  }
  console.log(`Profile columns verified: ${names.join(', ')}`);
  console.log(`Migration verified: ${migrations[0].version}`);
}

validate()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error.message);
    await pool.end();
    process.exit(1);
  });
