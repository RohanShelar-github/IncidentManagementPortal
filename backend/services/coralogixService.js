'use strict';

// Coralogix Alert Management integration: lets the app snooze (disable for a
// fixed duration, auto re-enabled by coralogixSnoozeScheduler.js) and tune
// (threshold/wait-time) real Coralogix alert definitions.
// Confirmed live against this account's real API (485 real alert
// definitions read back successfully) via the REST/JSON gateway Coralogix
// exposes alongside its native gRPC API — NOT the gRPC service itself
// (com.coralogixapis.alerts.v3.AlertDefsService, reachable only via
// grpcurl/a gRPC client per Coralogix's own docs). The write path (PUT
// replace) follows the documented ReplaceAlertDef gRPC-gateway convention
// but has not been exercised against a real alert yet — the first real call
// happens from the app itself (Snooze/Tune buttons), not a throwaway script,
// since mutating a live, real monitoring alert isn't something to probe
// blind.
const ALERT_DEFS_BASE = '/mgmt/openapi/3/alerts/alerts-general/v3';

function coralogixConfigured() {
  return Boolean(process.env.CORALOGIX_API_KEY && process.env.CORALOGIX_DOMAIN);
}

function coralogixBaseUrl() {
  return `https://${String(process.env.CORALOGIX_DOMAIN || '').trim()}`;
}

function coralogixAuthHeader() {
  return `Bearer ${process.env.CORALOGIX_API_KEY}`;
}

