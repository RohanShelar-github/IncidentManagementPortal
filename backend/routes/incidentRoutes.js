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
  getRecipientDirectory,
  getIncidentCommunications
} = require('../controllers/incidentController');
const {
  createIncidentDraft,
  deleteIncidentDraft,
  getIncidentDraft,
  listIncidentDrafts,
  setIncidentDraftResolved
} = require('../controllers/incidentDraftController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, requireClosePermissionWhenClosing } = require('../middleware/permissions');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// POST /api/incidents - Create incident
router.post('/', requirePermission('create_incidents'), createIncident);

// Drafts are kept separate from incidents until the user completes the
// email-review step after the source email's ten-minute review window.
router.get('/drafts', requirePermission('view_drafts'), listIncidentDrafts);
router.post('/drafts', requirePermission('create_incidents'), createIncidentDraft);
router.get('/drafts/:id', requirePermission('view_drafts'), getIncidentDraft);
router.post('/drafts/:id/resolve', requirePermission('create_incidents'), setIncidentDraftResolved);
router.delete('/drafts/:id', requirePermission('delete_drafts'), deleteIncidentDraft);

// GET /api/incidents - Get all incidents with filters
router.get('/', requirePermission('view_incidents'), getIncidents);

// GET /api/incidents/stats/dashboard - Get dashboard statistics
router.get('/stats/dashboard', requirePermission('view_incidents'), getDashboardStats);

// GET /api/incidents/activity-log - Get persistent incident activity
router.get('/activity-log', requirePermission('view_incidents'), getActivityLog);
router.get('/critical-email-recipients', requirePermission('create_incidents'), getCriticalEmailRecipients);
router.get('/recipient-directory', requirePermission('create_incidents'), getRecipientDirectory);

// GET /api/incidents/:id - Get incident by ID
router.get('/:id', requirePermission('view_incidents'), getIncidentById);
router.get('/:id/communications', requirePermission('view_incidents'), getIncidentCommunications);

// PUT /api/incidents/:id - Update incident
router.put('/:id', requirePermission('edit_incidents'), requireClosePermissionWhenClosing, updateIncident);

// DELETE /api/incidents/:id - Delete incident
router.delete('/:id', requirePermission('delete_incidents'), deleteIncident);

// POST /api/incidents/:id/comments - Add comment to incident
router.post('/:id/comments', requirePermission('edit_incidents'), addComment);

module.exports = router;
