require('dotenv').config();
const pool = require('../config/database');

async function main() {
  const [roles] = await pool.query(`
    SELECT r.role_key, r.role_name, COUNT(DISTINCT rp.permission_key) AS permission_count,
           COUNT(DISTINCT u.id) AS user_count
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN users u ON u.role = r.role_key
    GROUP BY r.id ORDER BY r.id
  `);
  const [column] = await pool.query("SHOW COLUMNS FROM users LIKE 'role'");
  const [foreignKey] = await pool.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'users'
      AND constraint_name = 'fk_users_role' AND constraint_type = 'FOREIGN KEY'
  `);
  const [migration] = await pool.query(
    "SELECT version FROM schema_migrations WHERE version = '014_database_roles'"
  );
  console.log(JSON.stringify({ roles, roleColumnType: column[0] && column[0].Type,
    foreignKey: foreignKey.length === 1, migrationApplied: migration.length === 1 }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
