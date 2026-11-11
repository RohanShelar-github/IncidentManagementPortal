'use strict';

const pool = require('../config/database');
const { matchingCustomersByName } = require('./mailboxController');
const { confluenceConfigured, findSopCandidates, listSopLibrary } = require('../services/confluenceService');

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

module.exports = { getSopLibrary, getSopSuggestion };
