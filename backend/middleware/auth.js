const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { jwtSecret } = require('../config/security');

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
      next();
    } catch (error) {
      console.error('Authentication user lookup error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
};

module.exports = { authenticateToken };
