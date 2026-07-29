const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notificationController');

const router = express.Router();
router.use(authenticateToken);
router.get('/', getNotifications);
router.put('/read-all', markAllNotificationsRead);
router.put('/:id/read', markNotificationRead);

module.exports = router;
