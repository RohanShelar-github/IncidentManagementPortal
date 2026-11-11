'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const sopRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'sopRoutes.js'), 'utf8');
const sopController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'sopController.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const confluenceService = require(path.join(root, 'backend', 'services', 'confluenceService.js'));

test('the SOP route is mounted, additive, authenticated and gated behind view_mailbox', () => {
  assert.match(server, /const sopRoutes = require\('\.\/routes\/sopRoutes'\);/);
  assert.match(server, /app\.use\('\/api\/sop', sopRoutes\);/);
  assert.match(sopRoutes, /router\.use\(authenticateToken\);/);
  assert.match(sopRoutes, /router\.get\('\/suggestion', requirePermission\('view_mailbox'\), getSopSuggestion\);/);
});

test('getSopSuggestion requires a subject, reuses matchingCustomersByName, and never throws the integration being unconfigured as an error', () => {
  assert.match(sopController, /if \(!confluenceConfigured\(\)\) return res\.json\(\{ success: true, data: \{ configured: false, candidates: \[\] \} \}\);/);
  assert.match(sopController, /if \(!subject\) return res\.status\(400\)/);
  assert.match(sopController, /const \{ matchingCustomersByName \} = require\('\.\/mailboxController'\);/);
});

test("azure/ngcplantsmonitoring alerts resolve to NGC without a DB lookup, since NGC is the only customer hosted on Azure (same assumption the incident-prefill flow already makes)", () => {
  assert.match(sopController, /if \(category === 'azure' \|\| category === 'ngcplantsmonitoring'\) return 'NGC';/);
});

test('alertSearchText strips known provider wrappers down to the alert\'s distinctive wording', () => {
  assert.equal(confluenceService.alertSearchText("Alert 'Redis Container Instance Restarted' was fired"), 'Redis Container Instance Restarted');
  assert.equal(confluenceService.alertSearchText("Re: Alert 'Redis Container Instance Restarted' was resolved"), 'Redis Container Instance Restarted');
  assert.equal(confluenceService.alertSearchText('[RESOLVED] Coralogix Alert on magic / TileBar - Pod Memory High'), 'TileBar - Pod Memory High');
  assert.equal(confluenceService.alertSearchText('Coralogix Alert on magic / TileBar - Pod Memory High'), 'TileBar - Pod Memory High');
});

test('findSopCandidates is configuration-safe: returns [] (never throws) when Atlassian credentials are missing', async () => {
  const previous = { site: process.env.ATLASSIAN_SITE, email: process.env.ATLASSIAN_EMAIL, token: process.env.ATLASSIAN_TOKEN };
  delete process.env.ATLASSIAN_SITE; delete process.env.ATLASSIAN_EMAIL; delete process.env.ATLASSIAN_TOKEN;
  try {
    assert.equal(confluenceService.confluenceConfigured(), false);
    const result = await confluenceService.findSopCandidates({ customer: 'NGC', subject: "Alert 'Redis Container Instance Restarted' was fired" });
    assert.deepEqual(result, []);
  } finally {
    if (previous.site !== undefined) process.env.ATLASSIAN_SITE = previous.site;
    if (previous.email !== undefined) process.env.ATLASSIAN_EMAIL = previous.email;
    if (previous.token !== undefined) process.env.ATLASSIAN_TOKEN = previous.token;
  }
});

test('findSopCandidates returns [] rather than throwing when given no usable subject text', async () => {
  // Does not require real credentials — alertSearchText('') short-circuits
  // before any network call is made.
  const result = await confluenceService.findSopCandidates({ customer: 'NGC', subject: '' });
  assert.deepEqual(result, []);
});

test('frontend: the Find SOP button only appears for alert-provider categories, and toggles a results panel instead of stacking duplicates', () => {
  assert.match(frontend, /function mailboxSopButton\(message, detail\) \{/);
  assert.match(frontend, /if \(\['coralogix', 'azure', 'ngcplantsmonitoring'\]\.indexOf\(message\.category\) === -1\) return null;/);
  assert.match(frontend, /var sopButton = mailboxSopButton\(message, detail\); if \(sopButton\) actions\.appendChild\(sopButton\);/);
  assert.match(frontend, /function loadMailboxSopSuggestion\(message, button, detail\) \{/);
  assert.match(frontend, /var existing = detail\.querySelector\('\.mailbox-sop-panel'\);\s*\n\s*if \(existing\) \{ existing\.remove\(\); return; \}/);
});

test('frontend: the SOP panel always frames results as unconfirmed candidates to verify, never a single confident answer', () => {
  assert.match(frontend, /verify before following/);
  assert.match(frontend, /API_BASE_URL \+ '\/sop\/suggestion\?' \+ params/);
});
