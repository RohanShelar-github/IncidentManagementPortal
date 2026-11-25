'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const jiraRoutes = fs.readFileSync(path.join(root, 'backend', 'routes', 'jiraRoutes.js'), 'utf8');
const jiraController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'jiraController.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const roleController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'roleController.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'sql', '050_cso_incidents_permission.sql'), 'utf8');
const jiraService = require(path.join(root, 'backend', 'services', 'jiraService.js'));

test('the migration adds view_cso_incidents and grants it to admin only', () => {
  assert.match(migration, /INSERT INTO permissions\(permission_key, permission_name\) VALUES\s*\n\('view_cso_incidents', 'View CSO Incidents'\)/);
  assert.match(migration, /SELECT r\.id, 'view_cso_incidents' FROM roles r WHERE r\.role_key IN \('admin'\);/);
  assert.doesNotMatch(migration, /'admin', '(cso|pmo|aoc|engineer|stakeholder)'/, 'must be admin-only, not also granted to another role');
});

test('roleController validates view_cso_incidents as a real permission key, and Role Management has a checkbox for it', () => {
  assert.match(roleController, /'view_cso_incidents'/);
  assert.match(html, /<input type="checkbox" value="view_cso_incidents"\/> View CSO Incidents/);
});

test('the Jira routes are mounted and every route is gated behind the single view_cso_incidents permission (no read/write split, unlike the mailbox)', () => {
  assert.match(server, /const jiraRoutes = require\('\.\/routes\/jiraRoutes'\);/);
  assert.match(server, /app\.use\('\/api\/jira', jiraRoutes\);/);
  assert.match(jiraRoutes, /router\.use\(authenticateToken\);/);
  assert.match(jiraRoutes, /router\.get\('\/cso-incidents', requirePermission\('view_cso_incidents'\), getCsoIncidents\);/);
  assert.match(jiraRoutes, /router\.get\('\/issue\/:key', requirePermission\('view_cso_incidents'\), getJiraIssue\);/);
  assert.match(jiraRoutes, /router\.get\('\/issue\/:key\/comments', requirePermission\('view_cso_incidents'\), getJiraIssueComments\);/);
  assert.match(jiraRoutes, /router\.post\('\/issue\/:key\/comments', requirePermission\('view_cso_incidents'\), postJiraIssueComment\);/);
  assert.match(jiraRoutes, /router\.get\('\/issue\/:key\/transitions', requirePermission\('view_cso_incidents'\), getJiraIssueTransitions\);/);
  assert.match(jiraRoutes, /router\.post\('\/issue\/:key\/transitions', requirePermission\('view_cso_incidents'\), postJiraIssueTransition\);/);
});

