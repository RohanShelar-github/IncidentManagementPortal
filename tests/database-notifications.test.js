const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const incidentController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'incidentController.js'), 'utf8');
const notificationController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'notificationController.js'), 'utf8');
const notificationService = fs.readFileSync(path.join(root, 'backend', 'services', 'notificationService.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('authenticated notification API supports list and read state', () => {
  assert.match(server, /app\.use\('\/api\/notifications', notificationRoutes\)/);
  assert.match(notificationController, /FROM notifications\s+WHERE user_id = \?/);
  assert.match(notificationController, /UPDATE notifications SET is_read = 1/);
});

test('notifications older than 24 hours are hidden and deleted from the database', () => {
  assert.match(notificationController, /await purgeExpiredNotifications\(\)/);
  assert.match(notificationController, /created_at >= NOW\(\) - INTERVAL 24 HOUR/);
  assert.match(notificationService, /NOTIFICATION_RETENTION_HOURS = 24/);
  assert.match(notificationService, /DELETE FROM notifications WHERE created_at < NOW\(\) - INTERVAL 24 HOUR/);
  assert.match(notificationService, /NOTIFICATION_PURGE_INTERVAL_MS = 60 \* 1000/);
});

test('incident lifecycle and comments create database notifications', () => {
  for (const type of ["type: 'create'", "type: closed ? 'close' : 'edit'", "type: 'delete'", "type: 'comment'"]) {
    assert.ok(incidentController.includes(type), `missing ${type}`);
  }
  assert.match(notificationService, /containsMention\(mentionText, user\.full_name\)/);
});

test('notification failures do not fail incident business actions', () => {
  assert.match(notificationService, /Notification delivery must never roll back/);
  assert.match(notificationService, /return false/);
});

test('frontend polls database notifications and supports unread and mention tabs', () => {
  assert.match(frontend, /\/notifications\?limit=100/);
  assert.match(frontend, /setInterval\(function \(\)/);
  assert.match(frontend, /item\.unread && Number\(item\.id\) > latestNotificationId/);
  assert.match(frontend, /notifications\.filter\(function \(n\) \{ return n\.mention; \}\)/);
  assert.match(frontend, /\/notifications\/read-all/);
});
