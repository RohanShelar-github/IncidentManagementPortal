'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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

// Regression test for a real production bug: Coralogix subjects read
// "{Customer} - {alert text}", so after alertSearchText the customer name
// was still the leading word(s) of the keyword phrase — duplicating it
// alongside the separate customer-title clause. Confirmed empirically
// against the real Confluence space that this duplication collapses the
// combined CQL query's relevance score to zero hits even when an exact-
// match page exists (reported: "Prettl - Local Agent Connectors not running
// for last 5 minutes" found nothing, despite "Prettl- SOP for Local Agent
// Connectors Alert" existing verbatim).
test('stripLeadingCustomerName removes a duplicated leading customer name from the keyword phrase, case-insensitively, with or without a separator', () => {
  assert.equal(confluenceService.stripLeadingCustomerName('Prettl - Local Agent Connectors not running for last 5 minutes', 'Prettl'), 'Local Agent Connectors not running for last 5 minutes');
  assert.equal(confluenceService.stripLeadingCustomerName('prettl Local Agent Connectors', 'Prettl'), 'Local Agent Connectors');
  assert.equal(confluenceService.stripLeadingCustomerName('TileBar: Average K8s Node Memory', 'TileBar'), 'Average K8s Node Memory');
  // No customer resolved — keywords pass through unchanged.
  assert.equal(confluenceService.stripLeadingCustomerName('Redis Container Instance Restarted', null), 'Redis Container Instance Restarted');
  // Customer name isn't actually the leading text — left alone rather than
  // mangled, and the function never returns an empty string that would make
  // findSopCandidates give up with nothing to search.
  assert.equal(confluenceService.stripLeadingCustomerName('Redis Container Instance Restarted', 'NGC'), 'Redis Container Instance Restarted');
  assert.equal(confluenceService.stripLeadingCustomerName('Prettl', 'Prettl'), 'Prettl');
});

test('findSopCandidates against the real Confluence space: the exact reported bug (Prettl Local Agent Connectors) now finds its real SOP page', async (t) => {
  if (!confluenceService.confluenceConfigured()) { t.skip('ATLASSIAN_* credentials not available in this environment'); return; }
  const results = await confluenceService.findSopCandidates({
    customer: 'Prettl',
    subject: 'Coralogix Alert on magic / Prettl - Local Agent Connectors not running for last 5 minutes'
  });
  assert.ok(results.some((r) => r.title === 'Prettl- SOP for Local Agent Connectors Alert'), `expected the real Prettl SOP page in results, got: ${JSON.stringify(results)}`);
});

