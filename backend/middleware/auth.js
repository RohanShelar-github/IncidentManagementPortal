const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { jwtSecret } = require('../config/security');

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const lastActivityWrites = new Map();

function recordUserActivity(userId) {
  const now = Date.now();
  const previous = lastActivityWrites.get(userId) || 0;
  if (now - previous < ACTIVITY_WRITE_INTERVAL_MS) return;
  lastActivityWrites.set(userId, now);
  // Activity tracking must never prevent an otherwise valid authenticated
  // request from completing.
  pool.query('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [userId])
    .catch((error) => console.error('Last-active update failed:', error.message));
}

const authenticateToken = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token is required'
    });
  }

  jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }, async (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    try {
      const [users] = await pool.query('SELECT id, email, full_name, role, is_active FROM users WHERE id = ? LIMIT 1', [user.id]);
      if (!users.length || !users[0].is_active) {
        return res.status(403).json({ success: false, message: 'This user account is inactive' });
      }
      req.user = {
        ...user,
        email: users[0].email,
        name: users[0].full_name || users[0].email,
        role: users[0].role
      };
      recordUserActivity(users[0].id);
      next();
    } catch (error) {
      console.error('Authentication user lookup error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
};

module.exports = { authenticateToken };
