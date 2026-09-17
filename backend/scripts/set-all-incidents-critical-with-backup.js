'use strict';

/*
 * Changes only incidents.severity and writes a rollback-ready JSON record
 * before committing. Run from the repository root:
 *   node backend/scripts/set-all-incidents-critical-with-backup.js
 */
const fs = require('fs/promises');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../config/database');

const BACKUP_DIRECTORY = path.join(__dirname, '..', 'backups');
const TARGET_SEVERITY = 'critical';

function backupFilename() {
  return 'incident-severity-before-critical-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
}

async function writeJson(filePath, content) {
  const temporaryPath = filePath + '.tmp';
  await fs.writeFile(temporaryPath, JSON.stringify(content, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temporaryPath, filePath);
}

async function main() {
  const connection = await pool.getConnection();
  let backupPath = null;
  try {
    if (process.argv.includes('--verify')) {
      const [totals] = await connection.query(
        `SELECT COUNT(*) AS total,
                SUM(LOWER(COALESCE(severity, '')) = ?) AS critical,
                SUM(LOWER(COALESCE(severity, '')) <> ?) AS non_critical
           FROM incidents`,
        [TARGET_SEVERITY, TARGET_SEVERITY]
      );
      console.log(JSON.stringify(totals[0]));
      if (Number(totals[0].non_critical) !== 0) throw new Error('Verification failed: not every incident is Critical.');
      return;
    }
    await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });
    await connection.beginTransaction();

    // Lock the exact records being changed so the backup and update describe
    // the same original values even while the portal is in use.
    const [incidents] = await connection.query(
      `SELECT id, incident_ref, severity
         FROM incidents
        WHERE LOWER(COALESCE(severity, '')) <> ?
        ORDER BY id
        FOR UPDATE`,
      [TARGET_SEVERITY]
    );

    if (!incidents.length) {
      await connection.commit();
      console.log('No severity changes required; every incident is already Critical.');
      return;
    }

    const backup = {
      format: 'incident-severity-rollback-v1',
      status: 'prepared',
      created_at_utc: new Date().toISOString(),
      target_severity: 'critical',
      changed_count: incidents.length,
      incidents: incidents.map((incident) => ({
        database_id: incident.id,
        incident_identifier: incident.incident_ref,
        original_severity: incident.severity
      }))
    };
    backupPath = path.join(BACKUP_DIRECTORY, backupFilename());
    await writeJson(backupPath, backup);

    const ids = incidents.map((incident) => incident.id);
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await connection.query(
      `UPDATE incidents
          SET severity = ?
        WHERE id IN (${placeholders})
          AND LOWER(COALESCE(severity, '')) <> ?`,
      [TARGET_SEVERITY, ...ids, TARGET_SEVERITY]
    );
    if (result.affectedRows !== incidents.length) {
      throw new Error(`Safety check failed: backed up ${incidents.length} incidents but updated ${result.affectedRows}.`);
    }

    await connection.commit();
    backup.status = 'applied';
    backup.applied_at_utc = new Date().toISOString();
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2) + '\n', 'utf8');
    console.log(`Changed ${incidents.length} incident severities to Critical.`);
    console.log(`Rollback record: ${backupPath}`);
  } catch (error) {
    await connection.rollback();
    if (backupPath) console.error(`No changes were committed. A prepared rollback record remains at: ${backupPath}`);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
