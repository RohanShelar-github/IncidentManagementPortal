// Interactive one-click-shortcut entry point for the disaster-recovery
// restore. Runs in a VISIBLE console window (never hidden) and requires
// you to actually type a confirmation phrase before doing anything.
//
// A GUI popup was tried first and removed: MessageBox.Show() from a
// -WindowStyle Hidden process did not reliably wait for a real click in
// this environment — it resolved on its own and let a run proceed
// unattended, which is exactly the failure this safeguard exists to
// prevent. A typed confirmation read from the terminal has no such
// ambiguity: without a real keystroke, execution cannot continue.
'use strict';

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execFileSync, spawn } = require('child_process');

const environmentDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(environmentDir, '.env') });
require('dotenv').config({ path: path.join(environmentDir, '.env.local'), override: true });

const DB_NAME = process.env.DB_NAME || 'incident_management_db';
const NODE_EXE = 'C:\\Program Files\\nodejs\\node.exe';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

function isPortListening(port) {
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    return out.split('\n').some((line) => line.includes(':' + port) && /LISTENING/i.test(line));
  } catch (e) { return false; }
}

function findPidOnPort(port) {
  const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.includes(':' + port) && /LISTENING/i.test(l));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  return parts[parts.length - 1];
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = require('http').get('http://127.0.0.1:' + port + '/api/health', (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log('==============================================================');
  console.log('  DISASTER RECOVERY: Restore latest backup into LIVE database');
  console.log('==============================================================');
  console.log('');
  console.log('Target database : ' + DB_NAME);
  console.log('');
  console.log('This will OVERWRITE the LIVE production database with the most');
  console.log('recent backup. A safety backup of the CURRENT live data will be');
  console.log('taken first and can be restored the same way if this turns out');
  console.log('to be a mistake — but any data created or changed since the');
  console.log('backup being restored was taken will be LOST from the live');
  console.log('database. The backend will be stopped during the restore and');
  console.log('restarted afterward.');
  console.log('');

  const answer = await ask('Type RESTORE (all caps) to continue, or anything else to cancel: ');
  if (answer.trim() !== 'RESTORE') {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  console.log('');
  console.log('Confirmed. Proceeding...');
  console.log('');

  const prodPid = findPidOnPort(4000);
  if (prodPid) {
    console.log('Stopping production backend (PID ' + prodPid + ')...');
    execFileSync('taskkill', ['/PID', prodPid, '/F'], { stdio: 'ignore' });
    const deadline = Date.now() + 15000;
    while (isPortListening(4000) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } else {
    console.log('Production backend was not running.');
  }

  console.log('Running the confirmed, safety-backup-first restore...');
  try {
    execFileSync(NODE_EXE, ['scripts/restore-backup-to-live-db.js', '--confirm=' + DB_NAME], {
      cwd: environmentDir,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('');
    console.error('RESTORE FAILED. The backend was left stopped so you can investigate before bringing it back up.');
    console.error(String(error.message || error));
    await ask('Press Enter to close this window.');
    process.exit(1);
  }

  console.log('');
  console.log('Restore succeeded. Restarting the production backend...');
  const logDir = 'C:\\ProgramData\\AOCIncident';
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const outFd = fs.openSync(path.join(logDir, 'portal.log'), 'a');
  const errFd = fs.openSync(path.join(logDir, 'portal.log'), 'a');
  const child = spawn(NODE_EXE, ['server.js'], {
    cwd: environmentDir,
    detached: true,
    stdio: ['ignore', outFd, errFd]
  });
  child.unref();

  const up = await waitForHealth(4000, 60000);
  console.log('');
  if (up) {
    console.log('SUCCESS: live database restored and the backend is back up and healthy.');
  } else {
    console.log('WARNING: restore succeeded, but the backend did not come back up healthy within 60 seconds.');
    console.log('Check C:\\ProgramData\\AOCIncident\\portal.log');
  }

  await ask('Press Enter to close this window.');
}

main().catch(async (error) => {
  console.error('Unexpected error:', error.message || error);
  await ask('Press Enter to close this window.');
  process.exit(1);
});
