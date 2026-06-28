const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query user from database
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    const user = users[0];

    // Simple password comparison (in production, use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Please try again'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production-2024',
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        initials: user.initials
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, name, role, initials, created_at FROM users');

    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const [users] = await pool.query('SELECT id, email, name, role, initials FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  login,
  getAllUsers,
  getCurrentUser
};
