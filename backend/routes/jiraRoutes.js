'use strict';
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
  getCsoIncidents,
  getJiraIssue,
  getJiraIssueComments,
  getJiraIssueTransitions,
  postJiraIssueComment,
  postJiraIssueTransition
} = require('../controllers/jiraController');

const router = express.Router();
router.use(authenticateToken);
// One permission gates the whole feature end to end — the CSO Incidents
// page and the same ticket panel embedded in the Operations mailbox detail
// view both act on the same Jira data, so there is no separate read/write
// split here (unlike view_mailbox/send_mailbox) beyond Jira's own workflow
// rules (see getIssueTransitions).
router.get('/cso-incidents', requirePermission('view_cso_incidents'), getCsoIncidents);
router.get('/issue/:key', requirePermission('view_cso_incidents'), getJiraIssue);
router.get('/issue/:key/comments', requirePermission('view_cso_incidents'), getJiraIssueComments);
router.post('/issue/:key/comments', requirePermission('view_cso_incidents'), postJiraIssueComment);
router.get('/issue/:key/transitions', requirePermission('view_cso_incidents'), getJiraIssueTransitions);
router.post('/issue/:key/transitions', requirePermission('view_cso_incidents'), postJiraIssueTransition);
module.exports = router;
