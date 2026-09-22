// Restores the most recent (or a given) database backup into a persistent
// review database — never the live one. Unlike verify-db-backup.js's
// throwaway verification database, this one is NOT dropped afterward: the
// review instance (scripts/start-review-instance.bat backup) stays pointed
// at it so its data can be browsed through the actual application UI.
//
// Usage: node scripts/restore-backup-to-review-db.js [path-to-sql-dump]
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const environmentDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(environmentDir, '.env') });
require('dotenv').config({ path: path.join(environmentDir, '.env.local'), override: true });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LIVE_DB_NAME = process.env.LIVE_DB_NAME || process.env.DB_NAME || 'incident_management_db';
const REVIEW_DB_NAME = process.env.REVIEW_DB_NAME || (LIVE_DB_NAME + '_review');
const MYSQL_BIN_DIR = process.env.MYSQL_BIN_DIR || 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin';
const BACKUP_DIR = path.join(environmentDir, '..', 'MySQL Database Backup');

function findLatestBackupFile() {
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

async function main() {
  const positionalArg = process.argv[2];
  const dumpFile = positionalArg ? path.resolve(positionalArg) : findLatestBackupFile();
  if (!fs.existsSync(dumpFile)) throw new Error('Backup file not found: ' + dumpFile);
  console.log('Restoring "' + dumpFile + '" into review database "' + REVIEW_DB_NAME + '"...');

  const adminConnection = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD });
  try {
    await adminConnection.query('DROP DATABASE IF EXISTS `' + REVIEW_DB_NAME + '`');
    await adminConnection.query('CREATE DATABASE `' + REVIEW_DB_NAME + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  } finally {
    await adminConnection.end();
  }

  restoreDumpIntoDatabase(dumpFile, REVIEW_DB_NAME);
  console.log('Review database "' + REVIEW_DB_NAME + '" is ready, restored from ' + path.basename(dumpFile) + '.');
}

main().catch((error) => {
  console.error('Restore-to-review error:', error.message);
  process.exit(1);
});
