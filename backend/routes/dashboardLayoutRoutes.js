'use strict';

const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getDashboardLayout, saveDashboardLayout } = require('../controllers/dashboardLayoutController');

router.use(authenticateToken);
router.get('/', requirePermission('view_dashboard'), getDashboardLayout);
router.post('/', requirePermission('customize_dashboard_layout'), saveDashboardLayout);

module.exports = router;