test('frontend: the Find SOP button only appears for alert-provider categories, and redirects to the SOP Library instead of showing results inline', () => {
  assert.match(frontend, /function mailboxSopButton\(message, detail\) \{/);
  assert.match(frontend, /if \(\['coralogix', 'azure', 'ngcplantsmonitoring'\]\.indexOf\(message\.category\) === -1\) return null;/);
  assert.match(frontend, /var sopButton = mailboxSopButton\(message, detail\); if \(sopButton\) actions\.appendChild\(sopButton\);/);
  assert.match(frontend, /function loadMailboxSopSuggestion\(message, button\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/sop\/suggestion\?' \+ params/);
  assert.match(frontend, /navigateToSopLibrary\(result\.customer, best \? best\.id : null\);/);
});

test('frontend: SOP Library page, nav item and permission gating (same view_mailbox gate as the mailbox this feature is linked from)', () => {
  assert.match(html, /<div class="nav-item" id="sopLibraryNav" onclick="navigate\('sopLibrary', this\)">/);
  assert.match(html, /<div class="page" id="page-sopLibrary">/);
  assert.match(html, /<input id="sopLibrarySearch"/);
  assert.match(frontend, /sopLibrary: 'view_mailbox'/);
  assert.match(frontend, /if \(page === 'sopLibrary'\) loadSopLibrary\(\);/);
  assert.match(frontend, /el = document\.getElementById\('sopLibraryNav'\);\s*\n\s*if \(el\) el\.style\.display = can\('view_mailbox'\) \? '' : 'none';/);
});

test('frontend: navigateToSopLibrary sets a highlight before navigating, and loadSopLibrary/renderSopLibrary handle the unconfigured and empty-result cases without throwing', () => {
  assert.match(frontend, /function navigateToSopLibrary\(customer, pageId\) \{/);
  assert.match(frontend, /sopLibraryHighlight = \{ customer: customer \|\| null, pageId: pageId \|\| null \};/);
  assert.match(frontend, /navigate\('sopLibrary', document\.getElementById\('sopLibraryNav'\)\);/);
  assert.match(frontend, /function loadSopLibrary\(forceRefresh\) \{/);
  assert.match(frontend, /if \(!data\.configured\) \{ if \(list\) list\.innerHTML = '<div class="mailbox-empty">Confluence integration is not configured\.<\/div>'; return; \}/);
  assert.match(frontend, /function renderSopLibrary\(\) \{/);
});

test('backend: the SOP Library route is mounted and gated behind view_mailbox', () => {
  assert.match(sopRoutes, /router\.get\('\/library', requirePermission\('view_mailbox'\), getSopLibrary\);/);
  assert.match(sopController, /if \(!confluenceConfigured\(\)\) return res\.json\(\{ success: true, data: \{ configured: false, customers: \[\] \} \}\);/);
});

test('deriveCustomerFromCookbookTitle strips the "Monitoring Cookbook" suffix regardless of dash/spacing style', () => {
  assert.equal(confluenceService.deriveCustomerFromCookbookTitle('TileBar - Monitoring Cookbook'), 'TileBar');
  assert.equal(confluenceService.deriveCustomerFromCookbookTitle('KMM- Monitoring Cookbook'), 'KMM');
  assert.equal(confluenceService.deriveCustomerFromCookbookTitle('Choctaw Nation  - Monitoring Cookbook'), 'Choctaw Nation');
});

test('deriveCategoryLabel strips the customer prefix and a "SOP for/on" wording, and falls back to the raw title when neither applies', () => {
  assert.equal(confluenceService.deriveCategoryLabel('TileBar- SOP for EKS Infrastructure Alerts', 'TileBar'), 'EKS Infrastructure Alerts');
  assert.equal(confluenceService.deriveCategoryLabel('GJKG - SOP on handling CSO Incident', 'GJKG'), 'handling CSO Incident');
  // A page that doesn't follow the "SOP for/on" convention still gets a
  // readable label: customer prefix stripped, nothing more guessed.
  assert.equal(confluenceService.deriveCategoryLabel('GJKG – K8s Pod Memory Utilization Exceeded 6GB', 'GJKG'), 'K8s Pod Memory Utilization Exceeded 6GB');
  assert.equal(confluenceService.deriveCategoryLabel('KMM Incident Report—Template', 'KMM'), 'Incident Report—Template');
});

test('listSopLibrary is configuration-safe: returns [] (never throws) when Atlassian credentials are missing', async () => {
  const previous = { site: process.env.ATLASSIAN_SITE, email: process.env.ATLASSIAN_EMAIL, token: process.env.ATLASSIAN_TOKEN };
  delete process.env.ATLASSIAN_SITE; delete process.env.ATLASSIAN_EMAIL; delete process.env.ATLASSIAN_TOKEN;
  try {
    const result = await confluenceService.listSopLibrary();
    assert.deepEqual(result, []);
  } finally {
    if (previous.site !== undefined) process.env.ATLASSIAN_SITE = previous.site;
    if (previous.email !== undefined) process.env.ATLASSIAN_EMAIL = previous.email;
    if (previous.token !== undefined) process.env.ATLASSIAN_TOKEN = previous.token;
  }
});

test('listSopLibrary against the real Confluence space: finds every customer Monitoring Cookbook (not capped at the alert-search page size), each with a readable category per page', async (t) => {
  if (!confluenceService.confluenceConfigured()) { t.skip('ATLASSIAN_* credentials not available in this environment'); return; }
  const library = await confluenceService.listSopLibrary({ forceRefresh: true });
  // Confirmed via live exploration: 25 customers have a Monitoring Cookbook
  // in this space. Asserting >= 20 (not an exact 25) so this test doesn't
  // flake if someone adds/removes a customer's cookbook page later.
  assert.ok(library.length >= 20, `expected at least 20 customers, got ${library.length}`);
  const tileBar = library.find((entry) => entry.customer === 'TileBar');
  assert.ok(tileBar, 'expected a TileBar entry in the library');
  assert.ok(tileBar.pages.some((p) => p.category === 'EKS Infrastructure Alerts'), `expected TileBar's EKS Infrastructure Alerts page, got: ${JSON.stringify(tileBar.pages.map((p) => p.category))}`);
});
