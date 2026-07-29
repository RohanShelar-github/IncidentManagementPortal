const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('session inactivity limit is exactly 20 minutes', () => {
  assert.match(frontend, /SESSION_INACTIVITY_LIMIT_MS\s*=\s*20\s*\*\s*60\s*\*\s*1000/);
});

test('authenticated user activity resets the inactivity timer', () => {
  assert.match(frontend, /function recordSessionActivity\(\)/);
  assert.match(frontend, /sessionStorage\.setItem\(SESSION_LAST_ACTIVITY_KEY/);
  assert.match(frontend, /\['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'\]/);
});

test('inactivity expiration clears authentication and returns to login', () => {
  assert.match(frontend, /function expireInactiveSession\(\)/);
  assert.match(frontend, /doLogoutConfirmed\('Your session expired after 20 minutes of inactivity/);
  assert.match(frontend, /sessionStorage\.removeItem\(SESSION_LAST_ACTIVITY_KEY\)/);
});

test('restored sessions are rejected when their inactivity period has expired', () => {
  const verifyStart = frontend.indexOf('function verifySessionAndInit()');
  const tokenLookup = frontend.indexOf('const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY)', verifyStart);
  const expiryCheck = frontend.indexOf('if (hasSessionInactivityExpired())', tokenLookup);
  const verificationFetch = frontend.indexOf("'/auth/me'", tokenLookup);
  assert.ok(tokenLookup >= 0);
  assert.ok(expiryCheck > tokenLookup);
  assert.ok(verificationFetch > expiryCheck);
});

test('authentication does not persist after the browser session ends', () => {
  assert.doesNotMatch(frontend, /localStorage\.(?:getItem|setItem)\(window\.APP_CONFIG\.JWT_TOKEN_KEY/);
  assert.match(frontend, /sessionStorage\.setItem\(window\.APP_CONFIG\.JWT_TOKEN_KEY, data\.token\)/);
  assert.match(frontend, /sessionStorage\.removeItem\(window\.APP_CONFIG \? window\.APP_CONFIG\.JWT_TOKEN_KEY/);
  assert.match(frontend, /localStorage\.removeItem\(window\.APP_CONFIG\.JWT_TOKEN_KEY\)/);
});
