const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getRoles, saveRoles } = require('../controllers/roleController');

router.get('/', authenticateToken, getRoles);
router.put('/', authenticateToken, saveRoles);

module.exports = router;
