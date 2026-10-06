'use strict';

const { getInboxMessage } = require('./emailService');
const { deriveAlertSeverity, alertFingerprint } = require('./operationsAlertGroupingService');

// A lightweight, standalone copy of mailboxController.js's plainMailText —
// duplicated here rather than imported, so this service never has to
// require mailboxController.js (which itself calls into this service to
// resolve severities for the Operations mailbox list) and risk a require
// cycle.
function plainTextFromHtml(value) {
  return String(value || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' $1 ')
    .replace(/<\/?(?:p|div|tr|li|br|h[1-6])\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(?:x2013|8211);?/gi, '-')
    .replace(/&#(?:x2019|8217);?/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 50000);
}

// Cached by alert IDENTITY (sender + normalized subject — the same
// alertFingerprint used to group repeats elsewhere), not by individual
// message id: severity is a property of the alert rule itself, so every
// repeat of a 10-minute-interval alert reuses one cached answer instead of
// re-fetching its body on every single occurrence.
const severityCache = new Map(); // fingerprint -> { severity, expiresAt }
const SEVERITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BODY_FETCH_BATCH_SIZE = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves P1/P2/P3/null severity for each item in `items` — each shaped
// { id, from, subject, category } — and returns a Map(item.id -> severity).
// Coralogix/Azure only; any other category resolves straight to null with
// no lookup at all (Jira tickets have no severity concept).
//
// Kept deliberately gentle (small, paced batches, one retry) since this
// mailbox already runs close to Microsoft Graph's own concurrency ceiling
// from its own unrelated background polling.
async function resolveAlertSeverities(items) {
  const result = new Map();
  const list = (items || []).filter((item) => item && item.id);
  const byFingerprint = new Map(); // fingerprint -> { representative, ids }

  list.forEach((item) => {
    if (!(item.category === 'coralogix' || item.category === 'azure')) { result.set(item.id, null); return; }
    const subjectOnly = deriveAlertSeverity(item.subject, '');
    if (subjectOnly !== null) { result.set(item.id, subjectOnly); return; }
    const fingerprint = alertFingerprint(item);
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, { representative: item, ids: [] });
    byFingerprint.get(fingerprint).ids.push(item.id);
  });

  const now = Date.now();
  const needsBodyFetch = [];
  byFingerprint.forEach((group, fingerprint) => {
    const cached = severityCache.get(fingerprint);
    if (cached && cached.expiresAt > now) {
      group.ids.forEach((id) => result.set(id, cached.severity));
    } else {
      needsBodyFetch.push({ fingerprint, representative: group.representative, ids: group.ids });
    }
  });

  for (let i = 0; i < needsBodyFetch.length; i += BODY_FETCH_BATCH_SIZE) {
    const batch = needsBodyFetch.slice(i, i + BODY_FETCH_BATCH_SIZE);
    await Promise.all(batch.map(async (group) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const message = await getInboxMessage(group.representative.id);
          const severity = deriveAlertSeverity(group.representative.subject, plainTextFromHtml(message.body || message.preview || ''), group.representative.category);
          severityCache.set(group.fingerprint, { severity, expiresAt: now + SEVERITY_CACHE_TTL_MS });
          group.ids.forEach((id) => result.set(id, severity));
          return;
        } catch (error) {
          if (attempt === 0) { await sleep(600); continue; }
          // A source email can be deleted/unavailable, or Graph is still
          // throttling after the retry — leave severity unresolved for this
          // alert rather than failing the whole mailbox list.
          console.warn('Mailbox alert severity body fetch skipped:', group.representative.id, error.message);
          group.ids.forEach((id) => result.set(id, null));
        }
      }
    }));
    if (i + BODY_FETCH_BATCH_SIZE < needsBodyFetch.length) await sleep(200);
  }

  return result;
}

module.exports = { resolveAlertSeverities };
