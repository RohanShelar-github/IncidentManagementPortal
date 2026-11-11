'use strict';

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { jwtSecret } = require('../config/security');
const { matchingCustomersByName } = require('./mailboxController');
const { confluenceConfigured, fetchConfluenceAsset, findSopCandidates, getSopPageContent, listSopLibrary, rewriteConfluenceImageSrcs } = require('../services/confluenceService');

// Best-effort customer resolution for the SOP suggestion only — this is
// advisory (the user clicks through and judges the result themselves), so it
// reuses the same rules already proven for incident customer auto-selection
// (mailboxController.prepareMailboxIncident) without that flow's full
// Jira-project-code precedence handling, which exists there to pick exactly
// one customer for a created incident, not to narrow a Confluence search.
async function resolveAlertCustomerName(category, subject) {
  if (category === 'azure' || category === 'ngcplantsmonitoring') return 'NGC';
  const [customers] = await pool.query("SELECT customer_name FROM customers WHERE is_active = 1 ORDER BY customer_name");
  const matches = matchingCustomersByName(customers, subject);
  return matches.length === 1 ? matches[0].customer_name : null;
}

const getSopSuggestion = async (req, res) => {
  try {
    if (!confluenceConfigured()) return res.json({ success: true, data: { configured: false, candidates: [] } });
    const category = String(req.query.category || '').trim();
    const subject = String(req.query.subject || '').trim();
    if (!subject) return res.status(400).json({ success: false, message: 'subject is required' });
    const customer = await resolveAlertCustomerName(category, subject);
    const candidates = await findSopCandidates({ customer, subject });
    res.json({ success: true, data: { configured: true, customer, candidates } });
  } catch (error) {
    console.error('SOP suggestion error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to search Confluence for a matching SOP.' });
  }
};

const getSopLibrary = async (req, res) => {
  try {
    if (!confluenceConfigured()) return res.json({ success: true, data: { configured: false, customers: [] } });
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const customers = await listSopLibrary({ forceRefresh });
    res.json({ success: true, data: { configured: true, customers } });
  } catch (error) {
    console.error('SOP library error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the SOP library from Confluence.' });
  }
};

// The SOP content viewer's embedded images are rewritten to point back at
// getSopAsset (see below) so they load with Confluence's own credentials —
// the viewer page itself passes its JWT along in that rewritten URL, read
// back here.
const getSopPage = async (req, res) => {
  try {
    if (!confluenceConfigured()) return res.status(404).json({ success: false, message: 'Confluence integration is not configured.' });
    const page = await getSopPageContent(req.params.id);
    if (!page) return res.status(404).json({ success: false, message: 'SOP page not found.' });
    const token = String(req.headers.authorization || '').split(' ')[1] || '';
    const assetProxyBase = `/api/sop/asset?token=${encodeURIComponent(token)}`;
    res.json({ success: true, data: { id: page.id, title: page.title, html: rewriteConfluenceImageSrcs(page.html, page.attachments, assetProxyBase) } });
  } catch (error) {
    console.error('SOP page content error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load this SOP page from Confluence.' });
  }
};

// Loaded via a plain <img src> inside the sandboxed content iframe, which
// cannot attach an Authorization header — so this route authenticates via a
// ?token= query param instead of the standard Bearer-header middleware
// (hence it is registered before router.use(authenticateToken), not after).
const getSopAsset = async (req, res) => {
  try {
    jwt.verify(String(req.query.token || ''), jwtSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).end();
  }
  try {
    const asset = await fetchConfluenceAsset(String(req.query.url || ''));
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(asset.buffer);
  } catch (error) {
    console.error('SOP asset proxy error:', error.message);
    res.status(502).end();
  }
};

module.exports = { getSopAsset, getSopLibrary, getSopPage, getSopSuggestion };
