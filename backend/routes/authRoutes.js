const express = require('express');
const router = express.Router();
const {
  login,
  getAllUsers,
  createUser,
  getCurrentUser,
  updateProfile,
  changePassword,
  updateUserRole,
  adminChangeUserPassword,
  updateUserActivation,
  deleteUser
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', login);

// PATCH /api/auth/profile
router.patch('/profile', authenticateToken, updateProfile);

// PATCH /api/auth/password
router.patch('/password', authenticateToken, changePassword);

// GET /api/auth/users
router.get('/users', authenticateToken, getAllUsers);

// POST /api/auth/users
router.post('/users', authenticateToken, createUser);

// PATCH /api/auth/users/:id/role
router.patch('/users/:id/role', authenticateToken, updateUserRole);

// PATCH /api/auth/users/:id/password
router.patch('/users/:id/password', authenticateToken, adminChangeUserPassword);

// PATCH /api/auth/users/:id/active
router.patch('/users/:id/active', authenticateToken, updateUserActivation);

// DELETE /api/auth/users/:id
router.delete('/users/:id', authenticateToken, deleteUser);

// GET /api/auth/me
router.get('/me', authenticateToken, getCurrentUser);

module.exports = router;
