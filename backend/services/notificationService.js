const pool = require('../config/database');

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

module.exports = { notifyUsers, containsMention };
