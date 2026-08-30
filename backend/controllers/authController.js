const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { jwtSecret } = require('../config/security');
const { hasRolePermission } = require('../middleware/permissions');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function loginAttemptKey(req, email) {
  return `${String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 128)}:${String(email || '').trim().toLowerCase()}`;
}

function canAttemptLogin(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return true;
  const now = Date.now();
  if (attempt.lockedUntil > now) return false;
  if (now - attempt.firstFailure > LOGIN_WINDOW_MS) { loginAttempts.delete(key); return true; }
  return true;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const previous = loginAttempts.get(key);
  const attempt = !previous || now - previous.firstFailure > LOGIN_WINDOW_MS ? { firstFailure: now, count: 0, lockedUntil: 0 } : previous;
  attempt.count += 1;
  if (attempt.count >= LOGIN_MAX_FAILURES) attempt.lockedUntil = now + LOGIN_LOCKOUT_MS;
  loginAttempts.set(key, attempt);
}

function clearFailedLogins(key) { loginAttempts.delete(key); }

function userDto(user) {
  const name = user.full_name || user.name || user.email;
  return {
    id: user.id,
    email: user.email,
    name,
    role: user.role,
    phone: user.phone || '',
    department: user.department || '',
    location: user.location || '',
    bio: user.bio || '',
    initials: user.initials || String(name || '').split(/\s+/).map(p => p[0] || '').join('').substring(0, 2).toUpperCase(),
    incidents: Number(user.incidents || 0),
    lastActive: user.last_active || 'Not tracked',
    active: user.is_active === undefined ? true : Boolean(user.is_active)
  };
}