async function coralogixRequest(path, options = {}) {
  const response = await fetch(`${coralogixBaseUrl()}${path}`, {
    ...options,
    headers: { Authorization: coralogixAuthHeader(), Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.message || `Coralogix request failed (${response.status})`);
  return data;
}

// Every time-window value actually seen in this real account's alert data
// (confirmed live) — used to populate the tune form's dropdown with values
// Coralogix is guaranteed to accept, rather than guessing the full enum.
const METRIC_TIME_WINDOWS = [
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_1_OR_UNSPECIFIED', label: '1 minute' },
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_5', label: '5 minutes' },
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_10', label: '10 minutes' },
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_15', label: '15 minutes' },
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_20', label: '20 minutes' },
  { value: 'METRIC_TIME_WINDOW_VALUE_MINUTES_30', label: '30 minutes' },
  { value: 'METRIC_TIME_WINDOW_VALUE_HOUR_1', label: '1 hour' }
];
const LOGS_TIME_WINDOWS = [
  { value: 'LOGS_TIME_WINDOW_VALUE_MINUTES_5_OR_UNSPECIFIED', label: '5 minutes' },
  { value: 'LOGS_TIME_WINDOW_VALUE_MINUTES_10', label: '10 minutes' },
  { value: 'LOGS_TIME_WINDOW_VALUE_MINUTES_30', label: '30 minutes' },
  { value: 'LOGS_TIME_WINDOW_VALUE_HOURS_6', label: '6 hours' }
];

function timeWindowLabel(type, value) {
  const list = type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD' ? LOGS_TIME_WINDOWS : METRIC_TIME_WINDOWS;
  return list.find((w) => w.value === value)?.label || value || '';
}

// Confirmed live across this real account's alert data — every
// {METRIC,LOGS}_THRESHOLD_CONDITION_TYPE_* value seen. Falls back to a
// humanized version of any unrecognized value (never breaks the page over
// an enum value this list hasn't seen yet).
const CONDITION_TYPE_COMPARISON_LABELS = {
  MORE_THAN_OR_UNSPECIFIED: 'more than',
  MORE_THAN_OR_EQUALS: 'more than or equal to',
  LESS_THAN: 'less than',
  LESS_THAN_OR_EQUALS: 'less than or equal to'
};
function conditionComparisonLabel(conditionType) {
  if (!conditionType) return null;
  const suffix = String(conditionType).replace(/^(?:METRIC|LOGS)_THRESHOLD_CONDITION_TYPE_/, '');
  return CONDITION_TYPE_COMPARISON_LABELS[suffix] || suffix.replace(/_/g, ' ').toLowerCase();
}

// Dropdown options for the Edit modal's comparison selector — same four
// values, just prefixed per alert type (METRIC_THRESHOLD_CONDITION_TYPE_*
// vs LOGS_THRESHOLD_CONDITION_TYPE_*), since Coralogix keys the enum
// separately for each even though the meaning is identical.
function conditionTypeOptions(prefix) {
  return Object.keys(CONDITION_TYPE_COMPARISON_LABELS).map((suffix) => ({ value: `${prefix}_THRESHOLD_CONDITION_TYPE_${suffix}`, label: CONDITION_TYPE_COMPARISON_LABELS[suffix] }));
}
const METRIC_CONDITION_TYPES = conditionTypeOptions('METRIC');
const LOGS_CONDITION_TYPES = conditionTypeOptions('LOGS');

// Flattens one alert definition down to what the list/table actually needs
// — the full nested alertDefProperties is kept only where it's needed for a
// replace (see getAlertDefRaw), not sent to the frontend for every one of
// the (485+) rows in the list.
function toAlertSummary(def) {
  const props = def.alertDefProperties || {};
  const isMetric = props.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD';
  const isLogs = props.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD';
  const rule = isMetric ? props.metricThreshold?.rules?.[0] : isLogs ? props.logsThreshold?.rules?.[0] : null;
  const timeWindowValue = isMetric ? rule?.condition?.ofTheLast?.metricTimeWindowSpecificValue : isLogs ? rule?.condition?.timeWindow?.logsTimeWindowSpecificValue : null;
  const threshold = rule?.condition?.threshold ?? null;
  const windowLabel = timeWindowLabel(props.type, timeWindowValue);
  const comparison = conditionComparisonLabel(rule?.condition?.conditionType);
  return {
    id: def.id,
    name: props.name || '',
    type: props.type || '',
    enabled: Boolean(props.enabled),
    priority: props.priority || '',
    tunable: isMetric || isLogs,
    threshold,
    timeWindowValue: timeWindowValue || null,
    timeWindowLabel: windowLabel,
    conditionType: rule?.condition?.conditionType || null,
    // The readable "Conditions" sentence Coralogix's own UI shows (e.g.
    // "When the query returns a value of less than 3 for at least 10
    // minutes") — same wording, assembled from the same condition fields.
    conditionText: (comparison && threshold !== null && windowLabel)
      ? `When the query returns a value of ${comparison} ${threshold} for at least ${windowLabel}`
      : null,
    updatedTime: def.updatedTime || null
  };
}

// The underlying query text for a metric/logs threshold alert — PromQL for
// metric alerts, a Lucene query for logs alerts (confirmed live against
// real alert data). Other alert types (e.g. ALERT_DEF_TYPE_LOGS_NEW_VALUE,
// which tracks a keypath rather than filtering with a query) have none.
function alertQueryText(props) {
  if (props.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD') return props.metricThreshold?.metricFilter?.promql ?? null;
  if (props.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD') return props.logsThreshold?.logsFilter?.simpleFilter?.luceneQuery ?? null;
  return null;
}

// The rest of Coralogix's own "Conditions" panel beyond the threshold
// sentence — "When there is no data" and "Auto retire undetected values"
// (confirmed live: metricThreshold.undetectedValuesManagement.
// triggerUndetectedValues / autoRetireTimeframe). Only on toAlertDetail,
// like description/query — not needed for the 485-row list.
function undetectedValuesInfo(props) {
  const mgmt = props.metricThreshold?.undetectedValuesManagement || props.logsThreshold?.undetectedValuesManagement;
  if (!mgmt) return null;
  return {
    // Coralogix's own UI phrasing for this exact toggle, confirmed live.
    noDataLabel: mgmt.triggerUndetectedValues ? 'Trigger Alert' : 'Set OK',
    autoRetireLabel: String(mgmt.autoRetireTimeframe || '').replace(/^AUTO_RETIRE_TIMEFRAME_/, '').replace(/_OR_UNSPECIFIED$/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) || 'Never'
  };
}

// Adds the editable long-form fields (description, the underlying
// query) on top of toAlertSummary — kept out of the list response (up to
// 485+ rows, some descriptions run to a full runbook's worth of text) and
// only fetched for the one alert actually being opened for editing.
function toAlertDetail(def) {
  const props = def.alertDefProperties || {};
  return {
    ...toAlertSummary(def),
    description: props.description || '',
    query: alertQueryText(props),
    undetectedValues: undetectedValuesInfo(props)
  };
}

const ALERT_LIST_CACHE_TTL_MS = 10 * 60 * 1000;
let alertListCache = null; // { data, expiresAt }

async function listAlertDefs({ forceRefresh } = {}) {
  if (!coralogixConfigured()) return [];
  if (!forceRefresh && alertListCache && alertListCache.expiresAt > Date.now()) return alertListCache.data;
  const data = await coralogixRequest(ALERT_DEFS_BASE);
  const list = (data.alertDefs || []).map(toAlertSummary);
  alertListCache = { data: list, expiresAt: Date.now() + ALERT_LIST_CACHE_TTL_MS };
  return list;
}

const ID_PATTERN = /^[a-f0-9-]{10,80}$/i;
function assertAlertId(id) {
  const value = String(id || '').trim();
  if (!ID_PATTERN.test(value)) throw new Error('Invalid Coralogix alert id');
  return value;
}

// Full raw alert def (not the flattened summary) — a replace must send back
// every existing field untouched except the one being changed, since this
// is a REPLACE, not a PATCH.
async function getAlertDefRaw(id) {
  const key = assertAlertId(id);
  const data = await coralogixRequest(`${ALERT_DEFS_BASE}/${encodeURIComponent(key)}`);
  return data.alertDef;
}

async function getAlertDef(id) {
  if (!coralogixConfigured()) return null;
  const def = await getAlertDefRaw(id);
  return toAlertDetail(def);
}

async function replaceAlertDef(id, alertDefProperties) {
  const key = assertAlertId(id);
  await coralogixRequest(`${ALERT_DEFS_BASE}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ id: key, alertDefProperties })
  });
}

async function setAlertEnabled(id, enabled) {
  const def = await getAlertDefRaw(id);
  const properties = { ...def.alertDefProperties, enabled: Boolean(enabled) };
  await replaceAlertDef(id, properties);
}

// Updates whichever of name / description / query / threshold+wait-time
// were actually provided — every other field (notifications, filter
// labels, schedule, etc.) is carried through unchanged from the current
// definition, since a replace must send back the full object. threshold
// and timeWindowValue are a pair: provide both together, or neither.
async function updateAlertDetails(id, { name, description, query, threshold, timeWindowValue, conditionType }) {
  const def = await getAlertDefRaw(id);
  const properties = { ...def.alertDefProperties };

  if (name !== undefined) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) throw new Error('Name is required');
    properties.name = trimmedName;
  }
  if (description !== undefined) properties.description = String(description || '');

  if (query !== undefined) {
    if (properties.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD') {
      if (!properties.metricThreshold?.metricFilter) throw new Error('This alert has no query to edit');
      properties.metricThreshold = { ...properties.metricThreshold, metricFilter: { ...properties.metricThreshold.metricFilter, promql: String(query || '') } };
    } else if (properties.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD') {
      if (!properties.logsThreshold?.logsFilter?.simpleFilter) throw new Error('This alert has no query to edit');
      properties.logsThreshold = {
        ...properties.logsThreshold,
        logsFilter: { ...properties.logsThreshold.logsFilter, simpleFilter: { ...properties.logsThreshold.logsFilter.simpleFilter, luceneQuery: String(query || '') } }
      };
    } else {
      throw new Error('This alert type does not support query editing');
    }
  }

  if (threshold !== undefined || timeWindowValue !== undefined || conditionType !== undefined) {
    const numericThreshold = Number(threshold);
    if (!Number.isFinite(numericThreshold) || numericThreshold < 0) throw new Error('Threshold must be a non-negative number');
    if (properties.type === 'ALERT_DEF_TYPE_METRIC_THRESHOLD') {
      const rules = properties.metricThreshold?.rules;
      if (!rules?.[0]) throw new Error('This alert has no tunable metric rule');
      rules[0] = {
        ...rules[0],
        condition: { ...rules[0].condition, threshold: numericThreshold, ofTheLast: { metricTimeWindowSpecificValue: timeWindowValue }, ...(conditionType !== undefined ? { conditionType } : {}) }
      };
    } else if (properties.type === 'ALERT_DEF_TYPE_LOGS_THRESHOLD') {
      const rules = properties.logsThreshold?.rules;
      if (!rules?.[0]) throw new Error('This alert has no tunable logs rule');
      rules[0] = {
        ...rules[0],
        condition: { ...rules[0].condition, threshold: numericThreshold, timeWindow: { logsTimeWindowSpecificValue: timeWindowValue }, ...(conditionType !== undefined ? { conditionType } : {}) }
      };
    } else {
      throw new Error('This alert type does not support threshold tuning');
    }
  }

  await replaceAlertDef(id, properties);
}

module.exports = {
  coralogixConfigured,
  getAlertDef,
  LOGS_CONDITION_TYPES,
  LOGS_TIME_WINDOWS,
  listAlertDefs,
  METRIC_CONDITION_TYPES,
  METRIC_TIME_WINDOWS,
  setAlertEnabled,
  updateAlertDetails
};
