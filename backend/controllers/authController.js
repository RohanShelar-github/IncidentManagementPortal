const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

function userDto(user) {
  const name = user.full_name || user.name || user.email;
  return {
    id: user.id,
    email: user.email,
    name,
    role: user.role,
    initials: user.initials || String(name || '').split(/\s+/).map(p => p[0] || '').join('').substring(0, 2).toUpperCase()
  };
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'No account found with this email address' });
    }

    const user = users[0];
    const storedPassword = String(user.password || '');
    const passwordOk = storedPassword.startsWith('$2')
      ? await bcrypt.compare(password, storedPassword)
      : storedPassword === password;

    if (!passwordOk) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again' });
    }

    const dto = userDto(user);
    const token = jwt.sign(
      { id: dto.id, email: dto.email, name: dto.name, role: dto.role },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production-2024',
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    return res.status(200).json({ success: true, message: 'Login successful', token, user: dto });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, full_name, role, created_at FROM users ORDER BY full_name');
    return res.status(200).json({ success: true, data: users.map(userDto) });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, full_name, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: userDto(users[0]) });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { login, getAllUsers, getCurrentUser };
