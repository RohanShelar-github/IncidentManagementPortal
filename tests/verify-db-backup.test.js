'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const verifyScript = fs.readFileSync(path.join(root, 'backend', 'scripts', 'verify-db-backup.js'), 'utf8');
const backupBat = fs.readFileSync(path.join(root, 'scripts', 'backup-db-to-git.bat'), 'utf8');

test('the verification database is a separate, throwaway schema, never the live one', () => {
  assert.match(verifyScript, /const VERIFY_DB_NAME = DB_NAME \+ '_backup_verify';/);
  assert.match(verifyScript, /DROP DATABASE IF EXISTS `' \+ VERIFY_DB_NAME \+ '`/);
});

test('the script restores via the mysql CLI and never writes into the live database connection', () => {
  assert.match(verifyScript, /execFileSync\(mysqlExe, \[/);
  assert.doesNotMatch(verifyScript, /liveConnection\.query\('(INSERT|UPDATE|DELETE|DROP|ALTER)/i);
});

test('the throwaway verification database is always dropped after comparison, pass or fail', () => {
  const cleanupIndex = verifyScript.indexOf("await cleanupConnection.query('DROP DATABASE IF EXISTS `' + VERIFY_DB_NAME + '`')");
  const exitIndex = verifyScript.indexOf('process.exit(1)', verifyScript.indexOf('BACKUP VERIFICATION FAILED'));
  assert.ok(cleanupIndex > -1, 'cleanup DROP DATABASE call is present');
  assert.ok(cleanupIndex < exitIndex, 'cleanup runs before the failure exit, not after');
});

test('verification fails loudly (non-zero exit) when any table row count does not match', () => {
  assert.match(verifyScript, /if \(!allMatch\) \{/);
  assert.match(verifyScript, /console\.error\('BACKUP VERIFICATION FAILED/);
  assert.match(verifyScript, /process\.exit\(1\);/);
});

test('a missing table in the restored backup counts as a mismatch, not a silent pass', () => {
  assert.match(verifyScript, /backupCount = null; \/\/ table missing from the restored backup/);
  assert.match(verifyScript, /const match = backupCount !== null && backupCount === liveCount;/);
});

test('the backup pipeline runs verification right after the dump, before committing to git', () => {
  const dumpIndex = backupBat.indexOf('call "%REPO_DIR%\\scripts\\mysql_backup.bat"');
  const verifyIndex = backupBat.indexOf('verify-db-backup.js');
  const gitAddIndex = backupBat.indexOf('git add "MySQL Database Backup"');
  assert.ok(dumpIndex > -1 && verifyIndex > -1 && gitAddIndex > -1);
  assert.ok(dumpIndex < verifyIndex && verifyIndex < gitAddIndex, 'order must be: dump, then verify, then git add');
});

test('a failed verification does not block the backup from still being committed (a bad check should not lose a good backup)', () => {
  assert.match(backupBat, /WARNING: Backup verification failed[\s\S]{0,80}Continuing to back up the file anyway/);
});

test('every verification run emails a pass/fail result, since this runs unattended and nobody is watching the console', () => {
  assert.match(verifyScript, /require\('\.\.\/services\/emailService'\)/);
  assert.match(verifyScript, /async function notifyVerificationResult\(dumpFile, allMatch, results\) \{/);
  assert.match(verifyScript, /await notifyVerificationResult\(dumpFile, allMatch, results\);/);
  assert.match(verifyScript, /subject: 'Database Backup Verification ' \+ \(allMatch \? 'PASSED' : 'FAILED'\)/);
});

test('the notification email is sent whether mail is configured or not, without crashing the verification', () => {
  assert.match(verifyScript, /if \(!mailConfigured\(\) \|\| !to \|\| !from\) \{/);
  assert.match(verifyScript, /catch \(error\) \{\s*console\.error\('Could not send the verification result email:', error\.message\);/);
});

test('the verification email has its own recipient list, independent of the general MAIL_TO', () => {
  assert.match(verifyScript, /const to = process\.env\.BACKUP_VERIFY_MAIL_TO \|\| process\.env\.MAIL_TO;/);
});

test('verification (not the dump itself) runs on its own 7-day cadence, independent of the 2-day backup schedule', () => {
  assert.match(verifyScript, /const VERIFY_INTERVAL_DAYS = Number\(process\.env\.BACKUP_VERIFY_INTERVAL_DAYS\) \|\| 7;/);
  assert.match(verifyScript, /function dueForVerification\(\) \{/);
  assert.match(verifyScript, /const daysSince = \(Date\.now\(\) - lastRun\.getTime\(\)\) \/ \(24 \* 60 \* 60 \* 1000\);/);
  assert.match(verifyScript, /return daysSince >= VERIFY_INTERVAL_DAYS;/);
});

test('the pipeline calling verify-db-backup.js on every 2-day run is safe, because the script itself skips when not due', () => {
  assert.match(verifyScript, /if \(!dueForVerification\(\)\) \{/);
  assert.match(verifyScript, /console\.log\('Skipping verification — last run was less than ' \+ VERIFY_INTERVAL_DAYS \+ ' day\(s\) ago\. Pass --force to run anyway\.'\);/);
  assert.match(verifyScript, /return;/);
});

test('a --force flag bypasses the interval and is not mistaken for a dump file path', () => {
  assert.match(verifyScript, /if \(process\.argv\.includes\('--force'\)\) return true;/);
  assert.match(verifyScript, /const positionalArg = process\.argv\.slice\(2\)\.find\(\(arg\) => arg !== '--force'\);/);
});

test('the marker file records when verification last ran, updated after every actual run', () => {
  assert.match(verifyScript, /function recordVerificationRan\(\) \{/);
  assert.match(verifyScript, /fs\.writeFileSync\(VERIFY_MARKER_FILE, new Date\(\)\.toISOString\(\)\);/);
  assert.match(verifyScript, /recordVerificationRan\(\);/);
});
