// Restores the most recent (or a given) database backup into a separate,
// throwaway verification database — never the live one — then compares
// per-table row counts against the live database to confirm the backup is
// complete and restorable. Exits non-zero if anything doesn't match.
//
// Usage: node scripts/verify-db-backup.js [path-to-sql-dump]
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const environmentDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(environmentDir, '.env') });
require('dotenv').config({ path: path.join(environmentDir, '.env.local'), override: true });

// Loaded after dotenv so it picks up the same mail configuration the running
// app uses. This runs as a standalone script (not through Express), so
// notifying by email is the only way to know this unattended, scheduled
// check ran at all and what it found.
const { sendCriticalIncidentEmail, configured: mailConfigured } = require('../services/emailService');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'incident_management_db';
const VERIFY_DB_NAME = DB_NAME + '_backup_verify';
const MYSQL_BIN_DIR = process.env.MYSQL_BIN_DIR || 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin';
const BACKUP_DIR = path.join(environmentDir, '..', 'MySQL Database Backup');

// The dump itself still runs on its own schedule (every 2 days, via
// backup-db-to-git.bat) — verification is a heavier operation (full restore
// + full table scan) and only needs to run on a slower cadence to confirm
// backups stay restorable. This file just remembers when it last actually
// ran, so backup-db-to-git.bat can call this script every time without
// needing its own separate schedule.
const VERIFY_INTERVAL_DAYS = Number(process.env.BACKUP_VERIFY_INTERVAL_DAYS) || 7;
const VERIFY_MARKER_FILE = path.join(BACKUP_DIR, '.last-verified');

function dueForVerification() {
  if (process.argv.includes('--force')) return true;
  if (!fs.existsSync(VERIFY_MARKER_FILE)) return true;
  const lastRun = new Date(fs.readFileSync(VERIFY_MARKER_FILE, 'utf8').trim());
  if (Number.isNaN(lastRun.getTime())) return true;
  const daysSince = (Date.now() - lastRun.getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= VERIFY_INTERVAL_DAYS;
}

function recordVerificationRan() {
  fs.writeFileSync(VERIFY_MARKER_FILE, new Date().toISOString());
}

function findLatestBackupFile() {
  // mysql_backup.bat only compresses to .zip when 7z is installed (not the
  // case on this server today); if that ever changes, this will need to
  // extract the archive first rather than looking only for a raw .sql file.
  const candidates = fs.readdirSync(BACKUP_DIR)
    .filter((name) => /\.sql$/i.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }));
  if (!candidates.length) throw new Error('No .sql backup files found in "' + BACKUP_DIR + '"');
  candidates.sort((a, b) => b.mtime - a.mtime);
  return path.join(BACKUP_DIR, candidates[0].name);
}

function restoreDumpIntoDatabase(dumpFile, targetDb) {
  const mysqlExe = path.join(MYSQL_BIN_DIR, 'mysql.exe');
  const sql = fs.readFileSync(dumpFile, 'utf8');
  execFileSync(mysqlExe, ['-u' + DB_USER, '-p' + DB_PASSWORD, '-h', DB_HOST, '-P', String(DB_PORT), targetDb], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    maxBuffer: 1024 * 1024 * 64
  });
}

