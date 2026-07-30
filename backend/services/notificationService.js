const pool = require('../config/database');

const NOTIFICATION_RETENTION_HOURS = 24;
const NOTIFICATION_PURGE_INTERVAL_MS = 60 * 1000;
let lastNotificationPurgeAt = 0;

async function purgeExpiredNotifications(options = {}) {
  const now = Date.now();
  if (!options.force && now - lastNotificationPurgeAt < NOTIFICATION_PURGE_INTERVAL_MS) return 0;
  lastNotificationPurgeAt = now;
  const [result] = await pool.query(
    'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 24 HOUR'
  );
  return Number(result.affectedRows) || 0;
}

function containsMention(text, fullName) {
  return String(text || '').toLowerCase().includes('@' + String(fullName || '').trim().toLowerCase());
}

async function notifyUsers({ actorId, message, type = 'info', incidentRef = null, mentionText = '' }) {
  try {
    const [users] = await pool.query('SELECT id, full_name FROM users');
    const recipients = users;
    if (!recipients.length) return true;

    const values = recipients.map((user) => [
      message,
      user.id,
      type,
      incidentRef,
      containsMention(mentionText, user.full_name) ? 1 : 0,
      actorId || null
    ]);
    await pool.query(
      'INSERT INTO notifications (message, user_id, type, incident_ref, is_mention, actor_id) VALUES ?',
      [values]
    );
    return true;
  } catch (error) {
    // Notification delivery must never roll back or misreport the business action.
    console.error('Notification delivery error:', error);
    return false;
  }
}

module.exports = {
  notifyUsers,
  containsMention,
  purgeExpiredNotifications,
  NOTIFICATION_RETENTION_HOURS,
  NOTIFICATION_PURGE_INTERVAL_MS
};
