const express = require('express');
const router = express.Router();
const {
  createIncident,
  getIncidents,
  getActivityLog,
  getIncidentById,
  updateIncident,
  deleteIncident,
  getDashboardStats,
  addComment,
  getCriticalEmailRecipients,
  getIncidentCommunications
} = require('../controllers/incidentController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// POST /api/incidents - Create incident
router.post('/', createIncident);

// GET /api/incidents - Get all incidents with filters
router.get('/', getIncidents);

// GET /api/incidents/stats/dashboard - Get dashboard statistics
router.get('/stats/dashboard', getDashboardStats);

// GET /api/incidents/activity-log - Get persistent incident activity
router.get('/activity-log', getActivityLog);
router.get('/critical-email-recipients', getCriticalEmailRecipients);

// GET /api/incidents/:id - Get incident by ID
router.get('/:id', getIncidentById);
router.get('/:id/communications', getIncidentCommunications);

// PUT /api/incidents/:id - Update incident
router.put('/:id', updateIncident);

// DELETE /api/incidents/:id - Delete incident
router.delete('/:id', deleteIncident);

// POST /api/incidents/:id/comments - Add comment to incident
router.post('/:id/comments', addComment);

module.exports = router;
