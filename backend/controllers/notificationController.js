const pool = require('../config/database');

const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const [rows] = await pool.query(
      `SELECT id, message, type, incident_ref, is_mention, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [req.user.id, limit]
    );
    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        text: row.message,
        type: row.type || 'info',
        incId: row.incident_ref || null,
        mention: Boolean(row.is_mention),
        unread: !row.is_read,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load notifications' });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update notification' });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update notifications' });
  }
};

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
