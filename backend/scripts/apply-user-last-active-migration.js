/* Add user last-activity storage to the configured database. */
require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });

const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'incident_management_db'
  });
  try {
    const [columns] = await connection.execute(`
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'last_active_at'
       LIMIT 1
    `);
    if (!columns.length) await connection.query('ALTER TABLE users ADD COLUMN last_active_at DATETIME NULL AFTER is_active');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await connection.execute('INSERT INTO schema_migrations(version) VALUES(?) ON DUPLICATE KEY UPDATE applied_at=applied_at', ['035_user_last_active']);
    console.log('User last-active migration applied.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('User last-active migration failed:', error.message);
  process.exitCode = 1;
});
