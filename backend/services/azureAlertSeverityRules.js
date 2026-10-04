'use strict';

const fs = require('fs');
const path = require('path');

// A one-time export of every configured Azure Monitor alert rule's own
// severity (Name -> SevN), supplied directly by Ops — several Azure alert
// email templates never state a severity anywhere in their own subject or
// body (see deriveAlertSeverity's final tier in operationsAlertGroupingService.js),
// so this file is the only remaining source of truth for those.
const CSV_PATH = path.join(__dirname, '..', 'data', 'azure-alert-severity-rules.csv');

function parseCsvLine(line) {
  // A plain split is safe here: Azure's own export already escapes any
  // literal comma inside a field as %2C before handing it to us (verified
  // against the supplied file), so no quoted-field CSV parsing is needed.
  return line.split(',');
}

function sevTokenToLevel(sevToken) {
  const match = String(sevToken || '').match(/(\d)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (n <= 1) return 'P1'; // Sev0 Critical, Sev1 Error
  if (n === 2) return 'P2'; // Sev2 Warning
  return 'P3'; // Sev3 Informational, Sev4 Verbose
}

function loadRules() {
  const byName = new Map(); // lowercased, trimmed rule name -> 'P1'|'P2'|'P3'
  try {
    const raw = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    lines.slice(1).forEach((line) => { // skip header row
      const cols = parseCsvLine(line);
      const name = String(cols[0] || '').trim();
      const level = sevTokenToLevel(cols[2]);
      if (name && level) byName.set(name.toLowerCase(), level);
    });
  } catch (error) {
    console.error('Azure alert severity rules load error:', error.message);
  }
  return byName;
}

const RULES_BY_NAME = loadRules();
// Longest name first, so a more specific rule name (e.g. "Critical Alert for
// MySQL Flexible Server") is matched before a short, generic one (e.g. "CPU
// Usage") that could otherwise false-positive as a substring of it.
const RULE_NAMES_BY_LENGTH_DESC = Array.from(RULES_BY_NAME.keys()).sort((a, b) => b.length - a.length);

// Tier A: the alert's own name is quoted in its subject — "Alert 'X' was
// fired/resolved" (or "...was STATE" once normalizeAlertSubject has run) —
// an exact, high-confidence lookup straight off the rule name.
function lookupByQuotedSubjectName(subject) {
  const match = String(subject || '').match(/Alert\s+['’]([^'’]+)['’]\s+was\s+(?:fired|resolved|STATE)/i);
  if (!match) return null;
  return RULES_BY_NAME.get(match[1].trim().toLowerCase()) || null;
}

// Tier B: fall back to scanning the subject+body for any known rule name
// mentioned as plain text — covers e.g. an Azure Service/Resource Health
// notification that names its own alert rule in prose rather than in quotes.
function lookupByNameMention(text) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return null;
  for (const name of RULE_NAMES_BY_LENGTH_DESC) {
    if (haystack.includes(name)) return RULES_BY_NAME.get(name);
  }
  return null;
}

// Azure-only fallback: looks up the alert's own configured severity from the
// exported Azure Monitor alert-rules reference when neither the subject nor
// the body states a severity directly.
function lookupAzureAlertSeverityByRuleName(subject, bodyText) {
  return lookupByQuotedSubjectName(subject) || lookupByNameMention(`${subject || ''} ${bodyText || ''}`);
}

module.exports = { lookupAzureAlertSeverityByRuleName };
