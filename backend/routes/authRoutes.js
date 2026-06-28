const express = require('express');
const router = express.Router();
const {
  login,
  getAllUsers,
  getCurrentUser
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/users
router.get('/users', authenticateToken, getAllUsers);

// GET /api/auth/me
router.get('/me', authenticateToken, getCurrentUser);

module.exports = router;
