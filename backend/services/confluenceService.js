'use strict';

// Suggests an existing Confluence SOP page for an Operations alert, by
// searching the Cloud Service Ops (CSO) space for a page whose title/content
// matches the customer and the alert's own distinctive wording. Confluence
// pages in this space follow a consistent "{Customer} - SOP for {alert
// type}" naming convention (confirmed across ~25 customers), so a CQL text
// search is enough — no per-alert mapping table to maintain, and it starts
// working automatically the moment someone adds a new SOP page.
const SOP_SPACE_KEY = String(process.env.CONFLUENCE_SOP_SPACE || 'CSO').trim();
const SOP_SEARCH_LIMIT = 5;

function confluenceConfigured() {
  return Boolean(process.env.ATLASSIAN_SITE && process.env.ATLASSIAN_EMAIL && process.env.ATLASSIAN_TOKEN);
}

function confluenceBaseUrl() {
  return `https://${String(process.env.ATLASSIAN_SITE || '').trim()}/wiki`;
}

function confluenceAuthHeader() {
  const credentials = `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

// Strips known provider-specific wrappers (Azure's "Alert '...' was
// fired/resolved", Coralogix's "Coralogix Alert on <workspace> / ...", reply
// prefixes, [RESOLVED] tags) down to the alert's own distinctive wording,
// which is what actually appears (in some form) in a matching SOP page's
// title. An unrecognized wrapper format is left as-is — CQL's fuzzy text
// search tolerates the extra noise reasonably well rather than needing every
// provider's format enumerated here.
function alertSearchText(subject) {
  return String(subject || '')
    .trim()
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/^\[RESOLVED\]\s*/i, '')
    .replace(/^alert\s+/i, '')
    .replace(/\s+was\s+(?:fired|resolved|activated|deactivated)\s*$/i, '')
    .replace(/^coralogix\s+alert\s+on\s+\S+\s*\/\s*/i, '')
    .replace(/^[’'‘"]+|[’'‘"]+$/g, '')
    .trim();
}

// Escapes a value for safe interpolation into a double-quoted CQL string
// literal (CQL, like most query languages, treats an embedded quote as the
// end of the string unless escaped).
function cqlQuote(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

// Coralogix subjects commonly read "{Customer} - {alert text}", so after
// alertSearchText the customer name is still the leading word(s) of the
// keyword phrase — duplicating it into the keyword clause alongside the
// dedicated customer title clause. Confirmed empirically against this real
// Confluence space: that duplication collapses the combined query's
// relevance score to zero hits even when an exact-match page exists (e.g.
// "Prettl - Local Agent Connectors not running for last 5 minutes" found
// nothing, but the same text with the leading "Prettl" removed found the
// real "Prettl- SOP for Local Agent Connectors Alert" page). Stripping it
// here, once, avoids that failure mode everywhere.
function stripLeadingCustomerName(keywords, customer) {
  if (!customer) return keywords;
  const escapedCustomer = String(customer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = String(keywords || '').replace(new RegExp(`^${escapedCustomer}\\s*[-:]?\\s*`, 'i'), '').trim();
  return stripped || keywords;
}

async function confluenceSearch(cql) {
  const query = new URLSearchParams({ cql, limit: String(SOP_SEARCH_LIMIT), expand: 'space' });
  const response = await fetch(`${confluenceBaseUrl()}/rest/api/content/search?${query}`, {
    headers: { Authorization: confluenceAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Confluence search failed (${response.status})`);
  return Array.isArray(data.results) ? data.results : [];
}

function toSopLink(page) {
  return {
    id: page.id,
    title: page.title,
    url: `${confluenceBaseUrl()}${page._links?.webui || ''}`
  };
}

// Returns up to a few candidate SOP pages for this alert, best match first —
// never a single confident claim, since text search can rank the wrong page.
// Returns [] (not an error) when nothing matches or Confluence isn't
// configured, so a missing/misconfigured integration never breaks the
// mailbox UI around it.
async function findSopCandidates({ customer, subject }) {
  if (!confluenceConfigured()) return [];
  const keywords = stripLeadingCustomerName(alertSearchText(subject), customer);
  if (!keywords) return [];
  const keywordClause = `(title ~ "${cqlQuote(keywords)}" OR text ~ "${cqlQuote(keywords)}")`;
  const customerClause = customer ? ` AND title ~ "${cqlQuote(customer)}"` : '';
  try {
    let results = await confluenceSearch(`space = "${cqlQuote(SOP_SPACE_KEY)}" AND type = page${customerClause} AND ${keywordClause}`);
    // A customer-scoped search can legitimately find nothing yet (e.g. a
    // brand-new alert type with no SOP written for that customer specifically)
    // — broaden to the whole SOP space rather than reporting "no SOP" when a
    // more general page might still help.
    if (!results.length && customerClause) {
      results = await confluenceSearch(`space = "${cqlQuote(SOP_SPACE_KEY)}" AND type = page AND ${keywordClause}`);
    }
    return results.map(toSopLink);
  } catch (error) {
    console.error('Confluence SOP search error:', error.message);
    return [];
  }
}

module.exports = { alertSearchText, confluenceConfigured, findSopCandidates, SOP_SPACE_KEY, stripLeadingCustomerName };
