'use strict';

const express = require('express');
const { chat } = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);
router.post('/chat', chat);

module.exports = router;
