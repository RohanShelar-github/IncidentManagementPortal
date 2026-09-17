/* Apply the Dashboard card-permission migration to the configured database. */
require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });

const mysql = require('mysql2/promise');

const permissions = [
  ['view_dashboard_total_incidents', 'Dashboard: Total Incidents'],
  ['view_dashboard_open_active', 'Dashboard: Open / Active'],
  ['view_dashboard_resolved', 'Dashboard: Resolved'],
  ['view_dashboard_avg_resolution', 'Dashboard: Avg Resolution'],
  ['view_dashboard_total_downtime', 'Dashboard: Total Downtime'],
  ['view_dashboard_historian_downtime', 'Dashboard: Historian Downtime'],
  ['view_dashboard_sla_breach', 'Dashboard: SLA Breach Rate'],
  ['view_dashboard_missed_mttr', 'Dashboard: Missed MTTR Count'],
  ['view_dashboard_missed_mttd', 'Dashboard: Missed MTTD Count'],
  ['view_dashboard_resolution_rate', 'Dashboard: Resolution Rate']
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'incident_management_db'
  });
  try {
    await connection.beginTransaction();
    for (const [key, name] of permissions) {
      await connection.execute(
        'INSERT INTO permissions(permission_key,permission_name) VALUES(?,?) ON DUPLICATE KEY UPDATE permission_name=VALUES(permission_name)',
        [key, name]
      );
    }
    const [dashboardRoles] = await connection.query(
      'SELECT DISTINCT role_id FROM role_permissions WHERE permission_key=?',
      ['view_dashboard']
    );
    for (const role of dashboardRoles) {
      for (const [key] of permissions) {
        await connection.execute('INSERT IGNORE INTO role_permissions(role_id,permission_key) VALUES(?,?)', [role.role_id, key]);
      }
    }
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await connection.execute('INSERT INTO schema_migrations(version) VALUES(?) ON DUPLICATE KEY UPDATE applied_at=applied_at', ['034_dashboard_card_role_permissions']);
    await connection.commit();
    console.log('Dashboard card role permissions applied.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Dashboard card role-permission migration failed:', error.message);
  process.exitCode = 1;
});
