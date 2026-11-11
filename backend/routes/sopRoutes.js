'use strict';
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { getSopAsset, getSopLibrary, getSopPage, getSopSuggestion } = require('../controllers/sopController');
const router = express.Router();
// Registered before authenticateToken: loaded via <img src> inside the SOP
// content iframe, which cannot send an Authorization header, so this route
// authenticates itself via its own ?token= query param instead (see
// sopController.getSopAsset).
router.get('/asset', getSopAsset);
router.use(authenticateToken);
router.get('/suggestion', requirePermission('view_mailbox'), getSopSuggestion);
router.get('/library', requirePermission('view_mailbox'), getSopLibrary);
router.get('/page/:id', requirePermission('view_mailbox'), getSopPage);
module.exports = router;
