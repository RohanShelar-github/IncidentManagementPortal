const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getMasterData,
  createCustomer,
  deactivateCustomer,
  createArea,
  deactivateArea
} = require('../controllers/masterDataController');

router.use(authenticateToken);

router.get('/', getMasterData);
router.post('/customers', createCustomer);
router.delete('/customers/:id', deactivateCustomer);
router.post('/areas', createArea);
router.delete('/areas/:id', deactivateArea);

module.exports = router;