async function notifyVerificationResult(dumpFile, allMatch, results) {
  // Dedicated recipient list for backup-verification emails, separate from
  // MAIL_TO (the general incident-notification recipient) so changing one
  // never affects the other. Falls back to MAIL_TO if not set.
  const to = process.env.BACKUP_VERIFY_MAIL_TO || process.env.MAIL_TO;
  const from = process.env.MAIL_FROM;
  if (!mailConfigured() || !to || !from) {
    console.log('Mail is not configured (MAIL_ENABLED/BACKUP_VERIFY_MAIL_TO or MAIL_TO/MAIL_FROM) — skipping the verification email.');
    return;
  }
  const rowsHtml = results.map((r) => (
    '<tr' + (r.match === 'MISMATCH' ? ' style="background:#fdecea"' : '') + '>'
    + '<td style="padding:4px 10px;border:1px solid #ddd">' + r.table + '</td>'
    + '<td style="padding:4px 10px;border:1px solid #ddd;text-align:right">' + r.live + '</td>'
    + '<td style="padding:4px 10px;border:1px solid #ddd;text-align:right">' + r.backup + '</td>'
    + '<td style="padding:4px 10px;border:1px solid #ddd;text-align:center">' + r.match + '</td>'
    + '</tr>'
  )).join('');
  const html = '<p>Database backup verification ' + (allMatch ? 'PASSED' : 'FAILED') + ' for:<br><code>' + dumpFile + '</code></p>'
    + '<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px">'
    + '<tr style="background:#f0f0f0"><th style="padding:4px 10px;border:1px solid #ddd">Table</th><th style="padding:4px 10px;border:1px solid #ddd">Live rows</th><th style="padding:4px 10px;border:1px solid #ddd">Backup rows</th><th style="padding:4px 10px;border:1px solid #ddd">Result</th></tr>'
    + rowsHtml + '</table>';
  try {
    await sendCriticalIncidentEmail({
      from,
      to,
      subject: 'Database Backup Verification ' + (allMatch ? 'PASSED' : 'FAILED') + ' — ' + new Date().toDateString(),
      html
    });
    console.log('Verification result email sent to ' + to);
  } catch (error) {
    console.error('Could not send the verification result email:', error.message);
  }
}

async function main() {
  if (!dueForVerification()) {
    console.log('Skipping verification — last run was less than ' + VERIFY_INTERVAL_DAYS + ' day(s) ago. Pass --force to run anyway.');
    return;
  }

  const positionalArg = process.argv.slice(2).find((arg) => arg !== '--force');
  const dumpFile = positionalArg ? path.resolve(positionalArg) : findLatestBackupFile();
  if (!fs.existsSync(dumpFile)) throw new Error('Backup file not found: ' + dumpFile);
  console.log('Verifying backup file: ' + dumpFile);

  const adminConnection = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD });
  try {
    await adminConnection.query('DROP DATABASE IF EXISTS `' + VERIFY_DB_NAME + '`');
    await adminConnection.query('CREATE DATABASE `' + VERIFY_DB_NAME + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  } finally {
    await adminConnection.end();
  }

  console.log('Restoring dump into throwaway database "' + VERIFY_DB_NAME + '"...');
  restoreDumpIntoDatabase(dumpFile, VERIFY_DB_NAME);

  const liveConnection = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  const verifyConnection = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: VERIFY_DB_NAME });

  let allMatch = true;
  const results = [];
  try {
    const [liveTables] = await liveConnection.query('SHOW TABLES');
    const tableNames = liveTables.map((row) => Object.values(row)[0]);

    for (const table of tableNames) {
      const [[liveCountRow]] = await liveConnection.query('SELECT COUNT(*) AS c FROM `' + table + '`');
      let backupCount = null;
      try {
        const [[backupCountRow]] = await verifyConnection.query('SELECT COUNT(*) AS c FROM `' + table + '`');
        backupCount = Number(backupCountRow.c);
      } catch (error) {
        backupCount = null; // table missing from the restored backup
      }
      const liveCount = Number(liveCountRow.c);
      const match = backupCount !== null && backupCount === liveCount;
      if (!match) allMatch = false;
      results.push({ table, live: liveCount, backup: backupCount === null ? 'MISSING' : backupCount, match: match ? 'OK' : 'MISMATCH' });
    }
  } finally {
    await liveConnection.end();
    await verifyConnection.end();
  }

  console.table(results);

  const cleanupConnection = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD });
  try {
    await cleanupConnection.query('DROP DATABASE IF EXISTS `' + VERIFY_DB_NAME + '`');
  } finally {
    await cleanupConnection.end();
  }

  await notifyVerificationResult(dumpFile, allMatch, results);
  recordVerificationRan();

  if (!allMatch) {
    console.error('BACKUP VERIFICATION FAILED: one or more tables do not match the live database.');
    process.exit(1);
  }
  console.log('BACKUP VERIFICATION PASSED: every table in the backup matches the live database row-for-row.');
}

main().catch((error) => {
  console.error('Backup verification error:', error.message);
  process.exit(1);
});