// Incident creators only need a display-name directory for assignment.  Keep
// the full account list (including email and usage details) restricted to
// administrators who manage user accounts.
function assigneeDto(user) {
  const name = user.full_name || user.name || user.email;
  return {
    id: user.id,
    name,
    role: user.role,
    initials: user.initials || String(name || '').split(/\s+/).map(p => p[0] || '').join('').substring(0, 2).toUpperCase(),
    active: user.is_active === undefined ? true : Boolean(user.is_active)
  };
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const attemptKey = loginAttemptKey(req, normalizedEmail);
    const invalidCredentials = () => res.status(401).json({ success: false, message: 'Invalid email or password' });
    if (!normalizedEmail || !password) return invalidCredentials();
    if (!canAttemptLogin(attemptKey)) return res.status(429).json({ success: false, message: 'Too many login attempts. Please try again later.' });

    const [users] = await pool.query('SELECT id, email, full_name, role, phone, department, location, bio, is_active, password FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (users.length === 0) {
      recordFailedLogin(attemptKey);
      return invalidCredentials();
    }

    const user = users[0];
    if (!user.is_active) {
      recordFailedLogin(attemptKey);
      return invalidCredentials();
    }
    const storedPassword = String(user.password || '');
    const passwordOk = storedPassword.startsWith('$2')
      ? await bcrypt.compare(password, storedPassword)
      : storedPassword === password;

    if (!passwordOk) {
      recordFailedLogin(attemptKey);
      return invalidCredentials();
    }

    // Preserve the user's actual password while eliminating legacy plaintext
    // storage the next time that user successfully authenticates.
    if (!storedPassword.startsWith('$2')) {
      try {
        const passwordHash = await bcrypt.hash(password, 12);
        await pool.query('UPDATE users SET password = ? WHERE id = ? AND password = ?', [passwordHash, user.id, storedPassword]);
      } catch (upgradeError) {
        console.error('Legacy password hash upgrade failed for user:', user.id);
      }
    }
    clearFailedLogins(attemptKey);
    const dto = userDto(user);
    const token = jwt.sign(
      { id: dto.id, email: dto.email, name: dto.name, role: dto.role },
      jwtSecret(),
      { expiresIn: process.env.JWT_EXPIRY || '8h' }
    );

    return res.status(200).json({ success: true, message: 'Login successful', token, user: dto });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const isAdmin = String(req.user.role || '').toLowerCase() === 'admin';
    const canCreateIncidents = isAdmin || await hasRolePermission(req.user.role, 'create_incidents');
    if (!canCreateIncidents) {
      return res.status(403).json({ success: false, message: 'Only administrators can view user accounts' });
    }

    // AOC/engineer roles must be able to assign an incident, but must not be
    // given the administrator's account-management directory.
    if (!isAdmin) {
      const [users] = await pool.query(`
        SELECT id, full_name, role, is_active
          FROM users
         WHERE is_active = 1
         ORDER BY full_name
      `);
      return res.status(200).json({ success: true, data: users.map(assigneeDto) });
    }

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
    const [users] = await pool.query('SELECT id, email, full_name, role, phone, department, location, bio, is_active, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: userDto(users[0]) });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createUser = async (req, res) => {
  try {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can add users' });
    }
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = String(req.body.role || '').trim().toLowerCase();
    const department = String(req.body.department || '').trim();
    const password = String(req.body.password || '');

    if (!fullName || fullName.length > 255) {
      return res.status(400).json({ success: false, message: 'Full name is required and must not exceed 255 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    const [matchingRoles] = await pool.query('SELECT role_key FROM roles WHERE role_key = ? LIMIT 1', [role]);
    if (!matchingRoles.length) {
      return res.status(400).json({ success: false, message: 'Invalid user role' });
    }
    if (department.length > 100) {
      return res.status(400).json({ success: false, message: 'Department must not exceed 100 characters' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, message: 'Password must be between 8 and 72 characters' });
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must include uppercase, lowercase, and numeric characters' });
    }

    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existingUsers.length) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password, role, department, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [fullName, email, passwordHash, role, department || null]
    );
    const [users] = await pool.query(
      'SELECT id, email, full_name, role, phone, department, location, bio, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ success: true, message: `User ${fullName} added successfully`, data: userDto(users[0]) });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const phone = String(req.body.phone || '').trim();
    const department = String(req.body.department || '').trim();
    const location = String(req.body.location || '').trim();
    const bio = String(req.body.bio || '').trim();

    if (!fullName || fullName.length > 255) {
      return res.status(400).json({ success: false, message: 'Display name is required and must not exceed 255 characters' });
    }
    if (phone.length > 50 || department.length > 100 || location.length > 100 || bio.length > 1000) {
      return res.status(400).json({ success: false, message: 'One or more profile fields exceed the allowed length' });
    }

    const [result] = await pool.query(
      'UPDATE users SET full_name = ?, phone = ?, department = ?, location = ?, bio = ? WHERE id = ?',
      [fullName, phone || null, department || null, location || null, bio || null, req.user.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const [users] = await pool.query(
      'SELECT id, email, full_name, role, phone, department, location, bio, is_active, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: userDto(users[0]) });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ success: false, message: 'New password must be between 8 and 72 characters' });
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'New password must include uppercase, lowercase, and numeric characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password' });
    }

    const [users] = await pool.query('SELECT id, password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const storedPassword = String(users[0].password || '');
    const currentPasswordOk = storedPassword.startsWith('$2')
      ? await bcrypt.compare(currentPassword, storedPassword)
      : storedPassword === currentPassword;
    if (!currentPasswordOk) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, req.user.id]);
    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
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
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const [matchingRoles] = await pool.query('SELECT role_key FROM roles WHERE role_key = ? LIMIT 1', [role]);
    if (!matchingRoles.length) {
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

const adminChangeUserPassword = async (req, res) => {
  try {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can change user passwords' });
    }
    const userId = Number(req.params.id);
    const newPassword = String(req.body.newPassword || '');
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ success: false, message: 'New password must be between 8 and 72 characters' });
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'New password must include uppercase, lowercase, and numeric characters' });
    }

    const [users] = await pool.query('SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, userId]);
    const userName = users[0].full_name || users[0].email;
    return res.status(200).json({ success: true, message: `Password changed successfully for ${userName}` });
  } catch (error) {
    console.error('Admin change user password error:', error);
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

module.exports = { login, getAllUsers, createUser, getCurrentUser, updateProfile, changePassword, updateUserRole, adminChangeUserPassword, updateUserActivation, deleteUser };
