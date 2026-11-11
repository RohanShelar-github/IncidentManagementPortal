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

test('frontend: the Find SOP button only appears on exactly the messages that would also show + Create Incident (reusing that same eligibility function, not a separate category check), and redirects to the SOP Library instead of showing results inline', () => {
  assert.match(frontend, /function mailboxSopButton\(message, detail\) \{/);
  assert.match(frontend, /if \(!mailboxHasCreateIncidentButton\(message\)\) return null;/);
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

test('frontend: navigateToSopLibrary expands the matched customer and sets a one-shot highlight before navigating; loadSopLibrary handles the unconfigured case without throwing', () => {
  assert.match(frontend, /function navigateToSopLibrary\(customer, pageId\) \{/);
  assert.match(frontend, /sopLibraryHighlight = \{ customer: customer \|\| null, pageId: pageId \|\| null \};/);
  assert.match(frontend, /if \(customer\) sopLibraryExpanded\[String\(customer\)\.toLowerCase\(\)\] = true;/);
  assert.match(frontend, /navigate\('sopLibrary', document\.getElementById\('sopLibraryNav'\)\);/);
  assert.match(frontend, /function loadSopLibrary\(forceRefresh, callback\) \{/);
  assert.match(frontend, /if \(!data\.configured\) \{ if \(tree\) tree\.innerHTML = '<div class="mailbox-empty">Confluence integration is not configured\.<\/div>'; if \(callback\) callback\(null\); return; \}/);
  assert.match(frontend, /function renderSopLibrary\(\) \{/);
});

test('frontend: the SOP Library refresh control is the small circular icon pattern shared with other pages (e.g. Alert Compliance), not a standalone button, driven by the shared setPageRefreshState id convention', () => {
  assert.match(html, /<span id="sopLibraryRefreshBtn" onclick="refreshSopLibrary\(event\)"/);
  assert.match(html, /<svg [^>]*id="sopLibraryRefreshIcon"/);
  assert.match(html, /id="sopLibraryLastUpdated"/);
  assert.doesNotMatch(html, /onclick="loadSopLibrary\(true\)"/);
  assert.match(frontend, /function refreshSopLibrary\(event\) \{/);
  assert.match(frontend, /setPageRefreshState\('sopLibrary', true\);/);
  assert.match(frontend, /loadSopLibrary\(true, function \(error\) \{/);
  assert.match(frontend, /setPageRefreshState\('sopLibrary', false, error \? \(error\.message \|\| 'Refresh failed'\) : ''\);/);
});

test('frontend: loadSopLibrary auto-opens the matched page content after a "Find SOP" redirect, then consumes the one-shot highlight', () => {
  assert.match(frontend, /if \(sopLibraryHighlight && sopLibraryHighlight\.pageId\) \{/);
  assert.match(frontend, /if \(matched\) openSopLibraryPage\(matched\);/);
  assert.match(frontend, /sopLibraryHighlight = null;/);
});

test('frontend: renderSopLibrary builds an expandable customer tree (not flat pills), auto-expanding matches while searching and marking the active page', () => {
  assert.match(frontend, /row\.onclick = function \(\) \{ sopLibraryExpanded\[key\] = !sopLibraryExpanded\[key\]; renderSopLibrary\(\); \};/);
  assert.match(frontend, /customers\.forEach\(function \(entry\) \{ sopLibraryExpanded\[entry\.customer\.toLowerCase\(\)\] = true; \}\);/);
  assert.match(frontend, /if \(sopLibraryActivePageId && String\(sopLibraryActivePageId\) === String\(page\.id\)\) pageRow\.classList\.add\('active'\);/);
});

test('frontend: openSopLibraryPage fetches real page content and renders it in a sandboxed iframe (not just a link), alongside an explicit "Open in Confluence" escape hatch', () => {
  assert.match(frontend, /function openSopLibraryPage\(page\) \{/);
  assert.match(frontend, /API_BASE_URL \+ '\/sop\/page\/' \+ encodeURIComponent\(page\.id\)/);
  assert.match(frontend, /frame\.setAttribute\('sandbox', 'allow-popups allow-popups-to-escape-sandbox'\);/);
  assert.match(frontend, /frame\.srcdoc = sopPageSafeHtml\(data\.html\);/);
  assert.match(frontend, /openLink\.textContent = 'Open in Confluence ↗';/);
});

test('frontend: sopPageSafeHtml strips scripts/forms/event handlers and only allows https:/mailto:/data:image URLs plus the app\'s own asset-proxy path — the same security posture as mailboxSafeRichHtml, reused rather than re-invented, with one scoped addition', () => {
  assert.match(frontend, /function sopPageSafeHtml\(value\) \{/);
  assert.match(frontend, /querySelectorAll\('script,iframe,object,embed,form,input,button,textarea,select,meta,base,link,style'\)\.forEach\(function \(node\) \{ node\.remove\(\); \}\);/);
  assert.match(frontend, /if \(name\.indexOf\('on'\) === 0 \|\| name === 'srcdoc'\) node\.removeAttribute\(attribute\.name\);/);
  assert.match(frontend, /!\/\^\(https:\|mailto:\|data:image\\\/\|\\\/api\\\/sop\\\/asset\\\?\)\/i\.test\(raw\)/);
});

// Regression test for a direct follow-up request: the content viewer looked
// "too basic" because the sanitizer never stripped Confluence's own class
// attributes (only tags/dangerous attributes), but no CSS targeted those
// classes — Confluence's visual styling (info/note/warning/tip panels,
// embedded-image alignment, etc.) comes entirely from ITS OWN stylesheet,
// which this app deliberately doesn't load (that would mean trusting an
// external, versioned CSS bundle inside the sandbox). Confirmed these exact
// class names against this space's real page markup before writing the CSS.
test('frontend: sopPageSafeHtml\'s stylesheet gives Confluence\'s own macro/panel classes their real visual look (info/note/warning/tip panels, embedded-image alignment, generic panel/code blocks) — confirmed against real page markup, not guessed', () => {
  assert.match(frontend, /\.confluence-information-macro-information\{background:#deebff\}/);
  assert.match(frontend, /\.confluence-information-macro-note\{background:#fff7d6\}/);
  assert.match(frontend, /\.confluence-information-macro-warning\{background:#ffebe6\}/);
  assert.match(frontend, /\.confluence-information-macro-tip\{background:#e3fcef\}/);
  assert.match(frontend, /\.confluence-embedded-image\.image-center\{margin-left:auto;margin-right:auto\}/);
  assert.match(frontend, /\.confluence-embedded-image\.image-wrap-left\{float:left;/);
  assert.match(frontend, /'\.panel\{border:1px solid #dfe1e6;border-radius:3px;margin:0 0 16px;overflow:hidden\}'/);
  assert.match(frontend, /'\.panelContent\{padding:12px 14px\}'/);
});

test('backend: the SOP Library and page-content routes are mounted and gated behind view_mailbox; the asset proxy is deliberately NOT (it is loaded via <img src>, which cannot send an Authorization header)', () => {
  assert.match(sopRoutes, /router\.get\('\/library', requirePermission\('view_mailbox'\), getSopLibrary\);/);
  assert.match(sopRoutes, /router\.get\('\/page\/:id', requirePermission\('view_mailbox'\), getSopPage\);/);
  assert.match(sopRoutes, /router\.get\('\/asset', getSopAsset\);\s*\n\s*router\.use\(authenticateToken\);/);
  assert.match(sopController, /if \(!confluenceConfigured\(\)\) return res\.json\(\{ success: true, data: \{ configured: false, customers: \[\] \} \}\);/);
});

test('backend: getSopAsset authenticates itself via its own ?token= query param (jwt.verify) rather than the shared Bearer-header middleware, and validates the url before fetching', () => {
  assert.match(sopController, /jwt\.verify\(String\(req\.query\.token \|\| ''\), jwtSecret\(\), \{ algorithms: \['HS256'\] \}\);/);
  assert.match(sopController, /const asset = await fetchConfluenceAsset\(String\(req\.query\.url \|\| ''\)\);/);
});

test('backend: getSopPage embeds the requesting user\'s own bearer token into the rewritten asset-proxy URLs, so the asset route can authenticate the same request that loaded the page', () => {
  assert.match(sopController, /const token = String\(req\.headers\.authorization \|\| ''\)\.split\(' '\)\[1\] \|\| '';/);
  assert.match(sopController, /const assetProxyBase = `\/api\/sop\/asset\?token=\$\{encodeURIComponent\(token\)\}`;/);
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

test('getSopPageContent is configuration-safe: returns null (never throws) when Atlassian credentials are missing', async () => {
  const previous = { site: process.env.ATLASSIAN_SITE, email: process.env.ATLASSIAN_EMAIL, token: process.env.ATLASSIAN_TOKEN };
  delete process.env.ATLASSIAN_SITE; delete process.env.ATLASSIAN_EMAIL; delete process.env.ATLASSIAN_TOKEN;
  try {
    const result = await confluenceService.getSopPageContent('3337650177');
    assert.equal(result, null);
  } finally {
    if (previous.site !== undefined) process.env.ATLASSIAN_SITE = previous.site;
    if (previous.email !== undefined) process.env.ATLASSIAN_EMAIL = previous.email;
    if (previous.token !== undefined) process.env.ATLASSIAN_TOKEN = previous.token;
  }
});

test('fetchConfluenceAsset rejects any URL that isn\'t on the configured Atlassian site\'s wiki path — never an open proxy for arbitrary URLs', async () => {
  await assert.rejects(() => confluenceService.fetchConfluenceAsset('https://evil.example.com/x.png'), /Invalid or disallowed asset URL/);
  await assert.rejects(() => confluenceService.fetchConfluenceAsset(''), /Invalid or disallowed asset URL/);
});

// Regression test for a real finding during this work: Confluence's
// rendered body embeds images via a CDN-fronted "/wiki/download/..." URL
// that (confirmed empirically) rejects the same Basic Auth that works fine
// against the regular REST API, expecting OAuth/a browser session instead —
// so proxying that exact URL always 401s. The REST API's own
// attachment-download link does accept Basic Auth, so each image must be
// resolved by filename against the page's attachment list and rewritten to
// THAT link, not the URL actually present in the HTML.
test('rewriteConfluenceImageSrcs resolves each embedded image by filename against the page\'s attachment list, rewriting to the REST API download link (not the CDN thumbnail URL, which rejects Basic Auth)', () => {
  const previousSite = process.env.ATLASSIAN_SITE;
  process.env.ATLASSIAN_SITE = 'example.atlassian.net';
  try {
    const html = '<img src="https://example.atlassian.net/wiki/download/thumbnails/123/photo.png?version=1&width=760">'
      + '<img src="https://example.atlassian.net/wiki/download/attachments/123/unresolved.png">';
    const attachments = [{ title: 'photo.png', _links: { download: '/rest/api/content/123/child/attachment/att1/download' } }];
    const result = confluenceService.rewriteConfluenceImageSrcs(html, attachments, '/api/sop/asset?token=abc');
    assert.match(result, /src="\/api\/sop\/asset\?token=abc&url=https%3A%2F%2Fexample\.atlassian\.net%2Fwiki%2Frest%2Fapi%2Fcontent%2F123%2Fchild%2Fattachment%2Fatt1%2Fdownload"/);
    // A filename not found in the attachment list is left as-is (best
    // effort — that one image may not load, rather than failing the page).
    assert.match(result, /src="https:\/\/example\.atlassian\.net\/wiki\/download\/attachments\/123\/unresolved\.png"/);
  } finally {
    if (previousSite !== undefined) process.env.ATLASSIAN_SITE = previousSite; else delete process.env.ATLASSIAN_SITE;
  }
});

test('getSopPageContent + rewriteConfluenceImageSrcs + fetchConfluenceAsset against the real Confluence space: every embedded image on a real page resolves and is actually downloadable', async (t) => {
  if (!confluenceService.confluenceConfigured()) { t.skip('ATLASSIAN_* credentials not available in this environment'); return; }
  const page = await confluenceService.getSopPageContent('3337650177'); // TileBar - SOP for EKS Infrastructure Alerts
  assert.equal(page.title, 'TileBar- SOP for EKS Infrastructure Alerts');
  assert.ok(page.attachments.length > 0, 'expected this real page to have attachments');
  const rewritten = confluenceService.rewriteConfluenceImageSrcs(page.html, page.attachments, '/api/sop/asset?token=fake');
  const imgSrcs = [...rewritten.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(imgSrcs.length > 0, 'expected this real page to embed images');
  assert.ok(imgSrcs.every((src) => src.startsWith('/api/sop/asset')), `expected every image to resolve through the proxy, got: ${JSON.stringify(imgSrcs)}`);
  const firstAssetUrl = decodeURIComponent(imgSrcs[0].split('&url=')[1]);
  const asset = await confluenceService.fetchConfluenceAsset(firstAssetUrl);
  assert.ok(asset.buffer.length > 0, 'expected real image bytes back');
  assert.match(asset.contentType, /^image\//);
});
