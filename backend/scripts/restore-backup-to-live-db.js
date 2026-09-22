// DISASTER RECOVERY ONLY: restores a backup DIRECTLY into the live
// database, overwriting its current contents. Anything created or changed
// after the backup was taken will be lost by this restore.
//
// Deliberately NOT a one-click tool (unlike the review instance scripts) —
// this is destructive to production, so it requires you to explicitly type
// the real database name to proceed. It always takes a fresh safety backup
// of the CURRENT live database first, so a wrong or mistaken restore can
// still be undone by restoring that safety file back.
//
// Usage:
//   node scripts/restore-backup-to-live-db.js --confirm=<live-db-name> [path-to-sql-dump]
//
// --confirm must exactly match the configured DB_NAME (from backend/.env),
// e.g. --confirm=incident_management_db. Without it, nothing happens.
// If no dump path is given, the most recent file in "MySQL Database
// Backup\" is used.
//
// After this finishes, restart the backend — it may be holding stale
// connections/state from before the restore.
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const environmentDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(environmentDir, '.env') });
require('dotenv').config({ path: path.join(environmentDir, '.env.local'), override: true });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'incident_management_db';
const MYSQL_BIN_DIR = process.env.MYSQL_BIN_DIR || 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin';
const BACKUP_DIR = path.join(environmentDir, '..', 'MySQL Database Backup');
const SAFETY_DIR = path.join(BACKUP_DIR, 'pre-restore-safety');

function findLatestBackupFile() {
  const candidates = fs.readdirSync(BACKUP_DIR)
    .filter((name) => /\.sql$/i.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }));
  if (!candidates.length) throw new Error('No .sql backup files found in "' + BACKUP_DIR + '"');
  candidates.sort((a, b) => b.mtime - a.mtime);
  return path.join(BACKUP_DIR, candidates[0].name);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function dumpDatabase(targetDb, outFile) {
  const mysqldumpExe = path.join(MYSQL_BIN_DIR, 'mysqldump.exe');
  const sql = execFileSync(mysqldumpExe, ['-u' + DB_USER, '-p' + DB_PASSWORD, '-h', DB_HOST, '-P', String(DB_PORT), targetDb], {
    maxBuffer: 1024 * 1024 * 256
  });
  fs.writeFileSync(outFile, sql);
}

// Dumps already contain "DROP TABLE IF EXISTS" + "CREATE TABLE" per table,
// so importing directly into the existing live database replaces every
// table's contents correctly without ever dropping the database itself.
function importDump(dumpFile, targetDb) {
  const mysqlExe = path.join(MYSQL_BIN_DIR, 'mysql.exe');
  const sql = fs.readFileSync(dumpFile, 'utf8');
  execFileSync(mysqlExe, ['-u' + DB_USER, '-p' + DB_PASSWORD, '-h', DB_HOST, '-P', String(DB_PORT), targetDb], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    maxBuffer: 1024 * 1024 * 64
  });
}

async function main() {
  const args = process.argv.slice(2);
  const confirmArg = args.find((a) => a.startsWith('--confirm='));
  const confirmValue = confirmArg ? confirmArg.slice('--confirm='.length) : null;
  const positionalArg = args.find((a) => !a.startsWith('--'));

  if (confirmValue !== DB_NAME) {
    console.error('REFUSED: this restores directly into the LIVE database "' + DB_NAME + '", overwriting its current contents.');
    console.error('Re-run with --confirm=' + DB_NAME + ' to proceed. Nothing has been changed.');
    process.exit(1);
  }

  const dumpFile = positionalArg ? path.resolve(positionalArg) : findLatestBackupFile();
  if (!fs.existsSync(dumpFile)) throw new Error('Backup file not found: ' + dumpFile);

  if (!fs.existsSync(SAFETY_DIR)) fs.mkdirSync(SAFETY_DIR, { recursive: true });
  const safetyFile = path.join(SAFETY_DIR, DB_NAME + '_pre-restore-safety_' + timestamp() + '.sql');

  console.log('Step 1/2: Taking a safety backup of the CURRENT live database before restoring...');
  dumpDatabase(DB_NAME, safetyFile);
  console.log('Safety backup saved: ' + safetyFile);
  console.log('If this restore turns out to be wrong, that file holds today\'s pre-restore state and can be restored the same way.');

  console.log('Step 2/2: Restoring "' + dumpFile + '" into LIVE database "' + DB_NAME + '"...');
  importDump(dumpFile, DB_NAME);

  console.log('Live database restore complete.');
  console.log('IMPORTANT: restart the backend now — it may be holding stale connections/state from before the restore.');
}

main().catch((error) => {
  console.error('Live restore error:', error.message);
  process.exit(1);
});
