'use strict';
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getAlertComplianceReport, listAlertComments, addAlertComment, getAlertMessage } = require('../controllers/operationsAlertReportController');

const router = express.Router();
router.use(authenticateToken);
router.get('/', requirePermission('view_alert_compliance_report'), getAlertComplianceReport);
router.get('/comments', requirePermission('view_alert_compliance_report'), listAlertComments);
router.post('/comments', requirePermission('view_alert_compliance_report'), addAlertComment);
router.get('/message/:id', requirePermission('view_alert_compliance_report'), getAlertMessage);

module.exports = router;
