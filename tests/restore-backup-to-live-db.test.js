'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'backend', 'scripts', 'restore-backup-to-live-db.js'), 'utf8');

test('refuses to run unless --confirm exactly matches the configured live DB_NAME', () => {
  assert.match(script, /if \(confirmValue !== DB_NAME\) \{/);
  assert.match(script, /console\.error\('REFUSED: this restores directly into the LIVE database/);
  assert.match(script, /process\.exit\(1\);/);
});

test('always takes a fresh safety backup of the current live database before restoring anything', () => {
  const safetyIndex = script.indexOf('dumpDatabase(DB_NAME, safetyFile);');
  const importIndex = script.indexOf('importDump(dumpFile, DB_NAME);');
  assert.ok(safetyIndex > -1, 'safety backup call is present');
  assert.ok(importIndex > -1, 'import call is present');
  assert.ok(safetyIndex < importIndex, 'safety backup must run before the destructive import');
});

test('the safety backup is stored separately from routine backups, clearly labeled', () => {
  assert.match(script, /const SAFETY_DIR = path\.join\(BACKUP_DIR, 'pre-restore-safety'\);/);
  assert.match(script, /DB_NAME \+ '_pre-restore-safety_' \+ timestamp\(\)/);
});

test('restores by importing the dump directly, never dropping the live database itself', () => {
  assert.doesNotMatch(script, /DROP DATABASE/);
  assert.match(script, /Dumps already contain "DROP TABLE IF EXISTS"/);
});

test('reminds the operator to restart the backend after a live restore', () => {
  assert.match(script, /restart the backend now/);
});

// A GUI MessageBox confirmation was tried first and removed: it did not
// reliably wait for a real click when shown from a -WindowStyle Hidden
// process in this environment — it resolved on its own and let a run
// proceed with nobody having confirmed anything, stopping the real
// production backend. Replaced with a visible console + typed
// confirmation (readline), which has no such ambiguity.
const interactiveScript = fs.readFileSync(path.join(root, 'backend', 'scripts', 'restore-live-interactive.js'), 'utf8');
const oneClickBat = fs.readFileSync(path.join(root, 'scripts', 'restore-live-from-latest-backup.bat'), 'utf8');

test('confirmation is a typed terminal prompt (readline), not a GUI popup', () => {
  assert.match(interactiveScript, /readline\.createInterface/);
  assert.match(interactiveScript, /Type RESTORE \(all caps\) to continue/);
});

test('the confirmation requires an exact case-sensitive match — anything else, including empty/closed input, cancels', () => {
  assert.match(interactiveScript, /if \(answer\.trim\(\) !== 'RESTORE'\) \{/);
  assert.match(interactiveScript, /console\.log\('Cancelled\. Nothing was changed\.'\);/);
});

test('the one-click .bat runs in a plain, visible console window — never wrapped in a hidden Start-Process', () => {
  assert.doesNotMatch(oneClickBat, /WindowStyle Hidden/);
  assert.doesNotMatch(oneClickBat, /Start-Process/);
  assert.match(oneClickBat, /node\.exe" scripts\\restore-live-interactive\.js/);
});

test('the interactive script resolves the confirm value dynamically from the same env config the restore script reads, never a hardcoded guess', () => {
  assert.match(interactiveScript, /const DB_NAME = process\.env\.DB_NAME \|\| 'incident_management_db';/);
  assert.match(interactiveScript, /'--confirm=' \+ DB_NAME/);
});

test('the backend is stopped before the restore call and only restarted after a successful restore, never inside the failure path', () => {
  const stopIndex = interactiveScript.indexOf('taskkill');
  const restoreCallIndex = interactiveScript.indexOf("'scripts/restore-backup-to-live-db.js'");
  const catchBlockIndex = interactiveScript.indexOf('RESTORE FAILED');
  const restartIndex = interactiveScript.indexOf('Restarting the production backend');
  assert.ok(stopIndex > -1 && stopIndex < restoreCallIndex, 'backend must be stopped before the restore call');
  assert.ok(restartIndex > catchBlockIndex, 'restart happens only after the catch/failure block, never before or inside it');
});

test('only one entry point wires the interactive script into a runnable shortcut, and it is the visible .bat', () => {
  const scriptsDir = fs.readdirSync(path.join(root, 'scripts'));
  const wired = scriptsDir.filter((f) => {
    if (f === 'restore-live-from-latest-backup.bat') return false;
    const content = fs.readFileSync(path.join(root, 'scripts', f), 'utf8');
    return content.includes('restore-live-interactive.js');
  });
  assert.deepEqual(wired, [], 'no other script should independently invoke the interactive restore entry point');
});
