'use strict';

// Lets the app manage Jira tickets that customers raised themselves (the
// same "Customer Raised Tickets" category already classified in the
// Operations mailbox, and listed per-customer on the CSO Incidents page) —
// adding comments and moving the ticket through its workflow. It never
// creates tickets; only tickets that already exist in Jira.
// Shares the same Atlassian account/API token already configured for
// Confluence (ATLASSIAN_SITE/ATLASSIAN_EMAIL/ATLASSIAN_TOKEN) — Jira Cloud
// and Confluence Cloud sit on the same site and accept the same Basic Auth.
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const PROJECT_CODE_PATTERN = /^[A-Z][A-Z0-9]+$/i;

function jiraConfigured() {
  return Boolean(process.env.ATLASSIAN_SITE && process.env.ATLASSIAN_EMAIL && process.env.ATLASSIAN_TOKEN);
}

function jiraBaseUrl() {
  return `https://${String(process.env.ATLASSIAN_SITE || '').trim()}/rest/api/3`;
}

function jiraAuthHeader() {
  const credentials = `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

function assertIssueKey(key) {
  const value = String(key || '').trim().toUpperCase();
  if (!ISSUE_KEY_PATTERN.test(value)) throw new Error('Invalid Jira issue key');
  return value;
}

function assertProjectCode(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!PROJECT_CODE_PATTERN.test(value)) throw new Error('Invalid Jira project code');
  return value;
}

async function jiraRequest(path, options = {}) {
  const response = await fetch(`${jiraBaseUrl()}${path}`, {
    ...options,
    headers: { Authorization: jiraAuthHeader(), Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.errorMessages?.[0] || data?.message || `Jira request failed (${response.status})`);
  return data;
}

// Wraps plain text into the minimal Atlassian Document Format Jira Cloud's
// v3 API requires for writing a comment (plain strings are rejected).
function textToAdf(text) {
  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: String(text || '') }] }] };
}

function toTicketSummary(issue) {
  return {
    key: issue.key,
    summary: issue.fields?.summary || '',
    status: issue.fields?.status?.name || '',
    statusCategory: issue.fields?.status?.statusCategory?.key || '',
    assignee: issue.fields?.assignee?.displayName || null,
    created: issue.fields?.created || null,
    updated: issue.fields?.updated || null,
    // Only present when the request asked for expand=renderedFields (the
    // single-issue fetch does; the project list search doesn't, to keep
    // that payload small across up to 50 tickets at once) — Jira's own
    // rendered HTML for the description, same idea as a comment's
    // renderedBody, so no Atlassian Document Format parsing is needed here.
    description: issue.renderedFields?.description || '',
    // Only present when the request asked for the comment field (the
    // single-issue fetch does) — Jira's issue GET conveniently returns the
    // comment thread's total count alongside everything else, so the real
    // comment count can be shown (e.g. in the Alert Compliance table's 💬
    // icon) without a second, dedicated /comment request per ticket.
    commentCount: issue.fields?.comment?.total ?? 0,
    url: `https://${String(process.env.ATLASSIAN_SITE || '').trim()}/browse/${issue.key}`
  };
}

// One JQL search per Jira project code — each customer's tickets live under
// their own project (customers.jira_project_code), the same field the
// mailbox customer-matching flow already relies on.
// Uses /search/jql, not the legacy /search — Atlassian removed /search in
// 2025 (confirmed live against this site: it now returns a 410-style
// "migrate to /rest/api/3/search/jql" error instead of search results).
// A customer's Jira project is not dedicated to incidents — it also holds
// other issue types (Task, Story, Production Deployment Request, Bug, etc,
// confirmed against this real project's own "Create" issue-type picker), so
// the search is scoped to the "CSO Incident" issue type specifically —
// otherwise every unrelated ticket in the project would show up here too.
const CSO_INCIDENT_ISSUE_TYPE = 'CSO Incident';

async function listIssuesForProject(projectCode) {
  if (!jiraConfigured()) return [];
  const code = assertProjectCode(projectCode);
  const query = new URLSearchParams({
    jql: `project = "${code}" AND issuetype = "${CSO_INCIDENT_ISSUE_TYPE}" ORDER BY created DESC`,
    maxResults: '50',
    fields: 'summary,status,assignee,created,updated'
  });
  const data = await jiraRequest(`/search/jql?${query}`);
  return (data.issues || []).map(toTicketSummary);
}

async function getIssueSummary(issueKey) {
  if (!jiraConfigured()) return null;
  const key = assertIssueKey(issueKey);
  const data = await jiraRequest(`/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,created,updated,description,comment&expand=renderedFields`);
  return toTicketSummary(data);
}

// expand=renderedBody returns Jira's own rendered HTML per comment (same
// idea as Confluence's body.view) — no need to parse Atlassian Document
// Format JSON just to display a comment someone already wrote.
async function getIssueComments(issueKey) {
  if (!jiraConfigured()) return [];
  const key = assertIssueKey(issueKey);
  const data = await jiraRequest(`/issue/${encodeURIComponent(key)}/comment?expand=renderedBody&orderBy=-created`);
  return (data.comments || []).map((comment) => ({
    id: comment.id,
    author: comment.author?.displayName || 'Unknown',
    html: comment.renderedBody || '',
    created: comment.created
  }));
}

async function addIssueComment(issueKey, text) {
  const key = assertIssueKey(issueKey);
  const value = String(text || '').trim();
  if (!value) throw new Error('Comment text is required');
  await jiraRequest(`/issue/${encodeURIComponent(key)}/comment`, { method: 'POST', body: JSON.stringify({ body: textToAdf(value) }) });
}

// A Jira ticket's status is a workflow state, not a free-text field — only
// the transitions Jira currently allows from the ticket's current state can
// ever be offered, so the frontend always drives its dropdown from this
// list rather than a hardcoded status set.
async function getIssueTransitions(issueKey) {
  if (!jiraConfigured()) return [];
  const key = assertIssueKey(issueKey);
  const data = await jiraRequest(`/issue/${encodeURIComponent(key)}/transitions`);
  return (data.transitions || []).map((transition) => ({ id: transition.id, name: transition.name, toStatus: transition.to?.name || '' }));
}

async function transitionIssue(issueKey, transitionId) {
  const key = assertIssueKey(issueKey);
  const id = String(transitionId || '').trim();
  if (!id) throw new Error('A transition id is required');
  await jiraRequest(`/issue/${encodeURIComponent(key)}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id } }) });
}

module.exports = {
  addIssueComment,
  getIssueComments,
  getIssueSummary,
  getIssueTransitions,
  jiraConfigured,
  listIssuesForProject,
  transitionIssue
};
