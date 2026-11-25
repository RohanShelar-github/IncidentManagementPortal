'use strict';

const pool = require('../config/database');
const {
  addIssueComment,
  getIssueComments,
  getIssueSummary,
  getIssueTransitions,
  jiraConfigured,
  listIssuesForProject,
  transitionIssue
} = require('../services/jiraService');

// Every active customer with a Jira project code gets their own tickets
// listed on the CSO Incidents page — one JQL search per distinct project
// code, grouped back onto each customer. Cached the same way the SOP
// Library's catalog is (listSopLibrary in confluenceService.js): a 20-minute
// TTL with a manual refresh escape hatch, since listing every customer's
// tickets on every page view would mean a Jira call per customer per view.
const CSO_INCIDENTS_CACHE_TTL_MS = 20 * 60 * 1000;
let csoIncidentsCache = null; // { data, expiresAt }

async function loadCsoIncidents({ forceRefresh } = {}) {
  if (!forceRefresh && csoIncidentsCache && csoIncidentsCache.expiresAt > Date.now()) return csoIncidentsCache.data;
  const [customers] = await pool.query(
    "SELECT customer_name, jira_project_code FROM customers WHERE is_active = 1 AND jira_project_code IS NOT NULL AND jira_project_code <> '' ORDER BY customer_name"
  );
  const codeToCustomers = new Map();
  for (const customer of customers) {
    const code = String(customer.jira_project_code || '').trim().toUpperCase();
    if (!code) continue;
    if (!codeToCustomers.has(code)) codeToCustomers.set(code, []);
    codeToCustomers.get(code).push(customer.customer_name);
  }
  const results = await Promise.all([...codeToCustomers.entries()].map(async ([code, customerNames]) => {
    const tickets = await listIssuesForProject(code).catch((error) => {
      console.error(`CSO Incidents: Jira project ${code} error:`, error.message);
      return [];
    });
    return { code, customerNames, tickets };
  }));
  // A shared Jira project code (for example one regional umbrella project
  // serving several customer records) lists the same tickets under each of
  // those customers — each is still a distinct, correctly-named node in the
  // sidebar tree, same as how a shared jira_project_code is already handled
  // for incident customer matching.
  const library = results.flatMap(({ customerNames, tickets }) => customerNames.map((customer) => ({ customer, tickets })));
  library.sort((a, b) => a.customer.localeCompare(b.customer));
  csoIncidentsCache = { data: library, expiresAt: Date.now() + CSO_INCIDENTS_CACHE_TTL_MS };
  return library;
}

const getCsoIncidents = async (req, res) => {
  try {
    if (!jiraConfigured()) return res.json({ success: true, data: { configured: false, customers: [] } });
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const customers = await loadCsoIncidents({ forceRefresh });
    res.json({ success: true, data: { configured: true, customers } });
  } catch (error) {
    console.error('CSO Incidents list error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load CSO Incidents from Jira.' });
  }
};

const getJiraIssue = async (req, res) => {
  try {
    if (!jiraConfigured()) return res.status(404).json({ success: false, message: 'Jira integration is not configured.' });
    const issue = await getIssueSummary(req.params.key);
    if (!issue) return res.status(404).json({ success: false, message: 'Jira ticket not found.' });
    res.json({ success: true, data: issue });
  } catch (error) {
    console.error('Jira issue fetch error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load this ticket from Jira.' });
  }
};

const getJiraIssueComments = async (req, res) => {
  try {
    if (!jiraConfigured()) return res.json({ success: true, data: { comments: [] } });
    const comments = await getIssueComments(req.params.key);
    res.json({ success: true, data: { comments } });
  } catch (error) {
    console.error('Jira comments fetch error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load comments from Jira.' });
  }
};

const postJiraIssueComment = async (req, res) => {
  try {
    await addIssueComment(req.params.key, req.body?.text);
    res.json({ success: true, message: 'Comment added.' });
  } catch (error) {
    console.error('Jira add comment error:', error.message);
    res.status(502).json({ success: false, message: error.message === 'Comment text is required' ? error.message : 'Unable to add this comment in Jira.' });
  }
};

const getJiraIssueTransitions = async (req, res) => {
  try {
    if (!jiraConfigured()) return res.json({ success: true, data: { transitions: [] } });
    const transitions = await getIssueTransitions(req.params.key);
    res.json({ success: true, data: { transitions } });
  } catch (error) {
    console.error('Jira transitions fetch error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load available status changes from Jira.' });
  }
};

const postJiraIssueTransition = async (req, res) => {
  try {
    await transitionIssue(req.params.key, req.body?.transitionId);
    res.json({ success: true, message: 'Ticket status updated.' });
  } catch (error) {
    console.error('Jira transition error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to update this ticket\'s status in Jira.' });
  }
};

module.exports = { getCsoIncidents, getJiraIssue, getJiraIssueComments, getJiraIssueTransitions, postJiraIssueComment, postJiraIssueTransition };
