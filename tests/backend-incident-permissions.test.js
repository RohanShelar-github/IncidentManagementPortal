'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('incident write routes enforce server-side role permissions', () => {
  const routes = read('backend/routes/incidentRoutes.js');
  assert.match(routes, /router\.post\('\/', requirePermission\('create_incidents'\), createIncident\)/);
  assert.match(routes, /router\.put\('\/:id', requirePermission\('edit_incidents'\), requireClosePermissionWhenClosing, updateIncident\)/);
  assert.match(routes, /router\.delete\('\/:id', requirePermission\('delete_incidents'\), deleteIncident\)/);
  assert.match(routes, /router\.post\('\/:id\/comments', requirePermission\('edit_incidents'\), addComment\)/);
});

test('JWT verification accepts only the expected HMAC algorithm', () => {
  assert.match(read('backend/middleware/auth.js'), /algorithms: \['HS256'\]/);
});

test('public health response contains no infrastructure or integration configuration', () => {
  const server = read('backend/server.js');
  const start = server.indexOf("app.get('/api/health'");
  const end = server.indexOf('// 404 handler', start);
  const implementation = server.slice(start, end);
  assert.doesNotMatch(implementation, /databaseName|databaseTime|emailConfigured|aiConfigured|error\.message/);
});

// ── Requirement: @mentioning a user in an incident comment also emails them ──
// ── (not just the existing in-app notification), CC'ing the commenter too  ──

test('incidentController imports findMentionedUsers and mentionNotificationEmailHtml alongside its existing notification/email imports', () => {
  const controller = read('backend/controllers/incidentController.js');
  assert.match(controller, /const \{ notifyUsers, findMentionedUsers \} = require\('\.\.\/services\/notificationService'\);/);
  assert.match(controller, /const \{ sendIncidentClosedEmail, sendIncidentCreatedEmail, sendCriticalIncidentEmail, htmlEscape, safeIncidentEmailHtml, mentionNotificationEmailHtml \} = require\('\.\.\/services\/emailService'\);/);
});

test('addComment sends an email (via the shared mentionNotificationEmailHtml template) to every @mentioned user, in addition to the existing in-app notifyUsers call', () => {
  const controller = read('backend/controllers/incidentController.js');
  const start = controller.indexOf('const addComment = async');
  const end = controller.indexOf('module.exports');
  const body = controller.slice(start, end);
  assert.match(body, /const mentioned = await findMentionedUsers\(text\);/);
  assert.match(body, /await Promise\.all\(mentioned\.filter\(\(user\) => user\.email\)\.map\(\(user\) =>\s*\n\s*sendCriticalIncidentEmail\(\{/);
  assert.match(body, /subject: `You were mentioned in a comment on \$\{req\.params\.id\}`,/);
  assert.match(body, /html: mentionNotificationEmailHtml\(\{\s*\n\s*actorName, commentText: text,\s*\n\s*itemLabel: `\$\{req\.params\.id\}\$\{incidentTitle \? `: \$\{incidentTitle\}` : ''\}`,\s*\n\s*actionUrl: portalBaseUrl \? `\$\{portalBaseUrl\}\/\?incident=\$\{encodeURIComponent\(req\.params\.id\)\}#incidents` : '',\s*\n\s*actionLabel: `Open \$\{req\.params\.id\}`\s*\n\s*\}\)/);
});

test('the incident comment mention email CCs the commenter, skipped only when they mentioned themselves, and a delivery failure is caught per-recipient without failing the comment request', () => {
  const controller = read('backend/controllers/incidentController.js');
  const start = controller.indexOf('const addComment = async');
  const end = controller.indexOf('module.exports');
  const body = controller.slice(start, end);
  assert.match(body, /cc: actorEmail && actorEmail\.toLowerCase\(\) !== String\(user\.email\)\.toLowerCase\(\) \? actorEmail : '',/);
  assert.match(body, /\.catch\(\(error\) => console\.error\('Mention email delivery error:', error\.message\)\)/);
});

test('addComment now also selects the incident title (in addition to comments) so the mention email can show a readable item label, not just the bare incident ref', () => {
  const controller = read('backend/controllers/incidentController.js');
  assert.match(controller, /SELECT comments, title FROM incidents WHERE id = \? FOR UPDATE/);
});
