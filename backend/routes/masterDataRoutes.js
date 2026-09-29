const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
  getMasterData,
  createCustomer,
  updateCustomerCsm,
  updateCustomerEnvironmentStage,
  deactivateCustomer,
  createArea,
  deactivateArea,
  createIncidentTag,
  deleteIncidentTag
} = require('../controllers/masterDataController');

router.use(authenticateToken);

router.get('/', getMasterData);
router.post('/customers', createCustomer);
router.patch('/customers/:id/csm', requirePermission('manage_customer_csm'), updateCustomerCsm);
router.patch('/customers/:id/environment-stage', updateCustomerEnvironmentStage);
router.delete('/customers/:id', deactivateCustomer);
router.post('/areas', createArea);
router.delete('/areas/:id', deactivateArea);
router.post('/tags', createIncidentTag);
router.delete('/tags/:id', deleteIncidentTag);

module.exports = router;
