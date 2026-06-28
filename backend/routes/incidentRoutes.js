const express = require('express');
const router = express.Router();
const {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  getDashboardStats,
  addComment
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

// GET /api/incidents/:id - Get incident by ID
router.get('/:id', getIncidentById);

// PUT /api/incidents/:id - Update incident
router.put('/:id', updateIncident);

// DELETE /api/incidents/:id - Delete incident
router.delete('/:id', deleteIncident);

// POST /api/incidents/:id/comments - Add comment to incident
router.post('/:id/comments', addComment);

module.exports = router;
