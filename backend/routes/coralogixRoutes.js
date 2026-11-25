'use strict';
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getAlert, getAlerts, postSnooze, postUnsnooze, putAlertDetails } = require('../controllers/coralogixController');

const router = express.Router();
router.use(authenticateToken);
router.get('/alerts', requirePermission('manage_coralogix_alerts'), getAlerts);
router.get('/alerts/:id', requirePermission('manage_coralogix_alerts'), getAlert);
router.post('/alerts/:id/snooze', requirePermission('manage_coralogix_alerts'), postSnooze);
router.post('/alerts/:id/unsnooze', requirePermission('manage_coralogix_alerts'), postUnsnooze);
router.put('/alerts/:id', requirePermission('manage_coralogix_alerts'), putAlertDetails);
module.exports = router;
