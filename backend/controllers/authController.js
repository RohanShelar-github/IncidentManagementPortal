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
    initials: user.initials || String(name || '').split(/\s+/).map(p => p[0] || '').join('').substring(0, 2).toUpperCase(),
    incidents: Number(user.incidents || 0),
    lastActive: user.last_active || 'Not tracked',
    active: user.is_active === undefined ? true : Boolean(user.is_active)
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
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'This user account is inactive' });
    }
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
    const [users] = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
             COUNT(i.id) AS incidents
        FROM users u
        LEFT JOIN incidents i ON i.assigned_to = u.id
       GROUP BY u.id, u.email, u.full_name, u.role, u.is_active, u.created_at
       ORDER BY u.full_name
    `);
    return res.status(200).json({ success: true, data: users.map(userDto) });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: userDto(users[0]) });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateUserRole = async (req, res) => {
  try {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can change user roles' });
    }

    const userId = Number(req.params.id);
    const role = String(req.body.role || '').trim().toLowerCase();
    const allowedRoles = ['admin', 'cso', 'pmo', 'aoc', 'engineer', 'stakeholder'];
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid user role' });
    }
    if (Number(req.user.id) === userId) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }

    const [result] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const [users] = await pool.query('SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = ?', [userId]);
    return res.status(200).json({ success: true, message: 'User role updated successfully', data: userDto(users[0]) });
  } catch (error) {
    console.error('Update user role error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateUserActivation = async (req, res) => {
  try {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can activate or deactivate users' });
    }
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (Number(req.user.id) === userId) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own user account' });
    }
    if (typeof req.body.active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Active status must be true or false' });
    }

    const [result] = await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [req.body.active ? 1 : 0, userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const [users] = await pool.query('SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = ?', [userId]);
    const action = req.body.active ? 'activated' : 'deactivated';
    return res.status(200).json({ success: true, message: `User ${action} successfully`, data: userDto(users[0]) });
  } catch (error) {
    console.error('Update user activation error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can delete users' });
    }

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (Number(req.user.id) === userId) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own user account' });
    }

    const [users] = await pool.query('SELECT id, full_name, email FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return res.status(200).json({
      success: true,
      message: `User ${users[0].full_name || users[0].email} deleted successfully`
    });
  } catch (error) {
    if (error && error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        message: 'This user cannot be deleted because they are referenced by existing incident history'
      });
    }
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { login, getAllUsers, getCurrentUser, updateUserRole, updateUserActivation, deleteUser };
