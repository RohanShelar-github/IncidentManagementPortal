'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const startScript = fs.readFileSync(path.join(root, 'scripts', 'start-review-instance.bat'), 'utf8');
const stopScript = fs.readFileSync(path.join(root, 'scripts', 'stop-review-instance.bat'), 'utf8');
const restoreScript = fs.readFileSync(path.join(root, 'backend', 'scripts', 'restore-backup-to-review-db.js'), 'utf8');
const oneClickBackup = fs.readFileSync(path.join(root, 'scripts', 'review-start-backup-and-open.ps1'), 'utf8');
const oneClickLive = fs.readFileSync(path.join(root, 'scripts', 'review-start-live-and-open.ps1'), 'utf8');
const oneClickStop = fs.readFileSync(path.join(root, 'scripts', 'review-stop.ps1'), 'utf8');

test('the review instance runs on its own ports, separate from production (4000/5500)', () => {
  assert.match(startScript, /set PORT=4001/);
  assert.match(startScript, /set UI_PORT=5501/);
  assert.doesNotMatch(startScript, /set PORT=4000\b/);
});

test('the review instance is reachable via its own origin, distinct from the production CORS origin', () => {
  assert.match(startScript, /set CORS_ORIGIN=https:\/\/aocincident\.mse\.corp:8443/);
});

test('backup mode restores into a separate "_review" database before starting, never overwriting the live one', () => {
  assert.match(startScript, /if \/I "%MODE%"=="backup" \(/);
  assert.match(startScript, /node scripts\\restore-backup-to-review-db\.js/);
  assert.match(startScript, /set REVIEW_TARGET_DB=incident_management_db_review/);
});

test('live mode points the review instance at the real production database', () => {
  assert.match(startScript, /else if \/I "%MODE%"=="live" \(/);
  assert.match(startScript, /set REVIEW_TARGET_DB=incident_management_db\s*$/m);
});

test('a failed restore aborts startup rather than silently starting against a broken review database', () => {
  assert.match(startScript, /if %ERRORLEVEL% NEQ 0 \(\s*echo ERROR: Restore into the review database failed\. Not starting the review instance\.\s*exit \/b 1\s*\)/);
});

test('the restore script drops and recreates the review database from the latest backup, and never touches the live one', () => {
  assert.match(restoreScript, /const REVIEW_DB_NAME = process\.env\.REVIEW_DB_NAME \|\| \(LIVE_DB_NAME \+ '_review'\);/);
  assert.match(restoreScript, /DROP DATABASE IF EXISTS `' \+ REVIEW_DB_NAME \+ '`/);
  assert.doesNotMatch(restoreScript, /DROP DATABASE IF EXISTS `' \+ LIVE_DB_NAME/);
});

test('starting the review instance always stops any previous one first, so toggling live/backup is a clean restart', () => {
  assert.match(startScript, /call "%REPO_DIR%\\scripts\\stop-review-instance\.bat"/);
});

test('the stop script only targets the review instance port (4001), not the production port (4000)', () => {
  assert.match(stopScript, /findstr ":4001"/);
  assert.doesNotMatch(stopScript, /findstr ":4000"/);
});

test('the stop script waits for the port to actually free up, so a start right after never races the old process', () => {
  assert.match(stopScript, /:waitloop/);
  assert.match(stopScript, /if !WAITED! GEQ 15 \(/);
});

test('the one-click scripts launch node.exe directly, never through the .bat file — Start-Process -WindowStyle Hidden does not reliably hide a console spawned via cmd.exe running a .bat', () => {
  for (const script of [oneClickBackup, oneClickLive]) {
    assert.doesNotMatch(script, /start-review-instance\.bat/);
    assert.match(script, /Start-Process -FilePath "C:\\Program Files\\nodejs\\node\.exe" -ArgumentList "server\.js"/);
    assert.match(script, /-WindowStyle Hidden/);
  }
});

test('the one-click scripts stop any existing review instance and wait for the port to free before starting a new one', () => {
  for (const script of [oneClickBackup, oneClickLive, oneClickStop]) {
    assert.match(script, /Get-NetTCPConnection -LocalPort 4001 -State Listen/);
    assert.match(script, /Stop-Process -Id \$conn\.OwningProcess -Force/);
  }
});

test('backup mode restores before starting and aborts on failure; live mode skips the restore entirely', () => {
  assert.match(oneClickBackup, /restore-backup-to-review-db\.js/);
  assert.match(oneClickBackup, /if \(\$restoreExit -ne 0\) \{/);
  assert.doesNotMatch(oneClickLive, /restore-backup-to-review-db\.js/);
});

test('every one-click script logs its own run, so a failure is diagnosable from review-portal.log without re-running anything', () => {
  for (const script of [oneClickBackup, oneClickLive]) {
    assert.match(script, /Add-Content -Path \$logFile -Value "`n===== \$\(Get-Date\) - /);
  }
});

test('node.exe stdout/stderr are redirected to their own files, separate from the synchronous restore/stop log', () => {
  for (const script of [oneClickBackup, oneClickLive]) {
    assert.match(script, /-RedirectStandardOutput \(Join-Path \$logDir "review-portal-out\.log"\)/);
    assert.match(script, /-RedirectStandardError \(Join-Path \$logDir "review-portal-err\.log"\)/);
  }
});
