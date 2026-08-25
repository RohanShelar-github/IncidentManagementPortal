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

async function notifyMailboxUsers({ fromName, subject, mailboxMessageId }) {
  try {
    const messageId = String(mailboxMessageId || '').trim();
    if (!messageId) return false;
    const [users] = await pool.query(`SELECT DISTINCT u.id
      FROM users u JOIN roles r ON r.role_key = u.role
      JOIN role_permissions rp ON rp.role_id = r.id
      WHERE u.is_active = 1 AND rp.permission_key = 'view_mailbox'`);
    if (!users.length) return true;
    const sender = String(fromName || 'Unknown sender').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const title = String(subject || '(No subject)').replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
    await pool.query('INSERT INTO notifications (message, user_id, type, incident_ref, is_mention, actor_id, mailbox_message_id) VALUES ?', [
      users.map((user) => [`New mailbox email from ${sender}: ${title}`, user.id, 'mailbox', null, 0, null, messageId])
    ]);
    return true;
  } catch (error) {
    console.error('Mailbox notification delivery error:', error);
    return false;
  }
}

// Read status belongs to the shared Microsoft 365 mailbox, not to one portal
// user. Once anyone opens a message, its notification must no longer pop up
// for another signed-in user.
async function markMailboxNotificationsRead(mailboxMessageId) {
  const messageId = String(mailboxMessageId || '').trim();
  if (!messageId) return 0;
  const [result] = await pool.query(
    "UPDATE notifications SET is_read = 1 WHERE type = 'mailbox' AND mailbox_message_id = ? AND is_read = 0",
    [messageId]
  );
  return Number(result.affectedRows) || 0;
}

module.exports = {
  notifyUsers,
  notifyMailboxUsers,
  markMailboxNotificationsRead,
  containsMention,
  purgeExpiredNotifications,
  NOTIFICATION_RETENTION_HOURS,
  NOTIFICATION_PURGE_INTERVAL_MS
};
