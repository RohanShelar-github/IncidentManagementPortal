const express = require('express');
const router = express.Router();
const {
  login,
  getAllUsers,
  getCurrentUser,
  updateUserRole,
  updateUserActivation,
  deleteUser
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/users
router.get('/users', authenticateToken, getAllUsers);

// PATCH /api/auth/users/:id/role
router.patch('/users/:id/role', authenticateToken, updateUserRole);

// PATCH /api/auth/users/:id/active
router.patch('/users/:id/active', authenticateToken, updateUserActivation);

// DELETE /api/auth/users/:id
router.delete('/users/:id', authenticateToken, deleteUser);

// GET /api/auth/me
router.get('/me', authenticateToken, getCurrentUser);

module.exports = router;
