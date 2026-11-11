'use strict';
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getSopSuggestion } = require('../controllers/sopController');
const router = express.Router();
router.use(authenticateToken);
router.get('/suggestion', requirePermission('view_mailbox'), getSopSuggestion);
module.exports = router;
