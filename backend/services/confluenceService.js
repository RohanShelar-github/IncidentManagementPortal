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

async function confluenceGet(path) {
  const response = await fetch(`${confluenceBaseUrl()}${path}`, {
    headers: { Authorization: confluenceAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Confluence request failed (${response.status})`);
  return data;
}

async function confluenceSearch(cql, limit = SOP_SEARCH_LIMIT) {
  const query = new URLSearchParams({ cql, limit: String(limit), expand: 'space' });
  return (await confluenceGet(`/rest/api/content/search?${query}`)).results || [];
}

async function confluenceChildPages(pageId) {
  const data = await confluenceGet(`/rest/api/content/${encodeURIComponent(pageId)}/child/page?limit=100`);
  return Array.isArray(data.results) ? data.results : [];
}

function toSopLink(page) {
  return {
    id: page.id,
    title: page.title,
    url: `${confluenceBaseUrl()}${page._links?.webui || ''}`
  };
}

// Each customer's SOPs live as child pages of their own "{Customer} -
// Monitoring Cookbook" page (confirmed across ~25 customers). Listing every
// customer's full catalog means ~1 + (1 per customer) Confluence calls, so
// it's cached rather than re-fetched on every page view.
const SOP_LIBRARY_CACHE_TTL_MS = 20 * 60 * 1000;
let sopLibraryCache = null; // { data, expiresAt }

function deriveCustomerFromCookbookTitle(title) {
  return String(title || '').replace(/[\s\-–]*Monitoring\s+Cookbook\s*$/i, '').trim();
}

// Strips the leading customer name and a "SOP for/on " prefix, leaving a
// short, readable category label — e.g. "TileBar- SOP for EKS Infrastructure
// Alerts" -> "EKS Infrastructure Alerts". A page whose title doesn't follow
// that convention (e.g. "TileBar – K8s Pod Memory Utilization Exceeded 6GB")
// still gets a sensible label: the customer prefix stripped, nothing more.
function deriveCategoryLabel(title, customer) {
  let remainder = String(title || '');
  if (customer) {
    const escapedCustomer = String(customer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    remainder = remainder.replace(new RegExp(`^${escapedCustomer}\\s*[-–:]?\\s*`, 'i'), '');
  }
  remainder = remainder.replace(/^SOP\s+(?:for|on)\s+/i, '').trim();
  return remainder || title;
}

// Returns every customer's SOP catalog, grouped and category-labeled,
// sourced from the CSO space's "{Customer} - Monitoring Cookbook" pages and
// their children. Returns [] (never throws) when Confluence isn't
// configured or a lookup fails, so a missing/misconfigured integration never
// breaks the SOP Library page around it.
async function listSopLibrary({ forceRefresh } = {}) {
  if (!confluenceConfigured()) return [];
  if (!forceRefresh && sopLibraryCache && sopLibraryCache.expiresAt > Date.now()) return sopLibraryCache.data;
  try {
    const cookbooks = await confluenceSearch(`space = "${cqlQuote(SOP_SPACE_KEY)}" AND type = page AND title ~ "Monitoring Cookbook"`, 100);
    const library = await Promise.all(cookbooks.map(async (cookbook) => {
      const customer = deriveCustomerFromCookbookTitle(cookbook.title);
      const children = await confluenceChildPages(cookbook.id).catch(() => []);
      return {
        customer,
        cookbookUrl: toSopLink(cookbook).url,
        pages: children.map((child) => ({ ...toSopLink(child), category: deriveCategoryLabel(child.title, customer) }))
      };
    }));
    library.sort((a, b) => a.customer.localeCompare(b.customer));
    sopLibraryCache = { data: library, expiresAt: Date.now() + SOP_LIBRARY_CACHE_TTL_MS };
    return library;
  } catch (error) {
    console.error('Confluence SOP library error:', error.message);
    return sopLibraryCache?.data || [];
  }
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

module.exports = { alertSearchText, confluenceConfigured, deriveCategoryLabel, deriveCustomerFromCookbookTitle, findSopCandidates, listSopLibrary, SOP_SPACE_KEY, stripLeadingCustomerName };
