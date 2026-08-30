const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
const controller = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'controllers', 'incidentController.js'), 'utf8');
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'routes', 'incidentRoutes.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('backend exposes authenticated persistent activity logs before the incident id route', () => {
  const activityRoute = routes.indexOf("router.get('/activity-log', requirePermission('view_incidents'), getActivityLog)");
  const incidentRoute = routes.indexOf("router.get('/:id', requirePermission('view_incidents'), getIncidentById)");

  assert.notEqual(activityRoute, -1);
  assert.ok(activityRoute < incidentRoute);
  assert.match(routes, /router\.use\(authenticateToken\)/);
});

test('activity log query joins incident and user context with a bounded limit', () => {
  assert.match(controller, /FROM activity_logs logs/);
  assert.match(controller, /LEFT JOIN incidents ON incidents\.id = logs\.incident_id/);
  assert.match(controller, /LEFT JOIN users ON users\.id = logs\.action_by/);
  assert.match(controller, /Math\.min\(Math\.max\(requestedLimit, 1\), 500\)/);
});

test('reports load persistent audit data and escape rendered database values', () => {
  assert.match(frontend, /function loadAuditLogFromBackend\(callback\)/);
  assert.match(frontend, /\/incidents\/activity-log\?limit=200/);
  assert.match(frontend, /if \(page === 'reports'\) return loadAuditLogFromBackend\(finish\)/);
  assert.match(frontend, /escapeMetricHtml\(e\.action\)/);
  assert.match(frontend, /escapeMetricHtml\(e\.detail\)/);
  assert.match(frontend, /escapeMetricHtml\(e\.user \|\| 'System'\)/);
});

test('audit log description reflects the persistent events currently recorded', () => {
  assert.match(html, /Persistent incident create \/ edit \/ comment activity/);
  assert.doesNotMatch(html, /close \/ login events/);
});