test('jiraService never creates tickets — only reads/comments/transitions existing ones', () => {
  const serviceSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'jiraService.js'), 'utf8');
  // The only two POST calls in this file target an existing issue's /comment
  // or /transitions sub-resource — neither creates a new issue (that would
  // be a bare POST to /issue or /issue/{key} with no sub-path).
  const postCalls = [...serviceSrc.matchAll(/jiraRequest\(`([^`]*)`,\s*\{\s*method:\s*'POST'/g)].map((m) => m[1]);
  assert.ok(postCalls.length >= 2, 'expected at least the comment and transition POST calls');
  postCalls.forEach((target) => assert.match(target, /\/issue\/\$\{encodeURIComponent\(key\)\}\/(comment|transitions)/));
  assert.match(serviceSrc, /ISSUE_KEY_PATTERN = \/\^\[A-Z\]\[A-Z0-9\]\+-\\d\+\$\//);
});

test('jiraService read functions return a safe empty value (never throw) when Jira is not configured', async () => {
  const saved = { site: process.env.ATLASSIAN_SITE, email: process.env.ATLASSIAN_EMAIL, token: process.env.ATLASSIAN_TOKEN };
  delete process.env.ATLASSIAN_SITE; delete process.env.ATLASSIAN_EMAIL; delete process.env.ATLASSIAN_TOKEN;
  try {
    assert.equal(jiraService.jiraConfigured(), false);
    assert.deepEqual(await jiraService.listIssuesForProject('TIL'), []);
    assert.equal(await jiraService.getIssueSummary('TIL-1'), null);
    assert.deepEqual(await jiraService.getIssueComments('TIL-1'), []);
    assert.deepEqual(await jiraService.getIssueTransitions('TIL-1'), []);
  } finally {
    if (saved.site !== undefined) process.env.ATLASSIAN_SITE = saved.site;
    if (saved.email !== undefined) process.env.ATLASSIAN_EMAIL = saved.email;
    if (saved.token !== undefined) process.env.ATLASSIAN_TOKEN = saved.token;
  }
});

test('jiraService rejects malformed issue keys and project codes before ever building a URL', async () => {
  await assert.rejects(() => jiraService.getIssueSummary('; DROP TABLE'), /Invalid Jira issue key/);
  await assert.rejects(() => jiraService.getIssueSummary('../../etc/passwd'), /Invalid Jira issue key/);
  await assert.rejects(() => jiraService.listIssuesForProject('not a code!'), /Invalid Jira project code/);
  await assert.rejects(() => jiraService.addIssueComment('bad key', 'hello'), /Invalid Jira issue key/);
  await assert.rejects(() => jiraService.transitionIssue('bad key', '1'), /Invalid Jira issue key/);
});

test('jiraService.addIssueComment requires non-empty text (rejected before any network call)', async () => {
  await assert.rejects(() => jiraService.addIssueComment('TIL-237', '   '), /Comment text is required/);
});

test('live Jira integration: listIssuesForProject, getIssueSummary, getIssueComments and getIssueTransitions all return real data for a real customer project (read-only — never writes a comment or transition against a live customer ticket)', async (t) => {
  if (!jiraService.jiraConfigured()) { t.skip('ATLASSIAN_* credentials not loaded in this run'); return; }
  const tickets = await jiraService.listIssuesForProject('TIL');
  assert.ok(Array.isArray(tickets) && tickets.length > 0, 'expected at least one real TileBar (TIL) ticket');
  const first = tickets[0];
  assert.match(first.key, /^TIL-\d+$/);
  assert.ok(first.url.includes('/browse/' + first.key));
  const summary = await jiraService.getIssueSummary(first.key);
  assert.equal(summary.key, first.key);
  const comments = await jiraService.getIssueComments(first.key);
  assert.ok(Array.isArray(comments));
  const transitions = await jiraService.getIssueTransitions(first.key);
  assert.ok(Array.isArray(transitions));
  if (transitions.length) assert.ok(transitions[0].id && transitions[0].name);
});

test('listIssuesForProject scopes the JQL to the "CSO Incident" issue type — a customer\'s Jira project also holds unrelated issue types (Task, Story, Production Deployment Request, Bug, confirmed against real project data) that must never appear on this page', () => {
  const serviceSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'jiraService.js'), 'utf8');
  assert.match(serviceSrc, /CSO_INCIDENT_ISSUE_TYPE = 'CSO Incident'/);
  assert.match(serviceSrc, /jql: `project = "\$\{code\}" AND issuetype = "\$\{CSO_INCIDENT_ISSUE_TYPE\}" ORDER BY created DESC`/);
});

test('live Jira integration: a project with mixed issue types (PRT) only returns CSO Incident tickets, never another issue type from the same project', async (t) => {
  if (!jiraService.jiraConfigured()) { t.skip('ATLASSIAN_* credentials not loaded in this run'); return; }
  const tickets = await jiraService.listIssuesForProject('PRT');
  assert.ok(Array.isArray(tickets) && tickets.length > 0, 'expected at least one real PRT CSO Incident ticket');
  tickets.forEach((ticket) => assert.match(ticket.key, /^PRT-\d+$/));
});

test('getIssueSummary requests the rendered description (expand=renderedFields) so the panel can show it as ready HTML, same idea as a comment\'s renderedBody — never raw Atlassian Document Format JSON', () => {
  const serviceSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'jiraService.js'), 'utf8');
  assert.match(serviceSrc, /\/issue\/\$\{encodeURIComponent\(key\)\}\?fields=summary,status,assignee,created,updated,description,comment&expand=renderedFields/);
  assert.match(serviceSrc, /description: issue\.renderedFields\?\.description \|\| ''/);
});

test('live Jira integration: getIssueSummary returns the ticket\'s real description HTML, not empty (a Customer Raised Ticket always has one — it is auto-filled from the customer\'s support-portal submission)', async (t) => {
  if (!jiraService.jiraConfigured()) { t.skip('ATLASSIAN_* credentials not loaded in this run'); return; }
  const tickets = await jiraService.listIssuesForProject('TIL');
  const summary = await jiraService.getIssueSummary(tickets[0].key);
  assert.ok(typeof summary.description === 'string' && summary.description.length > 0, 'expected a non-empty description');
});

test('frontend: the ticket panel renders a sandboxed Description section (same sanitize-then-iframe treatment as comments), sourced from issue.description', () => {
  assert.match(frontend, /function jiraDescriptionSafeHtml\(html, useLightTheme\) \{/);
  assert.match(frontend, /descriptionFrame\.setAttribute\('sandbox', ''\);/);
  assert.match(frontend, /descriptionFrame\.srcdoc = jiraDescriptionSafeHtml\(issue\.description, useLightTheme\);/);
  assert.match(frontend, /function jiraSanitizeFragment\(rawHtml\) \{/);
});

test('frontend: CSO Incidents nav, page and permission gating', () => {
  assert.match(html, /<div class="nav-item" id="csoIncidentsNav" onclick="navigate\('csoIncidents', this\)">/);
  assert.match(html, /<div class="page" id="page-csoIncidents">/);
  assert.match(html, /<input id="csoIncidentsSearch"/);
  assert.match(frontend, /csoIncidents: 'view_cso_incidents'/);
  assert.match(frontend, /if \(page === 'csoIncidents'\) loadCsoIncidents\(\);/);
  assert.match(frontend, /el = document\.getElementById\('csoIncidentsNav'\);\s*\n\s*if \(el\) el\.style\.display = can\('view_cso_incidents'\) \? '' : 'none';/);
});

test('frontend: the Jira ticket panel is shared between the CSO Incidents page and the mailbox detail view for a Customer Raised Ticket email', () => {
  assert.match(frontend, /function renderJiraTicketPanel\(container, issueKey, options\) \{/);
  assert.match(frontend, /function openCsoIncidentTicket\(issueKey\) \{/);
  assert.match(frontend, /renderJiraTicketPanel\(content, issueKey\);/);
  assert.match(frontend, /message\.category === 'jira' && message\.jiraIssueKey && hasPermission\('view_cso_incidents'\)/);
  assert.match(frontend, /renderJiraTicketPanel\(jiraSection, message\.jiraIssueKey\);/);
});

test('frontend: jiraCommentsSafeHtml strips scripts/event handlers and disallowed URL schemes the same way sopPageSafeHtml does', () => {
  assert.match(frontend, /function jiraCommentsSafeHtml\(comments, useLightTheme\) \{/);
  assert.match(frontend, /'script,iframe,object,embed,form,input,button,textarea,select,meta,base,link,style'/);
  assert.match(frontend, /if \(name\.indexOf\('on'\) === 0 \|\| name === 'srcdoc'\) node\.removeAttribute\(attribute\.name\);/);
});

test('frontend: status change always comes from Jira\'s own live transitions list, never a hardcoded status set', () => {
  assert.doesNotMatch(frontend, /jira-ticket-transition-select[\s\S]{0,40}<option value="open"/i);
  assert.match(frontend, /transitions\.forEach\(function \(transition\) \{ var opt = document\.createElement\('option'\); opt\.value = transition\.id;/);
});

test('getIssueSummary also requests the comment field, exposing the real comment total so the Alert Compliance table\'s 💬 icon can show it instead of the local (always-0-for-these-rows) count', () => {
  const serviceSrc = fs.readFileSync(path.join(root, 'backend', 'services', 'jiraService.js'), 'utf8');
  assert.match(serviceSrc, /fields=summary,status,assignee,created,updated,description,comment&expand=renderedFields/);
  assert.match(serviceSrc, /commentCount: issue\.fields\?\.comment\?\.total \?\? 0,/);
});

test('live Jira integration: getIssueSummary\'s commentCount matches the ticket\'s real comment list length', async (t) => {
  if (!jiraService.jiraConfigured()) { t.skip('ATLASSIAN_* credentials not loaded in this run'); return; }
  const tickets = await jiraService.listIssuesForProject('TIL');
  const key = tickets[0].key;
  const [summary, comments] = await Promise.all([jiraService.getIssueSummary(key), jiraService.getIssueComments(key)]);
  assert.equal(summary.commentCount, comments.length);
});

test('frontend: renderJiraTicketPanel supports a comments-only mode (the table\'s 💬 icon) that shows just the comment thread, not the key/summary/status/description — those are already visible from the row itself', () => {
  assert.match(frontend, /var commentsOnly = !!\(options && options\.commentsOnly\);/);
  assert.match(frontend, /if \(commentsOnly\) panel\.appendChild\(commentsSection\);/);
  assert.match(frontend, /else panel\.append\(header, statusRow, descriptionSection, commentsSection\);/);
  assert.match(frontend, /if \(showJiraPanel\) renderJiraTicketPanel\(jiraSection, row\.jiraIssueKey, \{ commentsOnly: !!commentsOnly \}\);/);
});
