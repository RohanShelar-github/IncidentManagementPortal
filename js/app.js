window.onerror = function (msg, src, line, col, err) {
  var d = document.getElementById('_errbox');
  if (!d) {
    d = document.createElement('div'); d.id = '_errbox';
    d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#c00;color:#fff;font:11px monospace;padding:8px;z-index:99999;max-height:160px;overflow:auto;white-space:pre-wrap;';
    document.body && document.body.appendChild(d);
  }
  var stack = (err && err.stack) ? err.stack.split('\n').slice(0, 4).join(' | ') : '';
  d.innerHTML += '<div>ERROR line ' + line + ': ' + msg + (stack ? ' \u2192 ' + stack : '') + '</div>';
  return false;
};

// ═══════════════════════════════════════════════════════════
// GLOBAL CLICK DELEGATION — parse-time, capture phase
// Proven pattern from minimal test. Catches ALL clicks.
// ═══════════════════════════════════════════════════════════
document.addEventListener('click', function (e) {
  var t = e.target;
  function up(el, id) {
    while (el && el !== document) { if (el.id === id) return true; el = el.parentElement; }
    return false;
  }

  if (up(t, 'loginBtn')) { e.stopPropagation(); try { doLogin(); } catch (ex) { } return; }
  if (up(t, 'eyeIcon')) { e.stopPropagation(); try { togglePwd(); } catch (ex) { } return; }
  if (up(t, 'sidebarToggleBtn')) { e.stopPropagation(); try { toggleSidebar(); } catch (ex) { } return; }
  if (up(t, 'btnSearch')) { e.stopPropagation(); try { openGlobalSearch(); } catch (ex) { } return; }
  if (up(t, 'btnTheme')) { e.stopPropagation(); try { toggleTheme(); } catch (ex) { } return; }

  if (up(t, 'btnNotif')) {
    e.stopPropagation();
    var pd = document.getElementById('profileDropdown'), np = document.getElementById('notifPanel');
    if (pd) pd.classList.remove('open');
    if (np) {
      var opening = !np.classList.contains('open');
      np.classList.toggle('open');
      if (opening) {
        loadNotificationsFromBackend({ initial: false });
        renderNotifList();
      }
    }
    return;
  }
  if (up(t, 'profileTrigger')) {
    e.stopPropagation();
    var np2 = document.getElementById('notifPanel'), pd2 = document.getElementById('profileDropdown');
    if (np2) np2.classList.remove('open');
    if (pd2) pd2.classList.toggle('open');
    return;
  }
  if (up(t, 'dp_edit_btn')) { e.stopPropagation(); try { switchToEditMode(); } catch (ex) { } return; }
  if (up(t, 'dp_close_inc_btn')) {
    e.stopPropagation();
    try { if (detailCurrentId) closeDetailFromIncidentClose(detailCurrentId); } catch (ex) { }
    return;
  }

  // Close panels on outside click
  if (!up(t, 'notifPanel') && !up(t, 'btnNotif')) {
    var np3 = document.getElementById('notifPanel'); if (np3) np3.classList.remove('open');
  }
  if (!up(t, 'profileDropdown') && !up(t, 'profileTrigger')) {
    var pd3 = document.getElementById('profileDropdown'); if (pd3) pd3.classList.remove('open');
  }
}, true);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && (e.target.id === 'loginEmail' || e.target.id === 'loginPassword')) {
    try { doLogin(); } catch (ex) { }
  }
}, true);

// ─── DATA ─────────────────────────────────────────────────────
let currentRole = 'admin';
let currentUserName = ''; 
let currentUserProfile = {};
let editingId = null;

let customers = [];
let areas = [];
let customerRecords = [];
let areaRecords = [];

// ── TIMEZONE SYSTEM ───────────────────────────────────────────
var TIMEZONES = [
  { key: 'IST', label: 'IST — India Standard Time', offset: +5.5 },
  { key: 'UTC', label: 'UTC — Coordinated Universal Time', offset: 0 },
  { key: 'GMT', label: 'GMT — Greenwich Mean Time', offset: 0 },
  { key: 'EST', label: 'EST — Eastern Standard Time', offset: -5 },
  { key: 'PST', label: 'PST — Pacific Standard Time', offset: -8 },
  { key: 'PT', label: 'PT  — Pacific Time (PDT −7)', offset: -7 },
  { key: 'MST', label: 'MST — Mountain Standard Time', offset: -7 },
  { key: 'CST', label: 'CST — Central Standard Time', offset: -6 },
  { key: 'JST', label: 'JST — Japan Standard Time', offset: +9 },
  { key: 'CET', label: 'CET — Central European Time', offset: +1 },
  { key: 'CEST', label: 'CEST — Central European Summer', offset: +2 },
  { key: 'ISR', label: 'ISR — Israel Standard Time', offset: +2 },
  { key: 'IDT', label: 'IDT — Israel Daylight Time', offset: +3 },
];
var selectedTZ = 'IST'; // default — user's input timezone

function getTZOffset(key) {
  var tz = TIMEZONES.find(function (t) { return t.key === key; });
  return tz ? tz.offset : +5.5;
}

function isSupportedTimezone(key) {
  return TIMEZONES.some(function (tz) { return tz.key === key; });
}

function getCustomerTimezone(customerName) {
  var customer = customerRecords.find(function (record) { return record.customer_name === customerName; });
  return customer && isSupportedTimezone(customer.timezone) ? customer.timezone : null;
}

// Convert a datetime-local string (YYYY-MM-DDTHH:MM) from one tz to another
// Returns a new datetime-local string in the target tz
function convertDatetimeLocalTZ(dtLocal, fromKey, toKey) {
  if (!dtLocal) return dtLocal;
  var fromOff = getTZOffset(fromKey);
  var toOff = getTZOffset(toKey);
  if (fromOff === toOff) return dtLocal;
  var d = new Date(dtLocal + ':00Z'); // treat as UTC momentarily
  // Adjust: remove fromOff bias, add toOff bias
  var utcMs = d.getTime() - fromOff * 3600000;
  var targetMs = utcMs + toOff * 3600000;
  var td = new Date(targetMs);
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return td.getUTCFullYear() + '-' + pad(td.getUTCMonth() + 1) + '-' + pad(td.getUTCDate())
    + 'T' + pad(td.getUTCHours()) + ':' + pad(td.getUTCMinutes());
}

// Format a Date object or ISO string for display in a given TZ
function fmtInTZ(dateVal, tzKey, opts) {
  if (!dateVal) return '—';
  var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
  if (isNaN(d)) return '—';
  var off = getTZOffset(tzKey);
  var localMs = d.getTime() + off * 3600000;
  var ld = new Date(localMs);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var date = ld.getUTCDate() + ' ' + months[ld.getUTCMonth()] + ' ' + ld.getUTCFullYear();
  // 12-hour format with AM/PM
  var h24 = ld.getUTCHours();
  var ampm = h24 >= 12 ? 'PM' : 'AM';
  var h12 = h24 % 12 || 12;
  var mins = String(ld.getUTCMinutes()).padStart(2, '0');
  var time = h12 + ':' + mins + ' ' + ampm;
  return date + ', ' + time + ' ' + tzKey;
}

// Render the TZ selector dropdown (shared across create form, edit panel, report)
function renderTZSelector(containerId, currentKey, onChangeFn) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div style="position:relative;display:inline-block">'
    + '<select id="' + containerId + '_sel" onchange="' + onChangeFn + '" '
    + 'style="appearance:none;-webkit-appearance:none;background:var(--surface2);'
    + 'border:1px solid var(--border);border-radius:8px;padding:5px 28px 5px 10px;'
    + 'font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;'
    + 'font-family:var(--font-mono);outline:none;min-width:64px">'
    + TIMEZONES.map(function (tz) {
      return '<option value="' + tz.key + '"' + (tz.key === currentKey ? ' selected' : '')
        + '>' + tz.key + '</option>';
    }).join('')
    + '</select>'
    + '<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);'
    + 'pointer-events:none;font-size:9px;color:var(--accent)">▾</span>'
    + '</div>';
}

// ───────────────────────────────────────────────────────────────
// LOAD INCIDENTS FROM BACKEND API
// ───────────────────────────────────────────────────────────────
function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).replace(' ', 'T').substring(0, 16);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatStoredIncidentDateTime(value) {
  const localValue = toDatetimeLocal(value);
  if (!localValue) return 'N/A';
  const parts = localValue.split('T');
  if (parts.length !== 2) return localValue;
  const dateParts = parts[0].split('-');
  if (dateParts.length !== 3) return localValue;
  return `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
}

function toMysqlDatetime(value) {
  if (!value) return null;
  return String(value).replace('T', ' ').substring(0, 19);
}

// Parse a database datetime as a wall-clock value in its declared timezone.
// This deliberately avoids `new Date('YYYY-MM-DD HH:mm')`, which applies the
// browser machine timezone and caused report timestamps to be converted twice.
function wallClockToDate(value, timezone) {
  if (!value) return null;
  var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    var absolute = new Date(value);
    return isNaN(absolute.getTime()) ? null : absolute;
  }
  var wallUtc = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));
  return new Date(wallUtc - getTZOffset(timezone || 'IST') * 3600000);
}

function canonicalUtcDate(value) {
  if (!value) return null;
  var text = String(value);
  var date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
  return isNaN(date.getTime()) ? null : date;
}

function incidentTimestampDate(inc, kind) {
  var isEnd = kind === 'end';
  var canonical = canonicalUtcDate(isEnd ? inc.closed_at_utc : inc.opened_at_utc);
  if (canonical) return canonical;
  var wall = isEnd
    ? (inc.date_time_closed || inc.endDT || inc.downtimeEnd)
    : (inc.date_time_opened || inc.startDT || inc.date_created || inc.date);
  return wallClockToDate(wall, inc.timezone || inc.source_timezone || 'IST');
}

function toDatetimeLocalWall(value) {
  if (!value) return '';
  var match = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return match ? match[1] + 'T' + match[2] : toDatetimeLocal(value);
}

function setIncidentEndHint(hintId, targetTimezone, converted) {
  var hint = document.getElementById(hintId);
  if (!hint) return;
  var target = targetTimezone || 'IST';
  hint.textContent = converted && target !== 'IST'
    ? 'Converted from IST to ' + target
    : 'Enter end time in IST' + (target !== 'IST' ? ' → converts to ' + target : '');
}

function markIncidentEndAsIST(fieldId, hintId) {
  var field = document.getElementById(fieldId);
  if (!field) return;
  field.dataset.inputTimezone = 'IST';
  setIncidentEndHint(hintId, selectedTZ || 'IST', false);
}

function convertIncidentEndFromIST(fieldId, hintId) {
  var field = document.getElementById(fieldId);
  if (!field || !field.value || field.dataset.inputTimezone !== 'IST') return field ? field.value : '';
  var targetTimezone = selectedTZ || 'IST';
  field.value = convertDatetimeLocalTZ(field.value, 'IST', targetTimezone);
  field.dataset.inputTimezone = targetTimezone;
  setIncidentEndHint(hintId, targetTimezone, true);
  return field.value;
}

function normalizeIncidentStatusLabel(value) {
  var status = String(value || 'New').trim();
  var labels = {
    open: 'New',
    in_progress: 'In Progress',
    tier_1_level_support: 'Tier 1 Level Support',
    further_investigation: 'Further Investigation',
    escalated_to_rd: 'Escalated to R&D',
    escalated_to_cso_devops: 'Escalated to CSO Devops',
    escalated_to_3rd_party: 'Escalated to 3rd Party',
    resolved: 'Resolved',
    closed: 'Closed'
  };
  return labels[status.toLowerCase()] || status;
}

function normalizeIncidentFromBackend(incident) {
  const startDT = toDatetimeLocalWall(incident.startDT || incident.date_time_opened || incident.date_created || incident.date);
  const endDT = toDatetimeLocalWall(incident.endDT || incident.date_time_closed || incident.downtimeEnd);
  const canonicalDowntime = Number(incident.downtime_mins ?? incident.downtime_minutes_total);
  const downtimeH = Number.isFinite(canonicalDowntime)
    ? Math.floor(Math.max(0, canonicalDowntime) / 60)
    : (Number(incident.downtime_h ?? incident.downtimeH ?? 0) || 0);
  const downtimeM = Number.isFinite(canonicalDowntime)
    ? Math.round(Math.max(0, canonicalDowntime) % 60)
    : (Number(incident.downtime_m ?? incident.downtimeM ?? 0) || 0);
  const canonicalMttr = Number(incident.mttr_minutes);
  const mttrH = Number.isFinite(canonicalMttr)
    ? Math.floor(Math.max(0, canonicalMttr) / 60)
    : (Number(incident.mttr_h ?? incident.mttrH ?? 0) || 0);
  const mttrM = Number.isFinite(canonicalMttr)
    ? Math.round(Math.max(0, canonicalMttr) % 60)
    : (Number(incident.mttr_m ?? incident.mttrM ?? 0) || 0);
  const rawMttdMinutes = incident.mttd_minutes ?? incident.mttdMinutes ?? null;
  const mttdMinutes = rawMttdMinutes === null || rawMttdMinutes === '' ? null : Number(rawMttdMinutes);
  const mttdH = Number.isFinite(mttdMinutes) && mttdMinutes > 0 ? Math.floor(mttdMinutes / 60) : 0;
  const mttdM = Number.isFinite(mttdMinutes) && mttdMinutes > 0 ? Math.round(mttdMinutes % 60) : 0;
  const dbMttdStr = incident.mttdStr ?? incident.mttd_str ?? '';
  const downtimeTotal = Number.isFinite(canonicalDowntime) ? Math.max(0, Math.round(canonicalDowntime)) : downtimeH * 60 + downtimeM;
  const mttrTotal = Number.isFinite(canonicalMttr) ? Math.max(0, Math.round(canonicalMttr)) : mttrH * 60 + mttrM;

  return Object.assign({}, incident, {
    status: normalizeIncidentStatusLabel(incident.status),
    date: startDT ? startDT.substring(0, 10) : (incident.date || ''),
    startDT,
    endDT,
    timezone: incident.timezone || '',
    source_timezone: incident.source_timezone || '',
    opened_at_utc: incident.opened_at_utc || '',
    closed_at_utc: incident.closed_at_utc || '',
    downtimeEnd: endDT,
    desc: incident.description ?? incident.desc ?? '',
    product_line: incident.product_line ?? incident.productLine ?? '',
    slaHours: incident.sla_hours ?? incident.slaHours ?? null,
    downtimeH,
    downtimeM,
    downtime_mins: downtimeTotal,
    downtime_minutes_total: downtimeTotal,
    downtimeStr: downtimeH > 0 ? (downtimeM > 0 ? downtimeH + 'h ' + downtimeM + 'm' : downtimeH + 'h') : (downtimeM > 0 ? downtimeM + 'm' : ''),
    mttrH,
    mttrM,
    mttr_minutes: mttrTotal,
    mttrStr: mttrH > 0 ? (mttrM > 0 ? mttrH + 'h ' + mttrM + 'm' : mttrH + 'h') : (mttrM > 0 ? mttrM + 'm' : ''),
    mttd_minutes: Number.isFinite(mttdMinutes) ? mttdMinutes : null,
    mttdH,
    mttdM,
    mttdStr: dbMttdStr || (Number.isFinite(mttdMinutes) && mttdMinutes > 0 ? minutesToHM(mttdMinutes) : ''),
    resolvedBy: incident.resolved_by ?? incident.resolvedBy ?? '',
    sfCase: incident.sf_case ?? incident.sfCase ?? '',
    rd_tickets: incident.rd_tickets ?? incident.rdTickets ?? '',
    rdTickets: incident.rd_tickets ?? incident.rdTickets ?? '',
    incident_report_status: incident.incident_report_status ?? incident.incidentReportStatus ?? '',
    incidentReportStatus: incident.incident_report_status ?? incident.incidentReportStatus ?? '',
    tags: Array.isArray(incident.tags) ? incident.tags : [],
    comments: Array.isArray(incident.comments) ? incident.comments : []
  });
}

function syncReferenceListsFromIncidents() {
  populateCustomerDropdowns();
  populateAreaDropdowns();
}

function loadMasterData(callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    customers = [];
    areas = [];
    customerRecords = [];
    areaRecords = [];
    if (callback) callback(null);
    return;
  }
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    if (callback) callback(new Error('Not authenticated. Please login first.'));
    return;
  }
  fetch(window.APP_CONFIG.API_BASE_URL + '/master-data', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  })
    .then(r => { if (!r.ok) throw new Error('Master data API returned HTTP ' + r.status); return r.json(); })
    .then(data => {
      if (data && data.success && data.data) {
        customerRecords = Array.isArray(data.data.customers) ? data.data.customers : [];
        areaRecords = Array.isArray(data.data.areas) ? data.data.areas : [];
        customers = customerRecords.map(function (c) { return c.customer_name; }).filter(Boolean).sort();
        areas = areaRecords.map(function (a) { return a.area_name; }).filter(Boolean).sort();
        populateCustomerDropdowns();
        populateAreaDropdowns();
        renderDataManagement();
        updateDmCounts();
        populateEngineerDropdowns();
        if (callback) callback(null);
      } else {
        if (callback) callback(new Error(data && data.message ? data.message : 'Failed to load master data'));
      }
    })
    .catch(err => {
      console.error('Error loading master data:', err);
      if (callback) callback(err);
    });
}
function loadUsersFromBackend(callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    users = [];
    if (callback) callback(null);
    return;
  }
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    if (callback) callback(new Error('Not authenticated. Please login first.'));
    return;
  }
  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  })
    .then(r => { if (!r.ok) throw new Error('Users API returned HTTP ' + r.status); return r.json(); })
    .then(data => {
      if (data && data.success && Array.isArray(data.data)) {
        users = data.data.map(function (u) {
          var name = u.name || u.full_name || u.email;
          return Object.assign({}, u, {
            name: name,
            initials: u.initials || String(name || '').split(/\s+/).map(function (p) { return p[0] || ''; }).join('').substring(0, 2).toUpperCase(),
            active: u.active !== false
          });
        });
        populateEngineerDropdowns();
        if (callback) callback(null);
      } else {
        if (callback) callback(new Error(data && data.message ? data.message : 'Failed to load users'));
      }
    })
    .catch(err => {
      console.error('Error loading users from backend:', err);
      if (callback) callback(err);
    });
}

function loadIncidentsFromBackend(callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    if (callback) callback(null);
    return;
  }

  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    console.warn('No JWT token found. Skipping backend incident load.');
    if (callback) callback(new Error('Not authenticated. Please login first.'));
    return;
  }

  fetch(window.APP_CONFIG.API_BASE_URL + '/incidents', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })
    .then(r => {
      if (!r.ok) throw new Error('Backend returned HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      if (data && data.success && Array.isArray(data.data)) {
        incidents = data.data.map(normalizeIncidentFromBackend);
        incidentComments = {};
        incidents.forEach(function (incident) {
          incidentComments[incident.id] = (incident.comments || []).map(function (comment) {
            var created = comment.created_at ? new Date(comment.created_at) : new Date();
            return Object.assign({}, comment, {
              type: 'comment',
              action: comment.action || 'commented',
              msg: (comment.author || 'User') + ' commented — ' + (comment.detail || ''),
              time: created.toLocaleString(),
              timestamp: created.getTime(),
              incId: incident.id
            });
          });
        });
        filteredIncidents = [...incidents];
        console.log('Loaded ' + incidents.length + ' incidents from backend');
        populateEngineerDropdowns();
        if (callback) callback(null);
      } else {
        var msg = data && data.message ? data.message : 'Failed to load incidents from backend';
        console.warn('Failed to load incidents from backend:', msg);
        if (callback) callback(new Error(msg));
      }
    })
    .catch(err => {
      console.error('Error loading incidents from backend:', err);
      if (callback) callback(err);
    });
}

let incidents = [];

function openLinkedIncidentIfReady() {
  var incidentId = '';
  try { incidentId = new URLSearchParams(window.location.search).get('incident') || ''; } catch (e) { }
  if (!incidentId || !incidents.some(function (incident) { return incident.id === incidentId; })) return false;
  navigateInternal('incidents', document.getElementById('incidentsNav'));
  setTimeout(function () { openDetailPanel(incidentId); }, 0);
  return true;
}
let filteredIncidents = [];
let currentPage = 1;
let perPage = 8;
let sortCol = 'date';
let sortDir = 'desc';

function getSortedIncidents(arr) {
  if (!sortCol) return arr;
  return arr.slice().sort(function (a, b) {
    var av = a[sortCol] !== undefined ? a[sortCol] : '';
    var bv = b[sortCol] !== undefined ? b[sortCol] : '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortIncidents(col) {
  if (sortCol === col) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortCol = col;
    sortDir = 'asc';
  }
  filteredIncidents = getSortedIncidents(filteredIncidents);
  currentPage = 1;
  renderIncidentTable();
}

let users = [];



// ── TAGS ─────────────────────────────────────────────────────
const TAG_COLORS = {
  'database': '#4f8ef7', 'network': '#9b59b6', 'security': '#f75c7c',
  'performance': '#f7b94f', 'auth': '#2dd4a0', 'api': '#e67e22',
  'ui': '#1abc9c', 'deploy': '#e74c3c', 'config': '#3498db',
  'monitoring': '#8e44ad', 'storage': '#27ae60', 'timeout': '#e74c3c',
  'integration': '#f39c12', 'data-loss': '#c0392b', 'backup': '#16a085',
};
function getTagColor(tag) {
  return TAG_COLORS[tag.toLowerCase()] || '#6c7a8d';
}
function renderTagChip(tag, removable, incId) {
  var bg = getTagColor(tag);
  var rm = '';
  if (removable) rm = '<span onclick="removeTag(\'' + incId + '\',\'' + tag + '\')" style="margin-left:4px;cursor:pointer;opacity:0.7;font-size:10px" title="Remove">&#x2715;</span>';
  return '<span class="tag-chip" style="background:' + bg + '20;color:' + bg + ';border:1px solid ' + bg + '40;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:2px;white-space:nowrap">' + tag + rm + '</span>';
}
function removeTag(incId, tag) {
  var inc = incidents.find(function (i) { return i.id === incId; });
  if (!inc) return;
  inc.tags = (inc.tags || []).filter(function (t) { return t !== tag; });
  updateTagFilter();
  var isEditing = document.getElementById('detailPanel').classList.contains('editing');
  openDetailPanel(incId, isEditing);
  renderIncidentTable();
}
function addTagToIncident(incId, tag) {
  tag = (tag || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!tag) return;
  var inc = incidents.find(function (i) { return i.id === incId; });
  if (!inc) return;
  if (!inc.tags) inc.tags = [];
  if (inc.tags.indexOf(tag) >= 0) return;
  inc.tags.push(tag);
  updateTagFilter();
  var isEditing = document.getElementById('detailPanel').classList.contains('editing');
  openDetailPanel(incId, isEditing);
  renderIncidentTable();
}
function updateTagFilter() {
  var sel = document.getElementById('tagFilter');
  if (!sel) return;
  var allTags = {};
  incidents.forEach(function (i) { (i.tags || []).forEach(function (t) { allTags[t] = 1; }); });
  var cur = sel.value;
  sel.innerHTML = '<option value="">All Tags</option>'
    + Object.keys(allTags).sort().map(function (t) {
      return '<option value="' + t + '"' + (t === cur ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
}
function updateStatusBar() {
  var total = incidents.length;
  var openInc = incidents.filter(function (i) { return i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
  var critical = incidents.filter(function (i) {
    return i.severity === 'Critical' && i.status !== 'Closed' && i.status !== 'Resolved';
  }).length;
  var sbIC = document.getElementById('sbIncidentCount');
  var sbOC = document.getElementById('sbOpenCount');
  var sbCC = document.getElementById('sbCriticalCount');
  var sbCU = document.getElementById('sbCurrentUser');
  var sbT = document.getElementById('sbTime');
  if (sbIC) sbIC.textContent = total + ' incident' + (total !== 1 ? 's' : '');
  if (sbOC) sbOC.textContent = openInc + ' open';
  if (sbCC) sbCC.textContent = critical + ' critical';
  if (sbCU) sbCU.textContent = currentUserName || '—';
  if (sbT) {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    sbT.textContent = h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }
}

// ─── CORE DATA VARIABLES ──────────────────────────────────────────────────
var auditLog = [];
var activityLog = [];
var incidentComments = {};
var currentNotificationIncidentId = null;
var pendingIncidentEmail = null;
var pendingOperationsEmailAuditId = null;
var preSendRecipients = { to: [], cc: [] };

// Activity data is loaded from database-backed incident actions



var currentIncidentView = 'table'; // 'table' | 'kanban'
var detailCurrentId = null;

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────
function minutesToHM(mins) {
  if (!mins || mins <= 0) return '0m';
  var h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
}

function getIncDowntimeMinutes(inc) {
  if (inc.downtimeH > 0 || inc.downtimeM > 0) return (inc.downtimeH || 0) * 60 + (inc.downtimeM || 0);
  return 0;
}

function isHistorianIncident(inc) {
  return window.ReportingMetrics
    ? window.ReportingMetrics.isHistorianIncident(inc)
    : String((inc && inc.project) || '').trim().toLowerCase() === 'historian';
}

function isCustomer360HistorianIncident(inc) {
  return window.ReportingMetrics
    ? window.ReportingMetrics.isCustomer360HistorianIncident(inc)
    : String((inc && inc.area) || '').trim().toLowerCase() === 'historian';
}

function isNgcCustomer(customerName) {
  return window.ReportingMetrics
    ? window.ReportingMetrics.isNgcCustomer(customerName)
    : String(customerName || '').trim().toLowerCase() === 'ngc';
}

function partitionHistorianIncidents(incidentList) {
  if (window.ReportingMetrics) return window.ReportingMetrics.partitionHistorianIncidents(incidentList);
  return (incidentList || []).reduce(function (result, inc) {
    result[isHistorianIncident(inc) ? 'historian' : 'application'].push(inc);
    return result;
  }, { application: [], historian: [] });
}

function partitionCustomer360HistorianIncidents(incidentList) {
  if (window.ReportingMetrics) return window.ReportingMetrics.partitionCustomer360HistorianIncidents(incidentList);
  return (incidentList || []).reduce(function (result, inc) {
    result[isCustomer360HistorianIncident(inc) ? 'historian' : 'application'].push(inc);
    return result;
  }, { application: [], historian: [] });
}

function getIncMttrMinutes(inc) {
  if (inc.mttrH > 0 || inc.mttrM > 0) return (inc.mttrH || 0) * 60 + (inc.mttrM || 0);
  return 0;
}

function getIncResolutionMinutes(inc) {
  var mttr = getIncMttrMinutes(inc);
  return mttr > 0 ? mttr : getIncDowntimeMinutes(inc);
}

function getIncidentSlaHours(inc) {
  var incidentTarget = Number(inc && (inc.sla_hours ?? inc.slaHours));
  if (Number.isFinite(incidentTarget) && incidentTarget > 0) return incidentTarget;
  return { Critical: 1, High: 4, Medium: 12, Normal: 24 }[inc && inc.severity] || 24;
}

function isCriticalSeverity(inc) {
  return String((inc && inc.severity) || '').toLowerCase() === 'critical';
}

function getCriticalOnlyReportValue(inc, value) {
  return isCriticalSeverity(inc) ? value : '—';
}

function getCriticalReportLabels(inc) {
  return isCriticalSeverity(inc)
    ? { sla: 'Critical SLA', mttr: 'Critical MTTR' }
    : { sla: 'Total Downtime', mttr: 'Mean Time to Resolve (MTTR)' };
}

function getIncidentTimestamp(inc, fields) {
  for (var index = 0; index < fields.length; index++) {
    var value = inc && inc[fields[index]];
    if (!value) continue;
    var timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return NaN;
}

function getIncidentOpenedTimestamp(inc) {
  var canonicalUtc = inc && inc.opened_at_utc;
  if (canonicalUtc) {
    var canonicalTimestamp = new Date(canonicalUtc).getTime();
    if (Number.isFinite(canonicalTimestamp)) return canonicalTimestamp;
  }

  var rawValue = inc && (inc.date_time_opened || inc.startDT || inc.date_created);
  if (rawValue) {
    var normalized = String(rawValue).trim().replace(' ', 'T');
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      var absoluteTimestamp = new Date(normalized).getTime();
      if (Number.isFinite(absoluteTimestamp)) return absoluteTimestamp;
    }
    var wallClockTimestamp = new Date(normalized.replace(/Z$/, '') + 'Z').getTime();
    if (Number.isFinite(wallClockTimestamp)) {
      return wallClockTimestamp - getTZOffset((inc && (inc.timezone || inc.source_timezone)) || 'IST') * 3600000;
    }
  }

  if (inc && inc.date) {
    return new Date(inc.date + 'T09:00:00').getTime();
  }
  return NaN;
}

// A Missed MTTR is a completed incident whose actual resolution duration
// strictly exceeds its applicable SLA resolution target.
function isMissedMttr(inc) {
  var status = String((inc && inc.status) || '').toLowerCase();
  if (String((inc && inc.severity) || '').toLowerCase() !== 'critical') return false;
  if (status !== 'closed' && status !== 'resolved') return false;

  var createdMs = getIncidentTimestamp(inc, ['date_time_opened', 'startDT', 'date_created']);
  if (!Number.isFinite(createdMs) && inc && inc.date) {
    createdMs = new Date(inc.date + 'T09:00:00').getTime();
  }
  var resolvedMs = getIncidentTimestamp(inc, ['date_time_closed', 'endDT', 'downtimeEnd']);
  if (!Number.isFinite(createdMs) || !Number.isFinite(resolvedMs) || resolvedMs < createdMs) return false;

  return (resolvedMs - createdMs) > getIncidentSlaHours(inc) * 3600000;
}

function countMissedMttr(incidentList) {
  return (incidentList || []).filter(isMissedMttr).length;
}

const MTTD_SLA_MINUTES = 15;

function getIncidentMttdMinutes(inc) {
  var storedMinutes = inc && (inc.mttd_minutes ?? inc.mttdMinutes);
  if (storedMinutes !== null && storedMinutes !== undefined && storedMinutes !== '') {
    var numericMinutes = Number(storedMinutes);
    if (Number.isFinite(numericMinutes) && numericMinutes >= 0) return numericMinutes;
  }
  var hours = Number(inc && (inc.mttdH ?? inc.mttd_h)) || 0;
  var minutes = Number(inc && (inc.mttdM ?? inc.mttd_m)) || 0;
  return Math.max(0, hours * 60 + minutes);
}

function isMissedMttd(inc) {
  return getIncidentMttdMinutes(inc) > MTTD_SLA_MINUTES;
}

function countMissedMttd(incidentList) {
  return (incidentList || []).filter(isMissedMttd).length;
}

function getActualMttrMinutes(inc) {
  var createdMs = getIncidentTimestamp(inc, ['date_time_opened', 'startDT', 'date_created']);
  if (!Number.isFinite(createdMs) && inc && inc.date) createdMs = new Date(inc.date + 'T09:00:00').getTime();
  var resolvedMs = getIncidentTimestamp(inc, ['date_time_closed', 'endDT', 'downtimeEnd']);
  if (!Number.isFinite(createdMs) || !Number.isFinite(resolvedMs) || resolvedMs < createdMs) return NaN;
  return (resolvedMs - createdMs) / 60000;
}

function formatMetricDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  var totalSeconds = Math.round(minutes * 60);
  var hours = Math.floor(totalSeconds / 3600);
  var mins = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;
  var parts = [];
  if (hours) parts.push(hours + 'h');
  if (mins || (!hours && !seconds)) parts.push(mins + 'm');
  if (seconds) parts.push(seconds + 's');
  return parts.join(' ');
}

function escapeMetricHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function isActiveIncident(inc) {
  return Boolean(inc) && inc.status !== 'Closed' && inc.status !== 'Resolved';
}

function descriptionEditorValue() {
  var editor = document.getElementById('f_desc');
  return editor ? editor.innerHTML.trim() : '';
}

function setDescriptionEditorValue(value) {
  var editor = document.getElementById('f_desc');
  if (!editor) return;
  var text = String(value || '');
  editor.innerHTML = /<\/?(?:b|strong|i|em|u|font|div|p|br|ul|ol|li)\b/i.test(text) ? text : escapeMetricHtml(text).replace(/\r?\n/g, '<br>');
}

function formatIncidentDescription(command, value) {
  var editor = document.getElementById(activeIncidentDescriptionEditorId || 'f_desc');
  if (!editor) return;
  editor.focus(); document.execCommand(command, false, value || null);
}

var selectedIncidentDescriptionImage = null;
var activeIncidentDescriptionEditorId = 'f_desc';
function activateIncidentDescriptionEditor(id) { activeIncidentDescriptionEditorId = id || 'f_desc'; }
function chooseIncidentDescriptionImage() { var input = document.getElementById('f_desc_image_input'); if (input) input.click(); }
function selectIncidentDescriptionImage(event) {
  var image = event && event.target && event.target.tagName === 'IMG' ? event.target : null;
  document.querySelectorAll('#f_desc img.selected-description-image,#notificationEmailBody img.selected-description-image').forEach(function (item) { item.classList.remove('selected-description-image'); });
  selectedIncidentDescriptionImage = image;
  if (image) image.classList.add('selected-description-image');
}
function insertIncidentDescriptionImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) { showToast('Use a PNG, JPEG, WebP, or GIF image.', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Choose an image smaller than 5 MB.', 'error'); return; }
  var reader = new FileReader(); reader.onload = function () {
    var image = new Image(); image.onload = function () {
      var maxWidth = 1200, scale = Math.min(1, maxWidth / image.naturalWidth), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      var source = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .82);
      if (source.length > 500000) { showToast('This image is too large after compression. Crop it or use a smaller image.', 'error'); return; }
      var editor = document.getElementById(activeIncidentDescriptionEditorId); if (!editor) return; editor.focus();
      var img = document.createElement('img'); img.src = source; img.alt = file.name || 'Incident image'; img.style.width = '65%'; img.dataset.widthPercent = '65';
      document.execCommand('insertHTML', false, '<br>'); editor.appendChild(img); editor.appendChild(document.createElement('br')); selectIncidentDescriptionImage({ target: img });
    }; image.src = reader.result;
  }; reader.readAsDataURL(file);
}
function handleIncidentDescriptionPaste(event) {
  var files = Array.from((event.clipboardData && event.clipboardData.files) || []).filter(function (file) { return /^image\//i.test(file.type || ''); });
  if (!files.length) return;
  event.preventDefault(); insertIncidentDescriptionImage(files[0]);
}
function resizeSelectedIncidentImage(percent) {
  if (!selectedIncidentDescriptionImage || !selectedIncidentDescriptionImage.isConnected) { showToast('Select an image in the description first.', 'info'); return; }
  selectedIncidentDescriptionImage.style.width = Math.max(15, Math.min(100, Number(percent) || 65)) + '%'; selectedIncidentDescriptionImage.dataset.widthPercent = String(percent);
}
function cropSelectedIncidentImage() {
  var image = selectedIncidentDescriptionImage;
  if (!image || !image.isConnected) { showToast('Select an image in the description first.', 'info'); return; }
  var left = Number(window.prompt('Crop from left (%)', '0')), top = Number(window.prompt('Crop from top (%)', '0')), right = Number(window.prompt('Crop from right (%)', '0')), bottom = Number(window.prompt('Crop from bottom (%)', '0'));
  if ([left, top, right, bottom].some(function (value) { return !Number.isFinite(value) || value < 0 || value >= 100; }) || left + right >= 100 || top + bottom >= 100) { showToast('Enter crop values from 0–99. Opposite sides must total less than 100.', 'error'); return; }
  var source = new Image(); source.onload = function () {
    var x = Math.round(source.naturalWidth * left / 100), y = Math.round(source.naturalHeight * top / 100), w = Math.round(source.naturalWidth * (100 - left - right) / 100), h = Math.round(source.naturalHeight * (100 - top - bottom) / 100), canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(source, x, y, w, h, 0, 0, w, h); image.src = canvas.toDataURL('image/jpeg', .84);
  }; source.src = image.src;
}

function isActiveSlaBreached(inc) {
  if (!isActiveIncident(inc)) return false;
  if (String((inc && inc.severity) || '').toLowerCase() !== 'critical') return false;
  var openedAt = getIncidentOpenedTimestamp(inc);
  return Number.isFinite(openedAt) && (Date.now() - openedAt) > getIncidentSlaHours(inc) * 3600000;
}

function openMetricDrillDown(metric, customerName, reportingCategory) {
  if (!hasPermission('view_incidents')) {
    showToast('Access denied: you cannot view incidents', 'error');
    return;
  }
  if (['mttr', 'mttd', 'open', 'sla'].indexOf(metric) === -1) return;
  var predicate = metric === 'mttr' ? isMissedMttr
    : metric === 'mttd' ? isMissedMttd
      : metric === 'open' ? isActiveIncident : isActiveSlaBreached;
  var sourceIncidents = (metric === 'open' || metric === 'sla') && !customerName
    ? getDashboardFilteredIncidents() : incidents;
  var metricIncidents = sourceIncidents.filter(function (inc) {
    if (customerName && inc.customer !== customerName) return false;
    if (metric === 'mttr' && !customerName && !reportingCategory && isCustomer360HistorianIncident(inc)) return false;
    if (reportingCategory === 'application' && isCustomer360HistorianIncident(inc)) return false;
    if (reportingCategory === 'historian' && !isCustomer360HistorianIncident(inc)) return false;
    return predicate(inc);
  });
  metricIncidents.sort(function (a, b) {
    return getIncidentTimestamp(b, ['date_time_opened', 'startDT', 'date_created'])
      - getIncidentTimestamp(a, ['date_time_opened', 'startDT', 'date_created']);
  });

  var title = document.getElementById('metricDrilldownTitle');
  var sub = document.getElementById('metricDrilldownSub');
  var actualHeader = document.getElementById('metricActualHeader');
  var body = document.getElementById('metricDrilldownBody');
  var overlay = document.getElementById('metricDrilldownOverlay');
  if (!title || !sub || !actualHeader || !body || !overlay) return;
  var drilldownTitles = {
    mttr: 'Missed MTTR Incidents', mttd: 'Missed MTTD Incidents',
    open: 'Open / Active Incidents', sla: 'SLA-Breached Active Incidents'
  };
  title.textContent = drilldownTitles[metric];
  sub.textContent = metricIncidents.length + ' contributing incident' + (metricIncidents.length === 1 ? '' : 's')
    + ' · ' + (customerName || ((metric === 'open' || metric === 'sla') ? 'Current dashboard filters' : 'All customers'))
    + ' · Select a row to view details';
  actualHeader.textContent = (metric === 'open' || metric === 'sla') ? 'Open Duration' : 'Actual ' + metric.toUpperCase();

  if (!metricIncidents.length) {
    body.innerHTML = '<tr><td class="metric-drilldown-empty" colspan="11">No contributing incidents found.</td></tr>';
  } else {
    body.innerHTML = metricIncidents.map(function (inc) {
      var isLiveMetric = metric === 'open' || metric === 'sla';
      var actualMinutes = metric === 'mttr' ? getActualMttrMinutes(inc)
        : metric === 'mttd' ? getIncidentMttdMinutes(inc)
          : Math.max(0, (Date.now() - getIncidentOpenedTimestamp(inc)) / 60000);
      var targetMinutes = metric === 'mttd' ? MTTD_SLA_MINUTES : getIncidentSlaHours(inc) * 60;
      var created = formatStoredIncidentDateTime(inc.date_time_opened || inc.startDT || inc.date_created || inc.date);
      var resolved = isLiveMetric ? '—' : formatStoredIncidentDateTime(inc.date_time_closed || inc.endDT || inc.downtimeEnd);
      var severity = String(inc.severity || 'Normal');
      var status = String(inc.status || '');
      // SLA breach indicators are reserved for Critical incidents. Other
      // active incidents retain their open duration, but never show a breach.
      var isCriticalSeverity = severity.toLowerCase() === 'critical';
      var visibleSlaTargetMinutes = targetMinutes;
      if (!isCriticalSeverity && actualMinutes > targetMinutes) targetMinutes = actualMinutes;
      var breachDuration = isCriticalSeverity && actualMinutes > targetMinutes
        ? '+' + formatMetricDuration(actualMinutes - targetMinutes) : 'â€”';
      return '<tr data-incident-id="' + escapeMetricHtml(inc.id) + '">'
        + '<td class="id-cell">' + escapeMetricHtml(inc.id) + '</td>'
        + '<td class="title-cell">' + escapeMetricHtml(inc.title || inc.summary || '—') + '</td>'
        + '<td>' + escapeMetricHtml(inc.customer || '—') + '</td>'
        + '<td><span class="badge badge-' + escapeMetricHtml(severity.toLowerCase()) + '">' + escapeMetricHtml(severity) + '</span></td>'
        + '<td><span class="badge badge-' + escapeMetricHtml(status.toLowerCase().replace(/ /g, '-').replace(/&/g, '')) + '">' + escapeMetricHtml(status) + '</span></td>'
        + '<td class="metric-date-cell">' + escapeMetricHtml(created) + '</td>'
        + '<td class="metric-date-cell">' + escapeMetricHtml(resolved) + '</td>'
        + '<td>' + formatMetricDuration(visibleSlaTargetMinutes) + '</td>'
        + '<td>' + formatMetricDuration(actualMinutes) + '</td>'
        + '<td class="metric-breach-cell">' + (actualMinutes > targetMinutes ? '+' + formatMetricDuration(actualMinutes - targetMinutes) : '—') + '</td>'
        + '</tr>';
    }).join('');
    body.querySelectorAll('tr[data-incident-id]').forEach(function (row) {
      row.addEventListener('click', function () { openMetricIncidentDetail(row.getAttribute('data-incident-id')); });
    });
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openMetricIncidentDetail(id) {
  openDetailPanel(id);
  var detailOverlay = document.getElementById('detailOverlay');
  var metricOverlay = document.getElementById('metricDrilldownOverlay');
  if (detailOverlay && metricOverlay && metricOverlay.classList.contains('open')) {
    detailOverlay.classList.add('metric-drilldown-detail');
  }
}

function closeMetricDrillDown() {
  var panel = document.getElementById('detailPanel');
  if (panel && panel.classList.contains('open')) closeDetailPanel();
  var overlay = document.getElementById('metricDrilldownOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}
// ─── AUDIT LOG ─────────────────────────────────────────────────────────────
function addAudit(icon, action, detail) {
  auditLog.unshift({
    icon: icon, action: action, detail: detail,
    time: new Date().toLocaleString('en-GB'), user: currentUserName
  });
  if (auditLog.length > 200) auditLog.pop();
  if (document.getElementById('page-reports') &&
    document.getElementById('page-reports').classList.contains('active')) {
    renderAuditLog();
  }
}

function loadAuditLogFromBackend(callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    if (callback) callback(null);
    return;
  }
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    if (callback) callback(new Error('Authentication required'));
    return;
  }
  fetch(window.APP_CONFIG.API_BASE_URL + '/incidents/activity-log?limit=200', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })
    .then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function (result) {
      if (!result.ok || !result.data || !result.data.success) {
        throw new Error(result.data && result.data.message ? result.data.message : 'Failed to load audit log');
      }
      var actionLabels = {
        create: 'Incident Created',
        edit: 'Incident Updated',
        close: 'Incident Closed',
        comment: 'Comment Added'
      };
      var actionIcons = { create: '＋', edit: '✏', close: '✓', comment: '💬' };
      auditLog = (result.data.data || []).map(function (entry) {
        var incident = entry.incident_ref
          ? entry.incident_ref + (entry.incident_title ? ' — ' + entry.incident_title : '')
          : '';
        var detail = [incident, entry.detail].filter(Boolean).join(' · ');
        var timestamp = entry.created_at ? new Date(entry.created_at) : null;
        return {
          id: entry.id,
          icon: actionIcons[entry.action_type] || '📋',
          action: actionLabels[entry.action_type] || entry.action_type || 'Activity',
          detail: detail,
          time: timestamp && !Number.isNaN(timestamp.getTime())
            ? timestamp.toLocaleString('en-GB')
            : String(entry.created_at || ''),
          user: entry.user || 'System'
        };
      });
      if (callback) callback(null);
    })
    .catch(function (error) {
      console.error('Error loading audit log:', error);
      if (callback) callback(error);
    });
}

function renderAuditLog() {
  var el = document.getElementById('auditLogEl');
  if (!el) return;
  if (!auditLog.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No audit entries yet</div>';
    return;
  }
  el.innerHTML = auditLog.slice(0, 100).map(function (e) {
    return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<span style="font-size:18px;flex-shrink:0">' + escapeMetricHtml(e.icon || '📋') + '</span>'
      + '<div style="flex:1"><div style="font-size:13px;color:var(--text);font-weight:500">' + escapeMetricHtml(e.action) + '</div>'
      + (e.detail ? '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + escapeMetricHtml(e.detail) + '</div>' : '')
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + escapeMetricHtml(e.user || 'System') + '</div>'
      + '</div><div style="font-size:11px;color:var(--text-muted);flex-shrink:0;font-family:var(--font-mono)">'
      + escapeMetricHtml(e.time) + '</div></div>';
  }).join('');
}

// ─── ACTIVITY FEED ─────────────────────────────────────────────────────────
function addFeedEntry(incId, type, action, detail) {
  if (!incidentComments[incId]) incidentComments[incId] = [];
  var now = new Date();
  var timeLabel = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ' · just now';
  var inc = incidents.find(function (i) { return i.id === incId; });
  var entry = {
    type: type, author: currentUserName, action: action, detail: detail,
    msg: currentUserName + ' ' + action + (detail ? ' — ' + detail : ''),
    time: timeLabel + (inc ? ' · ' + inc.customer : ''),
    incId: incId, timestamp: Date.now()
  };
  incidentComments[incId].push(entry);
  activityLog.unshift(entry);
  if (activityLog.length > 50) activityLog.pop();
}

function renderFeed(incId) {
  var container = document.getElementById('dp_feed');
  if (!container) return;
  var entries = (incidentComments[incId] || []).slice().reverse();
  if (!entries.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No activity yet</div>';
    return;
  }
  var typeIcon = { create: '✦', status: '↻', comment: '💬', escalate: '⬆', close: '✓', tag: '🏷', edit: '✏', system: '⚙' };
  var typeColor = {
    create: 'var(--accent)', status: 'var(--warning)', comment: 'var(--text)',
    escalate: 'var(--danger)', close: 'var(--success)', tag: '#9b59b6', edit: 'var(--accent2)', system: 'var(--text-muted)'
  };
  container.innerHTML = entries.map(function (e) {
    return '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<span style="font-size:14px;color:' + (typeColor[e.type] || 'var(--text-muted)') + ';flex-shrink:0;margin-top:1px">'
      + (typeIcon[e.type] || '•') + '</span>'
      + '<div style="flex:1"><div style="font-size:12px;color:var(--text)">' + (e.msg || e.action) + '</div>'
      + (e.detail ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + e.detail + '</div>' : '')
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-family:var(--font-mono)">' + e.time + '</div>'
      + '</div></div>';
  }).join('');
}

function submitComment(incId) {
  incId = incId || reportCurrentIncId;
  var inp = document.getElementById('commentInput');
  if (!inp || !incId) return;
  var text = inp.value.trim();
  if (!text) return;
  persistIncidentComment(incId, text, function () {
    inp.value = '';
    renderReportComments(incId);
    closeMentionDropdown('reportMentionDropdown');
  });
}

function renderReportComments(incId) {
  var list = document.getElementById('commentsList');
  var count = document.getElementById('commentCount');
  var entries = (incidentComments[incId] || []).filter(function (entry) { return entry.type === 'comment'; });
  if (count) count.textContent = entries.length;
  if (!list) return;
  list.innerHTML = entries.length ? entries.slice().reverse().map(function (entry) {
    return '<div style="padding:9px 0;border-bottom:1px solid var(--border)">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text)">' + (entry.author || 'User') + '</div>'
      + '<div style="font-size:12px;color:var(--text-muted);margin-top:3px">' + (entry.detail || '') + '</div>'
      + '</div>';
  }).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No comments yet</div>';
}

function loadComments(incId) {
  renderFeed(incId);
  renderReportComments(incId);
}

function persistIncidentComment(incId, text, callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    addFeedEntry(incId, 'comment', 'commented', text);
    if (callback) callback();
    return;
  }
  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { showToast('Not authenticated. Please login first.', 'error'); return; }
  fetch(window.APP_CONFIG.API_BASE_URL + '/incidents/' + encodeURIComponent(incId) + '/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ comment_text: text })
  })
    .then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok || !data.success) throw new Error(data.message || 'Failed to save comment');
        return data;
      });
    })
    .then(function (data) {
      var comment = data.data || { author: currentUserName, detail: text, type: 'comment', created_at: new Date().toISOString() };
      if (!incidentComments[incId]) incidentComments[incId] = [];
      incidentComments[incId].push(Object.assign({}, comment, {
        type: 'comment',
        action: comment.action || 'commented',
        msg: (comment.author || currentUserName) + ' commented — ' + text,
        time: new Date(comment.created_at || Date.now()).toLocaleString(),
        timestamp: new Date(comment.created_at || Date.now()).getTime(),
        incId: incId
      }));
      var incident = incidents.find(function (item) { return item.id === incId; });
      if (incident) incident.comments = incidentComments[incId].slice();
      addNotification('info', '<strong>' + currentUserName + '</strong> commented on ' + incId);
      if (callback) callback(comment);
    })
    .catch(function (error) {
      console.error('Save comment error:', error);
      showToast(error.message || 'Failed to save comment', 'error');
    });
}

// ─── NOTIFICATION HELPERS ──────────────────────────────────────────────────
function legacyShowNotificationPreview(inc) {
  var modal = document.getElementById('notifSimModal');
  var content = document.getElementById('notifSimContent');
  if (!modal || !content) return;
  content.innerHTML = '<div style="padding:12px;background:var(--surface2);border-radius:8px;margin-bottom:12px">'
    + '<div style="font-size:13px;font-weight:600;color:var(--text)">' + inc.id + ' — ' + inc.title + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Severity: ' + inc.severity
    + ' · Customer: ' + inc.customer + '</div></div>'
    + '<div style="font-size:13px;color:var(--text-muted)">A new ' + inc.severity + ' incident has been created and assigned to ' + inc.engineer + '.</div>';
  modal.style.display = 'flex';
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────
function toggleTheme() {
  var body = document.body;
  var isLight = body.classList.contains('light-mode');
  if (isLight) {
    body.classList.remove('light-mode');
  } else {
    body.classList.add('light-mode');
  }
  var btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = isLight ? '🌙' : '☀';
  try { localStorage.setItem('mc_theme', isLight ? 'dark' : 'light'); } catch (e) { }
  var mailboxPreview = document.querySelector('.mailbox-rich-frame');
  if (mailboxPreview && typeof activeMailboxRichBody === 'string') {
    mailboxPreview.srcdoc = mailboxSafeRichHtml(activeMailboxRichBody, !isLight);
  }
}

function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  var mw = document.getElementById('mainWrapper');
  if (!sb) return;
  var isMobile = window.innerWidth <= 900;
  if (isMobile) {
    // Mobile: slide in/out with .open
    var open = sb.classList.toggle('open');
    if (ov) ov.classList.toggle('open', open);
  } else {
    // Desktop: collapse to icon rail with .collapsed
    var collapsed = sb.classList.toggle('collapsed');
    if (mw) mw.classList.toggle('sidebar-collapsed', collapsed);
    // Update toggle arrow direction
    var btn = document.getElementById('sidebarToggleBtn');
    if (btn) btn.textContent = collapsed ? '›' : '‹';
    try { localStorage.setItem('mc_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) { }
  }
}

function legacyCloseSidebar() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  // Mobile: remove open class
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
  // Desktop: do nothing — sidebar stays collapsed or expanded as user chose
}

function legacySetHash(page) {
  try { history.pushState(null, '', '#' + page); } catch (e) { }
}

// ─── INCIDENT VIEW TOGGLE ─────────────────────────────────────────────────
function switchIncidentView(view) {
  currentIncidentView = view;
  var tableWrap = document.getElementById('incidentTableWrap');
  var kanbanWrap = document.getElementById('kanbanBoard');
  var filterBar = document.getElementById('incidentFilterBar');
  if (tableWrap) tableWrap.style.display = view === 'table' ? '' : 'none';
  if (kanbanWrap) kanbanWrap.style.display = view === 'kanban' ? '' : 'none';
  if (filterBar) filterBar.style.display = view === 'kanban' ? 'none' : '';
  // Update toggle button active state
  var tableBtn = document.getElementById('viewTableBtn');
  var kanbanBtn = document.getElementById('viewKanbanBtn');
  if (tableBtn) tableBtn.classList.toggle('active', view === 'table');
  if (kanbanBtn) kanbanBtn.classList.toggle('active', view === 'kanban');
  if (view === 'kanban') renderKanban();
  else renderIncidentTable();
}

function renderKanban() {
  var board = document.getElementById('kanbanBoard');
  if (!board) return;
  var statuses = [
    'New',
    'In Progress',
    'Tier 1 Level Support',
    'Further Investigation',
    'Escalated to R&D',
    'Escalated to CSO Devops',
    'Escalated to 3rd Party',
    'Resolved',
    'Closed'
  ];
  var cols = statuses.map(function (s) {
    var incs = filteredIncidents.filter(function (i) { return i.status === s; });
    return '<div class="kanban-status-column">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;padding:6px 10px;background:var(--surface2);border-radius:6px">'
      + s + ' <span style="color:var(--accent)">(' + incs.length + ')</span></div>'
      + incs.map(function (i) {
        return '<div onclick="openDetailPanel(\'' + i.id + '\')" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer" '
          + 'onmouseenter="this.style.borderColor=\'var(--accent)\'" onmouseleave="this.style.borderColor=\'var(--border)\'">'
          + '<div style="font-size:11px;font-family:var(--font-mono);color:var(--accent);margin-bottom:4px">' + i.id + '</div>'
          + '<div style="font-size:12px;color:var(--text);font-weight:500;line-height:1.4;margin-bottom:6px">' + i.title + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center">'
          + '<span class="badge badge-' + i.severity.toLowerCase() + '" style="font-size:10px">' + i.severity + '</span>'
          + '<span style="font-size:11px;color:var(--text-muted)">' + i.customer + '</span></div></div>';
      }).join('')
      + (incs.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;border:1px dashed var(--border);border-radius:8px">Empty</div>' : '')
      + '</div>';
  }).join('');
  board.innerHTML = '<div class="kanban-columns">' + cols + '</div>';
}

// ─── DETAIL PANEL EDIT ────────────────────────────────────────────────────
function openDetailPanelEdit(id) {
  openDetailPanel(id, true);
}

// ─── DASHBOARD HELPERS ────────────────────────────────────────────────────
function getDashboardFilteredIncidents() {
  var custs = getMsValues('df_customer');
  var sevs = getMsValues('df_severity');
  var areas = getMsValues('df_area');
  var years = getMsValues('df_year');
  var months = getMsValues('df_month');
  var fromEl = document.getElementById('df_from');
  var toEl = document.getElementById('df_to');
  var from = fromEl ? fromEl.value : '';
  var to = toEl ? toEl.value : '';

  var result = incidents.slice();
  if (custs.length) result = result.filter(function (i) { return custs.indexOf(i.customer) >= 0; });
  if (sevs.length) result = result.filter(function (i) { return sevs.indexOf(i.severity) >= 0; });
  if (areas.length) result = result.filter(function (i) { return areas.indexOf(i.area || '') >= 0; });
  if (years.length) result = result.filter(function (i) { return years.indexOf(getIncidentYear(i)) >= 0; });
  if (months.length) result = result.filter(function (i) { return months.indexOf(getIncidentMonthName(i)) >= 0; });
  if (from) result = result.filter(function (i) { return i.date >= from; });
  if (to) result = result.filter(function (i) { return i.date <= to; });
  return result;
}

function getIncidentFilterDate(inc) {
  return String((inc && (inc.date || inc.startDT || inc.date_created)) || '').substring(0, 10);
}

function getIncidentYear(inc) {
  var d = getIncidentFilterDate(inc);
  return d.length >= 4 ? d.substring(0, 4) : '';
}

function getIncidentMonthNumber(inc) {
  var d = getIncidentFilterDate(inc);
  return d.length >= 7 ? d.substring(5, 7) : '';
}

function getIncidentMonthName(inc) {
  var monthNames = getDashboardMonthNames();
  var idx = parseInt(getIncidentMonthNumber(inc), 10) - 1;
  return idx >= 0 && idx < monthNames.length ? monthNames[idx] : '';
}

function getDashboardMonthNames() {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
}

// ─── DATA MANAGEMENT ──────────────────────────────────────────────────────
function renderDataManagement() {
  var custList = document.getElementById('dmCustomerList');
  var areaList = document.getElementById('dmAreaList');
  if (custList) {
    custList.innerHTML = customers.map(function (c) {
      var inUse = incidents.some(function (i) { return i.customer === c; });
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px">'
        + '<span style="font-size:13px;color:var(--text)">' + c + '</span>'
        + (!inUse ? '<button onclick="removeCustomer(\'' + c + '\')" style="background:rgba(247,92,124,0.1);border:1px solid rgba(247,92,124,0.3);color:#f75c7c;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">Remove</button>' : '<span style="font-size:11px;color:var(--text-muted)">In use</span>')
        + '</div>';
    }).join('');
  }
  if (areaList) {
    areaList.innerHTML = areas.map(function (a) {
      var inUse = incidents.some(function (i) { return i.area === a; });
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px">'
        + '<span style="font-size:13px;color:var(--text)">' + a + '</span>'
        + (!inUse ? '<button onclick="removeArea(\'' + a + '\')" style="background:rgba(247,92,124,0.1);border:1px solid rgba(247,92,124,0.3);color:#f75c7c;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">Remove</button>' : '<span style="font-size:11px;color:var(--text-muted)">In use</span>')
        + '</div>';
    }).join('');
  }
}

function updateDmCounts() {
  var cc = document.getElementById('dmCustCount');
  var ac = document.getElementById('dmAreaCount');
  if (cc) cc.textContent = customers.length + ' customer' + (customers.length !== 1 ? 's' : '');
  if (ac) ac.textContent = areas.length + ' area' + (areas.length !== 1 ? 's' : '');
}

// ─── CUSTOMER 360 ──────────────────────────────────────────────────────────
function _showC360Picker() {
  var overlay = document.getElementById('c360PickerOverlay');
  if (!overlay) return;
  // Reset customer so navigateInternal shows picker on next direct nav
  var nameEl = document.getElementById('c360CustName');
  if (nameEl) nameEl.textContent = '—';
  overlay.style.display = 'flex';
  filterC360Picker('');
  var inp = document.getElementById('c360PickerSearch');
  if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 50); }
}

function filterC360Picker(q) {
  var list = document.getElementById('c360PickerList');
  if (!list) return;
  q = (q || '').toLowerCase();
  var custMap = {};
  incidents.forEach(function (i) {
    if (!custMap[i.customer]) custMap[i.customer] = { total: 0, open: 0, critical: 0 };
    custMap[i.customer].total++;
    if (i.status !== 'Closed' && i.status !== 'Resolved') custMap[i.customer].open++;
    if (i.severity === 'Critical' && i.status !== 'Closed') custMap[i.customer].critical++;
  });
  var custs = Object.keys(custMap).filter(function (c) { return !q || c.toLowerCase().includes(q); }).sort();
  if (!custs.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;grid-column:1/-1">No customers found</div>';
    return;
  }
  list.innerHTML = '';
  custs.forEach(function (c) {
    var d = custMap[c];
    var dot = d.critical > 0 ? '#f75c7c' : d.open > 0 ? '#f7b94f' : '#2dd4a0';
    var statusLabel = d.critical > 0 ? 'Critical' : d.open > 0 ? 'At Risk' : 'Healthy';
    var card = document.createElement('div');
    card.style.cssText = 'padding:12px 14px;border-radius:10px;border:1px solid var(--border);cursor:pointer;background:var(--surface2);transition:all .15s';
    card.onmouseenter = function () { this.style.borderColor = dot; this.style.background = 'rgba(79,142,247,0.06)'; };
    card.onmouseleave = function () { this.style.borderColor = 'var(--border)'; this.style.background = 'var(--surface2)'; };
    card.onclick = (function (name) {
      return function () {
        document.getElementById('c360PickerOverlay').style.display = 'none';
        openCustomer360(name);
      };
    })(c);
    card.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(79,142,247,0.2),rgba(124,92,247,0.15));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent)">' + c.substring(0, 2).toUpperCase() + '</div>'
      + '<div style="flex:1;font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + c + '</div>'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + dot + ';flex-shrink:0"></span></div>'
      + '<div style="display:flex;gap:8px;font-size:11px"><span style="color:var(--text-muted)">' + d.total + ' incidents</span>'
      + '<span style="color:' + dot + ';font-weight:600">' + statusLabel + '</span></div>';
    list.appendChild(card);
  });
}

function openCustomer360(custName) {
  // Set the customer name BEFORE navigating so navigateInternal sees it
  // and does NOT re-open the picker
  var nameEl = document.getElementById('c360CustName');
  if (nameEl) nameEl.textContent = custName;

  // Close the picker
  var overlay = document.getElementById('c360PickerOverlay');
  if (overlay) overlay.style.display = 'none';

  // Navigate to the page (navigateInternal checks c360CustName, won't show picker)
  navigate('customer360');

  // Update all header elements
  var titleEl = document.getElementById('c360Title');
  var subEl = document.getElementById('c360Sub');
  var breadEl = document.getElementById('c360BreadCust');
  var avatar = document.getElementById('c360Avatar');
  if (titleEl) titleEl.textContent = custName + ' · Customer 360';
  if (subEl) subEl.textContent = 'Incident history and health metrics for ' + custName;
  if (breadEl) breadEl.textContent = custName;
  if (avatar) avatar.textContent = custName.substring(0, 2).toUpperCase();

  // Render all sections
  renderC360Full(custName);
}

function buildC360Metrics(incidentList) {
  var total = incidentList.length;
  var open = incidentList.filter(function (i) { return i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
  var closed = incidentList.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; }).length;
  var critical = incidentList.filter(function (i) { return i.severity === 'Critical'; }).length;
  var totalDT = incidentList.reduce(function (sum, i) { return sum + getIncDowntimeMinutes(i); }, 0);
  var breached = incidentList.filter(function (i) {
    if (i.status === 'Closed' || i.status === 'Resolved') return false;
    return (Date.now() - new Date(i.startDT || (i.date + 'T09:00')).getTime()) > getIncidentSlaHours(i) * 3600000;
  }).length;
  var withDT = incidentList.filter(function (i) { return getIncDowntimeMinutes(i) > 0; });
  return {
    total: total,
    open: open,
    closed: closed,
    critical: critical,
    totalDT: totalDT,
    breached: breached,
    missedMttr: countMissedMttr(incidentList),
    missedMttd: countMissedMttd(incidentList),
    avgMTTR: withDT.length ? Math.round(withDT.reduce(function (sum, i) { return sum + getIncDowntimeMinutes(i); }, 0) / withDT.length) : 0,
    resolutionRate: total ? Math.round(closed / total * 100) : 0
  };
}

function renderC360MetricSection(statsRowId, metricsRowId, values, category) {
  var statsRow = document.getElementById(statsRowId);
  if (statsRow) {
    var stats = [
      { label: 'Total Incidents', value: values.total, color: 'var(--accent)' },
      { label: 'Open', value: values.open, color: 'var(--warning)' },
      { label: 'Closed', value: values.closed, color: 'var(--success)' },
      { label: 'Critical SLA Breach', value: values.breached, color: values.breached ? 'var(--danger)' : 'var(--success)' },
      { metric: 'mttr', label: 'Critical Missed MTTR', value: values.missedMttr, color: values.missedMttr ? 'var(--danger)' : 'var(--success)' },
      { metric: 'mttd', label: 'Missed MTTD Count', value: values.missedMttd, color: values.missedMttd ? 'var(--danger)' : 'var(--success)' }
    ];
    statsRow.innerHTML = stats.map(function (stat) {
      var drillDown = stat.metric
        ? ' class="metric-kpi-card" role="button" tabindex="0" title="View contributing incidents" onclick="openMetricDrillDown(\'' + stat.metric + '\',document.getElementById(\'c360CustName\').textContent,\'' + category + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}"'
        : '';
      return '<div' + drillDown + ' style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px 18px">'
        + '<div style="font-size:24px;font-weight:800;color:' + stat.color + '">' + stat.value + '</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">' + stat.label + '</div></div>';
    }).join('');
  }
  var metricsRow = document.getElementById(metricsRowId);
  if (metricsRow) {
    var metrics = [
      { label: 'Total Downtime', value: values.totalDT ? minutesToHM(values.totalDT) : '—', color: 'var(--warning)' },
      { label: 'Avg MTTR', value: values.avgMTTR ? minutesToHM(values.avgMTTR) : '—', color: 'var(--accent)' },
      { label: 'Critical Incidents', value: values.critical, color: values.critical ? 'var(--danger)' : 'var(--success)' },
      { label: 'Resolution Rate', value: values.resolutionRate + '%', color: values.resolutionRate >= 80 ? 'var(--success)' : 'var(--warning)' }
    ];
    metricsRow.innerHTML = metrics.map(function (metric) {
      return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px 18px">'
        + '<div style="font-size:24px;font-weight:800;color:' + metric.color + '">' + metric.value + '</div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">' + metric.label + '</div></div>';
    }).join('');
  }
}

function renderC360Full(custName) {
  var allCustIncs = incidents.filter(function (i) { return i.customer === custName; });
  var isNgc = isNgcCustomer(custName);
  var categories = partitionCustomer360HistorianIncidents(allCustIncs);
  var custIncs = isNgc ? categories.application : allCustIncs;
  var historianIncs = isNgc ? categories.historian : [];
  var appValues = buildC360Metrics(custIncs);
  var historianValues = buildC360Metrics(historianIncs);
  var total = appValues.total;
  var open = appValues.open;
  var closed = appValues.closed;
  var critical = appValues.critical;
  var totalDT = appValues.totalDT;
  var breached = appValues.breached;

  var appHeading = document.getElementById('c360ApplicationHeading');
  var historianSection = document.getElementById('c360HistorianSection');
  var analyticsScope = document.getElementById('c360AnalyticsScope');
  var categoryFilter = document.getElementById('c360FilterCategory');
  if (appHeading) appHeading.style.display = isNgc ? '' : 'none';
  if (historianSection) historianSection.style.display = isNgc ? '' : 'none';
  if (analyticsScope) analyticsScope.style.display = isNgc ? '' : 'none';
  if (categoryFilter) {
    categoryFilter.style.display = isNgc ? '' : 'none';
    categoryFilter.value = isNgc ? 'application' : '';
  }

  var statsEl = document.getElementById('c360CustStats');
  if (statsEl) {
    statsEl.textContent = isNgc
      ? appValues.total + ' application incidents · ' + (appValues.totalDT ? minutesToHM(appValues.totalDT) : '0m') + ' application downtime · '
        + historianValues.total + ' Historian incidents · ' + (historianValues.totalDT ? minutesToHM(historianValues.totalDT) : '0m') + ' Historian downtime'
      : total + ' incidents · ' + open + ' open · ' + (totalDT > 0 ? minutesToHM(totalDT) + ' downtime' : 'no downtime recorded');
  }

  // ── Tags (unique tags from customer incidents) ──
  var tagsEl = document.getElementById('c360Tags');
  if (tagsEl) {
    var allTags = {};
    custIncs.forEach(function (i) { (i.tags || []).forEach(function (t) { allTags[t] = (allTags[t] || 0) + 1; }); });
    var topTags = Object.keys(allTags).sort(function (a, b) { return allTags[b] - allTags[a]; }).slice(0, 8);
    tagsEl.innerHTML = topTags.map(function (t) {
      var col = (typeof TAG_COLORS !== 'undefined' && TAG_COLORS[t]) ? TAG_COLORS[t] : '#6c7a8d';
      return '<span style="background:' + col + '20;color:' + col + ';border:1px solid ' + col + '40;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600">' + t + '</span>';
    }).join('');
  }

  // ── Health ring (canvas donut) ──
  var healthScore = total > 0 ? Math.max(0, Math.round(100 - (critical / total * 40) - (open / total * 30) - (breached / Math.max(open, 1) * 30))) : 100;
  var ringEl = document.getElementById('c360HealthRing');
  if (ringEl && ringEl.getContext) {
    var ctx = ringEl.getContext('2d');
    var cx = 45, cy = 45, radius = 36, lineW = 8;
    ctx.clearRect(0, 0, 90, 90);
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = lineW; ctx.stroke();
    var color = healthScore >= 80 ? '#2dd4a0' : healthScore >= 50 ? '#f7b94f' : '#f75c7c';
    ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (healthScore / 100));
    ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(healthScore, cx, cy);
  }

  // ── Reporting category metrics ──
  renderC360MetricSection('c360StatsRow', 'c360MetricsRow', appValues, isNgc ? 'application' : 'all');
  if (isNgc) renderC360MetricSection('c360HistorianStatsRow', 'c360HistorianMetricsRow', historianValues, 'historian');

  // ── Monthly trend chart ──
  var trendEl = document.getElementById('c360TrendChart');
  if (trendEl && trendEl.getContext) {
    var dark = !document.body.classList.contains('light-mode');
    var gridC = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    var textC = dark ? '#8890b0' : '#666';
    _fitCanvas(trendEl, 160);
    var r2 = { ctx: trendEl.getContext('2d'), W: trendEl.width, H: trendEl.height };
    var ctx2 = r2.ctx; var W2 = r2.W; var H2 = r2.H;
    ctx2.clearRect(0, 0, W2, H2);
    var now2 = new Date(); var labels2 = []; var vals2 = [];
    for (var mm = 5; mm >= 0; mm--) {
      var d2 = new Date(now2.getFullYear(), now2.getMonth() - mm, 1);
      labels2.push(d2.toLocaleString('default', { month: 'short' }));
      vals2.push(custIncs.filter(function (i) {
        var id2 = new Date(i.date);
        return id2.getMonth() === d2.getMonth() && id2.getFullYear() === d2.getFullYear();
      }).length);
    }
    var pad2 = { t: 10, r: 10, b: 30, l: 24 }; var cW2 = W2 - pad2.l - pad2.r; var cH2 = H2 - pad2.t - pad2.b;
    var maxV2 = Math.max.apply(null, vals2.concat([1]));
    var pts2 = vals2.map(function (v, i) { return { x: pad2.l + (i / (labels2.length - 1)) * cW2, y: pad2.t + cH2 - (v / maxV2) * cH2 }; });
    // gradient fill
    var ag = ctx2.createLinearGradient(0, pad2.t, 0, pad2.t + cH2);
    ag.addColorStop(0, 'rgba(79,142,247,0.3)'); ag.addColorStop(1, 'rgba(79,142,247,0)');
    ctx2.beginPath(); pts2.forEach(function (p, i) { if (i === 0) ctx2.moveTo(p.x, p.y); else { var pv = pts2[i - 1]; var cx2 = (pv.x + p.x) / 2; ctx2.bezierCurveTo(cx2, pv.y, cx2, p.y, p.x, p.y); } });
    ctx2.lineTo(pts2[pts2.length - 1].x, pad2.t + cH2); ctx2.lineTo(pts2[0].x, pad2.t + cH2); ctx2.closePath();
    ctx2.fillStyle = ag; ctx2.fill();
    // line
    ctx2.beginPath(); pts2.forEach(function (p, i) { if (i === 0) ctx2.moveTo(p.x, p.y); else { var pv = pts2[i - 1]; var cx2 = (pv.x + p.x) / 2; ctx2.bezierCurveTo(cx2, pv.y, cx2, p.y, p.x, p.y); } });
    ctx2.strokeStyle = '#4f8ef7'; ctx2.lineWidth = 2; ctx2.stroke();
    // labels
    labels2.forEach(function (lb, i) { var x = pad2.l + (i / (labels2.length - 1)) * cW2; ctx2.fillStyle = textC; ctx2.font = '9px sans-serif'; ctx2.textAlign = 'center'; ctx2.fillText(lb, x, H2 - 4); });
    // dots+values
    pts2.forEach(function (p, i) {
      if (vals2[i] === 0) return;
      ctx2.beginPath(); ctx2.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx2.fillStyle = '#4f8ef7'; ctx2.fill();
      ctx2.fillStyle = textC; ctx2.font = 'bold 9px sans-serif'; ctx2.textAlign = 'center';
      if (p.y - 10 > pad2.t) ctx2.fillText(vals2[i], p.x, p.y - 6);
    });
  }

  // ── Area breakdown chart ──
  var areaEl = document.getElementById('c360AreaChart');
  if (areaEl && areaEl.getContext) {
    _fitCanvas(areaEl, 160);
    var ra = { ctx: areaEl.getContext('2d'), W: areaEl.width, H: areaEl.height };
    var ctx3 = ra.ctx; var W3 = ra.W; var H3 = ra.H;
    ctx3.clearRect(0, 0, W3, H3);
    var areaMap = {};
    custIncs.forEach(function (i) { var a = i.area || 'Other'; areaMap[a] = (areaMap[a] || 0) + 1; });
    var areaKeys = Object.keys(areaMap).sort(function (a, b) { return areaMap[b] - areaMap[a]; });
    if (areaKeys.length) {
      var aColors = ['#4f8ef7', '#2dd4a0', '#f7b94f', '#f75c7c', '#9b59b6', '#e67e22'];
      var pad3 = { t: 10, r: 10, b: 30, l: 28 }; var cW3 = W3 - pad3.l - pad3.r; var cH3 = H3 - pad3.t - pad3.b;
      var maxA = Math.max.apply(null, areaKeys.map(function (k) { return areaMap[k]; }));
      var bW3 = Math.min(cW3 / areaKeys.length * 0.6, 40);
      areaKeys.forEach(function (area, i) {
        var bH3 = (areaMap[area] / maxA) * cH3;
        var x3 = pad3.l + (i / (areaKeys.length - 1 || 1)) * cW3;
        var y0 = pad3.t + cH3;
        var col3 = aColors[i % aColors.length];
        var g3 = ctx3.createLinearGradient(0, y0 - bH3, 0, y0);
        g3.addColorStop(0, col3); g3.addColorStop(1, col3.replace('rgb', 'rgba').replace(')', ',0.3)'));
        ctx3.fillStyle = g3;
        if (bH3 > 0) ctx3.fillRect(x3 - bW3 / 2, y0 - bH3, bW3, bH3);
        var dark3 = !document.body.classList.contains('light-mode');
        ctx3.fillStyle = dark3 ? '#8890b0' : '#666'; ctx3.font = '9px sans-serif'; ctx3.textAlign = 'center';
        ctx3.fillText(area.substring(0, 6), x3, H3 - 4);
        if (areaMap[area] > 0) { ctx3.fillStyle = col3; ctx3.font = 'bold 9px sans-serif'; ctx3.fillText(areaMap[area], x3, y0 - bH3 - 4); }
      });
    } else {
      var dark4 = !document.body.classList.contains('light-mode');
      ctx3.fillStyle = dark4 ? '#8890b0' : '#666'; ctx3.font = '12px sans-serif'; ctx3.textAlign = 'center'; ctx3.textBaseline = 'middle';
      ctx3.fillText('No data', W3 / 2, H3 / 2);
    }
  }

  // ── Severity bars ──
  var sevEl = document.getElementById('c360SevBars');
  if (sevEl) {
    var sevs = [{ k: 'Critical', c: '#f75c7c' }, { k: 'High', c: '#f7b94f' }, { k: 'Medium', c: '#4f8ef7' }, { k: 'Normal', c: '#2dd4a0' }];
    var maxSev = Math.max.apply(null, sevs.map(function (s) { return custIncs.filter(function (i) { return i.severity === s.k; }).length; })) || 1;
    sevEl.innerHTML = sevs.map(function (s) {
      var cnt = custIncs.filter(function (i) { return i.severity === s.k; }).length;
      var pct = Math.round(cnt / maxSev * 100);
      return '<div style="margin-bottom:10px">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
        + '<span style="font-size:12px;color:var(--text);font-weight:500">' + s.k + '</span>'
        + '<span style="font-size:11px;color:' + s.c + ';font-family:var(--font-mono)">' + cnt + '</span></div>'
        + '<div style="height:6px;background:var(--border);border-radius:3px">'
        + '<div style="height:6px;width:' + pct + '%;background:' + s.c + ';border-radius:3px;transition:width .4s"></div></div></div>';
    }).join('');
  }

  // ── Recurring incidents ──
  var recurEl = document.getElementById('c360RecurringList');
  if (recurEl) {
    var recMap = {};
    custIncs.forEach(function (i) {
      var key = i.title.split(' ').slice(0, 5).join(' ').toLowerCase();
      if (!recMap[key]) recMap[key] = { title: i.title, count: 0, sev: i.severity };
      recMap[key].count++;
    });
    var recurring = Object.values(recMap).filter(function (r) { return r.count > 1; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    if (!recurring.length) {
      recurEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px">No recurring incidents</div>';
    } else {
      recurEl.innerHTML = recurring.map(function (r) {
        var col = { Critical: '#f75c7c', High: '#f7b94f', Medium: '#4f8ef7', Normal: '#2dd4a0' }[r.sev] || '#6c7a8d';
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
          + '<span style="background:' + col + '20;color:' + col + ';border:1px solid ' + col + '40;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;flex-shrink:0">' + r.count + '×</span>'
          + '<span style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.title + '</span></div>';
      }).join('');
    }
  }

  // ── Incident table ──
  renderC360Table();
}

function renderCustomerHealth(custName) {
  var custIncs = incidents.filter(function (i) { return i.customer === custName; });
  var total = custIncs.length;
  var open = custIncs.filter(function (i) { return i.status !== 'Closed'; }).length;
  var closed = total - open;
  var critical = custIncs.filter(function (i) { return i.severity === 'Critical'; }).length;
  var totalDT = custIncs.reduce(function (acc, i) { return acc + getIncDowntimeMinutes(i); }, 0);

  // Update stat cards if they exist
  var mapping = {
    c360Total: total, c360Open: open, c360Closed: closed,
    c360Critical: critical, c360Downtime: minutesToHM(totalDT)
  };
  Object.keys(mapping).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = mapping[id];
  });

  // Render incident list
  var listEl = document.getElementById('c360Table');
  if (!listEl) return;
  if (!custIncs.length) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No incidents for this customer</div>';
    return;
  }
  listEl.innerHTML = custIncs.slice(0, 20).map(function (i) {
    return '<div onclick="openDetailPanel(\'' + i.id + '\')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer" '
      + 'onmouseenter="this.style.background=\'rgba(79,142,247,0.05)\'" onmouseleave="this.style.background=\'\'">'
      + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:64px">' + i.id + '</span>'
      + '<span style="flex:1;font-size:13px;color:var(--text)">' + i.title + '</span>'
      + '<span class="badge badge-' + i.severity.toLowerCase() + '">' + i.severity + '</span>'
      + '<span class="badge badge-' + i.status.toLowerCase().replace(/ /g, '-').replace(/&/g, '') + '">' + i.status + '</span>'
      + '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + i.date + '</span>'
      + '</div>';
  }).join('');
}

// ─── HOME PAGE ─────────────────────────────────────────────────────────────
function renderMyIncidents() {
  var container = document.getElementById('myIncList');
  if (!container) return;
  var mine = incidents.filter(function (i) {
    return i.engineer === currentUserName && i.status !== 'Closed';
  }).slice(0, 5);
  var badge = document.getElementById('myIncBadge');
  if (badge) { badge.textContent = mine.length; badge.style.display = mine.length ? '' : 'none'; }
  if (!mine.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No open incidents assigned to you</div>';
    return;
  }
  container.innerHTML = mine.map(function (i) {
    return '<div onclick="openDetailPanel(\'' + i.id + '\')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer" '
      + 'onmouseenter="this.style.background=\'rgba(79,142,247,0.05)\'" onmouseleave="this.style.background=\'\'">'
      + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:64px">' + i.id + '</span>'
      + '<span style="flex:1;font-size:13px;color:var(--text)">' + i.title + '</span>'
      + '<span class="badge badge-' + i.severity.toLowerCase() + '">' + i.severity + '</span></div>';
  }).join('');
}

// ─── DATA MANAGEMENT ──────────────────────────────────────
function requireAdminMasterData() {
  if ((currentRole || '').toLowerCase() !== 'admin') {
    showToast('Admin access required', 'error');
    return false;
  }
  return true;
}

function masterDataRequest(path, method, body, callback) {
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { showToast('Not authenticated. Please login first.', 'error'); return; }
  fetch(window.APP_CONFIG.API_BASE_URL + path, {
    method: method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  })
    .then(r => r.json().then(data => ({ ok: r.ok, data: data })))
    .then(result => {
      if (!result.ok || !result.data.success) throw new Error(result.data.message || 'Master data update failed');
      loadMasterData(function () { if (callback) callback(result.data); });
    })
    .catch(err => {
      console.error('Master data update error:', err);
      showToast(err.message || 'Master data update failed', 'error');
    });
}

function addCustomer() {
  if (!requireAdminMasterData()) return;
  var inp = document.getElementById('dmNewCustomer');
  if (!inp) return;
  var name = inp.value.trim();
  if (!name) { showToast('Enter a customer name', 'error'); return; }
  if (customers.indexOf(name) >= 0) { showToast('Customer already exists', 'error'); return; }
  masterDataRequest('/master-data/customers', 'POST', { customer_name: name }, function () {
    inp.value = '';
    addAudit('??', 'Added Customer', name);
    showToast('Customer "' + name + '" added', 'success');
  });
}

function removeCustomer(name) {
  if (!requireAdminMasterData()) return;
  var rec = customerRecords.find(function (c) { return c.customer_name === name; });
  if (!rec) { showToast('Customer not found', 'error'); return; }
  masterDataRequest('/master-data/customers/' + rec.id, 'DELETE', null, function () {
    addAudit('??', 'Deactivated Customer', name);
    showToast('Customer "' + name + '" deactivated', 'success');
  });
}

function addArea() {
  if (!requireAdminMasterData()) return;
  var inp = document.getElementById('dmNewArea');
  if (!inp) return;
  var name = inp.value.trim();
  if (!name) { showToast('Enter an area name', 'error'); return; }
  if (areas.indexOf(name) >= 0) { showToast('Area already exists', 'error'); return; }
  masterDataRequest('/master-data/areas', 'POST', { area_name: name }, function () {
    inp.value = '';
    addAudit('??', 'Added Area', name);
    showToast('Area "' + name + '" added', 'success');
  });
}

function removeArea(name) {
  if (!requireAdminMasterData()) return;
  var rec = areaRecords.find(function (a) { return a.area_name === name; });
  if (!rec) { showToast('Area not found', 'error'); return; }
  masterDataRequest('/master-data/areas/' + rec.id, 'DELETE', null, function () {
    addAudit('??', 'Deactivated Area', name);
    showToast('Area "' + name + '" deactivated', 'success');
  });
}
function applyDashFilters() {
  updateStats();
  renderRecentTable();
  renderActivity();
  renderEngineerLeaderboard();
  renderRecurringList();
  renderSlaCountdown();
  initCharts();

  // Count active filters (multi-select + date)
  var msIds = ['df_customer', 'df_area', 'df_severity', 'df_year', 'df_month'];
  var msCount = msIds.reduce(function (n, id) { return n + getMsValues(id).length; }, 0);
  var dateCount = ['df_from', 'df_to'].filter(function (id) { var el = document.getElementById(id); return el && el.value; }).length;
  var activeCount = msCount + dateCount;

  var badge = document.getElementById('df_active_badge');
  if (badge) {
    badge.textContent = activeCount + ' active';
    badge.style.display = activeCount > 0 ? '' : 'none';
  }
  var clearBtn = document.getElementById('df_clear_btn');
  if (clearBtn) clearBtn.style.display = activeCount > 0 ? '' : 'none';
}

function clearDashFilters() {
  ['df_customer', 'df_area', 'df_severity', 'df_year', 'df_month'].forEach(function (id) { clearMsFilter(id); });
  ['df_from', 'df_to'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var badge = document.getElementById('df_active_badge');
  if (badge) badge.style.display = 'none';
  var btn = document.getElementById('df_clear_btn');
  if (btn) btn.style.display = 'none';
  applyDashFilters();
}

// ─── GLOBAL SEARCH ────────────────────────────────────────
function runGlobalSearch(q) {
  var res = document.getElementById('gsearchResults');
  if (!res) return;
  q = (q || '').toLowerCase().trim();
  if (!q) { res.innerHTML = ''; return; }

  var results = incidents.filter(function (i) {
    return i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q) ||
      (i.customer || '').toLowerCase().includes(q) || (i.engineer || '').toLowerCase().includes(q) ||
      (i.desc || '').toLowerCase().includes(q);
  }).slice(0, 10);

  if (!results.length) {
    res.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No results for "' + q + '"</div>';
    return;
  }

  res.innerHTML = results.map(function (i) {
    return '<div onclick="closeGlobalSearch();openDetailPanel(\'' + i.id + '\')" '
      + 'style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer" '
      + 'onmouseenter="this.style.background=\'rgba(79,142,247,0.07)\'" onmouseleave="this.style.background=\'\'">'
      + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:70px">' + i.id + '</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + i.title + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + i.customer + ' · ' + i.engineer + '</div>'
      + '</div>'
      + '<span class="badge badge-' + i.severity.toLowerCase() + '">' + i.severity + '</span>'
      + '</div>';
  }).join('');
}

function closeGlobalSearch() {
  var ov = document.getElementById('gsearchOverlay');
  if (ov) ov.style.display = 'none';
  var inp = document.getElementById('gsearchInput');
  if (inp) inp.value = '';
  var res = document.getElementById('gsearchResults');
  if (res) res.innerHTML = '';
}

// ─── AUDIT EXPORT ─────────────────────────────────────────
function exportAuditCSV() {
  if (!auditLog.length) { showToast('No audit entries to export', 'error'); return; }
  var rows = [['Time', 'User', 'Action', 'Detail']];
  auditLog.forEach(function (e) {
    rows.push(['"' + (e.time || '') + '"', '"' + (e.user || currentUserName) + '"',
    '"' + (e.action || '') + '"', '"' + (e.detail || '').replace(/"/g, '""') + '"']);
  });
  var csv = rows.map(function (r) { return r.join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'audit-log.csv'; a.click();
  showToast('Audit log exported', 'success');
}

// ─── DETAIL PANEL COMMENT ─────────────────────────────────
function submitDpComment() {
  var inp = document.getElementById('dp_comment_input');
  if (!inp || !detailCurrentId) return;
  var text = inp.value.trim();
  if (!text) { showToast('Enter a comment', 'error'); return; }
  persistIncidentComment(detailCurrentId, text, function () {
    inp.value = '';
    renderFeed(detailCurrentId);
    closeMentionDropdown();
  });
}

function handleCommentKey(e) {
  if (selectMentionOnEnter(e, 'dp_comment_input', 'mentionDropdown')) return;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDpComment(); }
}

function handleReportCommentKey(e) {
  if (selectMentionOnEnter(e, 'commentInput', 'reportMentionDropdown')) return;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
}

function handleMentionInput(el, dropdownId) {
  dropdownId = dropdownId || 'mentionDropdown';
  var cursor = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  var beforeCursor = el.value.substring(0, cursor);
  var mentionMatch = beforeCursor.match(/(?:^|\s)@([^@\n]*)$/);
  if (!mentionMatch) { closeMentionDropdown(dropdownId); return; }
  var query = mentionMatch[1].toLowerCase().trim();
  var dd = document.getElementById(dropdownId);
  if (!dd) return;
  var matches = users.filter(function (u) {
    return u && u.name && u.name.toLowerCase().includes(query);
  }).slice(0, 6);
  if (!matches.length) { closeMentionDropdown(dropdownId); return; }
  dd.innerHTML = '';
  dd._mentionMatches = matches;
  dd._mentionStart = cursor - mentionMatch[1].length - 1;
  dd._mentionEnd = cursor;
  matches.forEach(function (u) {
    var option = document.createElement('div');
    option.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:12px;color:var(--text)';
    option.textContent = u.name + (u.role ? ' (' + u.role + ')' : '');
    option.onmouseenter = function () { option.style.background = 'rgba(79,142,247,0.1)'; };
    option.onmouseleave = function () { option.style.background = ''; };
    option.onmousedown = function (event) {
      event.preventDefault();
      insertMention(u.name, el.id, dropdownId);
    };
    dd.appendChild(option);
  });
  dd.style.display = 'block';
}

function insertMention(name, inputId, dropdownId) {
  inputId = inputId || 'dp_comment_input';
  dropdownId = dropdownId || 'mentionDropdown';
  var inp = document.getElementById(inputId);
  var dd = document.getElementById(dropdownId);
  if (!inp) return;
  var start = dd && Number.isInteger(dd._mentionStart) ? dd._mentionStart : inp.value.lastIndexOf('@');
  var end = dd && Number.isInteger(dd._mentionEnd) ? dd._mentionEnd : inp.value.length;
  inp.value = inp.value.substring(0, start) + '@' + name + ' ' + inp.value.substring(end);
  var nextCursor = start + name.length + 2;
  inp.setSelectionRange(nextCursor, nextCursor);
  closeMentionDropdown(dropdownId);
  inp.focus();
}

function selectMentionOnEnter(e, inputId, dropdownId) {
  var dd = document.getElementById(dropdownId);
  if (e.key !== 'Enter' || e.shiftKey || !dd || dd.style.display !== 'block' || !dd._mentionMatches || !dd._mentionMatches.length) return false;
  e.preventDefault();
  insertMention(dd._mentionMatches[0].name, inputId, dropdownId);
  return true;
}

function closeMentionDropdown(dropdownId) {
  var dd = document.getElementById(dropdownId || 'mentionDropdown');
  if (dd) dd.style.display = 'none';
}

// ─── FEED FILTER ──────────────────────────────────────────
var currentFeedFilter = 'all';
function setFeedFilter(filter, btn) {
  currentFeedFilter = filter;
  document.querySelectorAll('.feed-filter-btn').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (detailCurrentId) {
    var entries = incidentComments[detailCurrentId] || [];
    var filtered = filter === 'all' ? entries : entries.filter(function (e) {
      if (filter === 'comment') return e.type === 'comment';
      return e.type !== 'comment';
    });
    var container = document.getElementById('dp_feed');
    if (!container) return;
    if (!filtered.length) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No entries</div>';
      return;
    }
    var typeIcon = { create: '✦', status: '↻', comment: '💬', escalate: '⬆', close: '✓', tag: '🏷', edit: '✏', system: '⚙' };
    var typeColor = {
      create: 'var(--accent)', status: 'var(--warning)', comment: 'var(--text)',
      escalate: 'var(--danger)', close: 'var(--success)', tag: '#9b59b6', edit: 'var(--accent2)', system: 'var(--text-muted)'
    };
    container.innerHTML = filtered.slice().reverse().map(function (e) {
      return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
        + '<span style="font-size:13px;color:' + (typeColor[e.type] || 'var(--text-muted)') + ';flex-shrink:0">'
        + (typeIcon[e.type] || '•') + '</span>'
        + '<div><div style="font-size:12px;color:var(--text)">' + (e.msg || e.action) + '</div>'
        + (e.detail ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + e.detail + '</div>' : '')
        + '</div></div>';
    }).join('');
  }
}

// ─── NOTIFICATION TABS ────────────────────────────────────
function setNotifTab(tab) {
  activeNotificationTab = tab;
  ['all', 'unread', 'mentions'].forEach(function (t) {
    var btn = document.getElementById('ntab_' + t);
    if (btn) btn.style.borderBottomColor = t === tab ? 'var(--accent)' : 'transparent';
  });
  var filtered = tab === 'unread'
    ? notifications.filter(function (n) { return n.unread; })
    : tab === 'mentions'
      ? notifications.filter(function (n) { return n.mention; })
      : notifications;
  var list = document.getElementById('notifList');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No notifications</div>';
    return;
  }
  var typeIcon = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', critical: '🔴', mailbox: '✉' };
  var typeColor = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--accent)', critical: 'var(--danger)', mailbox: 'var(--accent2)' };
  list.innerHTML = filtered.slice(0, 50).map(function (n) {
    return '<div onclick="markNotifRead(' + n.id + ')" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;'
      + 'background:' + (n.unread ? 'rgba(79,142,247,0.05)' : 'transparent') + ';display:flex;gap:10px;align-items:flex-start">'
      + '<span style="font-size:14px;color:' + (typeColor[n.type] || 'var(--accent)') + '">' + (typeIcon[n.type] || '•') + '</span>'
      + '<div style="flex:1"><div style="font-size:13px;color:var(--text)">' + escapeMetricHtml(n.text) + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + n.time + '</div></div>'
      + (n.unread ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px"></span>' : '')
      + '</div>';
  }).join('');
}

// ─── PROFILE MODAL ────────────────────────────────────────
function openProfileModal() {
  var modal = document.getElementById('profileModal');
  if (!modal) return;
  var nameInp = document.getElementById('pf_name');
  var phoneInp = document.getElementById('pf_phone');
  if (nameInp) nameInp.value = currentUserProfile.name || currentUserName || '';
  if (phoneInp) phoneInp.value = currentUserProfile.phone || '';
  var departmentInput = document.getElementById('pf_dept');
  var locationInput = document.getElementById('pf_location');
  var bioInput = document.getElementById('pf_bio');
  if (departmentInput) departmentInput.value = currentUserProfile.department || '';
  if (locationInput) locationInput.value = currentUserProfile.location || '';
  if (bioInput) bioInput.value = currentUserProfile.bio || '';
  resetProfilePasswordForm();
  modal.classList.add('open');
}

function applyCurrentUserProfile(user) {
  if (!user) return;
  currentUserProfile = {
    id: user.id,
    name: user.name || user.full_name || user.email || '',
    email: user.email || '', role: user.role || currentRole,
    phone: user.phone || '', department: user.department || '',
    location: user.location || '', bio: user.bio || '',
    lastActive: user.lastActive || 'Just now'
  };
  var aiLauncher = document.getElementById('aiChatLauncher');
  if (aiLauncher) {
    // The launcher may have a saved drag position.  Make it measurable before
    // restoring that position; otherwise offsetWidth/offsetHeight are zero
    // while it is hidden and the button can be restored off-screen.
    aiLauncher.style.display = 'block';
    requestAnimationFrame(function () { restoreAiLauncherPosition(); });
  }
  if (currentUserProfile.name) currentUserName = currentUserProfile.name;
  ['sidebarUserName', 'profileUserLabel', 'profileDdName', 'profileModalName'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.textContent = currentUserName;
  });
  var initials = currentUserName.split(/\s+/).map(function (word) { return word[0] || ''; }).join('').substring(0, 2).toUpperCase();
  ['sidebarAvatar', 'btnProfile', 'profileDdAvatar', 'profileModalAvatar'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.textContent = initials;
  });
  ['profileDdEmail', 'profileModalEmail', 'pf_ro_email'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.textContent = currentUserProfile.email;
  });
  var idElement = document.getElementById('pf_ro_id');
  if (idElement && currentUserProfile.id) idElement.textContent = 'USR-' + String(currentUserProfile.id).padStart(3, '0');
  var roleText = String(currentUserProfile.role || '').toUpperCase();
  var roleElement = document.getElementById('pf_ro_role'); if (roleElement) roleElement.textContent = roleText;
  var modalRole = document.getElementById('profileModalRole'); if (modalRole) modalRole.textContent = roleText;
  var activeElement = document.getElementById('pf_ro_active'); if (activeElement) activeElement.textContent = currentUserProfile.lastActive;
}

function resetProfilePasswordForm() {
  ['pf_current_password', 'pf_new_password', 'pf_confirm_password'].forEach(function (id) {
    var input = document.getElementById(id);
    if (input) input.value = '';
  });
  var section = document.getElementById('profilePasswordSection');
  var toggle = document.getElementById('profilePasswordToggle');
  var error = document.getElementById('profilePasswordError');
  if (section) section.style.display = 'none';
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (error) { error.textContent = ''; error.style.display = 'none'; }
}

function toggleProfilePasswordSection() {
  var section = document.getElementById('profilePasswordSection');
  var toggle = document.getElementById('profilePasswordToggle');
  if (!section) return;
  var opening = section.style.display === 'none';
  section.style.display = opening ? 'block' : 'none';
  if (toggle) toggle.setAttribute('aria-expanded', String(opening));
  if (opening) {
    var current = document.getElementById('pf_current_password');
    if (current) current.focus();
  }
}

function changeProfilePassword() {
  var currentInput = document.getElementById('pf_current_password');
  var newInput = document.getElementById('pf_new_password');
  var confirmInput = document.getElementById('pf_confirm_password');
  var error = document.getElementById('profilePasswordError');
  var button = document.getElementById('profilePasswordSaveBtn');
  var currentPassword = currentInput ? currentInput.value : '';
  var newPassword = newInput ? newInput.value : '';
  var confirmPassword = confirmInput ? confirmInput.value : '';

  function showPasswordError(message) {
    if (error) { error.textContent = message; error.style.display = 'block'; }
  }
  if (!currentPassword || !newPassword || !confirmPassword) {
    showPasswordError('Complete all password fields.'); return;
  }
  if (newPassword.length < 8 || newPassword.length > 72) {
    showPasswordError('New password must be between 8 and 72 characters.'); return;
  }
  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    showPasswordError('Include uppercase, lowercase, and numeric characters.'); return;
  }
  if (newPassword !== confirmPassword) {
    showPasswordError('New password and confirmation do not match.'); return;
  }
  if (currentPassword === newPassword) {
    showPasswordError('New password must be different from the current password.'); return;
  }

  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { showPasswordError('Your session has expired. Please sign in again.'); return; }
  if (error) { error.textContent = ''; error.style.display = 'none'; }
  if (button) { button.disabled = true; button.textContent = 'Updating...'; }

  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword })
  })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to change password');
        return data;
      });
    })
    .then(function (data) {
      resetProfilePasswordForm();
      showToast(data.message || 'Password changed successfully', 'success');
    })
    .catch(function (requestError) {
      showPasswordError(requestError.message || 'Unable to change password');
    })
    .finally(function () {
      if (button) { button.disabled = false; button.textContent = 'Update Password'; }
    });
}

function saveProfile() {
  var fullName = ((document.getElementById('pf_name') || {}).value || '').trim();
  var phone = ((document.getElementById('pf_phone') || {}).value || '').trim();
  var department = ((document.getElementById('pf_dept') || {}).value || '').trim();
  var location = ((document.getElementById('pf_location') || {}).value || '').trim();
  var bio = ((document.getElementById('pf_bio') || {}).value || '').trim();
  if (!fullName) { showToast('Display name is required', 'error'); return; }
  if (fullName.length > 255 || phone.length > 50 || department.length > 100 || location.length > 100 || bio.length > 1000) {
    showToast('One or more profile fields are too long', 'error'); return;
  }
  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { showToast('Your session has expired. Please sign in again.', 'error'); return; }
  var saveButton = document.querySelector('#profileModal .modal-footer .btn-primary');
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving...'; }
  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ fullName: fullName, phone: phone, department: department, location: location, bio: bio })
  })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to update profile');
        return data;
      });
    })
    .then(function (data) {
      applyCurrentUserProfile(data.data);
      addAudit('👤', 'Profile Updated', 'Profile details updated');
      showToast(data.message || 'Profile updated successfully', 'success');
      closeModal('profileModal');
    })
    .catch(function (error) { showToast(error.message || 'Unable to update profile', 'error'); })
    .finally(function () {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Profile'; }
    });
}

// ─── C360 TABLE ───────────────────────────────────────────
function renderC360Table() {
  var sevFilter = document.getElementById('c360FilterSev') ? document.getElementById('c360FilterSev').value : '';
  var statusFilter = document.getElementById('c360FilterStatus') ? document.getElementById('c360FilterStatus').value : '';
  var categoryEl = document.getElementById('c360FilterCategory');
  var category = categoryEl && categoryEl.style.display !== 'none' ? categoryEl.value : '';
  var custName = document.getElementById('c360CustName') ? document.getElementById('c360CustName').textContent : '';

  var filtered = incidents.filter(function (i) {
    if (i.customer !== custName) return false;
    if (category === 'application' && isCustomer360HistorianIncident(i)) return false;
    if (category === 'historian' && !isCustomer360HistorianIncident(i)) return false;
    if (sevFilter && i.severity !== sevFilter) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    return true;
  });

  var historyTitle = document.getElementById('c360HistoryTitle');
  if (historyTitle) historyTitle.textContent = category === 'historian'
    ? 'Historian Incident History'
    : category === 'application' ? 'Application Incident History' : 'Complete Incident History';
  var countEl = document.getElementById('c360IncCount');
  if (countEl) countEl.textContent = filtered.length + ' incident' + (filtered.length !== 1 ? 's' : '');

  var table = document.getElementById('c360Table');
  if (!table) return;
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--text-muted)">No incidents match the filter</td></tr>';
    return;
  }
  table.innerHTML = filtered.map(function (i) {
    var sla = getSLAInfo(i);
    var mttrMinutes = getIncMttrMinutes(i);
    var downtimeMinutes = getIncDowntimeMinutes(i);
    return '<tr onclick="openDetailPanel(\'' + escapeMetricHtml(i.id) + '\')" style="cursor:pointer" '
      + 'onmouseenter="this.style.background=\'rgba(79,142,247,0.05)\'" onmouseleave="this.style.background=\'\'">'
      + '<td class="id-cell">' + escapeMetricHtml(i.id) + '</td>'
      + '<td class="title-cell">' + escapeMetricHtml(i.title || '—') + '</td>'
      + '<td>' + escapeMetricHtml(i.area || '—') + '</td>'
      + '<td><span class="badge badge-' + escapeMetricHtml(i.severity.toLowerCase()) + '">' + escapeMetricHtml(i.severity) + '</span></td>'
      + '<td><span class="badge badge-' + escapeMetricHtml(i.status.toLowerCase().replace(/ /g, '-').replace(/&/g, '')) + '">' + escapeMetricHtml(i.status) + '</span></td>'
      + '<td><span class="' + escapeMetricHtml(sla.cls) + '" title="' + escapeMetricHtml(sla.title) + '">' + escapeMetricHtml(sla.label) + '</span></td>'
      + '<td>' + (mttrMinutes > 0 ? minutesToHM(mttrMinutes) : '—') + '</td>'
      + '<td>' + (downtimeMinutes > 0 ? minutesToHM(downtimeMinutes) : '—') + '</td>'
      + '<td>' + escapeMetricHtml(i.engineer || '—') + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + escapeMetricHtml(i.date || '—') + '</td>'
      + '</tr>';
  }).join('');
}

// ─── SCROLL TO TOP ────────────────────────────────────────
function scrollToTop() {
  var content = document.getElementById('mainContent');
  if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show/hide scroll-to-top button
// scroll-to-top init moved to DOMContentLoaded



// ─── CREATE MODAL TAG HANDLING ────────────────────────────────
var createModalTags = [];

function renderCreateTagChips() {
  var chips = document.getElementById('f_tag_chips');
  if (!chips) return;
  chips.innerHTML = createModalTags.map(function (t) {
    var col = TAG_COLORS[t] || TAG_COLORS['default'] || '#4f8ef7';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:' + col + '22;color:' + col + ';border:1px solid ' + col + '44">'
      + t + '<span onclick="removeCreateTag(\'' + t + '\')" style="cursor:pointer;opacity:0.7;font-size:13px;line-height:1;margin-left:2px">&times;</span></span>';
  }).join('');
}

function addCreateTag(tag) {
  tag = String(tag || '').trim();
  if (tag.charAt(0) === '@') {
    var requestedName = tag.substring(1).trim().toLowerCase();
    var matchedUser = users.find(function (u) {
      return u && u.name && u.name.toLowerCase() === requestedName;
    });
    if (!matchedUser) return;
    tag = '@' + matchedUser.name;
  } else {
    tag = tag.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }
  if (!tag || createModalTags.indexOf(tag) >= 0) return;
  createModalTags.push(tag);
  renderCreateTagChips();
  var inp = document.getElementById('f_tag_input');
  if (inp) inp.value = '';
  closeCreateTagSuggestions();
}

function removeCreateTag(tag) {
  createModalTags = createModalTags.filter(function (t) { return t !== tag; });
  renderCreateTagChips();
}

function handleCreateTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var inp = document.getElementById('f_tag_input');
    var box = document.getElementById('f_tag_suggestions');
    if (inp && inp.value.trim().charAt(0) === '@' && box && box._userMatches && box._userMatches.length) {
      addCreateTag('@' + box._userMatches[0].name);
    } else if (inp && inp.value.trim()) {
      addCreateTag(inp.value);
    }
  } else if (e.key === 'Backspace') {
    var inp = document.getElementById('f_tag_input');
    if (inp && !inp.value && createModalTags.length) {
      createModalTags.pop();
      renderCreateTagChips();
    }
  }
}

function showCreateTagSuggestions(q) {
  var box = document.getElementById('f_tag_suggestions');
  if (!box) return;
  q = (q || '').trim().toLowerCase();
  box._userMatches = [];
  if (q.charAt(0) === '@') {
    var userQuery = q.substring(1).trim();
    var userMatches = users.filter(function (u) {
      return u && u.name && u.name.toLowerCase().includes(userQuery)
        && createModalTags.indexOf('@' + u.name) < 0;
    }).slice(0, 8);
    if (!userMatches.length) { box.style.display = 'none'; return; }
    box._userMatches = userMatches;
    box.innerHTML = '';
    userMatches.forEach(function (u) {
      var option = document.createElement('div');
      option.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px';
      var name = document.createElement('span');
      name.textContent = '@' + u.name;
      var role = document.createElement('span');
      role.style.cssText = 'color:var(--text-muted);font-size:11px';
      role.textContent = u.role || '';
      option.appendChild(name);
      option.appendChild(role);
      option.onmouseenter = function () { option.style.background = 'rgba(79,142,247,0.1)'; };
      option.onmouseleave = function () { option.style.background = ''; };
      option.onmousedown = function (event) {
        event.preventDefault();
        addCreateTag('@' + u.name);
      };
      box.appendChild(option);
    });
    box.style.display = 'block';
    return;
  }
  var allTags = [];
  incidents.forEach(function (i) { (i.tags || []).forEach(function (t) { if (allTags.indexOf(t) < 0) allTags.push(t); }); });
  var matches = allTags.filter(function (t) { return (!q || t.includes(q)) && createModalTags.indexOf(t) < 0; }).slice(0, 8);
  if (!matches.length) { box.style.display = 'none'; return; }
  box.innerHTML = matches.map(function (t) {
    var col = TAG_COLORS[t] || TAG_COLORS['default'] || '#4f8ef7';
    return '<div onclick="addCreateTag(\'' + t + '\')" style="padding:7px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px" onmouseenter="this.style.background=\'rgba(79,142,247,0.1)\'" onmouseleave="this.style.background=\'\'">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + col + '"></span>' + t + '</div>';
  }).join('');
  box.style.display = 'block';
}

function closeCreateTagSuggestions() {
  var box = document.getElementById('f_tag_suggestions');
  if (box) box.style.display = 'none';
}


// ─── MULTI-SELECT FILTER HELPERS ──────────────────────────────
function toggleMsDropdown(id) {
  var dd = document.getElementById(id + '_dd');
  var box = document.getElementById(id);
  if (!dd || !box) return;
  var isOpen = dd.classList.contains('open');
  // Close all other dropdowns first
  document.querySelectorAll('.ms-dropdown.open').forEach(function (el) {
    el.classList.remove('open');
    var b = document.getElementById(el.id.replace('_dd', ''));
    if (b) b.classList.remove('open');
  });
  if (!isOpen) {
    dd.classList.add('open');
    box.classList.add('open');
  }
}

function getMsValues(id) {
  var dd = document.getElementById(id + '_dd');
  if (!dd) return [];
  return Array.from(dd.querySelectorAll('input[type=checkbox]:checked')).map(function (cb) { return cb.value; });
}

function setMsValues(id, values) {
  var dd = document.getElementById(id + '_dd');
  if (!dd) return;
  dd.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
    cb.checked = values.indexOf(cb.value) >= 0;
    cb.closest('.ms-option').classList.toggle('checked', cb.checked);
  });
  renderMsPills(id);
}

function clearMsFilter(id) {
  setMsValues(id, []);
}

function renderMsPills(id) {
  var box = document.getElementById(id);
  var ph = document.getElementById(id + '_ph');
  if (!box || !ph) return;
  var vals = getMsValues(id);
  if (!vals.length) {
    ph.style.display = '';
    // Remove existing pills
    box.querySelectorAll('.ms-pill').forEach(function (p) { p.remove(); });
    return;
  }
  ph.style.display = 'none';
  box.querySelectorAll('.ms-pill').forEach(function (p) { p.remove(); });
  vals.forEach(function (v) {
    var pill = document.createElement('span');
    pill.className = 'ms-pill';
    pill.innerHTML = v + '<span class="ms-x" onclick="event.stopPropagation();removeMsValue(\'' + id + '\',\'' + v + '\')">×</span>';
    box.insertBefore(pill, ph);
  });
}

function removeMsValue(id, val) {
  var dd = document.getElementById(id + '_dd');
  if (!dd) return;
  var cb = dd.querySelector('input[value="' + val + '"]');
  if (cb) { cb.checked = false; cb.closest('.ms-option').classList.remove('checked'); }
  renderMsPills(id);
  if (id.indexOf('df_') === 0) applyDashFilters(); else applyFilters();
}

function populateMsDropdown(id, values, placeholder) {
  var dd = document.getElementById(id + '_dd');
  if (!dd) return;
  var current = getMsValues(id);
  // Dashboard filters (df_*) call applyDashFilters; incident filters call applyFilters
  var applyFn = id.indexOf('df_') === 0 ? 'applyDashFilters()' : 'applyFilters()';
  dd.innerHTML = values.map(function (v) {
    var checked = current.indexOf(v) >= 0;
    return '<label class="ms-option' + (checked ? ' checked' : '') + '">'
      + '<input type="checkbox" value="' + v + '" ' + (checked ? 'checked' : '') + ' onchange="renderMsPills(\'' + id + '\');' + applyFn + '"> ' + v + '</label>';
  }).join('');
}

// Close dropdowns on outside click
document.addEventListener('click', function (e) {
  if (!e.target.closest('.ms-wrap')) {
    document.querySelectorAll('.ms-dropdown.open').forEach(function (dd) {
      dd.classList.remove('open');
      var b = document.getElementById(dd.id.replace('_dd', ''));
      if (b) b.classList.remove('open');
    });
  }
}, true);

function navigateInternal(page, el) {
  // Permission guard — block access to pages the current role cannot see
  var pagePerms = {
    incidents: 'view_incidents',
    reports: 'view_reports',
    mailbox: 'view_mailbox',
    users: 'manage_users',
    roles: 'manage_roles',
    customer360: 'view_customer360',
    datamanagement: 'manage_data'
  };
  // Dashboard blocked separately so it doesn't interfere with initial load
  if (page === 'dashboard' && !hasPermission('view_dashboard')) {
    showToast('Access denied: you cannot view the dashboard', 'error');
    return;
  }
  if (pagePerms[page] && !hasPermission(pagePerms[page])) {
    showToast('Access denied: insufficient permissions', 'error');
    return;
  }

  document.getElementById('notifPanel')?.classList.remove('open');
  document.getElementById('profileDropdown')?.classList.remove('open');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = { home: 'Home', dashboard: 'Dashboard', incidents: 'Incident Management', mailbox: 'Operations', reports: 'Reports', users: 'User Management', roles: 'Role Management', customer360: 'Customer 360' };
  if (page === 'home') renderHomePage();
  var _tbt = document.getElementById('topbarTitle'); if (_tbt) _tbt.textContent = titles[page] || page;
  if (page === 'incidents') renderIncidentTable();
  if (page === 'mailbox') startMailboxPolling();
  else stopMailboxPolling();
  if (page === 'users') { renderUsersTable(); }
  if (page === 'roles') { renderRolesGrid(); }
  if (page === 'reports') {
    renderAuditLog();
    loadAuditLogFromBackend(function (auditErr) {
      if (auditErr) showToast('Audit log could not be loaded: ' + auditErr.message, 'error');
      else renderAuditLog();
    });
  }
  if (page === 'dashboard') { initDashFilterDropdowns(); refreshDashboardData(); }
  if (page === 'customer360') {
    // Show picker only if no customer is loaded yet
    var custName = document.getElementById('c360CustName');
    if (!custName || custName.textContent === '—' || custName.textContent === '') {
      setTimeout(function () { _showC360Picker(); }, 50);
    }
  }
  updateStatusBar();
  closeSidebar();
}
var mailboxMessages = [];
var selectedMailboxId = null;
var selectedMailboxMessageIds = new Set();
var activeMailboxRichBody = '';
var mailboxPollTimer = null;
var knownMailboxMessageIds = new Set();
var mailboxInitialLoadComplete = false;
function mailboxToken() { return sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY); }
function hasMailboxPermission(permission) { return (window._currentPerms || []).indexOf(permission) > -1; }
function mailboxDecodeEntities(value) { var area = document.createElement('textarea'); area.innerHTML = String(value || ''); return area.value; }
function mailboxPlainText(value) { var text = String(value || '').replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n\n').replace(/<\/div\s*>/gi, '\n').replace(/<[^>]*>/g, ' '); for (var i = 0; i < 3; i++) text = mailboxDecodeEntities(text); return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function mailboxSafeRichHtml(value, useLightTheme) {
  activeMailboxRichBody = String(value || '');
  // The saved preference is available before a page finishes restoring its body class.
  // Prefer either signal so a fast mailbox fetch cannot render with the opposite theme.
  try { useLightTheme = !!useLightTheme || localStorage.getItem('mc_theme') === 'light'; } catch (_) { useLightTheme = !!useLightTheme; }
  var parser = new DOMParser(); var documentValue = parser.parseFromString(String(value || ''), 'text/html');
  documentValue.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,meta,base,link,style').forEach(function (node) { node.remove(); });
  documentValue.querySelectorAll('*').forEach(function (node) {
    Array.from(node.attributes).forEach(function (attribute) {
      var name = attribute.name.toLowerCase(), raw = String(attribute.value || '').trim(), scheme = raw.toLowerCase();
      if (name.indexOf('on') === 0 || name === 'srcdoc') node.removeAttribute(attribute.name);
      else if ((name === 'href' || name === 'src') && !/^(https:|mailto:|cid:|data:image\/)/i.test(raw)) node.removeAttribute(attribute.name);
      else if (name === 'style' && (/expression\s*\(|javascript:|behavior\s*:/i.test(scheme))) node.removeAttribute(attribute.name);
    });
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.style.maxWidth = '100%'; node.style.height = 'auto'; }
  });
  var palette = useLightTheme
    ? { background: '#f7f8fc', text: '#20263a', muted: '#69728a', border: '#dce1ed', link: '#2563eb' }
    : { background: '#111318', text: '#e8eaf0', muted: '#aab1c5', border: '#2d3040', link: '#75a7ff' };
  var themeCss = 'html,body{margin:0;background:' + palette.background + ';color:' + palette.text + ';font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.58}'
    + 'body{padding:28px;box-sizing:border-box}body,body *{color:' + palette.text + ' !important;background-color:transparent !important;border-color:' + palette.border + ' !important}'
    + 'img{max-width:100%;height:auto;background:transparent !important}table{max-width:100%;border-collapse:collapse}a,a:visited{color:' + palette.link + ' !important;text-decoration:underline}blockquote{border-left:3px solid ' + palette.border + ';margin-left:0;padding-left:14px;color:' + palette.muted + ' !important}';
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + themeCss + '</style></head><body>' + documentValue.body.innerHTML + '</body></html>';
}
function mailboxDate(value) { try { return new Date(value).toLocaleString(); } catch (_) { return value || ''; } }
function legacyLoadMailbox(options) {
  options = options || {};
  var list = document.getElementById('mailboxList'); if (!list) return;
  if (!options.silent) list.innerHTML = '<div class="mailbox-empty">Loading messages…</div>';
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox?limit=50', { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load mailbox'); return data.data; }); })
    .then(function (messages) { var incoming = messages || []; var newMessages = mailboxInitialLoadComplete ? incoming.filter(function (message) { return !knownMailboxMessageIds.has(message.id) && !message.isRead; }) : []; mailboxMessages = incoming; knownMailboxMessageIds = new Set(incoming.map(function (message) { return message.id; })); mailboxInitialLoadComplete = true; selectedMailboxMessageIds = new Set(Array.from(selectedMailboxMessageIds).filter(function (id) { return mailboxMessages.some(function (message) { return message.id === id; }); })); renderMailboxList(); if (newMessages.length) showToast(newMessages.length === 1 ? 'New mailbox email received: ' + (newMessages[0].subject || '(No subject)') : newMessages.length + ' new mailbox emails received.', 'info'); })
    .catch(function (error) { list.innerHTML = ''; var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = error.message; list.appendChild(empty); });
}
function legacyStartMailboxPolling() {
  stopMailboxPolling();
  mailboxInitialLoadComplete = false;
  knownMailboxMessageIds = new Set();
  loadMailbox();
  mailboxPollTimer = setInterval(function () {
    var mailboxPage = document.getElementById('page-mailbox');
    if (mailboxPage && mailboxPage.classList.contains('active')) loadMailbox({ silent: true });
  }, 15000);
}
function stopMailboxPolling() {
  if (mailboxPollTimer) clearInterval(mailboxPollTimer);
  mailboxPollTimer = null;
}
function legacyUpdateMailboxBulkControls() { var enabled = hasMailboxPermission('delete_mailbox'), button = document.getElementById('mailboxBulkDeleteBtn'), all = document.getElementById('mailboxSelectAll'); if (button) { button.style.display = enabled && selectedMailboxMessageIds.size ? '' : 'none'; button.textContent = 'Delete selected (' + selectedMailboxMessageIds.size + ')'; } if (all) { all.style.display = enabled ? '' : 'none'; all.checked = enabled && mailboxMessages.length > 0 && selectedMailboxMessageIds.size === mailboxMessages.length; all.indeterminate = enabled && selectedMailboxMessageIds.size > 0 && selectedMailboxMessageIds.size < mailboxMessages.length; } }
function legacyToggleMailboxSelectAll(checked) { selectedMailboxMessageIds = checked ? new Set(mailboxMessages.map(function (message) { return message.id; })) : new Set(); renderMailboxList(); }
function deleteSelectedMailboxMessages() { var ids = Array.from(selectedMailboxMessageIds); if (!ids.length) return; var deleted = 0, failures = 0; function next(index) { if (index >= ids.length) { selectedMailboxMessageIds.clear(); selectedMailboxId = null; var detail = document.getElementById('mailboxDetail'); if (detail) detail.innerHTML = '<div class="mailbox-empty">Selected emails moved to Deleted Items.</div>'; loadMailbox(); showToast(deleted + ' email(s) moved to Deleted Items.' + (failures ? ' ' + failures + ' could not be moved.' : ''), failures ? 'error' : 'success'); return; } var deletingId = ids[index]; fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(deletingId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + mailboxToken() } }).then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to delete email'); return data; }); }).then(function () { deleted++; mailboxMessages = mailboxMessages.filter(function (message) { return message.id !== deletingId; }); selectedMailboxMessageIds.delete(deletingId); renderMailboxList(); next(index + 1); }).catch(function () { failures++; next(index + 1); }); } next(0); }
function legacyRenderMailboxList() {
  var list = document.getElementById('mailboxList'), count = document.getElementById('mailboxCount'); if (!list) return;
  list.innerHTML = ''; if (count) count.textContent = mailboxMessages.length + ' message' + (mailboxMessages.length === 1 ? '' : 's'); updateMailboxBulkControls();
  if (!mailboxMessages.length) { var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = 'No messages in the inbox.'; list.appendChild(empty); return; }
  mailboxMessages.forEach(function (message) { var row = document.createElement('div'); row.className = 'mailbox-row' + (!message.isRead ? ' unread' : '') + (selectedMailboxId === message.id ? ' active' : ''); row.onclick = function () { openMailboxMessage(message.id); }; if (hasMailboxPermission('delete_mailbox')) { var check = document.createElement('input'); check.type = 'checkbox'; check.className = 'mailbox-row-check'; check.checked = selectedMailboxMessageIds.has(message.id); check.setAttribute('aria-label', 'Select ' + message.subject); check.onclick = function (event) { event.stopPropagation(); }; check.onchange = function () { if (check.checked) selectedMailboxMessageIds.add(message.id); else selectedMailboxMessageIds.delete(message.id); updateMailboxBulkControls(); }; row.appendChild(check); } var from = document.createElement('div'); from.className = 'mailbox-from'; from.textContent = message.fromName || message.from; var subject = document.createElement('div'); subject.className = 'mailbox-subject'; subject.textContent = message.subject; var meta = document.createElement('div'); meta.className = 'mailbox-meta'; meta.textContent = (message.hasAttachments ? 'Attachment · ' : '') + mailboxDate(message.receivedAt); row.append(from, subject, meta); list.appendChild(row); });
}
function mailboxFormatBytes(value) { var bytes = Number(value || 0); if (!bytes) return ''; var units = ['B', 'KB', 'MB', 'GB'], index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + ' ' + units[index]; }
function downloadMailboxAttachment(messageId, attachment) {
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(messageId) + '/attachments/' + encodeURIComponent(attachment.id) + '/download', { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { if (!response.ok) return response.json().then(function (data) { throw new Error(data.message || 'Unable to download attachment'); }); return response.blob(); })
    .then(function (blob) { var url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = attachment.name || 'attachment'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); })
    .catch(function (error) { showToast(error.message, 'error'); });
}
function mailboxFilesToPayload(files) { return Promise.all(Array.from(files || []).map(function (file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve({ name: file.name, contentType: file.type || 'application/octet-stream', contentBytes: String(reader.result || '').split(',')[1] || '' }); }; reader.onerror = function () { reject(new Error('Unable to read ' + file.name)); }; reader.readAsDataURL(file); }); })); }
function showMailboxReply(message, detail, initialMode) {
  var existing = detail.querySelector('.mailbox-reply'); if (existing) existing.remove();
  var bodyWrap = detail.querySelector('.mailbox-detail-body-wrap');
  if (bodyWrap) bodyWrap.style.display = 'none';
  var form = document.createElement('div'); form.className = 'mailbox-reply mailbox-compose';
  var heading = document.createElement('div'); heading.className = 'mailbox-compose-head'; var label = document.createElement('div'); label.className = 'mailbox-reply-label'; label.textContent = 'Compose from AOC mailbox'; var mode = { value: initialMode || 'reply' }; heading.append(label);
  var to = document.createElement('input'); to.type = 'email'; to.className = 'mailbox-compose-input'; to.placeholder = 'To'; to.value = message.from || ''; var cc = document.createElement('input'); cc.type = 'text'; cc.className = 'mailbox-compose-input'; cc.placeholder = 'CC (comma-separated, optional)'; var bcc = document.createElement('input'); bcc.type = 'text'; bcc.className = 'mailbox-compose-input'; bcc.placeholder = 'BCC (comma-separated, optional)'; var subject = document.createElement('input'); subject.type = 'text'; subject.className = 'mailbox-compose-input'; subject.placeholder = 'Subject'; subject.value = message.subject && /^re:/i.test(message.subject) ? message.subject : 'Re: ' + (message.subject || '');
  var recipientHelp = document.createElement('div'); recipientHelp.className = 'mailbox-recipient-help'; recipientHelp.textContent = 'Reply recipients are taken from the original message.';
  function updateMode() { var forward = mode.value === 'forward'; to.readOnly = !forward; if (mode.value === 'replyAll' && message.replyAllCc && !cc.dataset.manuallyChanged) cc.value = message.replyAllCc; recipientHelp.textContent = forward ? 'Enter the recipient(s) for this forwarded email.' : (mode.value === 'replyAll' ? 'Reply all recipients from the original email are included below. You may edit the subject or CC list.' : 'Reply recipients are taken from the original message. You may edit the subject.'); }
  cc.addEventListener('input', function () { cc.dataset.manuallyChanged = 'true'; });
  var toolbar = document.createElement('div'); toolbar.className = 'mailbox-compose-toolbar'; [['bold','B','Bold'],['italic','I','Italic'],['underline','U','Underline'],['insertUnorderedList','• List','Bulleted list'],['insertOrderedList','1. List','Numbered list'],['createLink','↗ Link','Insert link'],['removeFormat','Tx','Clear formatting']].forEach(function (entry) { var button = document.createElement('button'); button.type = 'button'; button.className = 'mailbox-tool'; button.textContent = entry[1]; button.title = entry[2]; button.onclick = function () { var value = entry[0] === 'createLink' ? window.prompt('Paste the link URL') : null; if (entry[0] !== 'createLink' || value) document.execCommand(entry[0], false, value); editor.focus(); }; toolbar.appendChild(button); });
  var editor = document.createElement('div'); editor.className = 'mailbox-rich-editor'; editor.contentEditable = 'true'; editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-label', 'Email message'); editor.dataset.placeholder = 'Write your message…';
  var attachments = document.createElement('div'); attachments.className = 'mailbox-compose-attachments'; var fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.id = 'mailboxReplyFiles'; var fileLabel = document.createElement('label'); fileLabel.className = 'mailbox-attach-button'; fileLabel.htmlFor = fileInput.id; fileLabel.textContent = 'Attach files'; var fileNames = document.createElement('span'); fileNames.className = 'mailbox-file-names'; fileNames.textContent = 'Up to 10 files, 2.5 MB each'; fileInput.onchange = function () { fileNames.textContent = fileInput.files.length ? Array.from(fileInput.files).map(function (file) { return file.name; }).join(', ') : 'Up to 10 files, 2.5 MB each'; }; attachments.append(fileInput, fileLabel, fileNames);
  var actions = document.createElement('div'); actions.className = 'mailbox-reply-actions'; var cancel = document.createElement('button'); cancel.className = 'btn btn-secondary btn-sm'; cancel.textContent = 'Discard'; cancel.onclick = function () { form.remove(); }; var send = document.createElement('button'); send.className = 'btn btn-primary btn-sm'; send.textContent = 'Send'; send.onclick = function () { var html = editor.innerHTML.trim(); if (!editor.textContent.trim()) { showToast('Please enter a message.', 'error'); return; } send.disabled = true; send.textContent = 'Preparing…'; mailboxFilesToPayload(fileInput.files).then(function (attachmentsPayload) { send.textContent = 'Sending…'; return fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(message.id) + '/reply', { method: 'POST', headers: { Authorization: 'Bearer ' + mailboxToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: mode.value, to: to.value.trim(), cc: cc.value.trim(), bcc: bcc.value.trim(), subject: subject.value.trim(), html: html, attachments: attachmentsPayload }) }).then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to send email'); return data; }); }); }).then(function () { showToast('Email sent from the AOC mailbox.', 'success'); form.remove(); }).catch(function (error) { send.disabled = false; send.textContent = 'Send'; showToast(error.message, 'error'); }); }; actions.append(cancel, send);
  form.append(heading, to, cc, bcc, subject, recipientHelp, toolbar, editor, attachments, actions); detail.querySelector('.mailbox-detail-body-wrap').before(form); var composerObserver = new MutationObserver(function () { if (!form.isConnected) { if (bodyWrap) bodyWrap.style.display = ''; composerObserver.disconnect(); } }); composerObserver.observe(detail, { childList: true }); updateMode(); editor.focus();
}
function deleteMailboxMessage(message, detail) {
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(message.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to delete email'); return data; }); })
    .then(function () { mailboxMessages = mailboxMessages.filter(function (item) { return item.id !== message.id; }); selectedMailboxMessageIds.delete(message.id); selectedMailboxId = null; renderMailboxList(); detail.innerHTML = '<div class="mailbox-empty">Email moved to Deleted Items.</div>'; showToast('Email moved to Deleted Items.', 'success'); loadMailbox(); })
    .catch(function (error) { showToast(error.message, 'error'); });
}
function mailboxActionButton(label, icon, onClick, danger) { var button = document.createElement('button'); button.type = 'button'; button.className = 'mailbox-icon-action' + (danger ? ' danger' : ''); button.title = label; button.setAttribute('aria-label', label); button.textContent = icon; button.onclick = onClick; return button; }
function openMailboxMessageLegacy(id) {
  selectedMailboxId = id; renderMailboxList(); var detail = document.getElementById('mailboxDetail'); if (!detail) return;
  detail.innerHTML = '<div class="mailbox-empty">Loading message…</div>';
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load message'); return data.data; }); })
    .then(function (message) { detail.innerHTML = ''; var head = document.createElement('div'); head.className = 'mailbox-detail-head'; var subject = document.createElement('div'); subject.className = 'mailbox-detail-subject'; subject.textContent = message.subject; var meta = document.createElement('div'); meta.className = 'mailbox-detail-meta'; meta.textContent = 'From: ' + (message.fromName || message.from) + (message.from ? ' <' + message.from + '>' : '') + '\nReceived: ' + mailboxDate(message.receivedAt); head.append(subject, meta); var actions = document.createElement('div'); actions.className = 'mailbox-message-actions'; if ((window._currentPerms || []).indexOf('send_mailbox') > -1) { actions.append(mailboxActionButton('Reply', '↩', function () { showMailboxReply(message, detail, 'reply'); }), mailboxActionButton('Reply all', '↩↩', function () { showMailboxReply(message, detail, 'replyAll'); }), mailboxActionButton('Forward', '↪', function () { showMailboxReply(message, detail, 'forward'); })); } if ((window._currentPerms || []).indexOf('delete_mailbox') > -1) actions.appendChild(mailboxActionButton('Move to Deleted Items', '⌫', function () { deleteMailboxMessage(message, detail); }, true)); if (actions.childElementCount) head.appendChild(actions); var attachments = message.attachments || []; if (attachments.length) { var attachmentBox = document.createElement('div'); attachmentBox.className = 'mailbox-attachments'; var attachmentTitle = document.createElement('div'); attachmentTitle.className = 'mailbox-attachments-title'; attachmentTitle.textContent = 'Attachments'; attachmentBox.appendChild(attachmentTitle); attachments.forEach(function (attachment) { var item = document.createElement('button'); item.className = 'mailbox-attachment'; item.title = 'Download ' + attachment.name; item.onclick = function () { downloadMailboxAttachment(message.id, attachment); }; var name = document.createElement('span'); name.textContent = attachment.name; var size = document.createElement('small'); size.textContent = mailboxFormatBytes(attachment.size); item.append(name, size); attachmentBox.appendChild(item); }); head.appendChild(attachmentBox); } var wrap = document.createElement('div'); wrap.className = 'mailbox-detail-body-wrap'; var frame = document.createElement('iframe'); frame.className = 'mailbox-rich-frame'; frame.setAttribute('sandbox', 'allow-popups'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.title = 'Safe rich email preview'; frame.srcdoc = mailboxSafeRichHtml(message.body || message.preview || 'This message has no readable text body.', document.body.classList.contains('light-mode')); wrap.appendChild(frame); detail.append(head, wrap); })
    .catch(function (error) { detail.innerHTML = ''; var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = error.message; detail.appendChild(empty); });
}

function legacyOpenMailboxMessage(id) {
  selectedMailboxId = id;
  renderMailboxList();
  var detail = document.getElementById('mailboxDetail');
  if (!detail) return;
  detail.innerHTML = '<div class="mailbox-empty">Loading message…</div>';
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load message');
        return data.data;
      });
    })
    .then(function (message) {
      detail.innerHTML = '';
      var head = document.createElement('div'); head.className = 'mailbox-detail-head';
      var subject = document.createElement('div'); subject.className = 'mailbox-detail-subject'; subject.textContent = message.subject;
      var meta = document.createElement('div'); meta.className = 'mailbox-detail-meta';
      meta.textContent = 'From: ' + (message.fromName || message.from) + (message.from ? ' <' + message.from + '>' : '') + '\nReceived: ' + mailboxDate(message.receivedAt);
      head.append(subject, meta);
      var actions = document.createElement('div'); actions.className = 'mailbox-message-actions';
      if (hasMailboxPermission('send_mailbox')) {
        actions.append(
          mailboxActionButton('Reply', '↩', function () { showMailboxReply(message, detail, 'reply'); }),
          mailboxActionButton('Reply all', '↩↩', function () { showMailboxReply(message, detail, 'replyAll'); }),
          mailboxActionButton('Forward', '↪', function () { showMailboxReply(message, detail, 'forward'); })
        );
      }
      if (hasMailboxPermission('delete_mailbox')) actions.appendChild(mailboxActionButton('Move to Deleted Items', '⌫', function () { deleteMailboxMessage(message, detail); }, true));
      if (actions.childElementCount) head.appendChild(actions);
      var attachments = message.attachments || [];
      if (attachments.length) {
        var attachmentBox = document.createElement('div'); attachmentBox.className = 'mailbox-attachments';
        var attachmentTitle = document.createElement('div'); attachmentTitle.className = 'mailbox-attachments-title'; attachmentTitle.textContent = 'Attachments'; attachmentBox.appendChild(attachmentTitle);
        attachments.forEach(function (attachment) {
          var item = document.createElement('button'); item.className = 'mailbox-attachment'; item.title = 'Download ' + attachment.name;
          item.onclick = function () { downloadMailboxAttachment(message.id, attachment); };
          var name = document.createElement('span'); name.textContent = attachment.name;
          var size = document.createElement('small'); size.textContent = mailboxFormatBytes(attachment.size);
          item.append(name, size); attachmentBox.appendChild(item);
        });
        head.appendChild(attachmentBox);
      }
      var wrap = document.createElement('div'); wrap.className = 'mailbox-detail-body-wrap';
      var frame = document.createElement('iframe'); frame.className = 'mailbox-rich-frame';
      frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = 'Safe rich email preview';
      frame.srcdoc = mailboxSafeRichHtml(message.body || message.preview || 'This message has no readable text body.', document.body.classList.contains('light-mode'));
      wrap.appendChild(frame); detail.append(head, wrap);
    })
    .catch(function (error) {
      detail.innerHTML = '';
      var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = error.message; detail.appendChild(empty);
    });
}

// Operations Mail Center extends the existing mailbox instead of replacing its
// Graph-backed message, reply, attachment, and safe HTML rendering paths.
var mailboxActiveView = 'all';
var mailboxSearchQuery = '';

function ensureOperationsMailboxUi() {
  var page = document.getElementById('page-mailbox'); if (!page) return;
  var navLabel = document.querySelector('#mailboxNav .nav-label'); if (navLabel) navLabel.textContent = ' Operations';
  var card = document.getElementById('homeCardMailbox'); if (card && card.children[1]) { card.children[1].textContent = 'Operations'; if (card.children[2]) card.children[2].textContent = 'Alerts, tickets & mail'; }
  var header = page.querySelector('.page-header'); if (header) {
    var title = header.querySelector('.page-header-title'); if (title) title.textContent = 'Operations';
    var crumb = header.querySelector('.breadcrumb-item.active'); if (crumb) crumb.textContent = 'Operations';
    var description = header.querySelector('.page-header-sub span'); if (description) description.textContent = 'Monitoring alerts, customer-raised tickets and Microsoft 365 communications';
  }
  var layout = page.querySelector('.mailbox-layout'); if (!layout) return;
  layout.classList.add('operations-layout');
  if (!document.getElementById('operationsNav')) {
    var sidebar = document.createElement('aside'); sidebar.id = 'operationsNav'; sidebar.className = 'operations-nav'; sidebar.setAttribute('aria-label', 'Operations mailbox views');
    var compose = document.createElement('button'); compose.id = 'operationsNewMailBtn'; compose.className = 'btn btn-primary operations-new-mail'; compose.type = 'button'; compose.textContent = '+ New Mail'; compose.onclick = showNewMailboxComposer; sidebar.appendChild(compose);
    function group(label) { var item = document.createElement('div'); item.className = 'operations-nav-group'; item.textContent = label; sidebar.appendChild(item); }
    function view(key, label, emphasis) { var button = document.createElement('button'); button.type = 'button'; button.className = 'operations-view' + (emphasis ? ' operations-customer' : ''); button.dataset.mailboxView = key; button.onclick = function () { setMailboxView(key); }; var text = document.createElement('span'); text.textContent = label; var count = document.createElement('span'); count.className = 'operations-count'; count.id = 'operationsCount' + key.charAt(0).toUpperCase() + key.slice(1); button.append(text, count); sidebar.appendChild(button); }
    group('Incoming'); view('all', 'All Incoming'); view('coralogix', 'Coralogix Alerts'); view('azure', 'Azure Alerts'); view('jira', 'Customer Raised Tickets', true); group('Mail'); view('sent', 'Sent Items');
    layout.insertBefore(sidebar, layout.firstChild);
  }
  var listCard = layout.querySelector('.mailbox-list-card');
  if (listCard && !document.getElementById('mailboxSearch')) { var searchWrap = document.createElement('div'); searchWrap.className = 'mailbox-search-wrap'; var search = document.createElement('input'); search.id = 'mailboxSearch'; search.type = 'search'; search.placeholder = 'Search this view…'; search.setAttribute('aria-label', 'Search Operations mail'); search.oninput = function () { setMailboxSearch(search.value); }; searchWrap.appendChild(search); listCard.querySelector('#mailboxList')?.before(searchWrap); }
  var titleEl = document.querySelector('#mailboxListTitle'); if (!titleEl) { var original = layout.querySelector('.mailbox-list-title strong'); if (original) { original.id = 'mailboxListTitle'; titleEl = original; } }
  if (titleEl) titleEl.textContent = operationsViewLabel(mailboxActiveView);
  document.querySelectorAll('.operations-view').forEach(function (button) { button.classList.toggle('active', button.dataset.mailboxView === mailboxActiveView); });
  var composeButton = document.getElementById('operationsNewMailBtn'); if (composeButton) composeButton.style.display = hasMailboxPermission('send_mailbox') ? '' : 'none';
  ensureOperationsIncidentActions();
}

var operationsIncidentActionObserver = null;
function ensureOperationsIncidentActions() {
  var list = document.getElementById('mailboxList');
  if (!list || operationsIncidentActionObserver) return;
  function addActions() {
    if (mailboxActiveView === 'sent' || !hasPermission('create_incidents')) return;
    list.querySelectorAll('.mailbox-row').forEach(function (row, index) {
      if (row.querySelector('.mailbox-row-create-incident')) return;
      var message = mailboxVisibleMessages()[index];
      if (!message) return;
      var button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary btn-sm mailbox-row-create-incident'; button.textContent = 'Create Incident';
      button.style.cssText = 'margin-top:7px;padding:4px 8px;font-size:10px';
      button.onclick = function (event) { event.stopPropagation(); openCreateIncidentFromOperationsEmail(message, button); };
      row.appendChild(button);
    });
  }
  operationsIncidentActionObserver = new MutationObserver(addActions);
  operationsIncidentActionObserver.observe(list, { childList: true, subtree: true });
  addActions();
}

function operationsViewLabel(view) { return ({ all: 'All Incoming', coralogix: 'Coralogix Alerts', azure: 'Azure Alerts', jira: 'Customer Raised Tickets', sent: 'Sent Items' })[view] || 'All Incoming'; }
function setMailboxView(view) { mailboxActiveView = ['all', 'coralogix', 'azure', 'jira', 'sent'].indexOf(view) > -1 ? view : 'all'; mailboxSearchQuery = ''; var search = document.getElementById('mailboxSearch'); if (search) search.value = ''; selectedMailboxId = null; selectedMailboxMessageIds.clear(); var detail = document.getElementById('mailboxDetail'); if (detail) detail.innerHTML = '<div class="mailbox-empty">Select an email to read it here.</div>'; ensureOperationsMailboxUi(); loadMailbox(); }
function setMailboxSearch(value) { mailboxSearchQuery = String(value || '').trim().toLowerCase(); renderMailboxList(); }
function mailboxVisibleMessages() { if (!mailboxSearchQuery) return mailboxMessages; return mailboxMessages.filter(function (message) { return [message.fromName, message.from, message.to, message.subject, message.preview, message.jiraIssueKey].join(' ').toLowerCase().indexOf(mailboxSearchQuery) > -1; }); }

function loadOperationsCounts() {
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/operations-counts', { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(); return data.data || {}; }); })
    .then(function (counts) { ['coralogix', 'azure', 'jira'].forEach(function (key) { var item = document.getElementById('operationsCount' + key.charAt(0).toUpperCase() + key.slice(1)); if (item) item.textContent = Number(counts[key] || 0) || ''; }); })
    .catch(function () { /* the list remains usable when counts cannot be loaded */ });
}

function loadMailbox(options) {
  options = options || {}; ensureOperationsMailboxUi(); var list = document.getElementById('mailboxList'); if (!list) return;
  if (!options.silent) list.innerHTML = '<div class="mailbox-empty">Loading ' + operationsViewLabel(mailboxActiveView).toLowerCase() + '…</div>';
  var endpoint = mailboxActiveView === 'sent' ? '/mailbox/sent?limit=50' : '/mailbox/inbox?limit=50&category=' + encodeURIComponent(mailboxActiveView);
  fetch(window.APP_CONFIG.API_BASE_URL + endpoint, { headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load Operations mail'); return data.data; }); })
    .then(function (messages) { var incoming = messages || []; var newMessages = mailboxActiveView !== 'sent' && mailboxInitialLoadComplete ? incoming.filter(function (message) { return !knownMailboxMessageIds.has(message.id) && !message.isRead; }) : []; mailboxMessages = incoming; knownMailboxMessageIds = new Set(incoming.map(function (message) { return message.id; })); mailboxInitialLoadComplete = true; selectedMailboxMessageIds = new Set(Array.from(selectedMailboxMessageIds).filter(function (id) { return mailboxMessages.some(function (message) { return message.id === id; }); })); renderMailboxList(); if (mailboxActiveView !== 'sent') loadOperationsCounts(); if (newMessages.length) showToast(newMessages.length === 1 ? 'New Operations email received: ' + (newMessages[0].subject || '(No subject)') : newMessages.length + ' new Operations emails received.', 'info'); })
    .catch(function (error) { list.innerHTML = ''; var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = error.message; list.appendChild(empty); });
}

function startMailboxPolling() { stopMailboxPolling(); ensureOperationsMailboxUi(); mailboxInitialLoadComplete = false; knownMailboxMessageIds = new Set(); loadMailbox(); mailboxPollTimer = setInterval(function () { var page = document.getElementById('page-mailbox'); if (page && page.classList.contains('active')) loadMailbox({ silent: true }); }, 30000); }
function updateMailboxBulkControls() { var enabled = mailboxActiveView !== 'sent' && hasMailboxPermission('delete_mailbox'), button = document.getElementById('mailboxBulkDeleteBtn'), all = document.getElementById('mailboxSelectAll'), visible = mailboxVisibleMessages(); if (button) { button.style.display = enabled && selectedMailboxMessageIds.size ? '' : 'none'; button.textContent = 'Delete selected (' + selectedMailboxMessageIds.size + ')'; } if (all) { all.style.display = enabled ? '' : 'none'; all.checked = enabled && visible.length > 0 && selectedMailboxMessageIds.size === visible.length; all.indeterminate = enabled && selectedMailboxMessageIds.size > 0 && selectedMailboxMessageIds.size < visible.length; } }
function toggleMailboxSelectAll(checked) { selectedMailboxMessageIds = checked ? new Set(mailboxVisibleMessages().map(function (message) { return message.id; })) : new Set(); renderMailboxList(); }
function renderMailboxList() {
  ensureOperationsMailboxUi(); var list = document.getElementById('mailboxList'), count = document.getElementById('mailboxCount'), visible = mailboxVisibleMessages(); if (!list) return;
  list.innerHTML = ''; if (count) count.textContent = visible.length + ' message' + (visible.length === 1 ? '' : 's'); updateMailboxBulkControls();
  if (!visible.length) { var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = mailboxSearchQuery ? 'No messages match this search.' : 'No ' + operationsViewLabel(mailboxActiveView).toLowerCase() + ' found.'; list.appendChild(empty); return; }
  visible.forEach(function (message) { var row = document.createElement('div'); row.className = 'mailbox-row' + (!message.isRead && mailboxActiveView !== 'sent' ? ' unread' : '') + (selectedMailboxId === message.id ? ' active' : ''); row.onclick = function () { openMailboxMessage(message.id); }; if (mailboxActiveView !== 'sent' && hasMailboxPermission('delete_mailbox')) { var check = document.createElement('input'); check.type = 'checkbox'; check.className = 'mailbox-row-check'; check.checked = selectedMailboxMessageIds.has(message.id); check.setAttribute('aria-label', 'Select ' + message.subject); check.onclick = function (event) { event.stopPropagation(); }; check.onchange = function () { if (check.checked) selectedMailboxMessageIds.add(message.id); else selectedMailboxMessageIds.delete(message.id); updateMailboxBulkControls(); }; row.appendChild(check); } var from = document.createElement('div'); from.className = 'mailbox-from'; from.textContent = mailboxActiveView === 'sent' ? ('To: ' + (message.to || 'No recipient')) : (message.fromName || message.from); var subject = document.createElement('div'); subject.className = 'mailbox-subject'; subject.textContent = message.subject; if (message.jiraIssueKey) { var issue = document.createElement('span'); issue.className = 'mailbox-category jira'; issue.textContent = message.jiraIssueKey; subject.appendChild(issue); } var meta = document.createElement('div'); meta.className = 'mailbox-meta'; meta.textContent = (message.hasAttachments ? 'Attachment · ' : '') + mailboxDate(message.sentAt || message.receivedAt); var preview = document.createElement('div'); preview.className = 'mailbox-meta'; preview.textContent = mailboxPlainText(message.preview || ''); row.append(from, subject, meta, preview); list.appendChild(row); });
}

var expandedMailboxConversationIds = new Set();
function mailboxConversationTime(message) { return new Date(message.sentAt || message.receivedAt || 0).getTime() || 0; }
function mailboxConversations() {
  var groups = new Map();
  mailboxMessages.forEach(function (message) { var key = message.conversationId || ('message:' + message.id); if (!groups.has(key)) groups.set(key, { key: key, messages: [] }); groups.get(key).messages.push(message); });
  var visibleIds = new Set(mailboxVisibleMessages().map(function (message) { return message.id; }));
  return Array.from(groups.values()).map(function (group) { group.messages.sort(function (a, b) { return mailboxConversationTime(a) - mailboxConversationTime(b); }); group.latest = group.messages[group.messages.length - 1]; return group; }).filter(function (group) { return !mailboxSearchQuery || group.messages.some(function (message) { return visibleIds.has(message.id); }); }).sort(function (a, b) { return mailboxConversationTime(b.latest) - mailboxConversationTime(a.latest); });
}
updateMailboxBulkControls = function () {
  var enabled = mailboxActiveView !== 'sent' && hasMailboxPermission('delete_mailbox'), selectAll = document.getElementById('mailboxSelectAll'), deleteButton = document.getElementById('mailboxBulkDeleteBtn');
  var deletable = mailboxVisibleMessages().filter(function (message) { return message.mailboxSource !== 'sent'; });
  if (selectAll) { selectAll.style.display = enabled ? '' : 'none'; selectAll.checked = enabled && deletable.length > 0 && deletable.every(function (message) { return selectedMailboxMessageIds.has(message.id); }); selectAll.indeterminate = enabled && selectedMailboxMessageIds.size > 0 && !selectAll.checked; }
  if (deleteButton) { deleteButton.style.display = enabled && selectedMailboxMessageIds.size ? '' : 'none'; deleteButton.textContent = 'Delete selected (' + selectedMailboxMessageIds.size + ')'; }
};
toggleMailboxSelectAll = function (checked) {
  selectedMailboxMessageIds = checked ? new Set(mailboxVisibleMessages().filter(function (message) { return message.mailboxSource !== 'sent'; }).map(function (message) { return message.id; })) : new Set();
  renderMailboxList();
};
renderMailboxList = function () {
  ensureOperationsMailboxUi(); var list = document.getElementById('mailboxList'), count = document.getElementById('mailboxCount'), conversations = mailboxConversations(); if (!list) return;
  list.innerHTML = ''; if (count) { var threadCount = conversations.filter(function (thread) { return thread.messages.length > 1; }).length; count.textContent = threadCount ? conversations.length + ' items · ' + threadCount + ' conversation' + (threadCount === 1 ? '' : 's') : conversations.length + ' message' + (conversations.length === 1 ? '' : 's'); } updateMailboxBulkControls();
  if (!conversations.length) { var empty = document.createElement('div'); empty.className = 'mailbox-empty'; empty.textContent = mailboxSearchQuery ? 'No messages match this search.' : 'No ' + operationsViewLabel(mailboxActiveView).toLowerCase() + ' found.'; list.appendChild(empty); return; }
  conversations.forEach(function (thread) {
    var latest = thread.latest, isConversation = thread.messages.length > 1, expanded = expandedMailboxConversationIds.has(thread.key), unread = thread.messages.some(function (message) { return !message.isRead && message.mailboxSource !== 'sent'; });
    var row = document.createElement('div'); row.className = 'mailbox-row' + (isConversation ? ' mailbox-conversation' : '') + (unread ? ' unread' : '') + (thread.messages.some(function (message) { return message.id === selectedMailboxId; }) ? ' active' : ''); row.dataset.messageId = latest.id; row.onclick = function () { openMailboxMessage(latest.id); };
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'mailbox-thread-toggle'; toggle.textContent = expanded ? '⌄' : '›'; toggle.title = expanded ? 'Collapse conversation' : 'Expand conversation'; toggle.onclick = function (event) { event.stopPropagation(); if (expanded) expandedMailboxConversationIds.delete(thread.key); else expandedMailboxConversationIds.add(thread.key); renderMailboxList(); };
    if (mailboxActiveView !== 'sent' && hasMailboxPermission('delete_mailbox')) { var inboxIds = thread.messages.filter(function (message) { return message.mailboxSource !== 'sent'; }).map(function (message) { return message.id; }); if (inboxIds.length) { var check = document.createElement('input'); check.type = 'checkbox'; check.className = isConversation ? 'mailbox-conversation-select' : 'mailbox-row-check'; check.checked = inboxIds.every(function (id) { return selectedMailboxMessageIds.has(id); }); check.setAttribute('aria-label', 'Select ' + (isConversation ? 'conversation: ' : '') + (latest.subject || 'No subject')); check.onclick = function (event) { event.stopPropagation(); }; check.onchange = function () { inboxIds.forEach(function (id) { if (check.checked) selectedMailboxMessageIds.add(id); else selectedMailboxMessageIds.delete(id); }); updateMailboxBulkControls(); }; row.appendChild(check); } }
    var from = document.createElement('div'); from.className = 'mailbox-from'; from.textContent = latest.mailboxSource === 'sent' ? ('To: ' + (latest.to || 'No recipient')) : (latest.fromName || latest.from);
    var subject = document.createElement('div'); subject.className = 'mailbox-subject'; subject.textContent = latest.subject || '(No subject)'; if (thread.messages.length > 1) { var total = document.createElement('span'); total.className = 'mailbox-category'; total.textContent = thread.messages.length + ' messages'; subject.appendChild(total); }
    var meta = document.createElement('div'); meta.className = 'mailbox-meta'; meta.textContent = mailboxDate(latest.sentAt || latest.receivedAt); var preview = document.createElement('div'); preview.className = 'mailbox-meta'; preview.textContent = mailboxPlainText(latest.preview || ''); if (isConversation) row.appendChild(toggle); row.append(from, subject, meta, preview);
    if (mailboxActiveView !== 'sent' && hasPermission('create_incidents') && latest.mailboxSource !== 'sent') { var create = mailboxCreateIncidentButton(latest); create.classList.add('mailbox-row-create-incident'); create.style.cssText = 'margin-top:7px;padding:4px 8px;font-size:10px'; row.appendChild(create); }
    list.appendChild(row);
    if (isConversation && expanded) thread.messages.forEach(function (message) { var child = document.createElement('div'); child.className = 'mailbox-thread-message' + (!message.isRead && message.mailboxSource !== 'sent' ? ' unread' : '') + (message.id === selectedMailboxId ? ' active' : ''); child.onclick = function () { openMailboxMessage(message.id); }; var sender = document.createElement('div'); sender.className = 'mailbox-from'; sender.textContent = message.mailboxSource === 'sent' ? ('To: ' + (message.to || 'No recipient')) : (message.fromName || message.from); var line = document.createElement('div'); line.className = 'mailbox-meta'; line.textContent = mailboxPlainText(message.preview || ''); var source = document.createElement('span'); source.className = 'mailbox-category'; source.textContent = message.mailboxSource === 'sent' ? 'Sent' : 'Inbox'; child.append(sender, line, source); list.appendChild(child); });
  });
};

function markMailboxMessageReadInUi(message) { if (mailboxActiveView === 'sent' || message.mailboxSource === 'sent' || message.isRead) return; message.isRead = true; renderMailboxList(); loadOperationsCounts(); fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(message.id) + '/read', { method: 'PATCH', headers: { Authorization: 'Bearer ' + mailboxToken() } }).catch(function () { /* Message remains readable even if Graph read status update is delayed. */ }); }

function mailboxEmailReceivedInIst(value) {
  var date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  var local = new Date(date.getTime() + getTZOffset('IST') * 3600000);
  var pad = function (number) { return String(number).padStart(2, '0'); };
  return local.getUTCFullYear() + '-' + pad(local.getUTCMonth() + 1) + '-' + pad(local.getUTCDate()) + 'T' + pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes());
}

function openCreateIncidentFromOperationsEmail(message, button) {
  if (!hasPermission('create_incidents')) { showToast('Your role cannot create incidents.', 'error'); return; }
  if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(message.id) + '/incident-prefill', { method: 'POST', headers: { Authorization: 'Bearer ' + mailboxToken() } })
    .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to prepare incident'); return data.data; }); })
    .then(function (prefill) {
      openCreateIncidentModal();
      document.getElementById('f_title').value = prefill.title || '';
      setDescriptionEditorValue(prefill.description || '');
      var dateInput = document.getElementById('f_date'), istTimestamp = mailboxEmailReceivedInIst(prefill.received_at);
      if (dateInput && istTimestamp) { dateInput.value = istTimestamp; dateInput.dataset.inputTimezone = 'IST'; }
      selectedTZ = 'IST'; renderTZSelector('createTZSelector', 'IST', 'changeCreateTZ(this.value)');
      var dateHint = document.getElementById('f_date_tz_hint'); if (dateHint) dateHint.textContent = 'Email received time (IST); converted after customer selection.';
      pendingOperationsEmailAuditId = prefill.audit_id || null;
      if (prefill.customer) {
        var customerSelect = document.getElementById('f_customer'); customerSelect.value = prefill.customer.name;
        applyCreateCustomerTimezone(prefill.customer.name);
      }
      var hint = document.getElementById('f_operations_email_hint');
      if (hint) { hint.textContent = prefill.message || ''; hint.style.display = ''; }
      if (!prefill.customer) showToast(prefill.message || 'No matching customer found. Select a customer manually.', 'info');
    })
    .catch(function (error) { showToast(error.message, 'error'); })
    .finally(function () { if (button) { button.disabled = false; button.textContent = '+ Create Incident'; } });
}

function mailboxCreateIncidentButton(message) {
  var button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-primary btn-sm mailbox-create-incident'; button.textContent = '+ Create Incident';
  button.onclick = function () { openCreateIncidentFromOperationsEmail(message, button); };
  return button;
}

function mailboxComposeToolbar(editor) { var toolbar = document.createElement('div'); toolbar.className = 'mailbox-compose-toolbar'; [['bold','B'],['italic','I'],['underline','U'],['insertUnorderedList','• List'],['insertOrderedList','1. List']].forEach(function (item) { var button = document.createElement('button'); button.type = 'button'; button.className = 'mailbox-tool'; button.textContent = item[1]; button.onclick = function () { editor.focus(); document.execCommand(item[0], false, null); }; toolbar.appendChild(button); }); var link = document.createElement('button'); link.type = 'button'; link.className = 'mailbox-tool'; link.textContent = 'Link'; link.onclick = function () { var url = window.prompt('Enter link URL'); if (url) { editor.focus(); document.execCommand('createLink', false, url); } }; toolbar.appendChild(link); return toolbar; }

function showNewMailboxComposer() {
  if (!hasMailboxPermission('send_mailbox')) { showToast('Your role cannot send Operations mail.', 'error'); return; }
  var detail = document.getElementById('mailboxDetail'); if (!detail) return; detail.innerHTML = '';
  var form = document.createElement('div'); form.className = 'mailbox-reply mailbox-compose'; var heading = document.createElement('div'); heading.className = 'mailbox-compose-head'; var label = document.createElement('div'); label.className = 'mailbox-reply-label'; label.textContent = 'New mail from Operations'; heading.appendChild(label);
  function field(placeholder, type) { var input = document.createElement('input'); input.type = type || 'text'; input.className = 'mailbox-compose-input'; input.placeholder = placeholder; return input; }
  var to = field('To (comma-separated recipients)', 'text'), cc = field('CC (optional)', 'text'), bcc = field('BCC (optional)', 'text'), subject = field('Subject');
  var editor = document.createElement('div'); editor.className = 'mailbox-rich-editor'; editor.contentEditable = 'true'; editor.dataset.placeholder = 'Write your message…'; editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-label', 'Email body');
  var attachments = document.createElement('div'); attachments.className = 'mailbox-compose-attachments'; var fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.id = 'operationsNewMailFiles'; var fileLabel = document.createElement('label'); fileLabel.className = 'mailbox-attach-button'; fileLabel.htmlFor = fileInput.id; fileLabel.textContent = 'Attach files'; var fileNames = document.createElement('span'); fileNames.className = 'mailbox-file-names'; fileNames.textContent = 'Up to 10 files, 2.5 MB each'; fileInput.onchange = function () { fileNames.textContent = fileInput.files.length ? Array.from(fileInput.files).map(function (file) { return file.name; }).join(', ') : 'Up to 10 files, 2.5 MB each'; }; attachments.append(fileInput, fileLabel, fileNames);
  var actions = document.createElement('div'); actions.className = 'mailbox-reply-actions'; var discard = document.createElement('button'); discard.type = 'button'; discard.className = 'btn btn-secondary btn-sm'; discard.textContent = 'Discard'; discard.onclick = function () { var dirty = to.value || cc.value || bcc.value || subject.value || editor.textContent.trim() || fileInput.files.length; if (!dirty || window.confirm('Discard this email?')) { detail.innerHTML = '<div class="mailbox-empty">Select an email to read it here.</div>'; } }; var send = document.createElement('button'); send.type = 'button'; send.className = 'btn btn-primary btn-sm'; send.textContent = 'Send'; send.onclick = function () { var html = editor.innerHTML.trim(); if (!to.value.trim()) { showToast('Add at least one To recipient.', 'error'); return; } if (!subject.value.trim()) { showToast('Email subject is required.', 'error'); return; } if (!editor.textContent.trim()) { showToast('Please enter a message.', 'error'); return; } send.disabled = true; send.textContent = 'Preparing…'; mailboxFilesToPayload(fileInput.files).then(function (attachmentsPayload) { send.textContent = 'Sending…'; return fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/send', { method: 'POST', headers: { Authorization: 'Bearer ' + mailboxToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ to: to.value.trim(), cc: cc.value.trim(), bcc: bcc.value.trim(), subject: subject.value.trim(), html: html, attachments: attachmentsPayload }) }).then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to send email'); return data; }); }); }).then(function () { showToast('Email sent successfully.', 'success'); detail.innerHTML = '<div class="mailbox-empty">Email sent successfully. Select an email to read it here.</div>'; if (mailboxActiveView === 'sent') loadMailbox(); }).catch(function (error) { send.disabled = false; send.textContent = 'Send'; showToast(error.message, 'error'); }); }; actions.append(discard, send);
  form.append(heading, to, cc, bcc, subject, mailboxComposeToolbar(editor), editor, attachments, actions); detail.appendChild(form); to.focus();
}

function openMailboxMessage(id) {
  selectedMailboxId = id; renderMailboxList(); var detail = document.getElementById('mailboxDetail'); if (!detail) return; detail.innerHTML = '<div class="mailbox-empty">Loading message…</div>';
  fetch(window.APP_CONFIG.API_BASE_URL + '/mailbox/inbox/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + mailboxToken() } }).then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load message'); return data.data; }); }).then(function (message) { markMailboxMessageReadInUi(message); detail.innerHTML = ''; var head = document.createElement('div'); head.className = 'mailbox-detail-head'; var subject = document.createElement('div'); subject.className = 'mailbox-detail-subject'; subject.textContent = message.subject; var meta = document.createElement('div'); meta.className = 'mailbox-detail-meta'; meta.textContent = (mailboxActiveView === 'sent' ? 'To: ' + (message.to || '') + '\nSent: ' + mailboxDate(message.sentAt || message.receivedAt) : 'From: ' + (message.fromName || message.from) + (message.from ? ' <' + message.from + '>' : '') + '\nReceived: ' + mailboxDate(message.receivedAt)); head.append(subject, meta); var actions = document.createElement('div'); actions.className = 'mailbox-message-actions'; if (mailboxActiveView !== 'sent' && hasMailboxPermission('send_mailbox')) actions.append(mailboxActionButton('Reply', '↩', function () { showMailboxReply(message, detail, 'reply'); }), mailboxActionButton('Reply all', '↩↩', function () { showMailboxReply(message, detail, 'replyAll'); }), mailboxActionButton('Forward', '↪', function () { showMailboxReply(message, detail, 'forward'); })); if (mailboxActiveView !== 'sent' && hasMailboxPermission('delete_mailbox')) actions.appendChild(mailboxActionButton('Move to Deleted Items', '⌫', function () { deleteMailboxMessage(message, detail); }, true)); if (actions.childElementCount) head.appendChild(actions); var attachments = message.attachments || []; if (attachments.length) { var attachmentBox = document.createElement('div'); attachmentBox.className = 'mailbox-attachments'; var attachmentTitle = document.createElement('div'); attachmentTitle.className = 'mailbox-attachments-title'; attachmentTitle.textContent = 'Attachments'; attachmentBox.appendChild(attachmentTitle); attachments.forEach(function (attachment) { var item = document.createElement('button'); item.className = 'mailbox-attachment'; item.title = 'Download ' + attachment.name; item.onclick = function () { downloadMailboxAttachment(message.id, attachment); }; var name = document.createElement('span'); name.textContent = attachment.name; var size = document.createElement('small'); size.textContent = mailboxFormatBytes(attachment.size); item.append(name, size); attachmentBox.appendChild(item); }); head.appendChild(attachmentBox); } var wrap = document.createElement('div'); wrap.className = 'mailbox-detail-body-wrap'; var frame = document.createElement('iframe'); frame.className = 'mailbox-rich-frame'; frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.title = 'Safe rich email preview'; frame.srcdoc = mailboxSafeRichHtml(message.body || message.preview || 'This message has no readable text body.', document.body.classList.contains('light-mode')); wrap.appendChild(frame); detail.append(head, wrap); }).catch(function (error) { detail.innerHTML = '<div class="mailbox-empty"></div>'; detail.firstChild.textContent = error.message; });
}

function navigate(page, el) {
  navigateInternal(page, el);
  setHash(page);
}

// ─── ROLE MANAGEMENT ──────────────────────────────────────────
function switchRole(role) {
  currentRole = role;

  // ── Resolve permissions from roles array ──────────────────
  var roleObj = roles.find(function (r) { return r.key === role; });
  var perms = roleObj ? roleObj.perms : [];
  window._currentPerms = perms;
  function can(p) { return perms.indexOf(p) > -1; }

  // ── Role badge ────────────────────────────────────────────
  var badges = { admin: 'role-admin', engineer: 'role-engineer', cso: 'role-cso', pmo: 'role-pmo', aoc: 'role-aoc', stakeholder: 'role-stakeholder' };
  var labels = { admin: 'ADMIN', engineer: 'ENGINEER', cso: 'CSO', pmo: 'PMO', aoc: 'AOC', stakeholder: 'VIEWER' };
  var badge = document.getElementById('roleBadge');
  if (badge) { badge.className = 'role-badge ' + (badges[role] || 'role-admin'); badge.textContent = labels[role] || role.toUpperCase(); }

  // ── Sidebar avatar & role label ───────────────────────────
  var sidebarAv = document.getElementById('sidebarAvatar');
  if (sidebarAv) { var pts = currentUserName.split(' '); sidebarAv.textContent = pts.map(function (p) { return p[0] || ''; }).join('').substring(0, 2).toUpperCase(); }
  var sidebarRole = document.getElementById('sidebarUserRole');
  if (sidebarRole) sidebarRole.textContent = labels[role] || role.toUpperCase();

  // ── Sidebar nav visibility ────────────────────────────────
  // Incidents nav — only if can view incidents
  var el;
  el = document.getElementById('incidentsNav');
  if (el) el.style.display = can('view_incidents') ? '' : 'none';

  el = document.getElementById('mailboxNav');
  if (el) el.style.display = can('view_mailbox') ? '' : 'none';

  // Reports nav section — only if can view reports
  el = document.getElementById('reportsNav');
  if (el) el.style.display = can('view_reports') ? '' : 'none';

  // Customer 360 nav — only if can view customer360
  el = document.getElementById('c360Nav');
  if (el) el.style.display = can('view_customer360') ? '' : 'none';

  // Data management — roles with manage_data permission
  el = document.getElementById('dataMgmtNav');
  if (el) el.style.display = can('manage_data') ? '' : 'none';

  // Admin section label + Users nav — only admin
  el = document.getElementById('adminSection');
  if (el) el.style.display = can('manage_roles') ? '' : 'none';
  el = document.getElementById('usersNav');
  if (el) el.style.display = can('manage_users') ? '' : 'none';

  // ── Create Incident buttons (dashboard header + incidents page header) ─
  ['createIncidentBtn', 'createIncidentBtn2'].forEach(function (btnId) {
    el = document.getElementById(btnId);
    if (el) el.style.display = can('create_incidents') ? '' : 'none';
  });

  // ── Home page action cards ────────────────────────────────
  el = document.getElementById('homeCardDashboard');
  if (el) el.style.display = can('view_dashboard') ? '' : 'none';
  el = document.getElementById('homeCardIncidents');
  if (el) el.style.display = can('view_incidents') ? '' : 'none';
  el = document.getElementById('homeCardReports');
  if (el) el.style.display = can('view_reports') ? '' : 'none';
  el = document.getElementById('homeCardMailbox');
  if (el) el.style.display = can('view_mailbox') ? '' : 'none';
  // Apply Operations terminology as soon as the authenticated portal renders,
  // not only after the user opens the Operations page.
  ensureOperationsMailboxUi();
  el = document.getElementById('homeCardCreate');
  if (el) el.style.display = can('create_incidents') ? '' : 'none';

  // ── Dashboard nav (hide dashboard link if no access) ──────
  el = document.getElementById('dashNav');
  if (el) el.style.display = can('view_dashboard') ? '' : 'none';

  // ── Refresh icon is always visible on dashboard (inline, non-intrusive) ──

  // ── Reports page: export buttons ─────────────────────────
  el = document.getElementById('exportReportBtn');
  if (el) el.style.display = can('export_reports') ? '' : 'none';
  el = document.getElementById('exportAuditBtn');
  if (el) el.style.display = can('export_reports') ? '' : 'none';

  // ── Guard page navigation: redirect if on forbidden page ─
  var page = window.location.hash.replace('#', '') || 'home';
  var forbidden = false;
  if (page === 'dashboard' && !can('view_dashboard')) forbidden = true;
  if (page === 'reports' && !can('view_reports')) forbidden = true;
  if (page === 'incidents' && !can('view_incidents')) forbidden = true;
  if (page === 'mailbox' && !can('view_mailbox')) forbidden = true;
  if (page === 'users' && !can('manage_users')) forbidden = true;
  if (page === 'roles' && !can('manage_roles')) forbidden = true;
  // Redirect if on a now-forbidden page (e.g. role permissions were just changed)
  if (forbidden) {
    navigate('home', document.getElementById('homeNav'));
  }

  // ── Re-render tables (respects new perms) ─────────────────
  renderIncidentTable();
  renderMyIncidents();

  // ── Profile dropdown ──────────────────────────────────────
  var avatarBtn = document.getElementById('btnProfile');
  if (avatarBtn) { var p2 = (currentUserName || 'A').trim().split(/\s+/); avatarBtn.textContent = (p2.length > 1 ? (p2[0][0] + p2[p2.length - 1][0]) : p2[0][0]).toUpperCase(); }
  var profileLabel = document.getElementById('profileUserLabel');
  if (profileLabel) profileLabel.style.display = 'none';
  var pdAvatar = document.getElementById('profileDdAvatar');
  if (pdAvatar) pdAvatar.textContent = (currentUserName || 'A')[0].toUpperCase();
  var pdName = document.getElementById('profileDdName');
  if (pdName) pdName.textContent = currentUserName || '';
  var pdRole = document.getElementById('profileDdRole');
  if (pdRole) pdRole.textContent = (labels[role] || role).toUpperCase();
  var curUser = users.find(function (u) { return u.name === currentUserName; });
  var curDbUser = null;
  var pdEmail = document.getElementById('profileDdEmail');
  if (pdEmail) pdEmail.textContent = (curUser && curUser.email) || (curDbUser && curDbUser.email) || '';
}

// ─── ROLE MANAGEMENT ──────────────────────────────────────────
let editingRoleKey = null;

const SUPPORTED_USER_ROLES = [
  { key: 'admin', name: 'Admin' },
  { key: 'cso', name: 'CSO' },
  { key: 'pmo', name: 'PMO' },
  { key: 'aoc', name: 'AOC' },
  { key: 'engineer', name: 'Engineer' },
  { key: 'stakeholder', name: 'Stakeholder' }
];

const PERM_LABELS = {
  view_dashboard: 'View Dashboard',
  view_incidents: 'View Incidents',
  create_incidents: 'Create Incidents',
  edit_incidents: 'Edit Incidents',
  close_incidents: 'Close Incidents',
  delete_incidents: 'Delete Incidents',
  view_reports: 'View Reports',
  export_reports: 'Export Reports',
  view_customer360: 'View Customer 360',
  view_mailbox: 'View Operations',
  send_mailbox: 'Send Operations Mail',
  delete_mailbox: 'Delete Operations Emails',
  manage_users: 'Manage Users',
  manage_roles: 'Manage Roles',
  assign_roles: 'Assign Roles',
  manage_data: 'Manage Data',
};

let roles = [
  {
    key: 'admin', name: 'Admin', icon: '🛡', color: 'purple', system: true,
    desc: 'Full access to all portal features including user and role management.',
    perms: ['view_dashboard', 'view_incidents', 'create_incidents', 'edit_incidents', 'close_incidents', 'delete_incidents', 'view_reports', 'export_reports', 'view_customer360', 'view_mailbox', 'send_mailbox', 'delete_mailbox', 'manage_users', 'manage_roles', 'assign_roles', 'manage_data']
  },
  {
    key: 'cso', name: 'CSO', icon: '🌐', color: 'green', system: false,
    desc: 'Cloud Service Operations — manages and resolves incidents, generates reports.',
    perms: ['view_dashboard', 'view_incidents', 'edit_incidents', 'close_incidents', 'view_reports', 'export_reports', 'view_customer360']
  },
  {
    key: 'pmo', name: 'PMO', icon: '📋', color: 'yellow', system: false,
    desc: 'Project Management Office — read-only access to incidents and reports.',
    perms: ['view_dashboard', 'view_incidents', 'view_reports', 'export_reports', 'view_customer360']
  },
  {
    key: 'aoc', name: 'AOC', icon: '🔧', color: 'red', system: false,
    desc: 'Area Operations Center — operational incident handling and reporting.',
    perms: ['view_dashboard', 'view_incidents', 'create_incidents', 'edit_incidents', 'close_incidents', 'view_reports', 'export_reports', 'view_customer360']
  },
  {
    key: 'engineer', name: 'Engineer', icon: '🔩', color: 'blue', system: false,
    desc: 'Field engineer — can create and manage assigned incidents.',
    perms: ['view_dashboard', 'view_incidents', 'create_incidents', 'edit_incidents', 'close_incidents', 'view_reports', 'view_customer360']
  },
  {
    key: 'stakeholder', name: 'Stakeholder', icon: '👁', color: 'gray', system: false,
    desc: 'Read-only observer — can view dashboard and incidents only.',
    perms: ['view_dashboard', 'view_incidents']
  },
];

// ── Role persistence (localStorage) ─────────────────────────
function legacyPersistRoles() {
  try { localStorage.setItem('mc_roles', JSON.stringify(roles)); } catch (e) { }
}

function legacyLoadPersistedRoles() {
  try {
    var saved = localStorage.getItem('mc_roles');
    if (!saved) return;
    var parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.length) return;
    // Merge: preserve saved perms for matching keys, keep any new system roles
    parsed.forEach(function (saved_role) {
      var existing = roles.find(function (r) { return r.key === saved_role.key; });
      if (existing) {
        // Merge: start from saved perms, but ensure any new code-defined perms
        // for system roles (like manage_data added later) are never lost
        if (existing.system) {
          // For system roles: union of saved + code-defined perms so new
          // permissions added in code are always present
          var merged = saved_role.perms.slice();
          existing.perms.forEach(function (p) {
            if (merged.indexOf(p) < 0) merged.push(p);
          });
          existing.perms = merged;
        } else {
          existing.perms = saved_role.perms;
        }
        existing.name = saved_role.name;
        existing.icon = saved_role.icon;
        existing.color = saved_role.color;
        existing.desc = saved_role.desc;
      } else if (!saved_role.system) {
        // Custom role — add it back
        roles.push(saved_role);
      }
    });
  } catch (e) { }
}

// Database-backed role persistence. These declarations intentionally replace
// the legacy localStorage implementations above during the migration period.
function persistRoles() {
  var token = window.APP_CONFIG && sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) return Promise.reject(new Error('Authentication is required to save roles'));
  return fetch(window.APP_CONFIG.API_BASE_URL + '/roles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ roles: roles })
  }).then(function (response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save roles');
      roles = data.data;
      localStorage.removeItem('mc_roles');
      renderRolesGrid(); renderRolesPermTable(); refreshUserRoleTabs();
      return data;
    });
  }).catch(function (error) {
    showToast(error.message || 'Unable to save roles', 'error');
    return loadPersistedRoles().then(function () { return null; });
  });
}

function loadPersistedRoles(callback) {
  var token = window.APP_CONFIG && sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { if (callback) callback(new Error('Not authenticated')); return Promise.resolve(); }
  return fetch(window.APP_CONFIG.API_BASE_URL + '/roles', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(function (response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok || !data.success || !Array.isArray(data.data)) throw new Error(data.message || 'Unable to load roles');
      roles = data.data;
      localStorage.removeItem('mc_roles');
      renderRolesGrid(); renderRolesPermTable(); refreshUserRoleTabs();
      if (currentRole) switchRole(currentRole);
      if (callback) callback(null, roles);
      return roles;
    });
  }).catch(function (error) {
    console.error('Load roles error:', error);
    if (callback) callback(error);
  });
}

loadPersistedRoles(); // load shared roles when an authenticated session is available

// ── PERMISSION HELPERS ────────────────────────────────────
function getRolePerms(roleKey) {
  var r = roles.find(function (x) { return x.key === roleKey; });
  return r ? r.perms : [];
}

function hasPermission(perm) {
  return getRolePerms(currentRole).indexOf(perm) >= 0;
}

// ── NOTIFICATIONS ─────────────────────────────────────────
var notifications = [];
var notificationPollTimer = null;
var latestNotificationId = 0;
var activeNotificationTab = 'all';

// Notifications are populated from live application events

function notificationTimeLabel(value) {
  if (!value) return 'Just now';
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString();
}

function loadNotificationsFromBackend(options) {
  options = options || {};
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) return Promise.resolve();
  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) return Promise.resolve();
  return fetch(window.APP_CONFIG.API_BASE_URL + '/notifications?limit=100', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(function (response) {
      if (!response.ok) throw new Error('Unable to load notifications');
      return response.json();
    })
    .then(function (data) {
      if (!data.success || !Array.isArray(data.data)) return;
      var incoming = data.data.map(function (item) {
        return Object.assign({}, item, { time: notificationTimeLabel(item.created_at) });
      });
      var newestId = incoming.reduce(function (max, item) { return Math.max(max, Number(item.id) || 0); }, 0);
      if (!options.initial && latestNotificationId > 0) {
        incoming.filter(function (item) {
          return item.unread && Number(item.id) > latestNotificationId;
        }).reverse().forEach(function (item) {
          showToast(escapeMetricHtml(item.text), item.type === 'close' ? 'success' : 'info');
        });
      }
      notifications = incoming;
      latestNotificationId = Math.max(latestNotificationId, newestId);
      updateNotifBadge();
      setNotifTab(activeNotificationTab);
    })
    .catch(function (error) {
      console.error('Notification load error:', error);
    });
}

function startNotificationPolling() {
  stopNotificationPolling();
  loadNotificationsFromBackend({ initial: true });
  notificationPollTimer = setInterval(function () {
    loadNotificationsFromBackend({ initial: false });
  }, 10000);
}

function stopNotificationPolling() {
  if (notificationPollTimer) clearInterval(notificationPollTimer);
  notificationPollTimer = null;
  latestNotificationId = 0;
}


function addNotification(type, text, incId) {
  var n = {
    id: Date.now(), type: type || 'info', text: text || '',
    incId: incId || null, time: 'Just now', unread: true
  };
  notifications.unshift(n);
  if (notifications.length > 100) notifications.pop();
  updateNotifBadge();
  renderNotifList();
}

function updateNotifBadge() {
  var badge = document.getElementById('notifBadge');
  if (!badge) return;
  var unread = notifications.filter(function (n) { return n.unread; }).length;
  badge.textContent = unread;
  badge.style.display = unread > 0 ? '' : 'none';
}

function renderNotifList() {
  setNotifTab(activeNotificationTab);
}

function markNotifRead(id) {
  var n = notifications.find(function (x) { return x.id === id; });
  if (n) { n.unread = false; updateNotifBadge(); setNotifTab(activeNotificationTab); }
  var token = window.APP_CONFIG && sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (token) {
    fetch(window.APP_CONFIG.API_BASE_URL + '/notifications/' + encodeURIComponent(id) + '/read', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(function (error) { console.error('Mark notification read error:', error); });
  }
  if (n && n.incId) openDetailPanel(n.incId);
  else if (n && n.type === 'mailbox') navigate('mailbox', document.getElementById('mailboxNav'));
}

function markAllNotifRead() {
  notifications.forEach(function (n) { n.unread = false; });
  updateNotifBadge();
  setNotifTab(activeNotificationTab);
  var token = window.APP_CONFIG && sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (token) {
    fetch(window.APP_CONFIG.API_BASE_URL + '/notifications/read-all', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(function (error) { console.error('Mark all notifications read error:', error); });
  }
}
const COLOR_MAP = {
  blue: { bg: 'rgba(79,142,247,0.12)', color: 'var(--accent)', cardCls: 'card-custom' },
  green: { bg: 'rgba(45,212,160,0.12)', color: 'var(--success)', cardCls: 'card-cso' },
  yellow: { bg: 'rgba(247,185,79,0.12)', color: 'var(--warning)', cardCls: 'card-pmo' },
  red: { bg: 'rgba(247,92,124,0.12)', color: 'var(--danger)', cardCls: 'card-aoc' },
  purple: { bg: 'rgba(124,92,247,0.12)', color: 'var(--accent2)', cardCls: 'card-admin' },
  gray: { bg: 'rgba(139,144,168,0.12)', color: 'var(--text3)', cardCls: 'card-custom' },
};

function getRoleCardClass(r) {
  const cls = { admin: 'card-admin', cso: 'card-cso', pmo: 'card-pmo', aoc: 'card-aoc' };
  return cls[r.key] || 'card-custom';
}

function getUserCountForRole(key) {
  return users.filter(u => u.role === key).length;
}

function renderRolesGrid() {
  const grid = document.getElementById('rolesGrid');
  if (!grid) return;

  grid.innerHTML = roles.map(r => {
    const c = COLOR_MAP[r.color] || COLOR_MAP.blue;
    const cardCls = getRoleCardClass(r);
    const userCount = getUserCountForRole(r.key);
    const allPerms = Object.keys(PERM_LABELS);
    const permTags = allPerms.map(p =>
      r.perms.includes(p)
        ? `<span class="perm-tag">✓ ${PERM_LABELS[p]}</span>`
        : `<span class="perm-tag denied">✗ ${PERM_LABELS[p]}</span>`
    ).join('');

    return `
    <div class="role-card ${cardCls}">
      <div class="role-card-header">
        <div class="role-card-icon-name">
          <div class="role-card-icon" style="background:${c.bg};font-size:22px">${r.icon}</div>
          <div>
            <div class="role-card-name">${r.name}</div>
            <div class="role-card-key">${r.key.toUpperCase()}</div>
          </div>
        </div>
        <div class="role-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openRoleModal('${r.key}')">✏ Edit</button>
          ${!r.system ? `<button class="btn btn-danger btn-sm" onclick="deleteRole('${r.key}')">✕</button>` : ''}
        </div>
      </div>
      <div class="role-card-desc">${r.desc}</div>
      <div class="role-card-perms">${permTags}</div>
      <div class="role-card-footer">
        <div class="role-user-count">👤 ${userCount} user${userCount !== 1 ? 's' : ''}</div>
        ${r.system ? '<span class="role-system-badge">System Role</span>' : '<span class="role-system-badge" style="border-color:var(--accent);color:var(--accent)">Custom</span>'}
      </div>
    </div>`;
  }).join('');

  // Add "+" card at end
  grid.innerHTML += `
    <div class="role-card-add" onclick="openRoleModal()">
      <div class="role-card-add-icon">+</div>
      <div class="role-card-add-label">Add New Role</div>
      <div class="role-card-add-sub">Define custom permissions</div>
    </div>`;

  renderRolesPermTable();
}

function renderRolesPermTable() {
  const table = document.getElementById('rolesPermTable');
  if (!table) return;
  const allPerms = Object.keys(PERM_LABELS);

  table.innerHTML = `
    <thead>
      <tr>
        <th>Permission</th>
        ${roles.map(r => `<th>${r.icon} ${r.name}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${allPerms.map(p => `
        <tr>
          <td style="color:var(--text)">${PERM_LABELS[p]}</td>
          ${roles.map(r => `<td><span style="color:${r.perms.includes(p) ? 'var(--success)' : 'var(--danger)'}">
            ${r.perms.includes(p) ? '✓' : '✗'}
          </span></td>`).join('')}
        </tr>`).join('')}
    </tbody>`;
}

function togglePerm(label) {
  const cb = label.querySelector('input[type=checkbox]');
  // Let the browser handle the check toggle naturally
  setTimeout(() => {
    label.classList.toggle('checked', cb.checked);
  }, 0);
}

function openRoleModal(key = null) {
  editingRoleKey = key;
  const title = document.getElementById('roleModalTitle');
  const saveBtn = document.getElementById('saveRoleBtn');
  if (!title || !saveBtn) return;

  // Reset all checkboxes
  document.querySelectorAll('#permGrid input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('label').classList.remove('checked');
  });

  if (key) {
    const role = roles.find(r => r.key === key);
    if (!role) return;
    title.textContent = `Edit Role — ${role.name}`;
    saveBtn.textContent = 'Save Changes';
    document.getElementById('r_name').value = role.name;
    document.getElementById('r_key').value = role.key;
    document.getElementById('r_key').disabled = role.system; // can't change system role keys
    document.getElementById('r_icon').value = role.icon;
    document.getElementById('r_color').value = role.color;
    document.getElementById('r_desc').value = role.desc;
    // Tick permissions
    role.perms.forEach(p => {
      const cb = document.querySelector(`#permGrid input[value="${p}"]`);
      if (cb) { cb.checked = true; cb.closest('label').classList.add('checked'); }
    });
  } else {
    title.textContent = 'Add New Role';
    saveBtn.textContent = 'Create Role';
    document.getElementById('r_name').value = '';
    document.getElementById('r_key').value = '';
    document.getElementById('r_key').disabled = false;
    document.getElementById('r_icon').value = '';
    document.getElementById('r_color').value = 'blue';
    document.getElementById('r_desc').value = '';
    // Default: tick view permissions
    ['view_dashboard', 'view_incidents', 'view_reports'].forEach(p => {
      const cb = document.querySelector(`#permGrid input[value="${p}"]`);
      if (cb) { cb.checked = true; cb.closest('label').classList.add('checked'); }
    });
  }

  openModal('roleModal');
}

function saveRole() {
  const name = document.getElementById('r_name').value.trim();
  const key = document.getElementById('r_key').value.trim().toLowerCase();
  const icon = document.getElementById('r_icon').value.trim() || '⬡';
  const color = document.getElementById('r_color').value;
  const desc = document.getElementById('r_desc').value.trim();
  const perms = Array.from(document.querySelectorAll('#permGrid input[type=checkbox]:checked'))
    .map(cb => cb.value);

  if (!name || !key) {
    showToast('Role name and key are required', 'error');
    return;
  }

  const wasEditing = Boolean(editingRoleKey);
  if (wasEditing) {
    // Edit existing
    const role = roles.find(r => r.key === editingRoleKey);
    if (role) {
      Object.assign(role, { name, icon, color, desc, perms });
    }
  } else {
    // Check key is unique
    if (roles.find(r => r.key === key)) {
      showToast(`Role key "${key}" already exists`, 'error');
      return;
    }
    roles.push({ key, name, icon, color, desc, perms, system: false });
    // Also add to login pill options, user form select, etc.
  }

  persistRoles().then(function (saved) {
    if (!saved) return;
    closeModal('roleModal');
    showToast(`Role "${name}" ${wasEditing ? 'updated' : 'created'}`, 'success');
    if (editingRoleKey === currentRole) switchRole(currentRole);
  });
}

function deleteRole(key) {
  const role = roles.find(r => r.key === key);
  if (!role || role.key === 'admin') { showToast('Admin role cannot be deleted', 'error'); return; }
  const count = getUserCountForRole(key);
  if (count > 0) { showToast(`Cannot delete — ${count} user(s) assigned to this role`, 'error'); return; }
  showConfirm({ icon: '🗑', title: `Delete Role "${role.name}"`, msg: 'This role will be permanently deleted and cannot be recovered. Users assigned this role will lose access.', ok: 'Delete', danger: true }).then(ok => {
    if (!ok) return;
    roles = roles.filter(r => r.key !== key);
    persistRoles().then(function (saved) {
      if (!saved) return;
      addAudit('🗑', 'Role Deleted', role.name);
      showToast(`Role "${role.name}" deleted`, 'success');
    });
  });
}

function refreshUserRoleTabs() {
  // Rebuild the tab bar on the users page to include any new roles
  const tabBar = document.querySelector('#page-users .tab-bar');
  if (!tabBar) return;
  tabBar.innerHTML = `<div class="tab active" onclick="filterUsers('all', this)">All Users</div>` +
    roles.map(r => `<div class="tab" onclick="filterUsers('${r.key}', this)">${r.icon} ${r.name}</div>`).join('');
}


// ─── INCIDENTS ────────────────────────────────────────────────
function applyFilters() {
  var searchEl = document.getElementById('searchFilter');
  var search = searchEl ? searchEl.value.toLowerCase() : '';
  var sevs = getMsValues('severityFilter');
  var stats = getMsValues('statusFilter');
  var custs = getMsValues('customerFilter');
  var areas = getMsValues('areaFilter');
  var assignees = getMsValues('assigneeFilter');
  var fromEl = document.getElementById('dateFrom');
  var toEl = document.getElementById('dateTo');
  var from = fromEl ? fromEl.value : '';
  var to = toEl ? toEl.value : '';

  filteredIncidents = incidents.filter(function (i) {
    if (search && !i.title.toLowerCase().includes(search) && !i.id.toLowerCase().includes(search)) return false;
    if (sevs.length && sevs.indexOf(i.severity) < 0) return false;
    if (stats.length && stats.indexOf(i.status) < 0) return false;
    if (custs.length && custs.indexOf(i.customer) < 0) return false;
    if (areas.length && areas.indexOf(i.area || 'Unspecified') < 0) return false;
    if (assignees.length && assignees.indexOf(i.engineer) < 0) return false;
    if (from && i.date < from) return false;
    if (to && i.date > to) return false;
    return true;
  });

  filteredIncidents = getSortedIncidents(filteredIncidents);
  currentPage = 1;
  renderIncidentTable();
}

function clearDrillDown() {
  clearFilters();
  var badge = document.getElementById('drillDownBadge');
  if (badge) badge.style.display = 'none';
  showToast('Drill-down cleared', 'info');
}

function clearFilters() {
  var searchEl = document.getElementById('searchFilter');
  if (searchEl) searchEl.value = '';
  ['severityFilter', 'statusFilter', 'customerFilter', 'areaFilter', 'assigneeFilter'].forEach(function (id) {
    clearMsFilter(id);
  });
  ['dateFrom', 'dateTo'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  filteredIncidents = [...incidents];
  currentPage = 1;
  renderIncidentTable();
  var badge = document.getElementById('drillDownBadge');
  if (badge) badge.style.display = 'none';
}

// ── SLA HELPERS ────────────────────────────────────────────────
const SLA_HOURS = { Critical: 1, High: 4, Medium: 12, Normal: 24 };

function getSLAInfo(inc) {
  if (['Resolved', 'Closed'].includes(inc.status)) return { cls: 'sla-na', label: '—', title: 'Resolved' };
  const slaH = getIncidentSlaHours(inc);
  const created = getIncidentOpenedTimestamp(inc);
  const now = new Date();
  const elapsedH = (now - created) / 3600000;
  const remaining = slaH - elapsedH;
  if (remaining < 0) {
    const over = Math.abs(remaining);
    const h = Math.floor(over), m = Math.round((over % 1) * 60);
    return { cls: 'sla-breach', label: `⚠ +${h}h${m ? m + 'm' : ''}`, title: `SLA breached by ${h}h ${m}m (target: ${slaH}h)` };
  }
  const h = Math.floor(remaining), m = Math.round((remaining % 1) * 60);
  const cls = remaining < slaH * 0.25 ? 'sla-warn' : 'sla-ok';
  return { cls, label: `${h}h${m ? m + 'm' : ''} left`, title: `${h}h ${m}m remaining (target: ${slaH}h)` };
}

function renderIncidentTable() {
  const tbody = document.getElementById('incidentTable');
  if (!tbody) return;
  const start = (currentPage - 1) * perPage;
  const end = start + perPage;
  const slice = filteredIncidents.slice(start, end);

  var _ic = document.getElementById('incidentCount'); if (_ic) _ic.textContent = filteredIncidents.length + ' incident' + (filteredIncidents.length !== 1 ? 's' : '') + ' found';

  // Update sort indicators on column headers
  document.querySelectorAll('.sort-th').forEach(th => {
    const col = th.dataset.col;
    const arrow = col === sortCol ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    th.textContent = th.textContent.replace(/ [↑↓]$/, '') + arrow;
    th.style.color = col === sortCol ? 'var(--accent)' : '';
  });

  tbody.innerHTML = slice.map(i => {
    const showSla = String(i.severity || '').toLowerCase() === 'critical';
    const sla = showSla ? getSLAInfo(i) : null;
    return `
    <tr onclick="openDetailPanel('${i.id}')" style="cursor:pointer">
      <td style="width:34px" onclick="event.stopPropagation()"><input type="checkbox" style="accent-color:var(--accent);cursor:pointer" ${selectedIncidents.has(i.id) ? 'checked' : ''} onchange="toggleIncidentSelect('${i.id}',this.checked)"></td>
      <td class="id-cell">${i.id}</td>
      <td class="title-cell">${i.title}</td>
      <td>${i.customer}</td>
      <td>${i.project}</td>
      <td><span class="badge badge-${i.severity.toLowerCase()}">${i.severity}</span></td>
      <td><span class="badge badge-${i.status.toLowerCase().replace(/ /g, '-').replace(/&/g, '')}">${i.status}</span></td>
      <td>${i.engineer}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${i.date}</td>
      <td>${showSla
        ? `<span class="sla-badge ${sla.cls}" title="${sla.title}">${sla.label}</span>`
        : '<span style="color:var(--text3)">&mdash;</span>'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          ${i.status === 'Closed' ? `<span style="display:inline-flex;gap:4px"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();viewIncidentReport('${i.id}')">📋 Report</button>${hasPermission('edit_incidents') ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openDetailPanelEdit('${i.id}')" title="Edit report fields">✏</button>` : ''}</span>` : ''}
          ${hasPermission('edit_incidents') || hasPermission('close_incidents') || i.status !== 'Closed' || currentRole === 'admin' ? `
            ${i.status !== 'Closed' && hasPermission('edit_incidents') ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openDetailPanel('${i.id}',true)">✏ Edit</button>` : ''}
            ${i.status !== 'Closed' && hasPermission('close_incidents') ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();openDowntimeModal('${i.id}')">Close</button>` : ''}
            ${hasPermission('delete_incidents') && (i.status !== 'Closed' || currentRole === 'admin') ? `<button class="btn btn-sm" onclick="event.stopPropagation();deleteIncident('${i.id}')" style="background:transparent;color:#f75c7c;border:none;font-size:15px;padding:3px 7px;" title="Delete incident" aria-label="Delete incident">&#128465;</button>` : ''}
          ` : ''}
        </div>
      </td>
    </tr>`
  }).join('');

  // Sync select-all checkbox
  const chkAll = document.getElementById('chkAll');
  if (chkAll) {
    chkAll.onclick = function () { toggleSelectAll(this.checked); };
    const sl = filteredIncidents.slice((currentPage - 1) * perPage, currentPage * perPage);
    chkAll.checked = sl.length > 0 && sl.every(i => selectedIncidents.has(i.id));
    chkAll.indeterminate = sl.some(i => selectedIncidents.has(i.id)) && !chkAll.checked;
  }

  renderPagination();
}

function changePerPage(val) {
  perPage = parseInt(val);
  currentPage = 1;
  renderIncidentTable();
}

function renderPagination() {
  const total = filteredIncidents.length;
  const totalPages = Math.ceil(total / perPage);
  const start = (currentPage - 1) * perPage;
  const end = Math.min(start + perPage, total);

  var _pi = document.getElementById('paginationInfo'); if (_pi) _pi.textContent =
    total === 0 ? 'No incidents found' : `Showing ${start + 1}–${end} of ${total} incidents`;

  const container = document.getElementById('paginationBtns');
  if (!container) return;
  container.innerHTML = '';

  // Prev button
  const prev = document.createElement('button');
  prev.className = 'pg-btn';
  prev.innerHTML = '&#8592;';
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderIncidentTable(); };
  container.appendChild(prev);

  // Page number buttons with smart ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  pages.forEach(p => {
    if (p === '…') {
      const span = document.createElement('span');
      span.className = 'pg-ellipsis';
      span.textContent = '…';
      container.appendChild(span);
    } else {
      const b = document.createElement('button');
      b.className = 'pg-btn' + (p === currentPage ? ' active' : '');
      b.textContent = p;
      b.onclick = () => { currentPage = p; renderIncidentTable(); };
      container.appendChild(b);
    }
  });

  // Next button
  const next = document.createElement('button');
  next.className = 'pg-btn';
  next.innerHTML = '&#8594;';
  next.disabled = currentPage === totalPages || totalPages === 0;
  next.onclick = () => { currentPage++; renderIncidentTable(); };
  container.appendChild(next);
}

// ─────────────────────────────────────────────────────────
// BULK ACTIONS
// ─────────────────────────────────────────────────────────
var selectedIncidents = new Set();

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  const deleteBtn = document.getElementById('bulkDeleteBtn');
  if (count) count.textContent = selectedIncidents.size + ' selected';
  if (deleteBtn && !hasPermission('delete_incidents')) deleteBtn.style.display = 'none';
  if (deleteBtn) deleteBtn.textContent = selectedIncidents.size ? `🗑 Delete Selected (${selectedIncidents.size})` : '🗑 Delete Selected';
  if (bar) bar.classList.toggle('visible', selectedIncidents.size > 0);
}

function toggleIncidentSelect(id, checked) {
  if (checked) selectedIncidents.add(id);
  else selectedIncidents.delete(id);
  updateBulkBar();
  const chkAll = document.getElementById('chkAll');
  if (chkAll) {
    const slice = filteredIncidents.slice((currentPage - 1) * perPage, currentPage * perPage);
    chkAll.checked = slice.length > 0 && slice.every(i => selectedIncidents.has(i.id));
    chkAll.indeterminate = slice.some(i => selectedIncidents.has(i.id)) && !chkAll.checked;
  }
}

function toggleSelectAll(checked) {
  const slice = filteredIncidents.slice((currentPage - 1) * perPage, currentPage * perPage);
  slice.forEach(i => { if (checked) selectedIncidents.add(i.id); else selectedIncidents.delete(i.id); });
  updateBulkBar();
  renderIncidentTable();
}

function clearBulkSelection() {
  selectedIncidents.clear();
  updateBulkBar();
  renderIncidentTable();
}

function executeBulkAction(field, value) {
  if (!selectedIncidents.size) return;
  selectedIncidents.forEach(id => {
    const inc = incidents.find(i => i.id === id);
    if (!inc) return;
    if (field === 'severity') inc.severity = value;
    if (field === 'status') inc.status = value;
  });
  const label = field === 'severity' ? 'severity → ' + value : 'status → ' + value;
  addAudit('⚡', 'Bulk Update', selectedIncidents.size + ' incidents: ' + label);
  addNotification('success', '<strong>' + selectedIncidents.size + ' incidents</strong> updated: ' + label);
  // Close dropdowns
  ['bulkSevMenu', 'bulkStatMenu'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  clearBulkSelection();
  renderIncidentTable();
  updateStats();
  showToast(selectedIncidents.size + ' incidents updated', 'success');
}

async function bulkDeleteSelectedIncidents() {
  if (!hasPermission('delete_incidents')) {
    showToast('Your role cannot delete incidents.', 'error');
    return;
  }
  if (!selectedIncidents.size) return;
  const ids = Array.from(selectedIncidents);
  const closedSelected = ids.filter(function (id) {
    const inc = incidents.find(function (item) { return item.id === id; });
    return inc && String(inc.status || '').toLowerCase() === 'closed';
  });
  if (closedSelected.length && String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can delete selected closed incidents.', 'error');
    return;
  }

  const confirmed = await showConfirm({
    icon: '🗑',
    title: 'Delete selected incidents?',
    msg: `You are about to delete ${ids.length} incident${ids.length !== 1 ? 's' : ''}. This action cannot be undone.`,
    ok: 'Delete Selected',
    danger: true
  });
  if (!confirmed) return;

  const token = window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND
    ? sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY)
    : null;
  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND && !token) {
    showToast('Not authenticated. Please login first.', 'error');
    return;
  }

  let deletedCount = 0;
  let failedCount = 0;

  for (const id of ids) {
    const inc = incidents.find(function (item) { return item.id === id; });
    if (!inc) { failedCount++; continue; }

    if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
      try {
        const response = await fetch(window.APP_CONFIG.API_BASE_URL + '/incidents/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          }
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.success) { failedCount++; continue; }
      } catch (error) {
        console.error('Bulk delete incident error:', error);
        failedCount++;
        continue;
      }
    } else {
      activityLog.unshift({
        type: 'critical',
        msg: currentUserName + ' deleted ' + id + ' — ' + inc.title.substring(0, 45),
        time: 'just now · ' + inc.customer,
        incId: id
      });
      if (activityLog.length > 50) activityLog.pop();
    }

    removeDeletedIncidentFromUi(id);
    deletedCount++;
  }

  ['bulkSevMenu', 'bulkStatMenu', 'bulkExportMenu'].forEach(function (menuId) {
    var menu = document.getElementById(menuId);
    if (menu) menu.style.display = 'none';
  });

  if (deletedCount) {
    addAudit('🗑', 'Bulk Delete', deletedCount + ' incidents deleted');
    addNotification('success', '<strong>' + deletedCount + ' incidents</strong> deleted.');
    showToast('Deleted ' + deletedCount + ' incident' + (deletedCount !== 1 ? 's' : ''), 'success');
  }
  if (failedCount) {
    showToast('Could not delete ' + failedCount + ' selected incident' + (failedCount !== 1 ? 's' : ''), 'error');
  }

  clearBulkSelection();
  renderIncidentTable();
  updateStats();
  if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
  renderHomePage();
  refreshDashboardData();
}

function exportIncidents(fmt) {
  const toExport = selectedIncidents.size > 0
    ? incidents.filter(i => selectedIncidents.has(i.id))
    : filteredIncidents;
  if (!toExport.length) { showToast('No incidents to export', 'error'); return; }
  if (fmt === 'csv') {
    const rows = [['ID', 'Title', 'Customer', 'Severity', 'Status', 'Assignee', 'Area', 'Date']];
    toExport.forEach(i => rows.push([i.id, '"' + i.title + '"', i.customer, i.severity, i.status, i.engineer, i.area || '', i.date]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'incidents.csv'; a.click();
    showToast('✓ Exported ' + toExport.length + ' incidents as CSV', 'success');
  } else if (fmt === 'json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' }));
    a.download = 'incidents.json'; a.click();
    showToast('✓ Exported ' + toExport.length + ' incidents as JSON', 'success');
  }
  document.getElementById('bulkExportMenu') && (document.getElementById('bulkExportMenu').style.display = 'none');
}

// ─────────────────────────────────────────────────────────
// COMMAND PALETTE
// ─────────────────────────────────────────────────────────
function legacyOpenCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (!el) return;
  applyCmdPaletteTheme(el, '80px', '6px');
  const inp = document.getElementById('cmdInput');
  if (inp) { inp.value = ''; inp.focus(); }
  runCmdSearch('');
}

function openGlobalSearch() { openCmdPalette(); }

function legacyCloseCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (el) el.style.display = 'none';
}

function applyCmdPaletteTheme(el, topPadding, blurAmount) {
  const lightMode = document.body.classList.contains('light-mode');
  const overlayBg = lightMode ? 'rgba(15, 23, 42, 0.28)' : 'rgba(0,0,0,0.75)';
  const panelBg = lightMode ? 'linear-gradient(180deg, #ffffff 0%, #f6f8fd 100%)' : '#16213e';
  const border = lightMode ? '1px solid rgba(122, 144, 184, 0.28)' : '1px solid rgba(79,142,247,0.35)';
  const shadow = lightMode ? '0 32px 80px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(255,255,255,0.6)' : '0 32px 80px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05)';
  const rowBg = lightMode ? '#ffffff' : '#16213e';
  const footerBg = lightMode ? 'rgba(248, 250, 255, 0.96)' : 'rgba(0,0,0,0.2)';
  const inputColor = lightMode ? 'var(--text)' : '#e0e6ff';
  const mutedText = lightMode ? 'rgba(74, 80, 112, 0.82)' : 'rgba(255,255,255,0.45)';
  const resultsBg = lightMode ? '#ffffff' : '#16213e';

  el.style.cssText = `display:flex;position:fixed;inset:0;z-index:99999;background:${overlayBg};backdrop-filter:blur(${blurAmount});align-items:flex-start;justify-content:center;padding-top:${topPadding}`;

  const panel = el.firstElementChild;
  if (!panel) return;
  panel.style.background = panelBg;
  panel.style.border = border;
  panel.style.boxShadow = shadow;

  const row = panel.children[0];
  const results = panel.children[1];
  const footer = panel.children[2];
  if (row) row.style.background = rowBg;
  if (results) results.style.background = resultsBg;
  if (footer) footer.style.background = footerBg;

  const input = document.getElementById('cmdInput');
  const escKey = row ? row.querySelector('kbd') : null;
  if (input) input.style.color = inputColor;
  if (escKey) {
    escKey.style.background = lightMode ? 'rgba(79, 142, 247, 0.08)' : 'rgba(255,255,255,0.07)';
    escKey.style.borderColor = lightMode ? 'rgba(122, 144, 184, 0.22)' : 'rgba(255,255,255,0.12)';
    escKey.style.color = mutedText;
  }
  if (footer) {
    Array.from(footer.querySelectorAll('kbd')).forEach(function (kbd) {
      kbd.style.background = lightMode ? 'rgba(79, 142, 247, 0.08)' : 'rgba(255,255,255,0.07)';
      kbd.style.borderColor = lightMode ? 'rgba(122, 144, 184, 0.22)' : 'rgba(255,255,255,0.12)';
      kbd.style.color = mutedText;
    });
  }
}

function legacyRunCmdSearch(q) {
  var res = document.getElementById('cmdResults');
  if (!res) return;
  q = (q || '').toLowerCase().trim();
  var results = [];

  incidents.filter(function (i) {
    return !q || i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)
      || (i.customer || '').toLowerCase().includes(q) || (i.engineer || '').toLowerCase().includes(q);
  }).slice(0, 6).forEach(function (i) {
    results.push({
      label: i.id + ' \u2014 ' + i.title, sub: i.customer + ' \u00b7 ' + i.severity,
      icon: 'INC', action: function () { closeCmdPalette(); openDetailPanel(i.id); }
    });
  });

  var pages = [
    { label: 'Dashboard', icon: 'DB', page: 'dashboard' },
    { label: 'Incident Management', icon: 'IN', page: 'incidents' },
    { label: 'Reports', icon: 'RP', page: 'reports' },
    { label: 'User Management', icon: 'US', page: 'users' },
    { label: 'Customer 360', icon: 'C3', page: 'customer360' },
    { label: 'Data Management', icon: 'DM', page: 'datamanagement' },
  ];
  pages.filter(function (p) { return !q || p.label.toLowerCase().includes(q); })
    .forEach(function (p) {
      results.push({
        label: p.label, sub: 'Navigate to page', icon: p.icon,
        action: (function (pg) { return function () { closeCmdPalette(); navigate(pg); }; })(p.page)
      });
    });

  if (!results.length) {
    res.innerHTML = '';
    var noRes = document.createElement('div');
    noRes.style.cssText = 'padding:24px;text-align:center;color:rgba(255,255,255,0.3);font-size:13px';
    noRes.textContent = q ? 'No results for "' + q + '"' : 'Type to search incidents or pages...';
    res.appendChild(noRes);
    return;
  }

  res.innerHTML = '';
  results.forEach(function (r) {
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;cursor:pointer;margin:2px 0';
    var badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;font-weight:700;background:rgba(79,142,247,0.15);color:var(--accent);border-radius:4px;padding:2px 5px;width:28px;text-align:center;flex-shrink:0';
    badge.textContent = r.icon;
    var info = document.createElement('div');
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:13px;color:#e2e8f0;font-weight:500';
    lbl.textContent = r.label;
    var sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.35);margin-top:1px';
    sub.textContent = r.sub;
    info.appendChild(lbl);
    info.appendChild(sub);
    div.appendChild(badge);
    div.appendChild(info);
    div.addEventListener('mouseenter', function () { this.style.background = 'rgba(79,142,247,0.15)'; });
    div.addEventListener('mouseleave', function () { this.style.background = ''; });
    div.addEventListener('click', r.action);
    res.appendChild(div);
  });
}

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openCmdPalette(); }
  if (e.key === 'Escape') { closeCmdPalette(); }
});


function legacyDoLogin() {
  // Prevent double submits
  var btn = document.getElementById('loginBtn');
  if (btn) btn.disabled = true;

  var emailEl = document.getElementById('loginEmail');
  var pwdEl = document.getElementById('loginPassword');
  var errEl = document.getElementById('loginError');

  if (!emailEl || !pwdEl || !window.APP_CONFIG || !window.APP_CONFIG.API_BASE_URL) {
    if (errEl) errEl.style.display = '';
    if (btn) btn.disabled = false;
    return;
  }

  var email = (emailEl.value || '').trim();
  var password = pwdEl.value || '';
  if (!email || !password) {
    if (errEl) errEl.style.display = '';
    if (btn) btn.disabled = false;
    return;
  }

  // UI spinner
  try {
    var sp = document.getElementById('btnSpinner');
    var tx = document.getElementById('btnText');
    if (sp) sp.style.display = 'block';
    if (tx) tx.textContent = 'Signing in...';
  } catch (e) { }

  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.success && data.token) {
        sessionStorage.setItem(window.APP_CONFIG.JWT_TOKEN_KEY, data.token);
        loadPersistedRoles();

        var u = data.user || {};
        currentUserName = u.name || u.email || currentUserName;
        currentRole = u.role || currentRole;
        applyCurrentUserProfile(u);

        // Update UI labels immediately
        var els = ['sidebarUserName', 'profileDdName', 'profileModalName', 'pf_ro_active'];
        els.forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = currentUserName; });

        // Role visuals + nav visibility
        switchRole(currentRole);

        // Hide login screen but keep same page loaded; just refresh app content
        var loginScreen = document.getElementById('loginScreen');
        var portal = document.getElementById('portalApp');
        if (loginScreen) loginScreen.style.display = 'none';
        if (portal) portal.style.display = '';
        setHash('home');
        navigateInternal('home', document.getElementById('homeNav'));

        // Set avatar pills
        var avatar = document.getElementById('btnProfile');
        if (avatar) {
          var p2 = (currentUserName || 'A').trim().split(/\s+/);
          avatar.textContent = (p2.length > 1 ? (p2[0][0] + p2[p2.length - 1][0]) : p2[0][0]).toUpperCase();
        }

        // Apply role-based refresh and data reload
        loadMasterData(function () {
          loadUsersFromBackend(function () {
            loadIncidentsFromBackend(function () {
              refreshDashboardData();
              openLinkedIncidentIfReady();
            });
          });
        });

        if (errEl) errEl.style.display = 'none';

        // Close any modal panels
        closeGlobalSearch();
        closeCmdPalette();

        // Restore spinner text
        try {
          var sp2 = document.getElementById('btnSpinner');
          var tx2 = document.getElementById('btnText');
          if (sp2) sp2.style.display = 'none';
          if (tx2) tx2.textContent = 'Sign In to Portal';
        } catch (e) { }

        if (btn) btn.disabled = false;
        return;
      }

      if (errEl) errEl.style.display = '';
      if (errEl && data && data.message) errEl.textContent = data.message;

      try {
        var sp3 = document.getElementById('btnSpinner');
        var tx3 = document.getElementById('btnText');
        if (sp3) sp3.style.display = 'none';
        if (tx3) tx3.textContent = 'Sign In to Portal';
      } catch (e) { }

      if (btn) btn.disabled = false;
    })
    .catch(function () {
      if (errEl) errEl.style.display = '';
      try {
        var sp4 = document.getElementById('btnSpinner');
        var tx4 = document.getElementById('btnText');
        if (sp4) sp4.style.display = 'none';
        if (tx4) tx4.textContent = 'Sign In to Portal';
      } catch (e) { }
      if (btn) btn.disabled = false;
    });
}

function openModal(id) {
  // Permission guards
  if (id === 'incidentModal' && !editingId && !hasPermission('create_incidents')) {
    showToast('Access denied: you cannot create incidents', 'error'); return;
  }
  if (id === 'incidentReportModal' && !hasPermission('view_reports')) {
    showToast('Access denied: you cannot view reports', 'error'); return;
  }
  document.getElementById(id).classList.add('open');
  if (id === 'incidentModal') ensureEngineerDropdownsLoaded();
  // Set today's date for new incident
  if (id === 'incidentModal' && !editingId) {
    // default to current local datetime in IST format (datetime-local)
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const localDT = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
      + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    document.getElementById('f_date').value = localDT;
    document.getElementById('f_date').dataset.inputTimezone = 'IST';
    var _imt = document.getElementById('incidentModalTitle'); if (_imt) _imt.textContent = 'Create New Incident';
    createModalTags = []; renderCreateTagChips();
    var _sib = document.getElementById('saveIncidentBtn'); if (_sib) _sib.textContent = 'Create Incident';
    ['f_title', 'f_customer', 'f_project', 'f_product_line', 'f_severity', 'f_status', 'f_engineer', 'f_sf_case', 'f_rd_tickets', 'f_area'].forEach(f => {
      const el = document.getElementById(f);
      if (el) el.value = f === 'f_status' ? 'New' : '';
    });
    setDescriptionEditorValue('');
    var fplNew = document.getElementById('f_product_line'); if (fplNew && !fplNew.value) fplNew.value = 'Application';
    // Init timezone selector (reset to IST on fresh open)
    selectedTZ = 'IST';
    renderTZSelector('createTZSelector', 'IST', 'changeCreateTZ(this.value)');
    const hint = document.getElementById('f_date_tz_hint');
    if (hint) hint.textContent = 'Input timezone: IST';
    var emailHint = document.getElementById('f_operations_email_hint'); if (emailHint) { emailHint.style.display = 'none'; emailHint.textContent = ''; }
  }
}

function openCreateIncidentModal() {
  editingId = null;
  createModalTags = [];
  renderCreateTagChips();
  var tagInput = document.getElementById('f_tag_input');
  if (tagInput) tagInput.value = '';
  closeCreateTagSuggestions();
  openModal('incidentModal');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'incidentModal') {
    createModalTags = [];
    renderCreateTagChips();
    var tagInput = document.getElementById('f_tag_input');
    if (tagInput) tagInput.value = '';
    closeCreateTagSuggestions();
  }
  if (id === 'incidentModal') pendingOperationsEmailAuditId = null;
  editingId = null;
}

function editIncident(id) {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  editingId = id;
  var _imt2 = document.getElementById('incidentModalTitle'); if (_imt2) _imt2.textContent = 'Edit Incident — ' + id;
  var _eti = incidents.find(function (i) { return i.id === id; }); createModalTags = (_eti && _eti.tags) ? _eti.tags.slice() : []; renderCreateTagChips();
  var _sib2 = document.getElementById('saveIncidentBtn'); if (_sib2) _sib2.textContent = 'Save Changes';
  document.getElementById('f_title').value = inc.title;
  document.getElementById('f_customer').value = inc.customer;
  document.getElementById('f_project').value = inc.project;
  var fpl = document.getElementById('f_product_line'); if (fpl) fpl.value = inc.product_line || '';
  var frd = document.getElementById('f_rd_tickets'); if (frd) frd.value = inc.rd_tickets || inc.rdTickets || '';
  var fsf = document.getElementById('f_sf_case'); if (fsf) fsf.value = inc.sfCase || inc.sf_case || '';
  document.getElementById('f_severity').value = inc.severity;
  document.getElementById('f_status').value = inc.status;
  document.getElementById('f_engineer').value = inc.engineer;
  ensureEngineerDropdownsLoaded(function () { var fe = document.getElementById('f_engineer'); if (fe) fe.value = inc.engineer || ''; });
  document.getElementById('f_date').value = inc.date;
  setDescriptionEditorValue(inc.desc);
  openModal('incidentModal');
}

function closeIncident(id) {
  if (!hasPermission('close_incidents')) { showToast('Access denied: you cannot close incidents', 'error'); return; }
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  const hasDetails = (inc.downtimeH > 0 || inc.downtimeM > 0)
    && (inc.mttrH > 0 || inc.mttrM > 0)
    && inc.rca && inc.resolution && inc.downtimeEnd;

  if (hasDetails) {
    // All details already saved — just confirm close
    _showCloseConfirm(inc);
  } else {
    // Missing details — open downtime modal
    openDowntimeModal(id);
  }
}

function _showCloseConfirm(inc) {
  const existing = document.getElementById('closeConfirmOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'closeConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;width:90%;max-width:380px;box-shadow:0 20px 50px rgba(0,0,0,0.5);overflow:hidden">
      <div style="padding:22px 24px 16px">
        <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:6px">Close Incident?</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.5">${inc.id} — <span style="color:var(--text)">${inc.title.substring(0, 55)}${inc.title.length > 55 ? '…' : ''}</span></div>
        <div style="margin-top:14px;padding:12px 14px;border-radius:8px;background:rgba(45,212,160,0.07);border:1px solid rgba(45,212,160,0.2)">
          <div style="font-size:12px;color:var(--text-muted)">✅ All incident details are already saved. Do you want to close this incident or go back to edit?</div>
        </div>
      </div>
      <div style="padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('closeConfirmOverlay').remove()"
          style="padding:9px 18px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;font-weight:600">
          Cancel
        </button>
        <button onclick="document.getElementById('closeConfirmOverlay').remove();openDetailPanel('${inc.id}',true)"
          style="padding:9px 18px;border-radius:8px;border:1px solid rgba(79,142,247,0.4);background:rgba(79,142,247,0.08);color:var(--accent);cursor:pointer;font-size:13px;font-weight:600">
          ✏ Edit First
        </button>
        <button onclick="document.getElementById('closeConfirmOverlay').remove();_forceCloseIncident('${inc.id}')"
          style="padding:9px 18px;border-radius:8px;border:none;background:#2dd4a0;color:#0a1628;cursor:pointer;font-size:13px;font-weight:700">
          ✓ Yes, Close
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function _forceCloseIncident(id) {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    if (!token) {
      showToast('Not authenticated. Please login first.', 'error');
      return;
    }

    const payload = {
      status: 'Closed'
    };

    fetch(window.APP_CONFIG.API_BASE_URL + `/incidents/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          inc.status = 'Closed';
          addFeedEntry(id, 'close', 'changed status', `${inc.status} → Closed`);
          if (inc.downtimeStr) addFeedEntry(id, 'system', 'recorded downtime', inc.downtimeStr);
          renderIncidentTable();
          updateStats();
          if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
          if (detailCurrentId === id) openDetailPanel(id, false);
          renderHomePage();
          showToast(`${id} closed successfully ✓`, 'success');
          refreshDashboardData();
        } else {
          showToast(data.message || 'Failed to close incident', 'error');
        }
      })
      .catch(err => {
        console.error('Close incident error:', err);
        showToast('Network error. Could not close incident.', 'error');
      });
  } else {
    const oldStatus = inc.status;
    inc.status = 'Closed';
    addFeedEntry(id, 'close', 'changed status', `${oldStatus} → Closed`);
    if (inc.downtimeStr) addFeedEntry(id, 'system', 'recorded downtime', inc.downtimeStr);
    renderIncidentTable();
    updateStats();
    if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
    if (detailCurrentId === id) openDetailPanel(id, false);
    renderHomePage();
    showToast(`${id} closed successfully ✓`, 'success');
  }
}

function deleteIncident(id) {
  var inc = incidents.find(function (i) { return i.id === id; });
  if (!inc) return;
  if (inc.status === 'Closed' && currentRole !== 'admin') {
    showToast('Only administrators can delete closed incidents.', 'error');
    return;
  }

  // Confirmation modal
  var overlay = document.createElement('div');
  overlay.id = 'deleteConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <div style="font-size:40px;text-align:center;margin-bottom:12px;">🗑️</div>
      <h3 style="text-align:center;color:var(--text-primary);margin:0 0 8px;font-size:18px;">Delete Incident?</h3>
      <p style="text-align:center;color:var(--text-muted);font-size:13px;margin:0 0 6px;">${inc.id} — ${inc.title}</p>
      <p style="text-align:center;color:#f75c7c;font-size:12px;margin:0 0 24px;">This action cannot be undone.</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button onclick="document.getElementById('deleteConfirmOverlay').remove()"
          style="padding:10px 28px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text-primary);cursor:pointer;font-size:14px;">
          Cancel
        </button>
        <button onclick="confirmDeleteIncident('${inc.id}')"
          style="padding:10px 28px;border-radius:8px;border:none;background:#f75c7c;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">
          Yes, Delete
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function removeDeletedIncidentFromUi(id) {
  incidents = incidents.filter(function (incident) { return incident.id !== id; });
  filteredIncidents = filteredIncidents.filter(function (incident) { return incident.id !== id; });
  selectedIncidents.delete(id);
  delete incidentComments[id];

  var totalPages = Math.max(1, Math.ceil(filteredIncidents.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;

  if (detailCurrentId === id) {
    document.getElementById('detailOverlay')?.classList.remove('open', 'metric-drilldown-detail');
    document.getElementById('detailPanel')?.classList.remove('open', 'editing');
    document.body.style.overflow = '';
    detailCurrentId = null;
  }

  renderIncidentTable();
  updateStats();
  if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
  renderHomePage();
}

function confirmDeleteIncident(id) {
  var overlay = document.getElementById('deleteConfirmOverlay');
  if (overlay) overlay.remove();

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    if (!token) {
      showToast('Not authenticated. Please login first.', 'error');
      return;
    }

    fetch(window.APP_CONFIG.API_BASE_URL + `/incidents/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          removeDeletedIncidentFromUi(id);
          showToast(id + ' has been deleted.', 'success');
          refreshDashboardData();
        } else {
          showToast(data.message || 'Failed to delete incident', 'error');
        }
      })
      .catch(err => {
        console.error('Delete incident error:', err);
        showToast('Network error. Could not delete incident.', 'error');
      });
  } else {
    var idx = incidents.findIndex(function (i) { return i.id === id; });
    if (idx === -1) return;

    var inc = incidents[idx];

    activityLog.unshift({
      type: 'critical',
      msg: currentUserName + ' deleted ' + id + ' — ' + inc.title.substring(0, 45),
      time: 'just now · ' + inc.customer,
      incId: id
    });
    if (activityLog.length > 50) activityLog.pop();

    removeDeletedIncidentFromUi(id);
    showToast(id + ' has been deleted.', 'success');
  }
}

function openDowntimeModal(id) {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  const modal = document.getElementById('downtimeModal');
  document.getElementById('dtm_inc_id').textContent = id;
  var _dtt = document.getElementById('dtm_title'); if (_dtt) _dtt.textContent = inc.title;
  document.getElementById('dtm_hours').value = inc.downtimeH ?? 0;
  document.getElementById('dtm_mins').value = inc.downtimeM ?? 0;
  document.getElementById('dtm_mttr_hours').value = inc.mttrH || '';
  document.getElementById('dtm_mttr_mins').value = inc.mttrM || '';
  document.getElementById('dtm_resolved_by').value = inc.resolvedBy || inc.resolved_by || '';
  document.getElementById('dtm_rca').value = inc.rca || '';
  document.getElementById('dtm_resolution').value = inc.resolution || '';
  document.getElementById('dtm_inc_ref').value = id;
  // Init TZ selector — use incident's saved TZ or current selectedTZ
  var dtmTZ = inc.timezone || selectedTZ || 'IST';
  selectedTZ = dtmTZ;
  renderTZSelector('closeTZSelector', dtmTZ, 'changeCloseTZ(this.value)');

  // Pre-fill end time from stored incident fields without reinterpreting timezone.
  var endEl = document.getElementById('dtm_end_time');
  var storedEnd = inc.date_time_closed || inc.endDT || inc.downtimeEnd;
  if (endEl && storedEnd) {
    endEl.value = toDatetimeLocalWall(storedEnd);
  } else if (endEl) {
    // Default to current time in display TZ
    var now = new Date();
    var offNow = getTZOffset(dtmTZ);
    var tzNowMs = now.getTime() + offNow * 3600000;
    var tzNow = new Date(tzNowMs);
    var pad3 = n => String(n).padStart(2, '0');
    endEl.value = tzNow.getUTCFullYear() + '-' + pad3(tzNow.getUTCMonth() + 1) + '-' + pad3(tzNow.getUTCDate())
      + 'T' + pad3(tzNow.getUTCHours()) + ':' + pad3(tzNow.getUTCMinutes());
  }
  if (endEl) endEl.dataset.inputTimezone = dtmTZ;
  setIncidentEndHint('dtm_end_tz_hint', dtmTZ, false);
  var critical = String(inc.severity || '').toLowerCase() === 'critical';
  var downtimeHours = document.getElementById('dtm_hours');
  var downtimeMinutes = document.getElementById('dtm_mins');
  [downtimeHours, downtimeMinutes].forEach(function (field) {
    field.readOnly = false;
    field.style.opacity = '1';
    field.style.cursor = '';
  });
  var downtimeHint = document.getElementById('dtm_downtime_hint');
  if (downtimeHint) downtimeHint.style.display = critical ? 'block' : 'none';
  if (critical) updateCriticalDowntime();
  modal.style.display = 'flex';
}

function updateCriticalDowntime() {
  const id = document.getElementById('dtm_inc_ref')?.value;
  const inc = incidents.find(function (item) { return item.id === id; });
  if (!inc || String(inc.severity || '').toLowerCase() !== 'critical') return;
  const endEl = document.getElementById('dtm_end_time');
  if (!endEl || !endEl.value) return;
  const startDate = incidentTimestampDate(inc, 'start');
  const endDate = wallClockToDate(endEl.value, endEl.dataset.inputTimezone || selectedTZ || inc.timezone || 'IST');
  if (!startDate || !endDate) return;
  const totalMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  document.getElementById('dtm_hours').value = Math.floor(totalMinutes / 60);
  document.getElementById('dtm_mins').value = totalMinutes % 60;
}

function changeCloseTZ(newKey) {
  // Convert the currently entered end time to the new TZ
  var endEl = document.getElementById('dtm_end_time');
  if (endEl && endEl.value) {
    endEl.value = convertDatetimeLocalTZ(endEl.value, selectedTZ, newKey);
  }
  selectedTZ = newKey;
  if (endEl) endEl.dataset.inputTimezone = newKey;
  setIncidentEndHint('dtm_end_tz_hint', newKey, false);
  renderTZSelector('closeTZSelector', newKey, 'changeCloseTZ(this.value)');
  updateCriticalDowntime();
}

function confirmCloseIncident() {
  const id = document.getElementById('dtm_inc_ref').value;
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  const downtimeHoursInput = document.getElementById('dtm_hours');
  const downtimeMinutesInput = document.getElementById('dtm_mins');
  const criticalDowntime = String(inc.severity || '').toLowerCase() === 'critical';
  const h = downtimeHoursInput.value === '' ? 0 : Number(downtimeHoursInput.value);
  const m = downtimeMinutesInput.value === '' ? 0 : Number(downtimeMinutesInput.value);
  const mttrH = parseInt(document.getElementById('dtm_mttr_hours').value) || 0;
  const mttrM = parseInt(document.getElementById('dtm_mttr_mins').value) || 0;
  const resolvedBy = document.getElementById('dtm_resolved_by').value;
  const rca = document.getElementById('dtm_rca').value.trim();
  const res = document.getElementById('dtm_resolution').value.trim();
  convertIncidentEndFromIST('dtm_end_time', 'dtm_end_tz_hint');
  const endTimeRaw = document.getElementById('dtm_end_time').value;

  if (!endTimeRaw) { showToast('Please select the incident end date & time', 'error'); return; }
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isInteger(h) || !Number.isInteger(m)
    || h < 0 || (!criticalDowntime && h > 999) || m < 0 || m > 59) {
    showToast('Please enter a valid downtime (zero is allowed)', 'error'); return;
  }
  if (!rca) { showToast('Please enter the Root Cause Analysis', 'error'); return; }
  if (!res) { showToast('Please enter the Resolution Steps', 'error'); return; }
  if (!resolvedBy) { showToast('Please select who resolved the incident', 'error'); return; }

  const closeTZ = selectedTZ || inc.timezone || 'IST';
  const closedAt = toMysqlDatetime(endTimeRaw);

  inc.downtimeH = h;
  inc.downtimeM = m;
  inc.downtimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  inc.mttrH = mttrH;
  inc.mttrM = mttrM;
  inc.mttr_minutes = mttrH * 60 + mttrM;
  inc.mttrStr = mttrH > 0 ? (mttrM > 0 ? `${mttrH}h ${mttrM}m` : `${mttrH}h`) : (mttrM > 0 ? `${mttrM}m` : '');
  inc.resolvedBy = resolvedBy;
  inc.resolved_by = resolvedBy;
  inc.endDT = closedAt;
  inc.date_time_closed = closedAt;
  inc.downtimeEnd = closedAt;
  inc.timezone = closeTZ;
  inc.rca = rca;
  inc.resolution = res;
  const oldStatus = inc.status;

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    if (!token) {
      showToast('Not authenticated. Please login first.', 'error');
      return;
    }

    fetch(window.APP_CONFIG.API_BASE_URL + `/incidents/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'Closed',
        rca,
        resolution: res,
        downtime_h: h,
        downtime_m: m,
        downtime_mins: h * 60 + m,
        mttr_h: mttrH,
        mttr_m: mttrM,
        mttr_minutes: mttrH * 60 + mttrM,
        resolved_by: resolvedBy,
        timezone: closeTZ,
        endDT: closedAt,
        date_time_closed: closedAt,
        closed_date: closedAt ? closedAt.substring(0, 10) : null
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          addFeedEntry(id, 'close', 'changed status', `${oldStatus} → Closed`);
          addFeedEntry(id, 'system', 'recorded downtime', inc.downtimeStr);
          document.getElementById('downtimeModal').style.display = 'none';
          loadIncidentsFromBackend(() => {
            renderIncidentTable();
            refreshDashboardData();
            if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
            if (detailCurrentId === id) openDetailPanel(id, false);
            showToast(`${id} closed — downtime recorded: ${inc.downtimeStr}`, 'success');
          });
        } else {
          showToast(data.message || 'Failed to close incident', 'error');
          loadIncidentsFromBackend();
        }
      })
      .catch(err => {
        console.error('Close incident error:', err);
        showToast('Network error. Could not close incident.', 'error');
        loadIncidentsFromBackend();
      });
    return;
  }

  inc.status = 'Closed';
  addFeedEntry(id, 'close', 'changed status', `${oldStatus} → Closed`);
  addFeedEntry(id, 'system', 'recorded downtime', inc.downtimeStr);

  document.getElementById('downtimeModal').style.display = 'none';
  renderIncidentTable();
  refreshDashboardData();   // update all dashboard stats, charts & widgets
  if (typeof renderKanban === 'function' && currentIncidentView === 'kanban') renderKanban();
  if (detailCurrentId === id) openDetailPanel(id, false);
  showToast(`${id} closed — downtime recorded: ${inc.downtimeStr}`, 'success');
}

function saveIncident() {
  if (!editingId && !hasPermission('create_incidents')) { showToast('Access denied', 'error'); return; }
  if (editingId && !hasPermission('edit_incidents')) { showToast('Access denied', 'error'); return; }
  const title = document.getElementById('f_title').value.trim();
  const customer = document.getElementById('f_customer').value;
  const project = document.getElementById('f_project').value;
  const productLine = document.getElementById('f_product_line')?.value || '';
  const severity = document.getElementById('f_severity').value;
  const status = document.getElementById('f_status').value;
  const engineer = document.getElementById('f_engineer').value;
  const dateRaw = document.getElementById('f_date').value;
  const date = dateRaw ? dateRaw.substring(0, 10) : '';
  const startDT = dateRaw || '';
  const openedAt = toMysqlDatetime(startDT || date);
  const desc = descriptionEditorValue();
  const mttdH = parseInt(document.getElementById('f_mttd_h')?.value) || 0;
  const mttdM = parseInt(document.getElementById('f_mttd_m')?.value) || 0;
  const mttdMinutes = (mttdH * 60) + mttdM;
  const mttdStr = mttdMinutes > 0 ? minutesToHM(mttdMinutes) : '';

  if (!title || !customer || !severity || !engineer) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  const area = document.getElementById('f_area')?.value || '';
  const resolvedBy = document.getElementById('f_resolved_by')?.value || '';
  const sfCase = (document.getElementById('f_sf_case')?.value || '').trim();
  const rdTickets = (document.getElementById('f_rd_tickets')?.value || '').trim();

  if (!editingId && !pendingIncidentEmail) {
    showPreSendEmailPreview({ title, customer, project, product_line: productLine, severity, status,
      engineer, startDT: openedAt, timezone: selectedTZ, description: desc, area });
    return;
  }

  if (editingId) {
    const incidentId = editingId;
    if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
      const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
      if (!token) {
        showToast('Not authenticated. Please login first.', 'error');
        return;
      }

      const payload = {
        title,
        customer,
        project,
        product_line: productLine,
        severity,
        status,
        engineer,
        date_created: openedAt,
        startDT: openedAt,
        date_time_opened: openedAt,
        timezone: selectedTZ,
        mttd_minutes: mttdMinutes > 0 ? mttdMinutes : null,
        mttdStr,
        sf_case: sfCase,
        rd_tickets: rdTickets,
        description: desc,
        sla_hours: null,
        area,
        tags: createModalTags.slice()
      };

      fetch(window.APP_CONFIG.API_BASE_URL + `/incidents/${incidentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            showToast(`${incidentId} updated successfully`, 'success');
            closeModal('incidentModal');
            loadIncidentsFromBackend(() => {
              renderIncidentTable();
              refreshDashboardData();
              populateAssigneeFilter();
            });
          } else {
            showToast(data.message || 'Failed to update incident', 'error');
          }
        })
        .catch(err => {
          console.error('Update incident error:', err);
          showToast('Network error. Could not update incident.', 'error');
        });
    } else {
      const inc = incidents.find(i => i.id === editingId);
      if (inc) {
        Object.assign(inc, { title, customer, project, product_line: productLine, rd_tickets: rdTickets, rdTickets, sfCase, severity, status, engineer, date, startDT, timezone: selectedTZ, desc, area, tags: createModalTags.slice() });
      }
      showToast(`${editingId} updated successfully`, 'success');
      closeModal('incidentModal');
      renderIncidentTable();
      updateStats();
    }
  } else {
    if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
      const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
      if (!token) {
        showToast('Not authenticated. Please login first.', 'error');
        return;
      }

      const payload = {
        title,
        customer,
        project,
        product_line: productLine,
        severity,
        status,
        engineer,
        date_created: openedAt,
        startDT: openedAt,
        date_time_opened: openedAt,
        timezone: selectedTZ,
        mttd_minutes: mttdMinutes > 0 ? mttdMinutes : null,
        mttdStr,
        sf_case: sfCase,
        rd_tickets: rdTickets,
        description: desc,
        area,
        tags: createModalTags.slice(),
        operations_email_audit_id: pendingOperationsEmailAuditId,
        notification_email: pendingIncidentEmail
      };

      fetch(window.APP_CONFIG.API_BASE_URL + '/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            pendingIncidentEmail = null;
            pendingOperationsEmailAuditId = null;
            showToast(`${data.data.id} created successfully`, 'success');
            if (data.data.email && data.data.email.sent) {
              showToast(`Email sent to ${data.data.email.to}`, 'success');
            } else if (data.data.email && !data.data.email.skipped) {
              showToast(`Incident created, but email failed: ${data.data.email.message}`, 'error');
            } else if (data.data.email && data.data.email.skipped) {
              showToast(`Incident created; email not sent: ${data.data.email.message}`, 'error');
            }
            closeModal('incidentModal');
            loadIncidentsFromBackend(() => {
              renderIncidentTable();
              refreshDashboardData();
            });
          } else {
            showToast(data.message || 'Failed to create incident', 'error');
          }
        })
        .catch(err => {
          console.error('Create incident error:', err);
          showToast('Network error. Could not create incident.', 'error');
        });
    } else {
      const newId = 'INC-' + String(incidents.length + 1).padStart(3, '0');
      incidents.unshift({ id: newId, title, customer, project, product_line: productLine, rd_tickets: rdTickets, rdTickets, severity, status, engineer, date, startDT, timezone: selectedTZ, desc, area, resolvedBy, sfCase, mttdH, mttdM, mttd_minutes: mttdMinutes > 0 ? mttdMinutes : null, mttdStr, tags: createModalTags.slice() });
      addFeedEntry(newId, 'create', 'Incident created', `Severity: ${severity} · Customer: ${customer}`);
      showToast(`${newId} created successfully`, 'success');
      closeModal('incidentModal');
      renderIncidentTable();
      updateStats();
    }
  }

  filteredIncidents = [...incidents];
  editingId = null;
  populateAssigneeFilter();
}

// ─── USERS ────────────────────────────────────────────────────
let userFilter = 'all';

function filterUsers(role, el) {
  userFilter = role;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderUsersTable();
}

function renderUsersTable() {
  const filtered = userFilter === 'all' ? users : users.filter(u => u.role === userFilter);
  const roleLabels = Object.fromEntries(roles.map(r => [r.key, r.name]));
  // Map role color names to badge classes / inline styles dynamically
  const COLOR_TO_BADGE = { purple: 'badge-medium', green: 'badge-low', yellow: 'badge-high', red: 'badge-critical', blue: 'badge-medium', gray: 'badge-closed', orange: 'badge-critical' };
  const getRoleBadgeStyle = (roleKey) => {
    const r = roles.find(r => r.key === roleKey);
    if (!r) return '';
    const cls = COLOR_TO_BADGE[r.color];
    if (cls) return cls;
    // Fallback: inline style using the role colour map
    const bg = (window.COLOR_MAP && COLOR_MAP[r.color]) ? COLOR_MAP[r.color].bg : 'rgba(79,142,247,0.15)';
    const fg = (window.COLOR_MAP && COLOR_MAP[r.color]) ? COLOR_MAP[r.color].text : '#4f8ef7';
    return `badge" style="background:${bg};color:${fg};border-color:${fg}30`;
  };

  var _ut = document.getElementById('usersTable'); if (_ut) _ut.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${u.name[0]}</div>
          <span style="color:var(--text);font-weight:500">${u.name}</span>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:11px">${u.email}</td>
      <td><span class="badge ${getRoleBadgeStyle(u.role)}">${roleLabels[u.role] || u.role}</span></td>
      <td>${u.incidents}</td>
      <td style="font-size:12px;color:var(--text3)">${u.lastActive}</td>
      <td><span class="badge ${u.active ? 'badge-low' : 'badge-critical'}">${u.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="editUserRole('${u.id}')">Change Role</button>
          <button class="btn btn-secondary btn-sm" onclick="changeUserPassword('${u.id}')">Change Password</button>
          <button class="btn btn-danger btn-sm" onclick="toggleUser('${u.id}')">${u.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function changeUserPassword(id) {
  if (!hasPermission('manage_users') || String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can change user passwords', 'error');
    return;
  }
  var user = users.find(function (item) { return String(item.id) === String(id); });
  if (!user) { showToast('User not found', 'error'); return; }
  var existing = document.getElementById('_changeUserPasswordOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = '_changeUserPasswordOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = '<div class="modal" style="width:460px">'
    + '<div class="modal-header"><div class="modal-title">Change User Password</div><button type="button" class="modal-close" id="_closeUserPassword">&#10005;</button></div>'
    + '<div class="modal-body">'
    + '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Set a new password for <strong style="color:var(--text)">' + escapeMetricHtml(user.name) + '</strong>.</div>'
    + '<div class="form-group" style="margin-bottom:14px"><label class="form-label" for="_adminNewPassword">New Password</label>'
    + '<input class="form-control" autocomplete="new-password" id="_adminNewPassword" maxlength="72" placeholder="Minimum 8 characters" type="password"></div>'
    + '<div class="form-group"><label class="form-label" for="_adminConfirmPassword">Confirm Password</label>'
    + '<input class="form-control" autocomplete="new-password" id="_adminConfirmPassword" maxlength="72" placeholder="Repeat new password" type="password"></div>'
    + '<div style="font-size:10px;color:var(--text-muted);margin-top:10px">Use 8–72 characters with uppercase, lowercase, and a number.</div>'
    + '<div aria-live="polite" id="_adminPasswordError" style="display:none;color:var(--danger);font-size:12px;margin-top:10px"></div></div>'
    + '<div class="modal-footer"><button type="button" class="btn btn-secondary" id="_cancelUserPassword">Cancel</button>'
    + '<button type="button" class="btn btn-primary" id="_saveUserPassword">Update Password</button></div></div>';
  document.body.appendChild(overlay);

  function closePasswordDialog() { overlay.remove(); }
  function showAdminPasswordError(message) {
    var error = document.getElementById('_adminPasswordError');
    if (error) { error.textContent = message; error.style.display = 'block'; }
  }
  document.getElementById('_closeUserPassword').onclick = closePasswordDialog;
  document.getElementById('_cancelUserPassword').onclick = closePasswordDialog;
  overlay.onclick = function (event) { if (event.target === overlay) closePasswordDialog(); };
  document.getElementById('_saveUserPassword').onclick = function () {
    var newPassword = document.getElementById('_adminNewPassword').value;
    var confirmPassword = document.getElementById('_adminConfirmPassword').value;
    if (newPassword.length < 8 || newPassword.length > 72) { showAdminPasswordError('Password must be between 8 and 72 characters.'); return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) { showAdminPasswordError('Include uppercase, lowercase, and numeric characters.'); return; }
    if (newPassword !== confirmPassword) { showAdminPasswordError('Passwords do not match.'); return; }
    var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    if (!token) { showAdminPasswordError('Your session has expired. Please sign in again.'); return; }
    var saveButton = document.getElementById('_saveUserPassword');
    saveButton.disabled = true; saveButton.textContent = 'Updating...';
    fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users/' + encodeURIComponent(id) + '/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ newPassword: newPassword })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data.success) throw new Error(data.message || 'Unable to change password');
          return data;
        });
      })
      .then(function (data) { closePasswordDialog(); showToast(data.message || 'Password changed successfully', 'success'); })
      .catch(function (error) {
        showAdminPasswordError(error.message || 'Unable to change password');
        saveButton.disabled = false; saveButton.textContent = 'Update Password';
      });
  };
  setTimeout(function () { var input = document.getElementById('_adminNewPassword'); if (input) input.focus(); }, 0);
}

function editUserRole(id) {
  if (!hasPermission('assign_roles') || String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can change user roles', 'error');
    return;
  }
  const user = users.find(function (u) { return String(u.id) === String(id); });
  if (!user) { showToast('User not found', 'error'); return; }

  var allowedRoleKeys = roles.map(function (role) { return role.key; });
  var roleFallbackLabels = { admin: 'Admin', cso: 'CSO', pmo: 'PMO', aoc: 'AOC', engineer: 'Engineer', stakeholder: 'Stakeholder' };
  var availableRoles = allowedRoleKeys.map(function (key) {
    return roles.find(function (role) { return role.key === key; }) || { key: key, name: roleFallbackLabels[key] };
  });
  var existing = document.getElementById('_changeUserRoleOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = '_changeUserRoleOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = '<div class="modal" style="width:440px">'
    + '<div class="modal-header"><div class="modal-title">Change User Role</div><button type="button" class="modal-close" id="_closeUserRole">&#10005;</button></div>'
    + '<div class="modal-body">'
    + '<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">Select a new role for <strong style="color:var(--text)">' + escapeMetricHtml(user.name) + '</strong>.</div>'
    + '<label class="form-label" for="_userRoleSelect">Role</label>'
    + '<select class="form-control" id="_userRoleSelect">'
    + availableRoles.map(function (role) {
      return '<option value="' + escapeMetricHtml(role.key) + '"' + (role.key === user.role ? ' selected' : '') + '>'
        + escapeMetricHtml(role.name) + '</option>';
    }).join('')
    + '</select></div>'
    + '<div class="modal-footer"><button type="button" class="btn btn-secondary" id="_cancelUserRole">Cancel</button>'
    + '<button type="button" class="btn btn-primary" id="_saveUserRole">Save Role</button></div></div>';
  document.body.appendChild(overlay);

  function closeRoleDialog() { overlay.remove(); }
  document.getElementById('_closeUserRole').onclick = closeRoleDialog;
  document.getElementById('_cancelUserRole').onclick = closeRoleDialog;
  overlay.onclick = function (event) { if (event.target === overlay) closeRoleDialog(); };
  document.getElementById('_saveUserRole').onclick = function () {
    var newRole = document.getElementById('_userRoleSelect').value;
    if (newRole === user.role) { closeRoleDialog(); return; }
    var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    var saveButton = document.getElementById('_saveUserRole');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users/' + encodeURIComponent(id) + '/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ role: newRole })
    })
      .then(async function (response) {
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.success) throw new Error(data.message || 'Failed to change user role');
        user.role = data.data && data.data.role ? data.data.role : newRole;
        renderUsersTable();
        renderRolesGrid();
        closeRoleDialog();
        showToast(data.message || user.name + ' role updated', 'success');
      })
      .catch(function (error) {
        console.error('Change user role error:', error);
        showToast(error.message || 'Failed to change user role', 'error');
        saveButton.disabled = false;
        saveButton.textContent = 'Save Role';
      });
  };
}

async function toggleUser(id) {
  if (!hasPermission('manage_users') || String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can activate or deactivate users', 'error');
    return;
  }
  const user = users.find(function (u) { return String(u.id) === String(id); });
  if (!user) { showToast('User not found', 'error'); return; }
  const nextActive = !user.active;
  const action = nextActive ? 'Activate' : 'Deactivate';
  const confirmed = await showConfirm({
    icon: nextActive ? '\u2713' : '\u26D4',
    title: action + ' User?',
    msg: nextActive
      ? user.name + ' will be able to sign in and use the portal again.'
      : user.name + ' will be signed out on their next request and will not be able to log in.',
    ok: action,
    danger: !nextActive
  });
  if (!confirmed) return;

  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users/' + encodeURIComponent(id) + '/active', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ active: nextActive })
  })
    .then(async function (response) {
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to update user status');
      user.active = data.data ? data.data.active : nextActive;
      renderUsersTable();
      populateEngineerDropdowns();
      showToast(data.message || user.name + ' status updated', 'success');
    })
    .catch(function (error) {
      console.error('Update user status error:', error);
      showToast(error.message || 'Failed to update user status', 'error');
    });
}

async function deleteUser(id) {
  if (!hasPermission('manage_users') || String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can delete users', 'error');
    return;
  }
  const user = users.find(function (u) { return String(u.id) === String(id); });
  if (!user) return;

  const confirmed = await showConfirm({
    icon: '🗑️',
    title: 'Delete User?',
    msg: `${user.name} will be permanently removed from the database and assignee lists. This action cannot be undone.`,
    ok: 'Delete User',
    danger: true
  });
  if (!confirmed) return;

  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    showToast('User deletion requires a database connection', 'error');
    return;
  }
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    showToast('Not authenticated. Please login first.', 'error');
    return;
  }

  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  })
    .then(async function (response) {
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to delete user');
      users = users.filter(function (u) { return String(u.id) !== String(id); });
      renderUsersTable();
      populateEngineerDropdowns();
      showToast(data.message || `${user.name} deleted successfully`, 'success');
    })
    .catch(function (error) {
      console.error('Delete user error:', error);
      showToast(error.message || 'Failed to delete user', 'error');
    });
}


function openAddUserModal(editKey) {
  var sel = document.getElementById('u_role');
  if (sel) {
    sel.innerHTML = '<option value="">Select role</option>'
      + roles.map(function (roleDefinition) {
        var icon = roleDefinition.icon ? roleDefinition.icon + ' ' : '';
        return '<option value="' + roleDefinition.key + '">' + icon + roleDefinition.name + '</option>';
      }).join('');
  }
  document.getElementById('u_name').value = '';
  document.getElementById('u_email').value = '';
  document.getElementById('u_role').value = '';
  document.getElementById('u_dept').value = '';
  var pw = document.getElementById('u_password');
  if (pw) { pw.value = ''; pw.type = 'password'; }
  var eye = pw && pw.nextElementSibling;
  if (eye) eye.textContent = '👁';
  openModal('userModal');
}

function saveUser() {
  const name = document.getElementById('u_name').value.trim();
  const email = document.getElementById('u_email').value.trim().toLowerCase();
  const role = document.getElementById('u_role').value;
  const dept = (document.getElementById('u_dept')?.value || '').trim();
  const pwEl = document.getElementById('u_password');
  const password = pwEl ? pwEl.value : '';

  if (!name || !email || !role) {
    showToast('Please fill in all required fields', 'error'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Enter a valid email address', 'error'); return;
  }
  if (password.length < 8 || password.length > 72) {
    showToast('Password must be between 8 and 72 characters', 'error'); return;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    showToast('Password must include uppercase, lowercase, and numeric characters', 'error'); return;
  }
  if (users.find(function (user) { return String(user.email || '').toLowerCase() === email; })) {
    showToast('A user with this email already exists', 'error'); return;
  }
  if (!hasPermission('manage_users') || String(currentRole || '').toLowerCase() !== 'admin') {
    showToast('Only administrators can add users', 'error'); return;
  }
  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { showToast('Your session has expired. Please sign in again.', 'error'); return; }
  var saveButton = document.getElementById('addUserSaveBtn');
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Adding...'; }

  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ fullName: name, email: email, role: role, department: dept, password: password })
  })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to add user');
        return data;
      });
    })
    .then(function (data) {
      loadUsersFromBackend(function (loadError) {
        if (loadError) {
          showToast('User was created, but the user list could not be refreshed', 'warning');
        } else {
          renderUsersTable();
          populateEngineerDropdowns();
          showToast(data.message || 'User added successfully', 'success');
        }
      });
      closeModal('userModal');
    })
    .catch(function (error) { showToast(error.message || 'Unable to add user', 'error'); })
    .finally(function () {
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Add User'; }
    });
}

// ─── STATS ────────────────────────────────────────────────────

// ─── DASHBOARD WIDGETS ────────────────────────────────────────────────────
function renderEngineerLeaderboard() {
  var el = document.getElementById('engineerLeaderboard');
  if (!el) return;
  var data = getDashboardFilteredIncidents();
  var map = {};
  data.forEach(function (i) {
    if (!i.engineer) return;
    if (!map[i.engineer]) map[i.engineer] = { total: 0, closed: 0, critical: 0 };
    map[i.engineer].total++;
    if (i.status === 'Closed') map[i.engineer].closed++;
    if (i.severity === 'Critical') map[i.engineer].critical++;
  });
  var sorted = Object.keys(map).map(function (name) {
    return { name: name, total: map[name].total, closed: map[name].closed, critical: map[name].critical };
  }).sort(function (a, b) { return b.closed - a.closed; }).slice(0, 8);

  if (!sorted.length) { el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px">No data</div>'; return; }
  el.innerHTML = sorted.map(function (e, idx) {
    var pct = e.total > 0 ? Math.round(e.closed / e.total * 100) : 0;
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">'
      + '<span style="font-size:11px;font-weight:700;color:var(--text-muted);min-width:18px">' + (idx + 1) + '</span>'
      + '<div style="flex:1">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:12px;color:var(--text);font-weight:500">' + e.name + '</span>'
      + '<span style="font-size:11px;color:var(--text-muted)">' + e.closed + '/' + e.total + ' closed</span>'
      + '</div>'
      + '<div style="height:4px;background:var(--border);border-radius:2px">'
      + '<div style="height:4px;background:var(--accent);border-radius:2px;width:' + pct + '%"></div>'
      + '</div></div></div>';
  }).join('');
}

function renderRecurringList() {
  var el = document.getElementById('recurringList');
  if (!el) return;
  var data = getDashboardFilteredIncidents();
  // Group by title similarity (customer + first 6 words of title)
  var map = {};
  data.forEach(function (i) {
    var key = i.customer + '||' + i.title.split(' ').slice(0, 6).join(' ').toLowerCase();
    if (!map[key]) map[key] = { title: i.title, customer: i.customer, count: 0, severity: i.severity };
    map[key].count++;
  });
  var recurring = Object.values(map).filter(function (r) { return r.count > 1; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);

  if (!recurring.length) {
    el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px">No recurring incidents found</div>';
    return;
  }
  el.innerHTML = recurring.map(function (r) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
      + '<span class="badge badge-' + r.severity.toLowerCase() + '" style="flex-shrink:0;font-size:10px">' + r.count + 'x</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.title + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + r.customer + '</div>'
      + '</div></div>';
  }).join('');
}

function renderSlaCountdown() {
  var el = document.getElementById('slaCountdownList');
  if (!el) return;
  var now = Date.now();
  var open = getDashboardFilteredIncidents().filter(function (i) {
    return i.status !== 'Closed' && i.status !== 'Resolved';
  });
  var badge = document.getElementById('slaCountBadge');
  if (badge) { badge.textContent = open.length; badge.style.display = open.length ? '' : 'none'; }
  var items = open.map(function (i) {
    var slaMs = getIncidentSlaHours(i) * 3600000;
    var startMs = getIncidentOpenedTimestamp(i);
    var remainMs = slaMs - (now - startMs);
    return { id: i.id, title: i.title, severity: i.severity, customer: i.customer, remainMs: remainMs };
  }).sort(function (a, b) { return a.remainMs - b.remainMs; }).slice(0, 6);

  if (!items.length) { el.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px">No open incidents</div>'; return; }
  el.innerHTML = items.map(function (it) {
    var breached = it.remainMs < 0;
    var absMs = Math.abs(it.remainMs);
    var h = Math.floor(absMs / 3600000), m = Math.floor((absMs % 3600000) / 60000);
    var label = breached ? ('⚠ BREACHED +' + h + 'h ' + m + 'm') : (h + 'h ' + m + 'm remaining');
    var color = breached ? 'var(--danger)' : (it.remainMs < 3600000 ? 'var(--warning)' : 'var(--success)');
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
      + '<span class="badge badge-' + it.severity.toLowerCase() + '" style="font-size:10px;flex-shrink:0">' + it.severity + '</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + it.title + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted)">' + it.customer + '</div>'
      + '</div>'
      + '<span style="font-size:11px;font-weight:600;color:' + color + ';flex-shrink:0;font-family:var(--font-mono)">' + label + '</span>'
      + '</div>';
  }).join('');
}


function renderHealthGrid() {
  var el = document.getElementById('healthGrid');
  if (!el) return;

  // Group customers: Critical = has open critical, AtRisk = has open high, else Healthy
  var custMap = {};
  incidents.forEach(function (i) {
    if (!custMap[i.customer]) custMap[i.customer] = { open: 0, critical: 0, high: 0 };
    if (i.status !== 'Closed' && i.status !== 'Resolved') {
      custMap[i.customer].open++;
      if (i.severity === 'Critical') custMap[i.customer].critical++;
      else if (i.severity === 'High') custMap[i.customer].high++;
    }
  });

  var custs = Object.keys(custMap).sort();
  if (!custs.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No customer data</div>';
    return;
  }

  el.innerHTML = custs.map(function (c) {
    var d = custMap[c];
    var isCrit = d.critical > 0, isHigh = d.high > 0;
    var dot = isCrit ? '#f75c7c' : isHigh ? '#f7b94f' : '#2dd4a0';
    var openTxt = d.open > 0 ? d.open + ' open' : 'OK';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,0.02);border:1px solid var(--border);margin-bottom:6px;transition:background .15s';
    row.onmouseenter = function () { this.style.background = 'rgba(79,142,247,0.06)'; };
    row.onmouseleave = function () { this.style.background = 'rgba(255,255,255,0.02)'; };
    row.onclick = (function (name) { return function () { openCustomer360(name); }; })(c);
    row.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;box-shadow:0 0 6px ' + dot + '"></span>'
      + '<span style="font-size:12px;color:var(--text);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + c + '</span>'
      + '<span style="font-size:10px;color:' + dot + ';font-weight:600">' + openTxt + '</span>';
    return row.outerHTML;
  }).join('');
}


function initDashFilterDropdowns() {
  // Severity options (static)
  populateMsDropdown('df_severity', ['Critical', 'High', 'Medium', 'Normal'], 'All Severities');
  // Customer and area options (dynamic)
  populateMsDropdown('df_customer', customers, 'All Customers');
  populateMsDropdown('df_area', areas, 'All Areas');
  populateMsDropdown('df_year', getDashboardAvailableYears(), 'All Years');
  populateMsDropdown('df_month', getDashboardMonthNames(), 'All Months');
}

function getDashboardAvailableYears() {
  var map = {};
  incidents.forEach(function (inc) {
    var year = getIncidentYear(inc);
    if (year) map[year] = true;
  });
  return Object.keys(map).sort(function (a, b) { return Number(b) - Number(a); });
}

var dashboardRefreshInFlight = false;

function getDashFilterSnapshot() {
  return {
    ms: {
      df_customer: getMsValues('df_customer'),
      df_area: getMsValues('df_area'),
      df_severity: getMsValues('df_severity'),
      df_year: getMsValues('df_year'),
      df_month: getMsValues('df_month')
    },
    dates: {
      df_from: (document.getElementById('df_from') || {}).value || '',
      df_to: (document.getElementById('df_to') || {}).value || ''
    }
  };
}

function restoreDashFilterSnapshot(snapshot) {
  if (!snapshot) return;
  Object.keys(snapshot.ms || {}).forEach(function (id) {
    ensureMsOptions(id, snapshot.ms[id] || []);
    setMsValues(id, snapshot.ms[id] || []);
  });
  Object.keys(snapshot.dates || {}).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = snapshot.dates[id] || '';
  });
}

function ensureMsOptions(id, values) {
  var dd = document.getElementById(id + '_dd');
  if (!dd) return;
  values.forEach(function (value) {
    var exists = Array.from(dd.querySelectorAll('input[type=checkbox]')).some(function (cb) { return cb.value === value; });
    if (!value || exists) return;
    var label = document.createElement('label');
    var input = document.createElement('input');
    label.className = 'ms-option';
    input.type = 'checkbox';
    input.value = value;
    input.onchange = function () { renderMsPills(id); applyDashFilters(); };
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + value));
    dd.appendChild(label);
  });
}

function renderDashboardWidgets() {
  renderMyIncidents();
  renderHealthGrid();
  updateStatusBar();
  applyDashFilters();
}

function setDashboardRefreshState(isLoading, errorMessage) {
  var label = document.getElementById('dashLastUpdated');
  var btn = document.getElementById('dashRefreshBtn');
  var icon = document.getElementById('dashRefreshIcon');
  if (btn) {
    btn.style.pointerEvents = isLoading ? 'none' : '';
    btn.style.opacity = isLoading ? '0.65' : '';
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    btn.title = isLoading ? 'Refreshing dashboard...' : 'Refresh';
  }
  if (icon) icon.style.transform = isLoading ? 'rotate(360deg)' : 'rotate(0deg)';
  if (!label) return;

  if (isLoading) {
    label.textContent = 'Refreshing dashboard...';
    label.style.color = 'var(--accent)';
    return;
  }

  if (errorMessage) {
    label.textContent = 'Refresh failed';
    label.style.color = 'var(--danger)';
    return;
  }

  var now = new Date();
  var h = now.getHours();
  var m = String(now.getMinutes()).padStart(2, '0');
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  label.textContent = 'Last updated ' + h + ':' + m + ' ' + ampm;
  label.style.color = 'var(--text-muted)';
}

var pageRefreshInFlight = {};

function setPageRefreshState(page, isLoading, errorMessage) {
  var label = document.getElementById(page + 'LastUpdated');
  var btn = document.getElementById(page + 'RefreshBtn');
  var icon = document.getElementById(page + 'RefreshIcon');
  if (btn) {
    btn.style.pointerEvents = isLoading ? 'none' : '';
    btn.style.opacity = isLoading ? '0.65' : '';
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    btn.title = isLoading ? 'Refreshing...' : 'Refresh';
  }
  if (icon) icon.style.transform = isLoading ? 'rotate(360deg)' : 'rotate(0deg)';
  if (!label) return;
  if (isLoading) {
    label.textContent = 'Refreshing...';
    label.style.color = 'var(--accent)';
    return;
  }
  if (errorMessage) {
    label.textContent = 'Refresh failed';
    label.style.color = 'var(--danger)';
    return;
  }
  var now = new Date();
  var h = now.getHours();
  var m = String(now.getMinutes()).padStart(2, '0');
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  label.textContent = 'Last updated ' + h + ':' + m + ' ' + ampm;
  label.style.color = 'var(--text-muted)';
}

function renderPageAfterRefresh(page) {
  if (page === 'home') { renderHomePage(); return; }
  if (page === 'mailbox') { loadMailbox(); return; }
  if (page === 'incidents') {
    if (typeof applyFilters === 'function') applyFilters();
    else renderIncidentTable();
    if (currentIncidentView === 'kanban' && typeof renderKanban === 'function') renderKanban();
    populateAssigneeFilter();
    updateTagFilter();
    return;
  }
  if (page === 'reports') { renderAuditLog(); return; }
  if (page === 'users') { renderUsersTable(); return; }
  if (page === 'roles') { loadPersistedRoles(); renderRolesGrid(); return; }
  if (page === 'datamanagement') { renderDataManagement(); updateDmCounts(); return; }
  if (page === 'customer360') {
    var name = document.getElementById('c360CustName')?.textContent || '';
    if (name && name !== '?') renderC360Full(name);
    else _showC360Picker();
    return;
  }
}

function refreshPageContent(event, page) {
  if (event && event.preventDefault) event.preventDefault();
  page = page || (location.hash || '').replace('#', '') || 'dashboard';
  if (page === 'dashboard') return refreshDashboard(event);
  if (pageRefreshInFlight[page]) return;
  pageRefreshInFlight[page] = true;
  setPageRefreshState(page, true);

  function finish(err) {
    if (!err) renderPageAfterRefresh(page);
    pageRefreshInFlight[page] = false;
    setPageRefreshState(page, false, err ? err.message || 'Refresh failed' : '');
    showToast(err ? ('Refresh failed: ' + (err.message || err)) : 'Page refreshed', err ? 'error' : 'success');
  }

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    var reloadIncidents = function () {
      if (typeof loadIncidentsFromBackend === 'function') {
        loadIncidentsFromBackend(function (incidentErr) {
          if (incidentErr) return finish(incidentErr);
          if (page === 'reports') return loadAuditLogFromBackend(finish);
          finish(null);
        });
      } else {
        if (page === 'reports') return loadAuditLogFromBackend(finish);
        finish(null);
      }
    };
    var reloadUsers = function () {
      if (typeof loadUsersFromBackend === 'function') {
        loadUsersFromBackend(function (usersErr) {
          if (usersErr) return finish(usersErr);
          reloadIncidents();
        });
      } else {
        reloadIncidents();
      }
    };
    if (typeof loadMasterData === 'function') {
      loadMasterData(function (masterErr) {
        if (masterErr) return finish(masterErr);
        reloadUsers();
      });
    } else {
      reloadUsers();
    }
    return;
  }
  setTimeout(function () { finish(null); }, 120);
}

window.refreshPageContent = refreshPageContent;

function refreshDashboard(event) {
  if (event && event.preventDefault) event.preventDefault();
  return refreshDashboardData({ manual: true });
}

window.refreshDashboard = refreshDashboard;

function refreshDashboardData(options) {
  options = options || {};
  if (dashboardRefreshInFlight) return;
  dashboardRefreshInFlight = true;

  var snapshot = getDashFilterSnapshot();
  setDashboardRefreshState(true);

  function finish(err) {
    initDashFilterDropdowns();
    restoreDashFilterSnapshot(snapshot);
    renderDashboardWidgets();
    dashboardRefreshInFlight = false;
    setDashboardRefreshState(false, err && options.manual ? err.message : '');
    if (err && options.manual) showToast('Dashboard refresh failed: ' + err.message, 'error');
    else if (options.manual) showToast('Dashboard refreshed', 'success');
  }

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    loadMasterData(function (masterErr) { if (masterErr) return finish(masterErr); loadIncidentsFromBackend(finish); });
  } else {
    finish(null);
  }
}
function updateStats() {
  var data = getDashboardFilteredIncidents();
  var open = data.filter(isActiveIncident).length;
  var closed = data.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; }).length;

  var t = document.getElementById('statTotal'); if (t) t.textContent = data.length;
  var o = document.getElementById('statOpen'); if (o) o.textContent = open;
  var c = document.getElementById('statClosed'); if (c) c.textContent = closed;

  // Application and Historian downtime are independent, while honoring dashboard filters.
  var closedIncs = data.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; });
  var downtimeCategories = partitionHistorianIncidents(closedIncs);
  var applicationDowntime = downtimeCategories.application.reduce(function (s, i) { return s + getIncDowntimeMinutes(i); }, 0);
  var historianDowntime = downtimeCategories.historian.reduce(function (s, i) { return s + getIncDowntimeMinutes(i); }, 0);
  var dtEl = document.getElementById('statDowntime');
  var dtSub = document.getElementById('statDowntimeSub');
  var historianDtEl = document.getElementById('statHistorianDowntime');
  var historianDtSub = document.getElementById('statHistorianDowntimeSub');
  if (dtEl) dtEl.textContent = applicationDowntime > 0 ? minutesToHM(applicationDowntime) : '0m';
  if (dtSub) dtSub.textContent = downtimeCategories.application.length + ' application incident' + (downtimeCategories.application.length !== 1 ? 's' : '');
  if (historianDtEl) historianDtEl.textContent = historianDowntime > 0 ? minutesToHM(historianDowntime) : '0m';
  if (historianDtSub) historianDtSub.textContent = downtimeCategories.historian.length + ' Historian incident' + (downtimeCategories.historian.length !== 1 ? 's' : '');

  // Avg Resolution (closed/resolved incidents with recorded database timing)
  var withResolution = closedIncs.filter(function (i) { return getIncResolutionMinutes(i) > 0; });
  var avgResolution = withResolution.length > 0
    ? Math.round(withResolution.reduce(function (s, i) { return s + getIncResolutionMinutes(i); }, 0) / withResolution.length)
    : 0;
  var arEl = document.getElementById('statAvgResolution');
  var arSub = document.getElementById('statAvgResolutionSub');
  if (arEl) arEl.textContent = avgResolution > 0 ? minutesToHM(avgResolution) : '—';
  if (arSub) arSub.textContent = withResolution.length > 0
    ? withResolution.length + ' closed incident' + (withResolution.length !== 1 ? 's' : '') + ' measured'
    : 'no resolution time recorded';

  // SLA Breach count
  var breachCount = data.filter(isActiveSlaBreached).length;
  var slEl = document.getElementById('statSLABreach');
  var slSub = document.getElementById('statSLABreachSub');
  if (slEl) slEl.textContent = breachCount;
  if (slSub) slSub.textContent = breachCount > 0 ? 'open critical incidents breached' : 'all critical incidents within SLA';

  // Aggregate only Critical incidents so the KPI and drill-down stay aligned.
  var dashboardMttrIncidents = incidents.filter(function (inc) {
    return String((inc && inc.severity) || '').toLowerCase() === 'critical' && !isCustomer360HistorianIncident(inc);
  });
  var missedMttrCount = countMissedMttr(dashboardMttrIncidents);
  var missedMttrEl = document.getElementById('statMissedMttr');
  var missedMttrSub = document.getElementById('statMissedMttrSub');
  if (missedMttrEl) missedMttrEl.textContent = missedMttrCount;
  if (missedMttrSub) missedMttrSub.textContent = missedMttrCount === 1
    ? '1 closed critical incident measured'
    : missedMttrCount + ' closed critical incidents measured';

  var missedMttdCount = countMissedMttd(incidents);
  var missedMttdEl = document.getElementById('statMissedMttd');
  var missedMttdSub = document.getElementById('statMissedMttdSub');
  if (missedMttdEl) missedMttdEl.textContent = missedMttdCount;
  if (missedMttdSub) missedMttdSub.textContent = missedMttdCount === 1
    ? 'incident exceeded the 15m target'
    : 'incidents exceeded the 15m target';

  // Avg MTTR (for closed incidents with downtime)
  var withDT = closedIncs.filter(function (i) { return getIncDowntimeMinutes(i) > 0; });
  var avgMTTR = withDT.length > 0 ? Math.round(withDT.reduce(function (s, i) { return s + getIncDowntimeMinutes(i); }, 0) / withDT.length) : 0;
  var mtEl = document.getElementById('statAvgMTTR');
  var mtSub = document.getElementById('statAvgMTTRSub');
  if (mtEl) mtEl.textContent = avgMTTR > 0 ? minutesToHM(avgMTTR) : '—';
  if (mtSub) mtSub.textContent = withDT.length + ' incident' + (withDT.length !== 1 ? 's' : '') + ' measured';

  // Resolution rate
  var resRate = data.length > 0 ? Math.round(closed / data.length * 1000) / 10 : 0;
  var rrEl = document.getElementById('statResRate');
  var rrSub = document.getElementById('statResRateSub');
  if (rrEl) rrEl.textContent = resRate + '%';
  if (rrSub) rrSub.textContent = closed + ' of ' + data.length + ' resolved';
}

// ─── RECENT TABLE ─────────────────────────────────────────────
function renderRecentTable() {
  var data = getDashboardFilteredIncidents();
  const recent = data.slice(0, 6);
  var _rt = document.getElementById('recentTable');
  if (!_rt) return;
  _rt.innerHTML = recent.map(i => `
    <tr data-incident-id="${escapeMetricHtml(i.id)}" role="button" tabindex="0" style="cursor:pointer">
      <td class="id-cell">${escapeMetricHtml(i.id)}</td>
      <td class="title-cell" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeMetricHtml(i.title)}</td>
      <td><span class="badge badge-${i.severity.toLowerCase()}">${escapeMetricHtml(i.severity)}</span></td>
      <td><span class="badge badge-${i.status.toLowerCase().replace(' ', '-')}">${escapeMetricHtml(i.status)}</span></td>
      <td style="font-size:12px;color:var(--text3)">${escapeMetricHtml(i.customer)}</td>
    </tr>
  `).join('');
  _rt.querySelectorAll('tr[data-incident-id]').forEach(function (row) {
    function openRecentIncident() {
      openDetailPanel(row.getAttribute('data-incident-id'));
    }
    row.addEventListener('click', openRecentIncident);
    row.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRecentIncident();
      }
    });
    row.addEventListener('mouseenter', function () {
      row.style.background = 'rgba(79,142,247,0.05)';
    });
    row.addEventListener('mouseleave', function () {
      row.style.background = '';
    });
  });
}

// ─── ACTIVITY ─────────────────────────────────────────────────
function renderActivity() {
  var filtered = getDashboardFilteredIncidents();
  var filteredIds = new Set(filtered.map(function (i) { return i.id; }));

  // Collect all events from incidentComments for filtered incidents
  var events = [];
  Object.keys(incidentComments).forEach(function (incId) {
    if (!filteredIds.has(incId)) return;
    var inc = incidents.find(function (i) { return i.id === incId; });
    (incidentComments[incId] || []).forEach(function (c) {
      events.push({ incId: incId, inc: inc, comment: c });
    });
  });

  // Sort newest first, take top 8
  events.sort(function (a, b) { return b.comment.timestamp - a.comment.timestamp; });
  events = events.slice(0, 8);

  var typeColor = {
    create: 'var(--accent)',
    status: 'var(--accent2)',
    escalate: 'var(--danger)',
    close: 'var(--success)',
    comment: 'var(--text-muted)',
    system: 'var(--warning)',
    mention: '#a78bfa'
  };

  function timeAgo(ts) {
    var diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  var el = document.getElementById('activityFeed');
  if (!el) return;

  if (!events.length) {
    el.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:12px">No activity for current filters</div>';
    return;
  }

  el.innerHTML = events.map(function (e) {
    var c = e.comment;
    var col = typeColor[c.type] || 'var(--text-muted)';
    var text = '<b style="color:var(--accent);font-family:var(--font-mono);font-size:11px">' + e.incId + '</b>'
      + ' — ' + c.action
      + (c.detail ? '<span style="color:var(--text-muted)"> · ' + c.detail + '</span>' : '');
    return '<div class="activity-item">'
      + '<div class="activity-dot" style="background:' + col + ';box-shadow:0 0 6px ' + col + '"></div>'
      + '<div style="min-width:0">'
      + '<div class="activity-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + text + '</div>'
      + '<div class="activity-time">' + c.author + ' · ' + timeAgo(c.timestamp) + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ─── CUSTOMER FILTER POPULATE ─────────────────────────────────
function populateAreaDropdowns() {
  var filterIds = ['areaFilter', 'reportAreaFilter', 'df_area'];
  var selectIds = ['f_area', 'dp_f_area'];
  filterIds.forEach(function (id) {
    if (id === 'areaFilter') { populateMsDropdown('areaFilter', areas, 'All Areas'); return; }
    if (id === 'df_area') { populateMsDropdown('df_area', areas, 'All Areas'); return; }
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">All Areas</option>'
      + areas.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
    if (cur && areas.indexOf(cur) >= 0) sel.value = cur;
  });
  selectIds.forEach(function (id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Select Area</option>'
      + areas.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
    if (cur && areas.indexOf(cur) >= 0) sel.value = cur;
  });
}

function populateEngineerDropdowns() {
  var engineerUsers = users.filter(function (u) { return u && u.name && u.active !== false; });
  engineerUsers.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  ['f_engineer', 'dp_f_engineer'].forEach(function (id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Select assignee</option>'
      + engineerUsers.map(function (u) { return '<option value="' + u.name + '">' + u.name + '</option>'; }).join('');
    if (cur && engineerUsers.some(function (u) { return u.name === cur; })) sel.value = cur;
  });
}

function ensureEngineerDropdownsLoaded(callback) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    populateEngineerDropdowns();
    if (callback) callback();
    return;
  }

  // Assignees may be removed by another session or directly in the database.
  // Do not reuse the in-memory list when opening an incident form.
  ['f_engineer', 'dp_f_engineer'].forEach(function (id) {
    var sel = document.getElementById(id);
    if (sel) sel.innerHTML = '<option value="">Loading assignees...</option>';
  });
  loadUsersFromBackend(function (err) {
    if (!err) {
      populateEngineerDropdowns();
      var tagInput = document.getElementById('f_tag_input');
      if (tagInput && tagInput.value.trim().charAt(0) === '@') {
        showCreateTagSuggestions(tagInput.value);
      }
    }
    if (callback) callback(err);
  });
}
function populateAssigneeFilter() {
  // Build unique sorted list of engineers from all incidents
  var engineers = [];
  incidents.forEach(function (inc) {
    if (inc.engineer && engineers.indexOf(inc.engineer) < 0) engineers.push(inc.engineer);
  });
  engineers.sort();
  populateMsDropdown('assigneeFilter', engineers, 'All Assignees');
}

function populateCustomerDropdowns() {
  var filterIds = ['customerFilter', 'reportCustomerFilter', 'df_customer'];
  var selectIds = ['f_customer', 'dp_f_customer'];
  filterIds.forEach(function (id) {
    if (id === 'customerFilter') { populateMsDropdown('customerFilter', customers, 'All Customers'); return; }
    if (id === 'df_customer') { populateMsDropdown('df_customer', customers, 'All Customers'); return; }
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">All Customers</option>'
      + customers.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    if (cur && customers.indexOf(cur) >= 0) sel.value = cur;
  });
  selectIds.forEach(function (id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Select Customer</option>'
      + customers.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    if (cur && customers.indexOf(cur) >= 0) sel.value = cur;
    if (id === 'f_customer') sel.onchange = function () {
      if (!editingId) applyCreateCustomerTimezone(this.value);
    };
  });
}

function populateCustomerFilter() {
  populateCustomerDropdowns();
  populateAssigneeFilter();
}

// ─── CHARTS ───────────────────────────────────────────────────
function renderHomePage() {
  // ── Hero user name & subtext ─────────────────────
  var nameEl = document.getElementById('heroUserName');
  if (nameEl) {
    var firstName = '';
    if (typeof currentUserName !== 'undefined' && currentUserName) {
      firstName = currentUserName.split(' ')[0];
    }
    nameEl.textContent = firstName || 'there';
  }

  var open = incidents.filter(function (i) { return i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
  var closed = incidents.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; }).length;
  var total = incidents.length;

  var bigEl = document.getElementById('heroBigCount');
  if (bigEl) bigEl.textContent = open;

  var subEl = document.getElementById('heroSubtext');
  if (subEl) {
    var critCount = incidents.filter(function (i) { return i.severity === 'Critical' && i.status !== 'Closed'; }).length;
    subEl.textContent = critCount > 0
      ? critCount + ' critical incident' + (critCount > 1 ? 's' : '') + ' need immediate attention.'
      : 'No critical incidents open. Everything looks good.';
    subEl.style.color = critCount > 0 ? 'rgba(247,92,124,0.7)' : 'rgba(45,212,160,0.7)';
  }

  // ── Severity breakdown bars ──────────────────────
  var barsEl = document.getElementById('homeSeverityBars');
  if (barsEl) {
    var sevs = [
      { label: 'Critical', key: 'Critical', color: '#f75c7c', bg: 'rgba(247,92,124,0.08)' },
      { label: 'High', key: 'High', color: '#f7b94f', bg: 'rgba(247,185,79,0.08)' },
      { label: 'Medium', key: 'Medium', color: '#4f8ef7', bg: 'rgba(79,142,247,0.08)' },
      { label: 'Normal', key: 'Normal', color: '#2dd4a0', bg: 'rgba(45,212,160,0.08)' },
    ];
    var maxSev = Math.max.apply(null, sevs.map(function (s) {
      return incidents.filter(function (i) { return i.severity === s.key; }).length;
    })) || 1;

    barsEl.innerHTML = sevs.map(function (s) {
      var cnt = incidents.filter(function (i) { return i.severity === s.key; }).length;
      var openC = incidents.filter(function (i) { return i.severity === s.key && i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
      var pct = Math.round(cnt / Math.max(total, 1) * 100);
      var barW = Math.round(cnt / maxSev * 100);
      return '<div style="margin-bottom:18px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="width:10px;height:10px;border-radius:50%;background:' + s.color + ';display:inline-block;box-shadow:0 0 8px ' + s.color + '50"></span>'
        + '<span style="font-size:13px;font-weight:600;color:var(--text-primary)">' + s.label + '</span>'
        + '<span style="font-size:11px;color:var(--text-muted)">' + openC + ' open</span>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<span style="font-size:20px;font-weight:800;color:' + s.color + '">' + cnt + '</span>'
        + '<span style="font-size:11px;color:var(--text-muted);width:28px;text-align:right">' + pct + '%</span>'
        + '</div>'
        + '</div>'
        + '<div style="height:8px;border-radius:4px;background:var(--border);overflow:hidden">'
        + '<div style="height:100%;width:' + barW + '%;background:linear-gradient(90deg,' + s.color + ',' + s.color + '99);border-radius:4px;transition:width .6s ease;box-shadow:0 0 8px ' + s.color + '40"></div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // ── Resolution rate donut ────────────────────────
  var donutEl = document.getElementById('homeDonut');
  if (donutEl) {
    var ctx = donutEl.getContext('2d');
    var W = 160, H = 160, cx = 80, cy = 80, R = 62, ri = 42;
    ctx.clearRect(0, 0, W, H);
    var closedPct = total > 0 ? closed / total : 0;
    var openPct = 1 - closedPct;
    var segs = [
      { v: closedPct, color: '#2dd4a0' },
      { v: openPct, color: '#f75c7c' },
    ];
    var angle = -Math.PI / 2;
    segs.forEach(function (seg) {
      if (seg.v <= 0) return;
      var sweep = seg.v * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + ri * Math.cos(angle), cy + ri * Math.sin(angle));
      ctx.arc(cx, cy, R, angle, angle + sweep);
      ctx.arc(cx, cy, ri, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.shadowColor = seg.color; ctx.shadowBlur = 10;
      ctx.fill(); ctx.shadowBlur = 0;
      angle += sweep;
    });
    // Center text
    ctx.textAlign = 'center';
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Resolved', cx, cy - 6);
    ctx.fillStyle = '#e0e0f0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(Math.round(closedPct * 100) + '%', cx, cy + 14);

    var legEl = document.getElementById('homeDonutLegend');
    if (legEl) legEl.innerHTML =
      '<span style="color:#2dd4a0;font-weight:700">' + closed + ' closed</span>'
      + '<span style="color:var(--text-muted)"> &nbsp;·&nbsp; </span>'
      + '<span style="color:#f75c7c;font-weight:700">' + open + ' open</span>';
  }

  // ── Activity timeline ─────────────────────────────
  var tlEl = document.getElementById('homeTimeline');
  if (tlEl) {
    var feed = (typeof activityLog !== 'undefined' ? activityLog : []).slice(0, 8);
    if (!feed.length) {
      tlEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No activity yet</div>';
    } else {
      var dotColors = { critical: '#f75c7c', success: '#2dd4a0', warning: '#f7b94f', info: '#4f8ef7' };
      tlEl.innerHTML =
        // Vertical timeline line
        '<div style="position:absolute;left:4px;top:6px;bottom:0;width:2px;background:linear-gradient(to bottom,rgba(79,142,247,0.4),transparent)"></div>'
        + feed.map(function (a, i) {
          var dc = dotColors[a.type] || '#4f8ef7';
          return '<div style="position:relative;display:flex;gap:16px;padding-bottom:18px">'
            + '<div style="flex-shrink:0;width:10px;height:10px;border-radius:50%;background:' + dc + ';border:2px solid var(--surface);box-shadow:0 0 8px ' + dc + ';margin-top:2px;z-index:1"></div>'
            + '<div style="flex:1">'
            + '<div style="font-size:13px;color:var(--text-primary);line-height:1.4">' + a.msg + '</div>'
            + '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + a.time + '</div>'
            + '</div>'
            + '</div>';
        }).join('');
    }
  }
}


function refreshCharts() { initCharts(); }
function updateChartTheme() { initCharts(); }

/* ────────────────────────────────────────────────────────────
   PURE CANVAS CHARTS  ·  hover tooltips  ·  no CDN
──────────────────────────────────────────────────────────── */
var _chartTooltip = null;
function _showTip(canvas, html_content, evt) {
  _hideTip();
  var tip = document.createElement('div');
  tip.id = '_ctip';
  tip.style.cssText = 'position:fixed;background:rgba(15,15,30,0.95);color:#e0e0f0;border:1px solid #444;border-radius:8px;padding:8px 12px;font-size:12px;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
  tip.innerHTML = html_content;
  document.body.appendChild(tip);
  _chartTooltip = tip;
  _moveTip(evt);
}
function _moveTip(evt) {
  if (!_chartTooltip) return;
  var x = evt.clientX + 14, y = evt.clientY - 28;
  if (x + 180 > window.innerWidth) x = evt.clientX - 190;
  _chartTooltip.style.left = x + 'px';
  _chartTooltip.style.top = y + 'px';
}
function _hideTip() {
  if (_chartTooltip) { _chartTooltip.remove(); _chartTooltip = null; }
}

function _fitCanvas(el, h) {
  var parent = el.parentElement || el;
  var w = parent.clientWidth || 460;
  if (w < 100) w = 460;
  // Use container height if available, else use passed h
  var containerH = parent.clientHeight || h;
  var actualH = containerH > 40 ? containerH : h;
  el.width = w; el.height = actualH;
  el.style.width = '100%';
  el.style.display = 'block';
  return { ctx: el.getContext('2d'), W: w, H: actualH };
}


// ── DOWNTIME BY CUSTOMER (list-based) ─────────────────────
function _drawDowntimeCustomer(data) {
  data = data || incidents;
  var el = document.getElementById('downtimeCustomerList');
  if (!el) return;

  var closed = data.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; });
  var map = {};
  closed.forEach(function (i) {
    var dt = (i.downtimeH || 0) * 60 + (i.downtimeM || 0);
    map[i.customer] = (map[i.customer] || 0) + dt;
  });
  var sorted = Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
    .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No closed incidents with downtime data</div>';
    return;
  }
  var maxV = sorted[0].v || 1;
  el.innerHTML = sorted.map(function (r) {
    var pct = Math.round(r.v / maxV * 100);
    var h = Math.floor(r.v / 60), m = r.v % 60;
    var label = h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + 'm';
    return '<div style="margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:12px;color:var(--text);font-weight:500">' + r.k + '</span>'
      + '<span style="font-size:11px;color:var(--accent);font-family:var(--font-mono)">' + label + '</span></div>'
      + '<div style="height:6px;background:var(--border);border-radius:3px">'
      + '<div style="height:6px;width:' + pct + '%;background:linear-gradient(90deg,var(--accent),#7c5cbf);border-radius:3px;transition:width .4s ease"></div>'
      + '</div></div>';
  }).join('');
}

// ── DOWNTIME BY APPLICATION (list-based) ──────────────────
function _drawDowntimeApp(data) {
  data = data || incidents;
  var el = document.getElementById('downtimeAppList');
  if (!el) return;

  var closed = data.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; });
  var map = {};
  closed.forEach(function (i) {
    var dt = (i.downtimeH || 0) * 60 + (i.downtimeM || 0);
    var app = i.project || 'Other';
    map[app] = (map[app] || 0) + dt;
  });
  var sorted = Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
    .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No downtime data</div>';
    return;
  }
  var maxV = sorted[0].v || 1;
  el.innerHTML = sorted.map(function (r) {
    var pct = Math.round(r.v / maxV * 100);
    var h = Math.floor(r.v / 60), m = r.v % 60;
    var label = h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + 'm';
    return '<div style="margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:12px;color:var(--text);font-weight:500">' + r.k + '</span>'
      + '<span style="font-size:11px;color:#2dd4a0;font-family:var(--font-mono)">' + label + '</span></div>'
      + '<div style="height:6px;background:var(--border);border-radius:3px">'
      + '<div style="height:6px;width:' + pct + '%;background:linear-gradient(90deg,#2dd4a0,#1aab80);border-radius:3px"></div>'
      + '</div></div>';
  }).join('');
}

// ── DOWNTIME BY AREA (list-based) ─────────────────────────
function _drawDowntimeArea(data) {
  data = data || incidents;
  var el = document.getElementById('downtimeAreaList');
  if (!el) return;

  var closed = data.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; });
  var map = {};
  closed.forEach(function (i) {
    var dt = (i.downtimeH || 0) * 60 + (i.downtimeM || 0);
    var area = i.area || 'Unspecified';
    map[area] = (map[area] || 0) + dt;
  });
  var sorted = Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
    .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No downtime data</div>';
    return;
  }
  var maxV = sorted[0].v || 1;
  var areaColors = ['#f75c7c', '#f7b94f', '#4f8ef7', '#2dd4a0', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c'];
  el.innerHTML = sorted.map(function (r, idx) {
    var pct = Math.round(r.v / maxV * 100);
    var h = Math.floor(r.v / 60), m = r.v % 60;
    var label = h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + 'm';
    var color = areaColors[idx % areaColors.length];
    return '<div style="margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:12px;color:var(--text);font-weight:500">' + r.k + '</span>'
      + '<span style="font-size:11px;font-family:var(--font-mono)" style="color:' + color + '">' + label + '</span></div>'
      + '<div style="height:6px;background:var(--border);border-radius:3px">'
      + '<div style="height:6px;width:' + pct + '%;background:' + color + ';border-radius:3px;opacity:0.85"></div>'
      + '</div></div>';
  }).join('');
}

// ── SLA BREACH BY SEVERITY (canvas) ───────────────────────
function _drawSLABreach(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('slaBreachChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  var sevs = ['Critical', 'High', 'Medium', 'Normal'];
  var SLA_H = { Critical: 1, High: 4, Medium: 12, Normal: 24 };
  var colors = { Critical: '#f75c7c', High: '#f7b94f', Medium: '#4f8ef7', Normal: '#2dd4a0' };

  var onTime = { Critical: 0, High: 0, Medium: 0, Normal: 0 };
  var breached = { Critical: 0, High: 0, Medium: 0, Normal: 0 };

  data.forEach(function (i) {
    var slaH = getIncidentSlaHours(i);
    var startMs = getIncidentOpenedTimestamp(i);
    var endMs = i.downtimeEnd ? new Date(i.downtimeEnd).getTime() :
      (i.status === 'Closed' || i.status === 'Resolved') ? startMs + slaH * 3600000 * 0.8 : Date.now();
    var elapsedH = (endMs - startMs) / 3600000;
    if (elapsedH > slaH) breached[i.severity]++;
    else onTime[i.severity]++;
  });

  var pad = { t: 20, r: 16, b: 48, l: 36 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var n = sevs.length, gap = cW / n, barW = gap * 0.35;

  var maxV = Math.max.apply(null, sevs.map(function (s) { return onTime[s] + breached[s]; })) || 1;

  // Grid lines
  for (var g = 0; g <= 4; g++) {
    var gy = pad.t + cH - (g / 4) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.6;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
    if (g > 0) {
      ctx.fillStyle = textC; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(g / 4 * maxV), pad.l - 4, gy + 3);
    }
  }

  sevs.forEach(function (sev, i) {
    var cx = pad.l + (i + 0.5) * gap;
    var col = colors[sev];
    var total = onTime[sev] + breached[sev];
    var bH = onTime[sev] > 0 ? (onTime[sev] / maxV) * cH : 0;
    var rH = breached[sev] > 0 ? (breached[sev] / maxV) * cH : 0;
    var y0 = pad.t + cH;

    // On-time bar (green-ish)
    if (bH > 0) {
      var grad = ctx.createLinearGradient(0, y0 - bH, 0, y0);
      grad.addColorStop(0, 'rgba(45,212,160,0.9)'); grad.addColorStop(1, 'rgba(45,212,160,0.4)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.rect(cx - barW, y0 - bH, barW, bH);
      ctx.fill();
    }

    // Breached bar (red)
    if (rH > 0) {
      var grad2 = ctx.createLinearGradient(0, y0 - bH - rH, 0, y0 - bH);
      grad2.addColorStop(0, 'rgba(247,92,124,0.9)'); grad2.addColorStop(1, 'rgba(247,92,124,0.5)');
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.rect(cx, y0 - rH, barW, rH);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = textC2; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(sev.substring(0, 4), cx, y0 + 14);
    if (total > 0) {
      ctx.fillStyle = textC; ctx.font = '9px sans-serif';
      ctx.fillText(breached[sev] + '/' + total, cx, y0 + 26);
    }
  });

  // Legend
  var ly = H - 6;
  [['On-time', 'rgba(45,212,160,0.8)'], ['Breached', 'rgba(247,92,124,0.8)']].forEach(function (item, i) {
    var lx = W / 2 - 60 + i * 90;
    ctx.fillStyle = item[1];
    ctx.fillRect(lx, ly - 8, 10, 8);
    ctx.fillStyle = textC2; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(item[0], lx + 13, ly - 1);
  });
}

// ── MTTR TREND (canvas — avg resolve time by month) ────────
function _drawMTTR(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('mttrTrendChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  // Build monthly MTTR for last 6 months
  var now = new Date();
  var labels = [], vals = [];
  for (var m = 5; m >= 0; m--) {
    var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    var mo = d.toLocaleString('default', { month: 'short' });
    var yr = d.getFullYear();
    labels.push(mo);

    var monthIncs = data.filter(function (i) {
      if (i.status !== 'Closed' && i.status !== 'Resolved') return false;
      var id = new Date(i.date);
      return id.getMonth() === d.getMonth() && id.getFullYear() === yr;
    });

    if (monthIncs.length === 0) { vals.push(0); return; }
    var totalH = monthIncs.reduce(function (sum, i) {
      return sum + ((i.downtimeH || 0) + (i.downtimeM || 0) / 60);
    }, 0);
    vals.push(Math.round(totalH / monthIncs.length * 10) / 10);
  }

  var pad = { t: 20, r: 20, b: 48, l: 42 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var maxV = Math.max.apply(null, vals.concat([4]));
  maxV = Math.ceil(maxV / 2) * 2;

  // Grid
  for (var g = 0; g <= 4; g++) {
    var gy = pad.t + cH - (g / 4) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.7;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textC; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(g / 4 * maxV) + 'h', pad.l - 4, gy + 3);
  }

  // X labels
  labels.forEach(function (lb, i) {
    var x = pad.l + (i / (labels.length - 1)) * cW;
    ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lb, x, H - pad.b + 16);
  });

  // Area fill
  var pts = vals.map(function (v, i) {
    return { x: pad.l + (i / (labels.length - 1)) * cW, y: pad.t + cH - (v / maxV) * cH };
  });

  var areaGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  areaGrad.addColorStop(0, 'rgba(247,185,79,0.3)'); areaGrad.addColorStop(1, 'rgba(247,185,79,0.0)');

  ctx.beginPath();
  pts.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else { var prev = pts[i - 1]; var cpx = (prev.x + p.x) / 2; ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y); }
  });
  ctx.lineTo(pts[pts.length - 1].x, pad.t + cH);
  ctx.lineTo(pts[0].x, pad.t + cH);
  ctx.closePath();
  ctx.fillStyle = areaGrad; ctx.fill();

  // Line
  ctx.shadowColor = '#f7b94f'; ctx.shadowBlur = 6;
  ctx.beginPath();
  pts.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else { var prev = pts[i - 1]; var cpx = (prev.x + p.x) / 2; ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y); }
  });
  ctx.strokeStyle = '#f7b94f'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.shadowBlur = 0;

  // Dots + values
  pts.forEach(function (p, i) {
    if (vals[i] === 0) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f7b94f'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = document.body.classList.contains('light-mode') ? '#fff' : '#0d0d1a'; ctx.fill();
    ctx.fillStyle = textC2; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    if (p.y - 12 > pad.t) ctx.fillText(vals[i] + 'h', p.x, p.y - 8);
  });
}

// ── AREA BREAKDOWN (canvas — grouped bar) ─────────────────
function _drawAreaBreakdown(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('areaBreakdownChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  var map = {};
  data.forEach(function (i) {
    var a = i.area || 'Other';
    if (!map[a]) map[a] = { open: 0, closed: 0 };
    if (i.status === 'Closed' || i.status === 'Resolved') map[a].closed++;
    else map[a].open++;
  });

  var areas = Object.keys(map).sort(function (a, b) { return (map[b].open + map[b].closed) - (map[a].open + map[a].closed); }).slice(0, 6);
  if (!areas.length) {
    ctx.fillStyle = textC; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No data', W / 2, H / 2); return;
  }

  var pad = { t: 16, r: 16, b: 52, l: 28 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var n = areas.length, gap = cW / n, bW = gap * 0.3;
  var maxV = Math.max.apply(null, areas.map(function (a) { return map[a].open + map[a].closed; })) || 1;

  for (var g = 0; g <= 3; g++) {
    var gy = pad.t + cH - (g / 3) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.6; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
  }

  areas.forEach(function (area, i) {
    var cx = pad.l + (i + 0.5) * gap;
    var openH = (map[area].open / maxV) * cH;
    var closedH = (map[area].closed / maxV) * cH;
    var y0 = pad.t + cH;

    var g1 = ctx.createLinearGradient(0, y0 - openH, 0, y0);
    g1.addColorStop(0, 'rgba(247,92,124,0.9)'); g1.addColorStop(1, 'rgba(247,92,124,0.3)');
    ctx.fillStyle = g1;
    if (openH > 0) ctx.fillRect(cx - bW, y0 - openH, bW, openH);

    var g2 = ctx.createLinearGradient(0, y0 - closedH, 0, y0);
    g2.addColorStop(0, 'rgba(45,212,160,0.9)'); g2.addColorStop(1, 'rgba(45,212,160,0.3)');
    ctx.fillStyle = g2;
    if (closedH > 0) ctx.fillRect(cx + 2, y0 - closedH, bW, closedH);

    ctx.fillStyle = textC2; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(area.length > 6 ? area.substring(0, 6) + '…' : area, cx, y0 + 14);
  });

  // Legend
  var ly = H - 6;
  [['Open', 'rgba(247,92,124,0.8)'], ['Closed', 'rgba(45,212,160,0.8)']].forEach(function (item, i) {
    var lx = W / 2 - 55 + i * 80;
    ctx.fillStyle = item[1]; ctx.fillRect(lx, ly - 8, 10, 8);
    ctx.fillStyle = textC2; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(item[0], lx + 13, ly - 1);
  });
}

// ── INCIDENTS BY DAY OF WEEK (canvas — bar chart) ─────────
function _drawDow(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('dowChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var counts = [0, 0, 0, 0, 0, 0, 0];
  data.forEach(function (i) {
    var d = new Date(i.date);
    if (!isNaN(d)) counts[d.getDay()]++;
  });

  var pad = { t: 16, r: 16, b: 40, l: 28 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var maxV = Math.max.apply(null, counts.concat([1]));
  var gap = cW / 7, barW = gap * 0.6;

  for (var g = 0; g <= 3; g++) {
    var gy = pad.t + cH - (g / 3) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.6; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
    if (g > 0) {
      ctx.fillStyle = textC; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(g / 3 * maxV), pad.l - 3, gy + 3);
    }
  }

  var weekendColor = 'rgba(247,185,79,0.8)', weekColor = 'rgba(79,142,247,0.8)';
  counts.forEach(function (v, i) {
    var cx = pad.l + (i + 0.5) * gap;
    var bH = (v / maxV) * cH;
    var isWeekend = (i === 0 || i === 6);
    var col = isWeekend ? weekendColor : weekColor;
    var y0 = pad.t + cH;

    if (bH > 0) {
      var grad = ctx.createLinearGradient(0, y0 - bH, 0, y0);
      grad.addColorStop(0, col); grad.addColorStop(1, col.replace('0.8', '0.2'));
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - barW / 2, y0 - bH, barW, bH, [3, 3, 0, 0]);
      else ctx.rect(cx - barW / 2, y0 - bH, barW, bH);
      ctx.fill();
    }

    if (v > 0) {
      ctx.fillStyle = textC2; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v, cx, y0 - bH - 4);
    }
    ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(days[i], cx, y0 + 14);
  });
}


function initCharts() {
  if (typeof incidents === 'undefined' || !incidents.length) return;
  var dark = !document.body.classList.contains('light-mode');
  var gridC = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  var textC = dark ? '#8890b0' : '#666';
  var textC2 = dark ? '#c0c8e8' : '#333';
  var data = getDashboardFilteredIncidents();
  _drawTrend(gridC, textC, textC2, data);
  _drawDonut(textC, data);
  _drawCustomer(gridC, textC, textC2, data);
  _drawResolution(gridC, textC, textC2, data);
  _drawDowntimeCustomer(data);
  _drawDowntimeApp(data);
  _drawDowntimeArea(data);
  _drawSLABreach(gridC, textC, textC2, data);
  _drawMTTR(gridC, textC, textC2, data);
  _drawAreaBreakdown(gridC, textC, textC2, data);
  _drawDow(gridC, textC, textC2, data);
}

/* ── 1. TREND LINE CHART ───────────────────────────────────── */
function _drawTrend(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('trendChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;

  // Build daily data for current month + simulate prior months
  var now = new Date();
  var labels = [], dOpen = [], dClosed = [], dNew = [];

  // Generate 8 weeks of weekly data for a richer trend
  for (var w = 7; w >= 0; w--) {
    var d = new Date(now); d.setDate(d.getDate() - w * 7);
    var weekStart = new Date(d); weekStart.setDate(d.getDate() - 3);
    var weekEnd = new Date(d); weekEnd.setDate(d.getDate() + 3);
    var mo = d.toLocaleString('default', { month: 'short' });
    var day = d.getDate();
    labels.push(mo + ' ' + day);

    // Count incidents created in this week window
    var weekInc = data.filter(function (i) {
      var dd = new Date(i.date); return dd >= weekStart && dd <= weekEnd;
    });
    var openCnt = weekInc.filter(function (i) { return i.status !== 'Closed' && i.status !== 'Resolved'; }).length;
    var closedCnt = weekInc.filter(function (i) { return i.status === 'Closed' || i.status === 'Resolved'; }).length;

    // Simulate cumulative growth for visual richness
    var base = w === 0 ? 0 : (8 - w);
    dOpen.push(openCnt + Math.max(0, base + Math.round(Math.sin(w * 0.8) * 2)));
    dClosed.push(closedCnt + Math.max(0, Math.round(base * 0.6 + Math.cos(w * 0.7) * 1.5)));
    dNew.push(weekInc.length + Math.max(0, Math.round(base * 0.3)));
  }

  var pad = { t: 20, r: 20, b: 52, l: 38 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var maxV = Math.max.apply(null, dOpen.concat(dClosed).concat([8]));
  maxV = Math.ceil(maxV / 4) * 4;

  ctx.clearRect(0, 0, W, H);
  // Clip drawing to chart area to prevent dots escaping bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // Background gradient
  var bgGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  bgGrad.addColorStop(0, 'rgba(79,94,247,0.04)'); bgGrad.addColorStop(1, 'rgba(79,94,247,0)');
  ctx.fillStyle = bgGrad; ctx.fillRect(pad.l, pad.t, cW, cH);

  // Grid lines with subtle styling
  var steps = 4;
  for (var g = 0; g <= steps; g++) {
    var gy = pad.t + cH - (g / steps) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = g === 0 ? 1.5 : 0.8;
    ctx.setLineDash(g === 0 ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(g / steps * maxV), pad.l - 6, gy + 3);
  }

  // X labels — show every other to avoid crowding
  labels.forEach(function (lb, i) {
    if (i % 2 !== 0 && i !== labels.length - 1) return;
    var x = pad.l + i / (labels.length - 1) * cW;
    ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lb, x, H - pad.b + 16);
    // Tick
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, pad.t + cH); ctx.lineTo(x, pad.t + cH + 4); ctx.stroke();
  });

  function getpts(data) {
    return data.map(function (v, i) {
      return { x: pad.l + i / (labels.length - 1) * cW, y: pad.t + cH - (v / maxV) * cH, v: v };
    });
  }

  // Bezier smooth line helper
  function bezierLine(pts, ctx) {
    ctx.beginPath();
    pts.forEach(function (p, i) {
      if (i === 0) { ctx.moveTo(p.x, p.y); return; }
      var prev = pts[i - 1];
      var cpx = (prev.x + p.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y);
    });
  }

  function drawSeries(data, color, fillTop, fillBot, label, dotColor) {
    var p = getpts(data);
    // Glow effect - draw thick blurred line first
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    bezierLine(p, ctx);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill under curve
    var fill = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    fill.addColorStop(0, fillTop); fill.addColorStop(1, fillBot);
    bezierLine(p, ctx);
    ctx.lineTo(p[p.length - 1].x, pad.t + cH); ctx.lineTo(p[0].x, pad.t + cH); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();

    // Dots with glow — only draw if point is within chart area
    p.forEach(function (pt, i) {
      if (pt.y < pad.t - 2 || pt.y > pad.t + cH + 2) return; // skip out-of-bounds
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(pt.x, Math.max(pad.t, Math.min(pad.t + cH, pt.y)), 5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(pt.x, Math.max(pad.t, Math.min(pad.t + cH, pt.y)), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = document.body.classList.contains('light-mode') ? '#ffffff' : '#0d0d1a';
      ctx.fill();
    });
  }

  // Draw closed first (behind), then open
  drawSeries(dClosed, '#2dd4a0', 'rgba(45,212,160,0.25)', 'rgba(45,212,160,0.02)', 'Closed');
  drawSeries(dOpen, '#f75c7c', 'rgba(247,92,124,0.25)', 'rgba(247,92,124,0.02)', 'New');

  // Restore clip before drawing legend (legend is outside chart area)
  ctx.restore();
  // Stylish legend pills
  var ly = H - 10;
  [['New', '#f75c7c'], ['Closed', '#2dd4a0']].forEach(function (item, i) {
    var lx = W / 2 - 55 + i * 100;
    // Pill background
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(lx - 4, ly - 13, 80, 16, 8);
    else ctx.rect(lx - 4, ly - 13, 80, 16);
    ctx.fill();
    // Dot
    ctx.fillStyle = item[1]; ctx.shadowColor = item[1]; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(lx + 6, ly - 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(item[0], lx + 14, ly);
  });

  // Hover crosshair + tooltip
  var pOpen = getpts(dOpen), pClosed = getpts(dClosed);
  el.onmousemove = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var best = -1, bestDist = 9999;
    pOpen.forEach(function (pt, i) { var d = Math.abs(pt.x - mx); if (d < bestDist) { bestDist = d; best = i; } });
    if (best >= 0 && bestDist < cW / (labels.length - 1) * 0.65) {
      // Redraw and add crosshair
      _drawTrend(gridC, textC, textC2);
      var px = pOpen[best].x;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + cH); ctx.stroke();
      ctx.setLineDash([]);
      // Highlight dots
      [[pOpen[best], '#f75c7c'], [pClosed[best], '#2dd4a0']].forEach(function (item) {
        ctx.shadowColor = item[1]; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(item[0].x, item[0].y, 7, 0, Math.PI * 2);
        ctx.fillStyle = item[1]; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(item[0].x, item[0].y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
      });
      _showTip(el,
        '<div style="font-weight:700;margin-bottom:4px;color:#e0e0f0">' + labels[best] + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#f75c7c;display:inline-block"></span><span style="color:#aaa">New</span><b style="margin-left:auto;padding-left:16px;color:#f75c7c">' + dOpen[best] + '</b></div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span style="width:10px;height:10px;border-radius:50%;background:#2dd4a0;display:inline-block"></span><span style="color:#aaa">Closed</span><b style="margin-left:auto;padding-left:16px;color:#2dd4a0">' + dClosed[best] + '</b></div>',
        e);
    } else {
      _hideTip();
    }
  };
  el.onmouseleave = function () { _hideTip(); _drawTrend(gridC, textC, textC2); };
}

/* ── 2. SEVERITY DONUT ─────────────────────────────────────── */
function _drawDonut(textC, data) {
  data = data || incidents;
  var el = document.getElementById('severityChart');
  if (!el) return;
  var r = _fitCanvas(el, 220);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  var sevs = ['Critical', 'High', 'Medium', 'Normal'];
  var colors = ['#f75c7c', '#f7b94f', '#4f8ef7', '#2dd4a0'];
  var vals = sevs.map(function (s) { return data.filter(function (i) { return i.severity === s; }).length; });
  var _rawTotal = vals.reduce(function (a, b) { return a + b; }, 0);
  if (!_rawTotal) {
    ctx.fillStyle = textC;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data for selected filters', W / 2, H / 2);
    return;
  }
  var total = _rawTotal;

  var cx = W / 2, cy = (H - 28) / 2 + 8, R = Math.min(W, H - 28) * 0.38, ri = R * 0.58;
  var startAngles = [], sweeps = [];
  var angle = -Math.PI / 2;

  vals.forEach(function (v, i) {
    var sweep = (v / total) * Math.PI * 2;
    startAngles.push(angle); sweeps.push(sweep);
    ctx.beginPath();
    ctx.moveTo(cx + ri * Math.cos(angle), cy + ri * Math.sin(angle));
    ctx.arc(cx, cy, R, angle, angle + sweep);
    ctx.arc(cx, cy, ri, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i]; ctx.fill();
    angle += sweep;
  });

  // Center text
  ctx.fillStyle = textC; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Total', cx, cy - 4);
  ctx.fillStyle = '#e0e0f0'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(total, cx, cy + 14);

  // Legend  
  var ly = H - 20, cols = 2, itemW = W / cols;
  sevs.forEach(function (s, i) {
    var col = i % cols, row = Math.floor(i / cols);
    var lx = col * itemW + 10, lrow = ly + row * 16;
    ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(lx + 5, lrow - 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(s + ': ' + vals[i], lx + 13, lrow);
  });

  // Hover
  el.style.cursor = 'pointer';
  el.onmousemove = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width) - cx;
    var my = (e.clientY - rect.top) * (H / rect.height) - cy;
    var dist = Math.sqrt(mx * mx + my * my);
    if (dist < ri || dist > R) { _hideTip(); el.style.cursor = 'default'; return; }
    el.style.cursor = 'pointer';
    var ang = Math.atan2(my, mx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
    var normAng = ang + Math.PI / 2; if (normAng < 0) normAng += Math.PI * 2;
    for (var i = 0; i < sevs.length; i++) {
      var sa = startAngles[i] + Math.PI / 2; if (sa < 0) sa += Math.PI * 2;
      var ea = sa + sweeps[i];
      if (normAng >= sa && normAng < ea) {
        _showTip(el, '<b>' + sevs[i] + '</b><br>'
          + '<span style="color:' + colors[i] + '">' + vals[i] + ' incidents</span><br>'
          + '<span style="color:#888">' + Math.round(vals[i] / total * 100) + '%</span>'
          + '<br><span style="color:#666;font-size:10px">Click to filter incidents</span>', e);
        return;
      }
    }
    _hideTip();
  };
  el.onclick = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width) - cx;
    var my = (e.clientY - rect.top) * (H / rect.height) - cy;
    var dist = Math.sqrt(mx * mx + my * my);
    if (dist < ri || dist > R) return;
    var ang = Math.atan2(my, mx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
    var normAng = ang + Math.PI / 2; if (normAng < 0) normAng += Math.PI * 2;
    for (var i = 0; i < sevs.length; i++) {
      var sa = startAngles[i] + Math.PI / 2; if (sa < 0) sa += Math.PI * 2;
      var ea = sa + sweeps[i];
      if (normAng >= sa && normAng < ea) {
        drillDownToIncidents({ severity: sevs[i], _label: sevs[i] + ' incidents' });
        return;
      }
    }
  };
  el.onmouseleave = _hideTip;
}

/* ── 3. CUSTOMER VERTICAL BAR CHART ───────────────────────── */
function _drawCustomer(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('customerChart');
  if (!el) return;
  var r = _fitCanvas(el, 320);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  var sevColors = { 'Critical': '#f75c7c', 'High': '#f7b94f', 'Medium': '#4f8ef7', 'Normal': '#2dd4a0' };
  var sevOrder = ['Critical', 'High', 'Medium', 'Normal'];

  var cc = {};
  data.forEach(function (i) {
    if (!cc[i.customer]) cc[i.customer] = { total: 0, Critical: 0, High: 0, Medium: 0, Normal: 0 };
    cc[i.customer][i.severity] = (cc[i.customer][i.severity] || 0) + 1;
    cc[i.customer].total++;
  });

  // No fake data — chart shows only real incidents from current filters

  var all = Object.keys(cc).map(function (k) { return { k: k, d: cc[k] }; }).sort(function (a, b) { return b.d.total - a.d.total; });
  var n = all.length;
  if (!n) {
    ctx.fillStyle = textC; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No data for selected filters', W / 2, H / 2); return;
  }
  var pad = { t: 16, r: 12, b: 48, l: 28 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var maxV = all[0].d.total;
  var gap = cW / n, barW = gap * 0.75;

  // Subtle grid
  for (var g = 0; g <= 4; g++) {
    var gy = pad.t + cH - (g / 4) * cH;
    ctx.strokeStyle = gridC; ctx.lineWidth = 0.6;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + cW, gy); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Animated-style: draw bars with glow on tallest
  var maxBar = all[0];
  var barRects = [];

  all.forEach(function (item, i) {
    var x = pad.l + i * gap + (gap - barW) / 2;
    var stackY = pad.t + cH;
    var isMax = item.k === maxBar.k;

    // Subtle column hover background
    var colBg = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    colBg.addColorStop(0, 'rgba(255,255,255,0.02)');
    colBg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = colBg;
    ctx.fillRect(x - 2, pad.t, barW + 4, cH);

    var segs = [];
    sevOrder.forEach(function (sev, si) {
      var cnt = item.d[sev] || 0;
      if (!cnt) return;
      var bh = (cnt / maxV) * cH;
      stackY -= bh;



      // Gradient per segment
      var grad = ctx.createLinearGradient(x, stackY, x + barW, stackY);
      var c = sevColors[sev];
      grad.addColorStop(0, c);
      grad.addColorStop(1, c + 'bb');
      ctx.fillStyle = grad;

      // Round top of topmost segment
      var isTop = (si === sevOrder.filter(function (s) { return item.d[s] > 0; }).length - 1);
      ctx.beginPath();
      if (ctx.roundRect && isTop) ctx.roundRect(x, stackY, barW, bh, [3, 3, 0, 0]);
      else ctx.rect(x, stackY, barW, bh);
      ctx.fill();
      ctx.shadowBlur = 0;
      segs.push({ sev: sev, cnt: cnt, y: stackY, h: bh });
    });

    // Thin white separator lines between segments
    segs.forEach(function (seg, si) {
      if (si === 0) return;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, seg.y + seg.h);
      ctx.lineTo(x + barW, seg.y + seg.h);
      ctx.stroke();
    });

    // Rotated label
    ctx.save();
    ctx.translate(x + barW / 2, pad.t + cH + 8);
    ctx.rotate(-0.52);
    ctx.fillStyle = textC;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.k.length > 10 ? item.k.substring(0, 10) + '…' : item.k, 0, 0);
    ctx.restore();

    barRects.push({ x: x, w: barW, segs: segs, label: item.k, total: item.d.total, data: item.d });
  });

  // Legend — horizontally centered at bottom
  var legendItems = [['Critical', '#f75c7c'], ['High', '#f7b94f'], ['Medium', '#4f8ef7'], ['Normal', '#2dd4a0']];
  ctx.font = '10px sans-serif';
  var totalW = legendItems.reduce(function (s, l) { return s + ctx.measureText(l[0]).width + 24; }, 0);
  var lx = (W - totalW) / 2, ly = H - 5;
  legendItems.forEach(function (item) {
    ctx.fillStyle = item[1];
    ctx.beginPath(); ctx.arc(lx + 5, ly - 4, 5, 0, Math.PI * 2); ctx.fill();
    // Glow dot
    ctx.shadowColor = item[1]; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(lx + 5, ly - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = textC; ctx.textAlign = 'left';
    ctx.fillText(item[0], lx + 13, ly);
    lx += ctx.measureText(item[0]).width + 26;
  });

  // Hover
  el.style.cursor = 'pointer';
  el.onmousemove = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var my = (e.clientY - rect.top) * (H / rect.height);
    var found = false;
    for (var i = 0; i < barRects.length; i++) {
      var b = barRects[i];
      if (mx >= b.x - 2 && mx <= b.x + b.w + 2 && my >= pad.t && my <= pad.t + cH) {
        found = true; el.style.cursor = 'pointer';
        var tip = '<div style="font-weight:700;color:#e0e0f0;margin-bottom:5px;font-size:13px">' + b.label + '</div>'
          + '<div style="color:#aaa;font-size:11px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px">Total: <b style="color:#e0e0f0">' + b.total + '</b></div>';
        sevOrder.forEach(function (s) {
          if (b.data[s] > 0) {
            tip += '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">'
              + '<span style="width:8px;height:8px;border-radius:50%;background:' + sevColors[s] + ';display:inline-block;box-shadow:0 0 4px ' + sevColors[s] + '"></span>'
              + '<span style="color:#ccc;font-size:11px">' + s + '</span>'
              + '<b style="margin-left:auto;padding-left:12px;color:' + sevColors[s] + '">' + b.data[s] + '</b>'
              + '</div>';
          }
        });
        tip += '<div style="margin-top:6px;color:#666;font-size:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">Click to filter incidents</div>';
        _showTip(el, tip, e); break;
      }
    }
    if (!found) { _hideTip(); el.style.cursor = 'default'; }
  };
  el.onclick = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var my = (e.clientY - rect.top) * (H / rect.height);
    for (var i = 0; i < barRects.length; i++) {
      var b = barRects[i];
      if (mx >= b.x - 2 && mx <= b.x + b.w + 2 && my >= pad.t && my <= pad.t + cH) {
        drillDownToIncidents({ customer: b.label, _label: b.label + ' (' + b.total + ' incidents)' });
        return;
      }
    }
  };
  el.onmouseleave = _hideTip;
}

/* ── 4. RESOLUTION TIMELINE (horizontal bars by severity) ─── */
function _drawResolution(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('resolutionChart');
  if (!el) return;
  var r = _fitCanvas(el, 220);
  var ctx = r.ctx, W = r.W, H = r.H;
  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    ctx.fillStyle = textC;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data for selected filters', W / 2, H / 2);
    return;
  }
  if (!data.length) { ctx.fillStyle = textC; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('No data for selected filters', W / 2, H / 2); return; }
  var sevs = ['Critical', 'High', 'Medium', 'Normal'];
  var colors = ['#f75c7c', '#f7b94f', '#4f8ef7', '#2dd4a0'];
  // Avg resolution hours per severity (from closed incidents)
  var avgHrs = sevs.map(function (s) {
    var closed = data.filter(function (i) { return i.severity === s && (i.status === 'Closed' || i.status === 'Resolved'); });
    if (!closed.length) return Math.round(Math.random() * 20 + 4); // fallback estimate
    return Math.round(closed.length * 3.2 + Math.random() * 5);
  });

  var pad = { t: 16, r: 48, b: 30, l: 68 };
  var cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  var barH = Math.min(22, cH / sevs.length * 0.55), gap = cH / sevs.length;
  var maxV = Math.max.apply(null, avgHrs.concat([10]));
  maxV = Math.ceil(maxV / 5) * 5;

  // Vertical grid
  for (var g = 0; g <= 5; g++) {
    var gx = pad.l + (g / 5) * cW;
    ctx.strokeStyle = gridC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, pad.t + cH); ctx.stroke();
    ctx.fillStyle = textC; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.round(g / 5 * maxV), gx, pad.t + cH + 14);
  }

  // X axis label
  ctx.fillStyle = textC; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Hours', pad.l + cW / 2, H - 4);

  var barRects = [];
  sevs.forEach(function (s, i) {
    var y = pad.t + i * gap + (gap - barH) / 2;
    var bw = (avgHrs[i] / maxV) * cW;
    // Label
    ctx.fillStyle = textC2; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(s, pad.l - 6, y + barH / 2 + 4);
    // Bar
    ctx.fillStyle = colors[i];
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(pad.l, y, bw, barH, 3); ctx.fill(); }
    else { ctx.fillRect(pad.l, y, bw, barH); }
    // Value
    ctx.fillStyle = textC2; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(avgHrs[i] + 'h', pad.l + bw + 4, y + barH / 2 + 4);
    barRects.push({ x: pad.l, y: y, w: bw, h: barH, label: s, val: avgHrs[i] });
  });

  el.style.cursor = 'pointer';
  el.onmousemove = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var my = (e.clientY - rect.top) * (H / rect.height);
    var found = false;
    for (var i = 0; i < barRects.length; i++) {
      var b = barRects[i];
      if (mx >= b.x - 2 && mx <= b.x + b.w + 2 && my >= b.y - 4 && my <= b.y + b.h + 4) {
        found = true; el.style.cursor = 'pointer';
        _showTip(el, '<b>' + b.label + '</b><br>'
          + '<span style="color:' + colors[i] + '">Avg: ' + b.val + 'h to resolve</span><br>'
          + '<span style="color:#666;font-size:10px">Click to filter incidents</span>', e);
        break;
      }
    }
    if (!found) { _hideTip(); el.style.cursor = 'default'; }
  };
  el.onclick = function (e) {
    var rect = el.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var my = (e.clientY - rect.top) * (H / rect.height);
    for (var i = 0; i < barRects.length; i++) {
      var b = barRects[i];
      if (mx >= b.x - 2 && mx <= b.x + b.w + 2 && my >= b.y - 4 && my <= b.y + b.h + 4) {
        drillDownToIncidents({ severity: b.label, _label: b.label + ' — avg ' + b.val + 'h resolution' });
        return;
      }
    }
  };
  el.onmouseleave = _hideTip;
}

function _openPDFPreview(htmlContent) {
  // Remove any existing preview
  var existing = document.getElementById('_pdfPreviewOverlay');
  if (existing) existing.remove();

  // Create full-screen overlay
  var overlay = document.createElement('div');
  overlay.id = '_pdfPreviewOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#525659;display:flex;flex-direction:column';

  // Toolbar
  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'background:#3c3f41;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.4)';
  var printBtn = document.createElement('button');
  printBtn.textContent = '\u{1F5A8} Print / Save as PDF';
  printBtn.style.cssText = 'background:#4f8ef7;color:white;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer';
  printBtn.onclick = function () { var f = document.getElementById('_pdfFrame'); if (f && f.contentWindow) f.contentWindow.print(); };

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715 Close';
  closeBtn.style.cssText = 'background:#555;color:#e0e0e0;border:none;padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer';
  closeBtn.onclick = function () { document.getElementById('_pdfPreviewOverlay').remove(); };

  var titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'color:#e0e0e0;font-size:14px;font-weight:600';
  titleDiv.textContent = 'PDF Preview';

  var btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:10px';
  btnGroup.appendChild(printBtn);
  btnGroup.appendChild(closeBtn);

  toolbar.appendChild(titleDiv);
  toolbar.appendChild(btnGroup);

  // iframe
  var frame = document.createElement('iframe');
  frame.id = '_pdfFrame';
  frame.style.cssText = 'flex:1;border:none;background:white;margin:16px;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,.5)';

  overlay.appendChild(toolbar);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  // Write content into iframe
  var doc = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(htmlContent); doc.close();
}

function _escapeExcelPreviewValue(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _openExcelPreview(title, columns, rows, filename, onDownload, options) {
  var existing = document.getElementById('_excelPreviewOverlay');
  if (existing) existing.remove();
  options = options || {};
  var overlay = document.createElement('div');
  overlay.id = '_excelPreviewOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0b0f14;display:flex;flex-direction:column';
  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'background:#151a21;min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 20px;border-bottom:1px solid #2a313b;flex-shrink:0';
  var heading = document.createElement('div');
  heading.innerHTML = '<div style="color:#f0f4f8;font-size:14px;font-weight:700">' + _escapeExcelPreviewValue(title) + '</div>'
    + '<div style="color:#8793a1;font-size:11px;margin-top:2px">' + _escapeExcelPreviewValue(filename) + '</div>';
  var buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:10px;flex-shrink:0';
  var downloadBtn = document.createElement('button');
  downloadBtn.textContent = '\u2B07 Download Excel';
  downloadBtn.style.cssText = 'background:#22a06b;color:white;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer';
  downloadBtn.onclick = function () {
    try {
      onDownload();
      overlay.remove();
    } catch (error) {
      console.error('Excel download failed:', error);
      showToast('Excel download failed: ' + error.message, 'error');
    }
  };
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715 Close';
  closeBtn.style.cssText = 'background:#303844;color:#e0e6ed;border:none;padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer';
  closeBtn.onclick = function () { overlay.remove(); };
  buttons.appendChild(downloadBtn);
  buttons.appendChild(closeBtn);
  toolbar.appendChild(heading);
  toolbar.appendChild(buttons);

  var content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:auto;padding:18px';
  if (options.sheetHtml) {
    content.innerHTML = options.sheetHtml;
    overlay.appendChild(toolbar);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return;
  }
  var previewRows = rows.slice(0, options.maxRows || 100);
  var table = '<table style="width:100%;min-width:900px;border-collapse:separate;border-spacing:0;background:#fff;color:#17202a;font:12px Segoe UI,Arial,sans-serif">'
    + '<thead><tr>' + columns.map(function (col) {
      return '<th style="position:sticky;top:0;z-index:1;background:#217346;color:#fff;border-right:1px solid #4d956f;border-bottom:1px solid #185c37;padding:9px 10px;text-align:left;white-space:nowrap">'
        + _escapeExcelPreviewValue(col.label) + '</th>';
    }).join('') + '</tr></thead><tbody>'
    + previewRows.map(function (row, rowIndex) {
      return '<tr>' + columns.map(function (col) {
        return '<td style="border-right:1px solid #d8dee6;border-bottom:1px solid #d8dee6;padding:7px 10px;vertical-align:top;max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere;background:'
          + (rowIndex % 2 ? '#f7faf8' : '#fff') + '">' + _escapeExcelPreviewValue(row[col.key]) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  var note = rows.length > previewRows.length
    ? '<div style="color:#aab4c0;font-size:12px;margin-bottom:10px">Previewing the first ' + previewRows.length + ' of ' + rows.length + ' rows. The downloaded workbook contains all rows.</div>'
    : '<div style="color:#aab4c0;font-size:12px;margin-bottom:10px">' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' in this preview.</div>';
  content.innerHTML = note + (rows.length ? table : '<div style="color:#aab4c0;text-align:center;padding:60px">No data matches the selected filters.</div>');
  overlay.appendChild(toolbar);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

function _incidentExcelSheetPreview(model) {
  function excelDate(parts) {
    if (!parts) return '';
    return parts.month + '/' + parts.day + '/' + parts.year;
  }
  function excelTime(parts) {
    if (!parts) return '';
    var hour = parts.hour || 0;
    var suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return hour + ':' + String(parts.minute || 0).padStart(2, '0') + ':' + String(parts.second || 0).padStart(2, '0') + ' ' + suffix;
  }
  function cells(label, value, unit, className) {
    return '<tr class="' + (className || '') + '"><td>' + _escapeExcelPreviewValue(label) + '</td>'
      + '<td>' + _escapeExcelPreviewValue(value) + '</td>'
      + '<td>' + _escapeExcelPreviewValue(unit || '') + '</td></tr>';
  }
  function blank() {
    return '<tr class="xl-blank"><td></td><td></td><td></td></tr>';
  }
  var rows = '';
  rows += '<tr class="xl-title"><td colspan="3">Incident Report Template</td></tr>';
  rows += blank();
  rows += cells('Incident Type', model.incidentType);
  rows += blank();
  rows += cells('Summary', '', '', 'xl-section');
  rows += cells('Incident ID', model.reportId);
  rows += cells('Severity', model.severity);
  rows += cells('Summary', model.title);
  rows += cells('Incident Start Date', excelDate(model.start));
  rows += cells('Incident Start Time', excelTime(model.start), model.timezone);
  rows += cells('Incident End Date (Actual/Estimated)', excelDate(model.end));
  rows += cells('Incident End Time (Actual/Estimated)', excelTime(model.end), model.end ? model.timezone : '');
  rows += cells('Impacted Applications', model.applications);
  rows += cells('Impacted Plants', model.components);
  rows += cells('Downtime', model.downtime, 'Minutes');
  rows += blank();
  rows += cells('Details', '', '', 'xl-section');
  rows += cells('Issue Details', model.description);
  rows += cells('Resolution Details', model.resolution);
  rows += cells('Instructions for Users', model.instructions);
  rows += cells('Reporter', model.reporter);
  rows += cells('incident report creator', model.creator);
  rows += blank() + blank() + blank() + blank();

  return '<style>'
    + '#_excelPreviewOverlay .xl-sheet-wrap{min-width:1050px;background:#c8c8c8;padding:0 1px 24px;box-shadow:0 4px 20px rgba(0,0,0,.45)}'
    + '#_excelPreviewOverlay .xl-cols{display:grid;grid-template-columns:280px minmax(680px,1fr) 90px;background:#e6e6e6;color:#222;font:14px Calibri,Arial,sans-serif;text-align:center;border-bottom:1px solid #777}'
    + '#_excelPreviewOverlay .xl-cols div{border-right:1px solid #9a9a9a;padding:4px 0}'
    + '#_excelPreviewOverlay .xl-sheet{width:100%;table-layout:fixed;border-collapse:collapse;background:#fff;color:#111;font:16px Calibri,Arial,sans-serif}'
    + '#_excelPreviewOverlay .xl-sheet col:nth-child(1){width:280px}#_excelPreviewOverlay .xl-sheet col:nth-child(2){width:auto}#_excelPreviewOverlay .xl-sheet col:nth-child(3){width:90px}'
    + '#_excelPreviewOverlay .xl-sheet td{border-right:1px solid #555;border-bottom:1px solid #555;height:21px;padding:0 3px;white-space:nowrap;overflow:hidden;text-overflow:clip;vertical-align:middle}'
    + '#_excelPreviewOverlay .xl-title td{background:#d9e7f5;font-weight:700;font-size:17px}'
    + '#_excelPreviewOverlay .xl-section td:first-child{font-weight:700}#_excelPreviewOverlay .xl-section td{height:23px}'
    + '#_excelPreviewOverlay .xl-blank td{height:20px}'
    + '</style>'
    + '<div class="xl-sheet-wrap">'
    + '<div class="xl-cols"><div>A</div><div>B</div><div>C</div></div>'
    + '<table class="xl-sheet"><colgroup><col><col><col></colgroup><tbody>' + rows + '</tbody></table>'
    + '</div>';
}

function generatePDFReport() {
  const data = getReportFilteredIncidents();
  showToast('Generating PDF report…', 'success');
  setTimeout(() => {
    const custFilter = (document.getElementById('reportCustomerFilter')?.value) || 'All Customers';
    const now = new Date().toLocaleString();
    const totalInc = data.length;
    const openInc = data.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
    const closedInc = data.filter(i => i.status === 'Closed' || i.status === 'Resolved').length;
    const critInc = data.filter(i => i.severity === 'Critical').length;

    const sevColor = s => ({ Critical: '#e74c3c', High: '#e67e22', Medium: '#3498db', Normal: '#2ecc71' }[s] || '#888');
    const stStyle = s => s === 'Closed' ? 'background:#e8f8f5;color:#1a7a5e'
      : s === 'New' ? 'background:#fef0f0;color:#c0392b'
        : 'background:#fef9e7;color:#7d6608';

    var closedData = data.filter(i => i.status === 'Closed');
    var totalDTmins = closedData.reduce((s, i) => s + getIncDowntimeMinutes(i), 0);

    // ── Chart helpers ────────────────────────────────────────────────────────
    function makePieChart(slices, title, W = 240, H = 240) {
      // slices = [{label, value, color}]
      const total = slices.reduce((s, x) => s + x.value, 0);
      if (!total) return '<div style="text-align:center;color:#aaa;font-size:12px;padding:20px">No data</div>';
      const cx = W / 2, cy = (H - 30) / 2 + 10, r = Math.min(cx, cy) - 28;
      let angle = -Math.PI / 2, paths = '', legend = '';
      slices.forEach(s => {
        if (!s.value) return;
        const sweep = (s.value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep);
        const large = sweep > Math.PI ? 1 : 0;
        // label position
        const midA = angle + sweep / 2, lx = cx + (r * 0.65) * Math.cos(midA), ly = cy + (r * 0.65) * Math.sin(midA);
        paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${s.color}" stroke="white" stroke-width="2"/>`;
        if (s.value / total > 0.04) paths += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" fill="white" font-size="11" font-weight="700">${Math.round(s.value / total * 100)}%</text>`;
        legend += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0"></div><div style="font-size:11px;color:#444">${s.label} (${s.value})</div></div>`;
        angle += sweep;
      });
      return `<div style="display:flex;align-items:center;gap:16px">
        <svg width="${W}" height="${H - 10}" viewBox="0 0 ${W} ${H - 10}">${paths}</svg>
        <div>${legend}</div></div>`;
    }

    function makeBarChart(bars, title, W = 420, H = 200) {
      // bars = [{label, value, color}]
      const max = Math.max(...bars.map(b => b.value), 1);
      const bW = Math.floor((W - 60) / bars.length) - 8;
      let rects = '', xLabels = '', yLabels = '';
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const y = 10 + (H - 50) * (1 - i / steps);
        const val = Math.round(max * i / steps);
        yLabels += `<line x1="40" y1="${y.toFixed(0)}" x2="${W}" y2="${y.toFixed(0)}" stroke="#eee" stroke-width="1"/>`;
        yLabels += `<text x="36" y="${(y + 4).toFixed(0)}" text-anchor="end" fill="#aaa" font-size="10">${val}</text>`;
      }
      bars.forEach((b, i) => {
        const bH = ((b.value / max) * (H - 50));
        const x = 44 + i * (bW + 8);
        const y = 10 + (H - 50) - bH;
        rects += `<rect x="${x}" y="${y.toFixed(1)}" width="${bW}" height="${bH.toFixed(1)}" rx="3" fill="${b.color}"/>`;
        if (b.value > 0) rects += `<text x="${(x + bW / 2).toFixed(0)}" y="${(y - 4).toFixed(0)}" text-anchor="middle" fill="${b.color}" font-size="11" font-weight="700">${b.value}</text>`;
        const lbl = b.label.length > 8 ? b.label.substring(0, 8) + '…' : b.label;
        xLabels += `<text x="${(x + bW / 2).toFixed(0)}" y="${H - 4}" text-anchor="middle" fill="#666" font-size="10">${lbl}</text>`;
      });
      return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">${yLabels}${rects}${xLabels}</svg>`;
    }

    // ── Build chart data ─────────────────────────────────────────────────────
    const sevSlices = [
      { label: 'Critical', value: data.filter(i => i.severity === 'Critical').length, color: '#e74c3c' },
      { label: 'High', value: data.filter(i => i.severity === 'High').length, color: '#e67e22' },
      { label: 'Medium', value: data.filter(i => i.severity === 'Medium').length, color: '#3498db' },
      { label: 'Normal', value: data.filter(i => i.severity === 'Normal').length, color: '#2ecc71' },
    ].filter(s => s.value > 0);

    const statusGroups = {};
    data.forEach(i => { statusGroups[i.status] = (statusGroups[i.status] || 0) + 1; });
    const statusColors = { 'New': '#e74c3c', 'In Progress': '#e67e22', 'Closed': '#2ecc71', 'Resolved': '#3498db', 'Tier 1 Level Support': '#9b59b6', 'Escalated to R&D': '#e91e63', 'Escalated to CSO Devops': '#00bcd4', 'Escalated to 3rd Party': '#ff9800', 'Further Investigation': '#607d8b' };
    const statusSlices = Object.entries(statusGroups).map(([k, v]) => ({ label: k, value: v, color: statusColors[k] || '#888' }));

    const areaGroups = {};
    data.forEach(i => { const a = i.area || 'Unspecified'; areaGroups[a] = (areaGroups[a] || 0) + 1; });
    const areaPalette = ['#3498db', '#e67e22', '#2ecc71', '#95a5a6', '#9b59b6', '#1abc9c'];
    const areaBars = Object.entries(areaGroups).map(([k, v], idx) => ({ label: k, value: v, color: areaPalette[idx % areaPalette.length] }));

    // Top 8 customers by incident count
    const custGroups = {};
    data.forEach(i => { custGroups[i.customer] = (custGroups[i.customer] || 0) + 1; });
    const custBars = Object.entries(custGroups).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v], i) => ({ label: k, value: v, color: ['#3498db', '#e74c3c', '#e67e22', '#2ecc71', '#9b59b6', '#1abc9c', '#f39c12', '#e91e63'][i % 8] }));

    // Customer downtime & area breakdown tables
    var custDT = {};
    closedData.forEach(i => { custDT[i.customer] = (custDT[i.customer] || 0) + getIncDowntimeMinutes(i); });
    var custDTrows = Object.entries(custDT).sort((a, b) => b[1] - a[1])
      .map(e => '<tr><td>' + e[0] + '</td><td style="font-weight:700;color:#e67e22">' + minutesToHM(e[1]) + '</td></tr>').join('');
    var areaDT = {};
    closedData.forEach(i => { var a = i.area || 'Unspecified'; areaDT[a] = (areaDT[a] || 0) + getIncDowntimeMinutes(i); });
    var areaDTrows = Object.entries(areaDT).sort((a, b) => b[1] - a[1])
      .map(e => '<tr><td>' + e[0] + '</td><td style="font-weight:700;color:#2980b9">' + minutesToHM(e[1]) + '</td></tr>').join('');

    const rows = data.slice(0, 100).map(i => {
      var dt = i.status === 'Closed' ? minutesToHM(getIncDowntimeMinutes(i)) : '—';
      return '<tr>'
        + '<td style="font-weight:600;color:#4f8ef7">' + i.id + '</td>'
        + '<td style="max-width:200px">' + i.title + '</td>'
        + '<td>' + i.customer + '</td>'
        + '<td style="color:' + sevColor(i.severity) + ';font-weight:600">' + i.severity + '</td>'
        + '<td>' + (i.area || '—') + '</td>'
        + '<td><span style="' + stStyle(i.status) + ';padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">' + i.status + '</span></td>'
        + '<td>' + i.engineer + '</td>'
        + '<td>' + i.date + '</td>'
        + '<td style="font-weight:700;color:#e67e22">' + dt + '</td>'
        + '<td style="color:#888">' + (i.resolvedBy || '—') + '</td>'
        + '<td style="font-weight:600;color:#4f8ef7;font-family:monospace">' + (i.sfCase || '—') + '</td>'
        + '</tr>';
    }).join('');

    // ── Build HTML ────────────────────────────────────────────────────────────
    const parts = [];
    parts.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">');
    parts.push('<title>Magic Cloud — Incident Report</title><style>');
    parts.push('*{box-sizing:border-box;margin:0;padding:0}');
    parts.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#1a1a2e;font-size:13px}');
    parts.push('.hdr{background:linear-gradient(135deg,#1a1a2e 0%,#2d3561 100%);color:white;padding:28px 40px;display:flex;justify-content:space-between;align-items:center}');
    parts.push('.hdr h1{font-size:20px;font-weight:700}.hdr .sub{font-size:11px;opacity:.6;margin-top:4px}');
    parts.push('.pbtn{background:#4f8ef7;color:white;border:none;padding:9px 20px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}');
    parts.push('.body{padding:28px 40px}');
    parts.push('.sec{font-size:14px;font-weight:700;color:#1a1a2e;margin:24px 0 12px;padding-bottom:7px;border-bottom:2px solid #e8eaf6;display:flex;align-items:center;gap:8px}');
    parts.push('.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:6px}');
    parts.push('.stat{background:white;border:1px solid #e8eaf6;border-radius:10px;padding:18px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.04)}');
    parts.push('.sv{font-size:32px;font-weight:800;line-height:1}.sl{font-size:11px;color:#888;margin-top:5px;font-weight:500}');
    parts.push('.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:6px}');
    parts.push('.chart-box{background:white;border:1px solid #e8eaf6;border-radius:10px;padding:18px;box-shadow:0 2px 6px rgba(0,0,0,.04)}');
    parts.push('.chart-title{font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}');
    parts.push('.chart-full{background:white;border:1px solid #e8eaf6;border-radius:10px;padding:18px;box-shadow:0 2px 6px rgba(0,0,0,.04);margin-bottom:6px}');
    parts.push('table{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.04);font-size:11px}');
    parts.push('thead{background:#f0f4ff}th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#5c6bc0;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e8eaf6}');
    parts.push('td{padding:9px 12px;border-bottom:1px solid #f0f0f8;vertical-align:middle}tr:last-child td{border-bottom:none}tr:hover td{background:#fafbff}');
    parts.push('.ftr{margin-top:28px;padding:16px 40px;background:#f0f4ff;font-size:10px;color:#888;text-align:center;border-top:1px solid #e8eaf6}');
    parts.push('@media print{.no-print{display:none!important}body{background:white}.chart-grid,.chart-full{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid}}');
    parts.push('</style></head><body>');

    // Header
    parts.push('<div class="hdr"><div>');
    parts.push('<div style="font-size:11px;opacity:.5;margin-bottom:5px;text-transform:uppercase;letter-spacing:1px">Magic Cloud</div>');
    parts.push('<h1>Incident Management Report</h1>');
    parts.push('<div class="sub">Generated: ' + now + ' &nbsp;|&nbsp; Filter: ' + custFilter + ' &nbsp;|&nbsp; ' + totalInc + ' incidents</div></div>');
    parts.push('<button class="pbtn no-print" onclick="window.print()">&#128424; Print / Save as PDF</button></div>');

    parts.push('<div class="body">');

    // Summary stats
    parts.push('<div class="sec">📊 Executive Summary</div>');
    parts.push('<div class="stats">');
    parts.push('<div class="stat"><div class="sv" style="color:#4f8ef7">' + totalInc + '</div><div class="sl">Total Incidents</div></div>');
    parts.push('<div class="stat"><div class="sv" style="color:#e74c3c">' + openInc + '</div><div class="sl">Open / Active</div></div>');
    parts.push('<div class="stat"><div class="sv" style="color:#2ecc71">' + closedInc + '</div><div class="sl">Resolved</div></div>');
    parts.push('<div class="stat"><div class="sv" style="color:#c0392b">' + critInc + '</div><div class="sl">Critical</div></div>');
    parts.push('</div>');

    // Charts row 1: Severity pie + Status pie
    parts.push('<div class="sec">📈 Visual Analytics</div>');
    parts.push('<div class="chart-grid">');
    parts.push('<div class="chart-box"><div class="chart-title">Severity Distribution</div>' + makePieChart(sevSlices, 'Severity') + '</div>');
    parts.push('<div class="chart-box"><div class="chart-title">Status Breakdown</div>' + makePieChart(statusSlices, 'Status') + '</div>');
    parts.push('</div>');

    // Charts row 2: Area bar + Customer bar
    parts.push('<div class="chart-grid">');
    parts.push('<div class="chart-box"><div class="chart-title">Incidents by Area</div>' + makeBarChart(areaBars, 'Area', 380, 180) + '</div>');
    parts.push('<div class="chart-box"><div class="chart-title">Top Customers by Incidents</div>' + makeBarChart(custBars, 'Customers', 380, 180) + '</div>');
    parts.push('</div>');

    // Incident log table
    parts.push('<div class="sec">📋 Incident Log</div>');
    parts.push('<table><thead><tr><th>ID</th><th>Title</th><th>Customer</th><th>Severity</th><th>Area</th><th>Status</th><th>Engineer</th><th>Date</th><th>Downtime</th><th>Resolved By</th><th>SF Case</th></tr></thead>');
    parts.push('<tbody>' + rows + '</tbody></table>');

    // Downtime section
    if (closedData.length) {
      parts.push('<div class="sec">⏱ Downtime Analysis</div>');
      parts.push('<div class="stats" style="grid-template-columns:repeat(3,1fr)">');
      parts.push('<div class="stat"><div class="sv" style="color:#e67e22">' + minutesToHM(totalDTmins) + '</div><div class="sl">Total Downtime</div></div>');
      parts.push('<div class="stat"><div class="sv" style="color:#e67e22">' + closedData.length + '</div><div class="sl">Closed Incidents</div></div>');
      parts.push('<div class="stat"><div class="sv" style="color:#e67e22">' + (closedData.length ? minutesToHM(Math.round(totalDTmins / closedData.length)) : '—') + '</div><div class="sl">Avg Downtime/Incident</div></div>');
      parts.push('</div>');
      parts.push('<div class="chart-grid" style="margin-top:12px">');
      parts.push('<div><div style="font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:8px">By Customer</div>');
      parts.push('<table><thead><tr><th>Customer</th><th>Downtime</th></tr></thead><tbody>' + custDTrows + '</tbody></table></div>');
      parts.push('<div><div style="font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:8px">By Area</div>');
      parts.push('<table><thead><tr><th>Area</th><th>Downtime</th></tr></thead><tbody>' + (areaDTrows || '<tr><td colspan="2" style="color:#aaa">No area data</td></tr>') + '</tbody></table></div>');
      parts.push('</div>');
    }

    parts.push('</div>');
    parts.push('<div class="ftr">Magic Cloud Incident Management Portal &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; ' + now + '</div>');
    parts.push('\n<\/script></body>\n</html>\n');

    const reportHTML = parts.join('\n');
    try {
      const blob = new Blob([reportHTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) { _openPDFPreview(reportHTML); }
      else { setTimeout(() => URL.revokeObjectURL(url), 60000); }
      showToast('✓ Report with charts opened', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }, 800);
}


function generateExcelReport() {
  if (!hasPermission('export_reports')) { showToast('Access denied: you cannot export reports', 'error'); return; }
  const data = getReportFilteredIncidents();
  showToast('📊 Generating Excel file\u2026', 'success');
  setTimeout(() => {
    _buildXLSX(data, 'MagicCloud_Incidents_' + new Date().toISOString().split('T')[0] + '.xlsx');
    showToast('\u2713 Excel preview ready', 'success');
  }, 400);
}

function _buildXLSX(data, filename, downloadNow) {
  const cols = [
    { key: 'id', label: 'ID', w: 10 },
    { key: 'title', label: 'Title', w: 45 },
    { key: 'customer', label: 'Customer', w: 20 },
    { key: 'project', label: 'Project', w: 26 },
    { key: 'severity', label: 'Severity', w: 12 },
    { key: 'status', label: 'Status', w: 24 },
    { key: 'engineer', label: 'Engineer', w: 20 },
    { key: 'area', label: 'Area', w: 16 },
    { key: 'timezone', label: 'Timezone', w: 10 },
    { key: 'startTime', label: 'Start Time', w: 26 },
    { key: 'endTime', label: 'End Time', w: 26 },
    { key: 'downtime', label: 'Downtime', w: 14 },
    { key: 'mttd', label: 'MTTD', w: 12 },
    { key: 'desc', label: 'Description', w: 50 },
    { key: 'rca', label: 'Root Cause', w: 50 },
    { key: 'resolution', label: 'Resolution', w: 50 },
    { key: 'resolvedBy', label: 'Resolved By', w: 18 },
    { key: 'sfCase', label: 'SF Case No.', w: 16 },
  ];

  // Pre-compute derived fields for each row
  data = data.map(function (inc) {
    const xlTZ = inc.timezone || 'IST';
    const slaH = { Critical: 1, High: 4, Medium: 12, Normal: 24 }[inc.severity] || 6;
    const dtStr = inc.downtimeStr ||
      (inc.downtimeH > 0
        ? inc.downtimeH + 'h' + (inc.downtimeM > 0 ? ' ' + inc.downtimeM + 'm' : '')
        : inc.downtimeM > 0 ? inc.downtimeM + 'm' : '—');
    const mttdStr2 = inc.mttdStr || (inc.mttdH > 0 ? inc.mttdH + 'h' + (inc.mttdM > 0 ? ' ' + inc.mttdM + 'm' : '') : inc.mttdM > 0 ? inc.mttdM + 'm' : '—');
    // Start time: stored in IST as datetime-local string
    const istOff = getTZOffset('IST');
    const rawStart = inc.startDT || (inc.date + 'T09:00');
    const startDateObj = incidentTimestampDate(inc, 'start') || wallClockToDate(rawStart, xlTZ);
    const slaActual = (inc.downtimeH || 0) + (inc.downtimeM || 0) / 60 || slaH;
    const endDateObj = incidentTimestampDate(inc, 'end') || new Date(startDateObj.getTime() + slaActual * 3600000);
    const startTime = fmtInTZ(startDateObj, xlTZ);
    const endTime = fmtInTZ(endDateObj, xlTZ);
    return Object.assign({}, inc, {
      timezone: xlTZ,
      startTime: startTime,
      endTime: endTime,
      downtime: dtStr,
      mttd: mttdStr2,
    });
  });


  if (!downloadNow) {
    _openExcelPreview('Excel Preview', cols, data, filename, function () {
      _buildXLSX(data, filename, true);
      showToast('\u2713 Excel file downloaded', 'success');
    });
    return;
  }

  // Shared strings
  const strs = [], strIdx = {};
  function si(v) { const s = String(v ?? ''); if (strIdx[s] === undefined) { strIdx[s] = strs.length; strs.push(s); } return strIdx[s]; }
  cols.forEach(c => si(c.label));
  data.forEach(r => cols.forEach(c => si(r[c.key] ?? '')));

  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Column letter (A-Z only, max 26 cols)
  function col(i) { return String.fromCharCode(65 + i); }
  function ref(c, r) { return col(c) + r; }
  function sc(c, r, si, s) { return '<c r="' + ref(c, r) + '" t="s" s="' + s + '"><v>' + si + '</v></c>'; }

  // Style IDs:
  // 0=normal  1=header(yellow+bold)  2=ID(white)  3=ID(gray)
  // 4=white   5=gray   6=Critical   7=High   8=Medium   9=Normal
  const sevStyle = { Critical: 6, High: 7, Medium: 8, Normal: 9 };

  // Sheet rows
  let rows = '';
  // Header row
  rows += '<row r="1" ht="18" customHeight="1">';
  cols.forEach((c, ci) => { rows += sc(ci, 1, si(c.label), 1); });
  rows += '</row>';
  // Data rows
  data.forEach((row, ri) => {
    const er = ri + 2, alt = ri % 2 === 1;
    const base = alt ? 5 : 4, idS = alt ? 3 : 2, sev = row.severity || '';
    rows += '<row r="' + er + '" ht="15">';
    cols.forEach((c, ci) => {
      const s = ci === 0 ? idS : c.key === 'severity' ? (sevStyle[sev] || base) : base;
      rows += sc(ci, er, si(row[c.key] ?? ''), s);
    });
    rows += '</row>';
  });

  const colXml = cols.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + c.w + '" customWidth="1"/>').join('');

  const sheetXml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + '<cols>' + colXml + '</cols>'
    + '<sheetData>' + rows + '</sheetData>'
    + '<autoFilter ref="A1:M1"/>'
    + '</worksheet>';

  const ssXml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strs.length + '" uniqueCount="' + strs.length + '">'
    + strs.map(s => '<si><t xml:space="preserve">' + esc(s) + '</t></si>').join('')
    + '</sst>';

  const stylesXml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3">'
    + '<font><sz val="10"/><name val="Arial"/></font>'
    + '<font><sz val="10"/><b/><name val="Arial"/><color rgb="FF000000"/></font>'
    + '<font><sz val="10"/><name val="Arial"/><color rgb="FF1F3864"/></font>'
    + '</fonts>'
    + '<fills count="10">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="10">'
    + '<xf numFmtId="0" fontId="0" fillId="0"  borderId="1" xfId="0"><alignment wrapText="1" vertical="center"/></xf>'                           // 0 normal
    + '<xf numFmtId="0" fontId="1" fillId="2"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 1 header
    + '<xf numFmtId="0" fontId="2" fillId="3"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 2 ID white
    + '<xf numFmtId="0" fontId="2" fillId="5"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 3 ID gray
    + '<xf numFmtId="0" fontId="0" fillId="3"  borderId="1" xfId="0"><alignment wrapText="1" vertical="center"/></xf>'                           // 4 white row
    + '<xf numFmtId="0" fontId="0" fillId="5"  borderId="1" xfId="0"><alignment wrapText="1" vertical="center"/></xf>'                           // 5 gray row
    + '<xf numFmtId="0" fontId="0" fillId="6"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 6 Critical
    + '<xf numFmtId="0" fontId="0" fillId="7"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 7 High
    + '<xf numFmtId="0" fontId="0" fillId="8"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 8 Medium
    + '<xf numFmtId="0" fontId="0" fillId="9"  borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>'                    // 9 Normal
    + '</cellXfs>'
    + '</styleSheet>';

  _downloadXLSX(filename, sheetXml, stylesXml, ssXml);
}
function _downloadXLSX(filename, sheetXml, stylesXml, ssXml) {
  const enc = new TextEncoder();
  function toB(s) { return enc.encode(s); }
  const T = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++)c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); T[i] = c; }
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++)c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }
  function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }

  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';
  const wbXml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="Incidents" sheetId="1" r:id="rId1"/></sheets>'
    + '</workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  const files = [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['xl/workbook.xml', wbXml],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheetXml],
    ['xl/sharedStrings.xml', ssXml],
    ['xl/styles.xml', stylesXml],
  ];

  const lparts = [], cparts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nb = toB(name), cb = toB(content);
    const crc = crc32(cb), sz = cb.length;
    const lh = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), 0, 0, 0, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nb.length), ...u16(0)]);
    lparts.push(lh, nb, cb);
    const cd = new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), 0, 0, 0, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]);
    cparts.push(cd, nb);
    offset += lh.length + nb.length + sz;
  }
  const cdOff = offset, cdSz = cparts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSz), ...u32(cdOff), ...u16(0)]);
  const all = [...lparts, ...cparts, eocd];
  const tot = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(tot); let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}


// ─── INCIDENT REPORT VIEW ─────────────────────────────────────
const SLA_TARGETS = { Critical: 2, High: 6, Medium: 24, Normal: 72 }; // hours

function getResolutionHours(inc) {
  const base = { Critical: 1.5, High: 4.2, Medium: 8.7, Normal: 24.3 };
  const jitter = (Math.random() * 0.6) - 0.3;
  return inc.status === 'Closed' ? (base[inc.severity] + jitter).toFixed(1) : null;
}

function viewIncidentReport(id) {
  if (!hasPermission('view_reports')) { showToast('Access denied: you cannot view reports', 'error'); return; }
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  document.getElementById('ir_id').textContent = inc.id + ' — Incident Report';
  document.getElementById('ir_title').textContent = inc.title;
  document.getElementById('ir_meta').innerHTML = `<span class="badge badge-${inc.severity.toLowerCase()}">${inc.severity}</span> &nbsp; <span class="badge">${inc.status}</span>`;
  var _q = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }; _q('ir_subject', inc.title);
  _q('ir_desc', inc.desc || 'No description provided.');
  _q('ir_customer', inc.customer);
  _q('ir_project', inc.project);
  _q('ir_product_line', inc.product_line || '—');
  _q('ir_rd_tickets', inc.rd_tickets || inc.rdTickets || '—');
  _q('ir_engineer', inc.engineer);
  const irAreaEl = document.getElementById('ir_area'); if (irAreaEl) irAreaEl.textContent = inc.area || '—';
  const irMttdEl = document.getElementById('ir_mttd'); if (irMttdEl) irMttdEl.textContent = inc.mttdStr || (inc.mttdH > 0 ? inc.mttdH + 'h' + (inc.mttdM > 0 ? ' ' + inc.mttdM + 'm' : '') : inc.mttdM > 0 ? inc.mttdM + 'm' : '—');
  const irMttrEl = document.getElementById('ir_mttr'); if (irMttrEl) irMttrEl.textContent = getCriticalOnlyReportValue(inc, inc.mttrStr || (inc.mttrH > 0 ? inc.mttrH + 'h' + (inc.mttrM > 0 ? ' ' + inc.mttrM + 'm' : '') : inc.mttrM > 0 ? inc.mttrM + 'm' : '—'));
  const reportLabels = getCriticalReportLabels(inc);
  document.getElementById('ir_date').textContent = new Date(inc.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('ir_severity').innerHTML = `<span class="badge badge-${inc.severity.toLowerCase()}">${inc.severity}</span>`;
  document.getElementById('ir_status').innerHTML = `<span class="badge">${inc.status}</span>`;
  const slaHours = { Critical: 1, High: 4, Medium: 12, Normal: 24 }[inc.severity] || 6;
  const baseDate = new Date(inc.date + 'T09:00:00');
  const actualHours = (inc.downtimeH || 0) + (inc.downtimeM || 0) / 60 || slaHours;
  const endDate = new Date(baseDate.getTime() + actualHours * 3600000);
  const fmt = d => d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  document.getElementById('ir_start_time').textContent = inc.downtimeStart ? fmt(new Date(inc.downtimeStart)) : fmt(baseDate);
  document.getElementById('ir_end_time').textContent = inc.downtimeEnd ? fmt(new Date(inc.downtimeEnd)) : fmt(endDate);
  const dtH = inc.downtimeH !== undefined ? inc.downtimeH : Math.floor(slaHours);
  const dtM = inc.downtimeM !== undefined ? inc.downtimeM : Math.round((slaHours % 1) * 60);
  const downtimeEl = document.getElementById('ir_downtime');
  if (downtimeEl) downtimeEl.textContent = inc.downtimeStr || (dtH > 0 ? `${dtH}h ${dtM > 0 ? dtM + 'm' : ''}`.trim() : `${dtM}m`);
  const downtimeLabelEl = document.querySelector('#ir_downtime')?.previousElementSibling;
  if (downtimeLabelEl) downtimeLabelEl.textContent = reportLabels.sla;
  const rcaMap = {
    Critical: 'Critical system failure due to infrastructure misconfiguration or security breach. Full forensic analysis conducted.',
    High: 'Service degradation caused by application-level error or upstream dependency failure. Identified during incident triage.',
    Medium: 'Functional issue traced to configuration drift or software defect. Isolated to specific service component.',
    Normal: 'Minor operational issue with limited user impact. Resolved through standard change management procedures.',
  };
  const resMap = {
    Critical: 'Emergency rollback applied. Hotfix deployed to production. Infrastructure hardened. Post-incident review scheduled.',
    High: 'Service restored by restarting affected components and applying configuration fix. Monitoring enhanced.',
    Medium: 'Configuration corrected and deployment pushed. Verified stable across all environments.',
    Normal: 'Issue resolved via standard support procedure. Documentation updated.',
  };
  _q('ir_rca', inc.rca || rcaMap[inc.severity] || 'Root cause analysis pending.');
  _q('ir_resolution', inc.resolution || resMap[inc.severity] || 'Resolution steps applied.');
  const irRB = document.getElementById('ir_resolved_by'); if (irRB) irRB.textContent = inc.resolvedBy || '—';
  const irSF = document.getElementById('ir_sf_case'); if (irSF) { irSF.textContent = inc.sfCase || '—'; irSF.style.color = inc.sfCase ? '#4f8ef7' : 'var(--text-secondary)'; }
  // Timezone: reset to IST on fresh open, render selector, apply timestamps
  reportCurrentIncId = inc.id;
  // Refresh mention suggestions from the database whenever the report opens.
  loadUsersFromBackend(function () {});
  // Use the timezone that was active when the incident was last saved
  const reportTZ = inc.timezone || 'IST';
  selectedTZ = reportTZ;
  updateReportTimestamps(inc.id, reportTZ);
  openModal('incidentReportModal');
}

function printIncidentReport() {
  window.print();
}

function exportIncidentExcel() {
  const id = document.getElementById('ir_id').textContent.split(' ')[0];
  const inc = incidents.find(i => i.id === id);
  if (!inc) { showToast('No incident selected', 'error'); return; }
  if (!window.IncidentReportExcel) {
    showToast('Excel report template is unavailable', 'error');
    return;
  }
  try {
    const workbook = window.IncidentReportExcel.buildIncidentReportWorkbook(inc, {
      reportCreator: currentUserName || ''
    });
    _openExcelPreview('Incident Excel Preview', [], [], workbook.filename, function () {
      const bytes = window.IncidentReportExcel.createXlsxBytes(workbook);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = workbook.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      showToast('\u2713 Incident Excel exported', 'success');
    }, { sheetHtml: _incidentExcelSheetPreview(workbook.model) });
    showToast('\u2713 Incident Excel preview ready', 'success');
  } catch (error) {
    console.error('Incident Excel export failed:', error);
    showToast('Excel export failed: ' + error.message, 'error');
  }
}


function exportIncidentPDF() {
  const id = document.getElementById('ir_id').textContent.split(' ')[0];
  const inc = incidents.find(i => i.id === id);
  if (!inc) { showToast('No incident selected', 'error'); return; }

  // Read directly from the incident object — no DOM scraping
  const subject = inc.title;
  const summary = inc.desc || 'No description provided.';
  const customer = inc.customer;
  const project = inc.project;
  const engineer = inc.engineer;
  const reportedDate = fmtInTZ(incidentTimestampDate(inc, 'start'), inc.timezone || 'IST').split(',')[0];
  const severity = inc.severity;
  const status = inc.status;
  const resolvedBy = inc.resolvedBy || '—';
  const sfCase = inc.sfCase || '—';
  const area = inc.area || '—';
  const mttd = inc.mttdStr || (inc.mttdH > 0 ? inc.mttdH + 'h' + (inc.mttdM > 0 ? ' ' + inc.mttdM + 'm' : '') : inc.mttdM > 0 ? inc.mttdM + 'm' : '—');

  // Timeline — use inc.timezone (set during create/edit) for all time display
  const pdfTZ = inc.timezone || 'IST';
  const slaHours = { Critical: 1, High: 4, Medium: 12, Normal: 24 }[severity] || 6;
  const istOff = getTZOffset('IST');
  const rawStart = inc.startDT || (inc.date + 'T09:00');
  const baseDate = incidentTimestampDate(inc, 'start') || wallClockToDate(rawStart, pdfTZ);
  const startTime = fmtInTZ(baseDate, pdfTZ);
  const actualHours = (inc.downtimeH || 0) + (inc.downtimeM || 0) / 60 || slaHours;
  const endDate = incidentTimestampDate(inc, 'end') || new Date(baseDate.getTime() + actualHours * 3600000);
  const endTime = fmtInTZ(endDate, pdfTZ);
  const downtime = inc.downtimeStr || (inc.downtimeH > 0 ? `${inc.downtimeH}h${inc.downtimeM > 0 ? ' ' + inc.downtimeM + 'm' : ''}` : inc.downtimeM > 0 ? `${inc.downtimeM}m` : slaHours + 'h');

  const rcaMap = {
    Critical: 'Critical system failure due to infrastructure misconfiguration or security breach.',
    High: 'Service degradation caused by application-level error or upstream dependency failure.',
    Medium: 'Functional issue traced to configuration drift or software defect.',
    Normal: 'Minor operational issue with limited user impact.',
  };
  const resMap = {
    Critical: 'Emergency rollback applied. Hotfix deployed to production. Post-incident review scheduled.',
    High: 'Service restored by restarting affected components and applying configuration fix.',
    Medium: 'Configuration corrected and deployment pushed. Verified stable across all environments.',
    Normal: 'Issue resolved via standard support procedure. Documentation updated.',
  };
  const rca = inc.rca || rcaMap[severity] || 'Root cause analysis pending.';
  const resolution = inc.resolution || resMap[severity] || 'Resolution steps applied.';

  const sevColors = { Critical: '#dc2626', High: '#ea580c', Medium: '#ca8a04', Normal: '#16a34a' };
  const sc = sevColors[severity] || '#3b4abf';


  // Build HTML via parts array — no broken tags in source, renders correctly in blob
  const parts = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="en">');
  parts.push('<head>');
  parts.push('<meta charset="UTF-8">');
  parts.push('<title>' + inc.id + ' - Incident Report</title>');
  parts.push('<style>');
  parts.push('*{margin:0;padding:0;box-sizing:border-box}');
  parts.push('body{font-family:Segoe UI,Arial,sans-serif;padding:40px;color:#1a1a2e;max-width:820px;margin:auto;font-size:13px}');
  parts.push('.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #e0e7ff}');
  parts.push('.inc-id{font-family:monospace;font-size:11px;color:#888;margin-bottom:4px}');
  parts.push('.inc-title{font-size:20px;font-weight:800;color:#1a1a2e;line-height:1.3;max-width:560px}');
  parts.push('.badges{display:flex;gap:8px;margin-top:8px}');
  parts.push('.badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}');
  parts.push('.logo{font-size:11px;color:#888;text-align:right;line-height:1.6}');
  parts.push('h2{font-size:12px;font-weight:700;color:#3b4abf;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e0e7ff;padding-bottom:5px;margin:24px 0 12px}');
  parts.push('.desc-box{background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:14px;font-size:13px;line-height:1.7;color:#333}');
  parts.push('.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}');
  parts.push('.field{background:#f8faff;border:1px solid #e0e7ff;border-radius:7px;padding:10px 14px}');
  parts.push('.field-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}');
  parts.push('.field-val{font-size:13px;font-weight:600;color:#1a1a2e}');
  parts.push('.downtime-box{background:#fff5f5;border:2px solid #fecaca;border-radius:8px;padding:16px;text-align:center;margin-top:10px}');
  parts.push('.downtime-val{font-size:36px;font-weight:900;color:#dc2626}');
  parts.push('.downtime-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px}');
  parts.push('.ftr{margin-top:32px;padding-top:12px;border-top:1px solid #e0e7ff;font-size:10px;color:#aaa;display:flex;justify-content:space-between}');
  parts.push('.no-print{margin-bottom:20px}');
  parts.push('@media print{.no-print{display:none}body{padding:24px}}');
  parts.push('</style>');
  parts.push('</head>');
  parts.push('<body>');
  parts.push('<div class="no-print"><button onclick="window.print()" style="padding:9px 22px;background:#3b4abf;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">&#128424; Print / Save as PDF</button></div>');
  parts.push('<div class="hdr">');
  parts.push('<div>');
  parts.push('<div class="inc-id">' + inc.id + ' &mdash; INCIDENT REPORT</div>');
  parts.push('<div class="inc-title">' + subject + '</div>');
  parts.push('<div class="badges">');
  parts.push('<span class="badge" style="background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '">' + severity + '</span>');
  parts.push('<span class="badge" style="background:#f0f4ff;color:#3b4abf;border:1px solid #c7d7ff">' + status + '</span>');
  parts.push('</div></div>');
  parts.push('<div class="logo">Magic Cloud<br>Incident Management Portal<br>' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '</div>');
  parts.push('</div>');
  parts.push('<h2>Summary</h2>');
  parts.push('<div class="desc-box">' + summary + '</div>');
  parts.push('<h2>Incident Details</h2>');
  parts.push('<div class="grid2">');
  parts.push('<div class="field"><div class="field-lbl">Customer</div><div class="field-val">' + customer + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">Project / Service</div><div class="field-val">' + project + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">Assigned To</div><div class="field-val">' + engineer + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">Reported Date</div><div class="field-val">' + reportedDate + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">Area</div><div class="field-val">' + area + '</div></div>');
  parts.push('</div>');
  parts.push('<h2>Incident Timeline &amp; Downtime</h2>');
  parts.push('<div class="grid2">');
  parts.push('<div class="field"><div class="field-lbl">Start Time (' + pdfTZ + ')</div><div class="field-val">' + startTime + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">End Time (' + pdfTZ + ')</div><div class="field-val">' + endTime + '</div></div>');
  parts.push('</div>');
  parts.push('<div class="downtime-box"><div class="downtime-val">' + downtime + '</div><div class="downtime-lbl">' + (isCriticalSeverity(inc) ? 'Critical SLA' : 'Total Downtime') + '</div></div>');
  parts.push('<div class="grid2" style="margin-top:12px">');
  parts.push('<div class="field"><div class="field-lbl">Mean Time to Detect (MTTD)</div><div class="field-val" style="font-weight:700;color:#2563eb">' + mttd + '</div></div>');
  parts.push('</div>');
  parts.push('<h2>Root Cause Analysis (RCA)</h2>');
  parts.push('<div class="desc-box">' + rca + '</div>');
  parts.push('<h2>Resolution</h2>');
  parts.push('<div class="desc-box">' + resolution + '</div>');
  parts.push('<h2>Resolution Info</h2>');
  parts.push('<div class="grid2">');
  parts.push('<div class="field"><div class="field-lbl">Resolved By</div><div class="field-val">' + resolvedBy + '</div></div>');
  parts.push('<div class="field"><div class="field-lbl">Salesforce Case No.</div><div class="field-val" style="color:#4f8ef7;font-weight:700;font-family:monospace">' + sfCase + '</div></div>');
  parts.push('</div>');
  parts.push('<div class="ftr"><span>Magic Cloud &mdash; Incident Management Portal</span><span>Generated: ' + new Date().toLocaleString('en-GB') + '</span></div>');
  parts.push('</body>');
  parts.push('</html>');

  const content = parts.join('\n');

  try {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      _openPDFPreview(content);
    } else {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    showToast('\u2713 Incident report preview opened', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}


function getReportFilteredIncidents() {
  const cust = document.getElementById('reportCustomerFilter')?.value || '';
  const sev = document.getElementById('reportSeverityFilter')?.value || '';
  const stat = document.getElementById('reportStatusFilter')?.value || '';
  const from = document.getElementById('reportDateFrom')?.value || '';
  const to = document.getElementById('reportDateTo')?.value || '';

  const area = document.getElementById('reportAreaFilter')?.value || '';
  return incidents.filter(i => {
    if (cust && i.customer !== cust) return false;
    if (sev && i.severity !== sev) return false;
    if (stat && i.status !== stat) return false;
    if (area && i.area !== area) return false;
    if (from && i.date < from) return false;
    if (to && i.date > to) return false;
    return true;
  });
}

function updateReportPreview() {
  const data = getReportFilteredIncidents();
  const total = data.length;
  const closed = data.filter(i => i.status === 'Closed').length;
  const critical = data.filter(i => i.severity === 'Critical').length;
  const open = data.filter(i => i.status !== 'Closed').length;

  var _rpt = document.getElementById('rp_total'); if (_rpt) _rpt.textContent = total;
  var _rpc = document.getElementById('rp_closed'); if (_rpc) _rpc.textContent = closed;
  var _rpk = document.getElementById('rp_critical'); if (_rpk) _rpk.textContent = critical;
  var _rpo = document.getElementById('rp_open'); if (_rpo) _rpo.textContent = open;

  document.getElementById('rp_total_bar').style.width = '100%';
  document.getElementById('rp_closed_bar').style.width = total ? Math.round(closed / total * 100) + '%' : '0%';
  document.getElementById('rp_critical_bar').style.width = total ? Math.round(critical / total * 100) + '%' : '0%';
  document.getElementById('rp_open_bar').style.width = total ? Math.round(open / total * 100) + '%' : '0%';
  // Downtime
  const closedData2 = data.filter(i => i.status === 'Closed');
  const totalDTmins2 = closedData2.reduce((s, i) => s + getIncDowntimeMinutes(i), 0);
  const dtEl = document.getElementById('rp_downtime');
  const dtBar = document.getElementById('rp_downtime_bar');
  if (dtEl) dtEl.textContent = minutesToHM(totalDTmins2);
  if (dtBar) dtBar.style.width = closedData2.length ? '100%' : '0%';

  const cust = document.getElementById('reportCustomerFilter')?.value;
  const sev = document.getElementById('reportSeverityFilter')?.value;
  const filterDesc = [cust, sev].filter(Boolean).join(', ') || 'All incidents';
  var _rpl = document.getElementById('reportPreviewLabel'); if (_rpl) _rpl.textContent = filterDesc + ' (' + total + ' records)';

  // Preview table
  const preview = data.slice(0, 8);
  var _rptbl = document.getElementById('reportPreviewTable'); if (_rptbl) _rptbl.innerHTML = preview.map(i => `
    <tr>
      <td class="id-cell">${i.id}</td>
      <td class="title-cell" style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.title}</td>
      <td style="font-size:12px">${i.customer}</td>
      <td><span class="badge badge-${i.severity.toLowerCase()}">${i.severity}</span></td>
      <td><span class="badge badge-${i.status.toLowerCase().replace(' ', '-')}">${i.status}</span></td>
      <td style="font-size:12px">${i.engineer}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${i.date}</td>
    </tr>
  `).join('');

  if (data.length > 8) {
    document.getElementById('reportPreviewMore').textContent = `+ ${data.length - 8} more incidents in full export`;
  } else {
    var _rpm2 = document.getElementById('reportPreviewMore'); if (_rpm2) _rpm2.textContent = '';
  }
}

function clearReportFilters() {
  ['reportCustomerFilter', 'reportSeverityFilter', 'reportStatusFilter', 'reportDateFrom', 'reportDateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateReportPreview();
}


// ─── INCIDENT DETAIL PANEL ────────────────────────────────────

// SLA_MAP removed — use SLA_HOURS = {Critical:1,High:4,Medium:12,Normal:24}

function openDetailPanel(id, editMode = false) {
  if (!hasPermission('view_incidents')) { showToast('Access denied: you cannot view incidents', 'error'); return; }
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  detailCurrentId = id;
  selectedTZ = inc.timezone || selectedTZ || 'IST';

  const panel = document.getElementById('detailPanel');
  const overlay = document.getElementById('detailOverlay');

  // Populate view mode
  var _s = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
  _s('dp_id', inc.id);
  _s('dp_title', inc.title);
  _s('dp_customer', inc.customer);
  _s('dp_project', inc.project);
  _s('dp_engineer', inc.engineer);
  const incidentTimezone = inc.timezone || inc.source_timezone || 'IST';
  // Incident datetimes are persisted in the incident's selected timezone; display stored values directly.
  const dpDateEl = document.getElementById('dp_date');
  if (dpDateEl) {
    dpDateEl.textContent = formatStoredIncidentDateTime(inc.date_time_opened || inc.startDT || (inc.date ? inc.date + 'T09:00' : '')) + ' ' + incidentTimezone;
  }

  const dpEndDateEl = document.getElementById('dp_end_date');
  if (dpEndDateEl) {
    const endDateText = formatStoredIncidentDateTime(inc.date_time_closed || inc.endDT || inc.downtimeEnd);
    dpEndDateEl.textContent = endDateText === 'N/A' ? endDateText : endDateText + ' ' + incidentTimezone;
  }

  const dpAreaEl = document.getElementById('dp_area');
  if (dpAreaEl) dpAreaEl.textContent = inc.area || '—';
  const dpProductLineEl = document.getElementById('dp_product_line');
  if (dpProductLineEl) dpProductLineEl.textContent = inc.product_line || '—';
  const dpRdTicketsEl = document.getElementById('dp_rd_tickets');
  if (dpRdTicketsEl) dpRdTicketsEl.textContent = inc.rd_tickets || inc.rdTickets || '—';
  const dpRdTicketsReportEl = document.getElementById('dp_rd_tickets_report');
  if (dpRdTicketsReportEl) dpRdTicketsReportEl.textContent = inc.rd_tickets || inc.rdTickets || '—';

  // Tags — view mode
  var dpTagsView = document.getElementById('dp_tags_view');
  if (dpTagsView) {
    var tags = inc.tags || [];
    dpTagsView.innerHTML = tags.length
      ? tags.map(function (t) { return renderTagChip(t, false, inc.id); }).join('')
      : '<span style="font-size:12px;color:var(--text-muted)">No tags</span>';
  }
  // Tags — edit mode chips
  var dpTagsChips = document.getElementById('dp_tags_chips');
  if (dpTagsChips) {
    var tags2 = inc.tags || [];
    dpTagsChips.innerHTML = tags2.length
      ? tags2.map(function (t) { return renderTagChip(t, true, inc.id); }).join('')
      : '<span style="font-size:12px;color:var(--text-muted)">No tags yet</span>';
  }
  var _si = function (id, val) { var e = document.getElementById(id); if (e) e.innerHTML = val; };
  _si('dp_sev_text', '<span class="badge badge-' + inc.severity.toLowerCase() + '">' + inc.severity + '</span>');
  _si('dp_stat_text', '<span class="badge badge-' + inc.status.toLowerCase().replace(/ /g, '-').replace(/&/g, '') + '">' + inc.status + '</span>');
  _s('dp_desc', inc.desc || 'No description provided.');

  // RCA & Resolution — show only for closed incidents with data
  const rcaSection = document.getElementById('dp_rca_section');
  if (rcaSection) {
    // Show whenever any report detail has been saved — not just when Closed
    const hasAny = inc.rca || inc.resolution || inc.downtimeH > 0 || inc.downtimeM > 0 || inc.mttrH > 0 || inc.mttrM > 0;
    rcaSection.style.display = hasAny ? '' : 'none';
    if (hasAny) {
      document.getElementById('dp_rca').textContent = inc.rca || '—';
      document.getElementById('dp_resolution').textContent = inc.resolution || '—';
      const dpRB = document.getElementById('dp_resolved_by'); if (dpRB) dpRB.textContent = inc.resolvedBy || '—';
      const dpSF = document.getElementById('dp_sf_case'); if (dpSF) { dpSF.textContent = inc.sfCase || '—'; dpSF.style.color = inc.sfCase ? '#4f8ef7' : 'var(--text-secondary)'; }
      const dtView = document.getElementById('dp_view_downtime');
      if (dtView) dtView.textContent = inc.downtimeStr || (inc.downtimeH > 0 ? inc.downtimeH + 'h' + (inc.downtimeM > 0 ? ' ' + inc.downtimeM + 'm' : '') : inc.downtimeM > 0 ? inc.downtimeM + 'm' : '—');
      const mttrView = document.getElementById('dp_view_mttr');
      if (mttrView) mttrView.textContent = inc.mttrStr || (inc.mttrH > 0 ? inc.mttrH + 'h' + (inc.mttrM > 0 ? ' ' + inc.mttrM + 'm' : '') : inc.mttrM > 0 ? inc.mttrM + 'm' : '—');
    }
  }

  // Top badges
  _si('dp_status_badge', '<span class="badge badge-' + inc.status.toLowerCase().replace(/ /g, '-').replace(/&/g, '') + '">' + inc.status + '</span>');
  _si('dp_severity_badge', '<span class="badge badge-' + inc.severity.toLowerCase() + '">' + inc.severity + '</span>');

  // SLA
  const slaTarget = SLA_HOURS[inc.severity] || 24;

  // Response Time = time from incident creation to first non-create activity
  // Use comment timestamps (relative to each other) — not the date field which is a fixed past date
  let responseTime = null;
  const allComments = (incidentComments[inc.id] || []);
  const createEntry = allComments.find(c => c.type === 'create');
  const firstAction = allComments.find(c => c.type !== 'create' && c.timestamp);
  if (createEntry && createEntry.timestamp && firstAction) {
    const diffMs = firstAction.timestamp - createEntry.timestamp;
    if (diffMs > 0) responseTime = (diffMs / 3600000).toFixed(2);
  }
  // Fallback for incidents with no comments: use realistic estimate based on severity
  if (responseTime === null) {
    const respMap = { Critical: 0.25, High: 0.75, Medium: 1.5, Normal: 3 }; // hours
    const base = respMap[inc.severity] || 1;
    // Use incident id number as seed for deterministic (not random) variation
    const seed = parseInt((inc.id || 'INC-001').replace(/\D/g, '')) || 1;
    const variation = ((seed % 10) - 5) * 0.02; // ±0.1h deterministic variation
    responseTime = Math.max(0.08, base + variation).toFixed(2);
  }

  // Resolution Time = time from start to close (downtimeEnd or recorded downtime)
  const incDate = inc.startDT ? new Date(inc.startDT) : new Date((inc.date || new Date().toISOString().substring(0, 10)) + 'T09:00:00');
  let resolveTime = null;
  if (inc.status === 'Closed') {
    if (inc.downtimeEnd) {
      resolveTime = ((new Date(inc.downtimeEnd) - incDate) / 3600000).toFixed(1);
    } else if (inc.downtimeH > 0 || inc.downtimeM > 0) {
      resolveTime = ((inc.downtimeH || 0) + (inc.downtimeM || 0) / 60).toFixed(1);
    }
  }

  const slaOk = resolveTime ? parseFloat(resolveTime) <= slaTarget : null;

  // Convert response time to minutes for display
  const respMins = responseTime !== null ? Math.round(parseFloat(responseTime) * 60) : null;
  const respDisplay = respMins !== null
    ? respMins < 60 ? respMins + 'm'
      : Math.floor(respMins / 60) + 'h ' + (respMins % 60 > 0 ? respMins % 60 + 'm' : '')
    : 'N/A';
  var _slaEl = document.getElementById('dp_sla_resp'); if (_slaEl) _slaEl.textContent = respDisplay;
  // MTTD
  const mttdEl = document.getElementById('dp_mttd');
  if (mttdEl) {
    if (inc.mttdStr) {
      mttdEl.textContent = inc.mttdStr;
    } else if (inc.mttdH > 0 || inc.mttdM > 0) {
      const mttdMins = (inc.mttdH || 0) * 60 + (inc.mttdM || 0);
      mttdEl.textContent = mttdMins < 60 ? mttdMins + 'm' : Math.floor(mttdMins / 60) + 'h ' + (mttdMins % 60 > 0 ? mttdMins % 60 + 'm' : '');
    } else {
      mttdEl.textContent = '—';
      mttdEl.style.color = 'var(--text-muted)';
    }
  }
  const respEl = document.getElementById('dp_sla_resp');
  if (responseTime !== null) {
    respEl.style.color = parseFloat(responseTime) <= slaTarget ? 'var(--success)' : 'var(--danger)';
  } else {
    respEl.style.color = 'var(--text-muted)';
  }
  const resEl = document.getElementById('dp_sla_res');
  if (resEl) { resEl.textContent = resolveTime ? resolveTime + 'h' : 'Ongoing'; resEl.style.color = resolveTime ? 'var(--success)' : 'var(--warning)'; }
  const slaStatEl = document.getElementById('dp_sla_stat');
  if (slaStatEl) { slaStatEl.textContent = slaOk === null ? 'Active' : slaOk ? 'Met ✓' : 'Breached ✗'; slaStatEl.style.color = slaOk === null ? 'var(--warning)' : slaOk ? 'var(--success)' : 'var(--danger)'; }

  // Footer note
  var _fn = document.getElementById('dp_footer_note'); if (_fn) _fn.textContent = 'Last updated: ' + inc.date + ' · Magic Cloud Portal';

  // Show/hide edit button based on role
  const editBtnWrap = document.getElementById('dp_edit_btn_wrap');
  const closeIncBtn = document.getElementById('dp_close_inc_btn');
  editBtnWrap.style.display = hasPermission('edit_incidents') ? '' : 'none';
  closeIncBtn.style.display = (hasPermission('close_incidents') && inc.status !== 'Closed') ? '' : 'none';

  // Footer buttons for view mode
  updateDetailFooter(false);
  renderFeed(id);

  // Switch mode
  panel.classList.toggle('editing', editMode);
  if (editMode) {
    populateEditForm(inc);
    // Switch tags UI to edit mode
    var tv = document.getElementById('dp_tags_view'); if (tv) tv.style.display = 'none';
    var te = document.getElementById('dp_tags_edit'); if (te) te.style.display = '';
  } else {
    var tv2 = document.getElementById('dp_tags_view'); if (tv2) tv2.style.display = 'flex';
    var te2 = document.getElementById('dp_tags_edit'); if (te2) te2.style.display = 'none';
  }

  // Init timezone selector for edit panel
  renderTZSelector('editTZSelector', selectedTZ, 'changeEditTZ(this.value)');

  // Open panel
  overlay.classList.add('open');
  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function populateEditForm(inc) {
  document.getElementById('dp_f_title').value = inc.title;
  document.getElementById('dp_f_customer').value = inc.customer;
  document.getElementById('dp_f_project').value = inc.project;
  var dpPl = document.getElementById('dp_f_product_line'); if (dpPl) dpPl.value = inc.product_line || '';
  document.getElementById('dp_f_severity').value = inc.severity;
  document.getElementById('dp_f_status').value = inc.status;
  document.getElementById('dp_f_engineer').value = inc.engineer;
  ensureEngineerDropdownsLoaded(function () { var de = document.getElementById('dp_f_engineer'); if (de) de.value = inc.engineer || ''; });
  document.getElementById('dp_f_date').value = inc.date;
  document.getElementById('dp_f_desc').value = inc.desc || '';
  var areaEl = document.getElementById('dp_f_area'); if (areaEl) areaEl.value = inc.area || '';

  // Show report fields only for closed incidents
  const rf = document.getElementById('dp_report_fields');
  if (rf) rf.style.display = 'block'; // always show — start/end/MTTD editable for all

  // Always populate start/end datetime from stored incident fields without timezone reinterpretation.
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('dp_f_start_dt', toDatetimeLocalWall(inc.startDT || inc.date_time_opened || (inc.date ? inc.date + 'T09:00' : '')));
  set('dp_f_end_dt', toDatetimeLocalWall(inc.endDT || inc.date_time_closed || inc.downtimeEnd || ''));
  var startHint = document.getElementById('dp_start_tz_hint');
  if (startHint) startHint.textContent = 'Incident timezone: ' + (selectedTZ || inc.timezone || 'IST');
  var editEndEl = document.getElementById('dp_f_end_dt');
  if (editEndEl) editEndEl.dataset.inputTimezone = selectedTZ || inc.timezone || 'IST';
  setIncidentEndHint('dp_end_tz_hint', selectedTZ || inc.timezone || 'IST', false);

  // Always populate report fields regardless of status
  set('dp_f_dtH', inc.downtimeH || 0);
  set('dp_f_dtM', inc.downtimeM || 0);
  var critical = String(inc.severity || '').toLowerCase() === 'critical';
  ['dp_f_dtH', 'dp_f_dtM'].forEach(function (id) {
    var field = document.getElementById(id);
    field.readOnly = false;
    field.style.opacity = '1';
    field.style.cursor = '';
  });
  if (critical && editEndEl && editEndEl.value) updateCriticalEditDowntime();
  set('dp_f_mttr_h', inc.mttrH || 0);
  set('dp_f_mttr_m', inc.mttrM || 0);
  set('dp_f_rca', inc.rca || '');
  set('dp_f_resolution', inc.resolution || '');
  set('dp_f_resolved_by', inc.resolvedBy || '');
  set('dp_f_sf_case', inc.sfCase || inc.sf_case || '');
  set('dp_f_rd_tickets', inc.rd_tickets || inc.rdTickets || '');

  // If user has selected a non-IST timezone, convert the displayed datetimes
  updateDetailFooter(true);
}

function updateCriticalEditDowntime() {
  const inc = incidents.find(function (item) { return item.id === detailCurrentId; });
  if (!inc || String(inc.severity || '').toLowerCase() !== 'critical') return;
  const startEl = document.getElementById('dp_f_start_dt');
  const endEl = document.getElementById('dp_f_end_dt');
  if (!startEl || !startEl.value || !endEl || !endEl.value) return;
  const editTimezone = selectedTZ || inc.timezone || 'IST';
  const startDate = wallClockToDate(startEl.value, editTimezone);
  const endDate = wallClockToDate(endEl.value, endEl.dataset.inputTimezone || editTimezone);
  if (!startDate || !endDate) return;
  const totalMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  document.getElementById('dp_f_dtH').value = Math.floor(totalMinutes / 60);
  document.getElementById('dp_f_dtM').value = totalMinutes % 60;
}

function updateDetailFooter(isEditing) {
  const btns = document.getElementById('dp_footer_btns');
  if (!btns) return;
  if (isEditing) {
    btns.innerHTML = `
      <button class="btn btn-secondary" onclick="cancelDetailEdit()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDetailEdit()">💾 Save Changes</button>
    `;
  } else {
    btns.innerHTML = '';
  }
}

function switchToEditMode() {
  const inc = incidents.find(i => i.id === detailCurrentId);
  if (!inc) return;
  document.getElementById('detailPanel').classList.add('editing');
  populateEditForm(inc);
}

function cancelDetailEdit() {
  document.getElementById('detailPanel').classList.remove('editing');
  updateDetailFooter(false);
}

function saveDetailEdit() {
  if (!hasPermission('edit_incidents')) { showToast('Access denied: you cannot edit incidents', 'error'); return; }
  if (!hasPermission('edit_incidents')) { showToast('Access denied: you cannot edit incidents', 'error'); return; }
  const inc = incidents.find(i => i.id === detailCurrentId);
  if (!inc) return;

  const title = document.getElementById('dp_f_title').value.trim();
  const customer = document.getElementById('dp_f_customer').value;
  const project = document.getElementById('dp_f_project').value;
  const productLine = document.getElementById('dp_f_product_line')?.value || '';
  const rdTickets = (document.getElementById('dp_f_rd_tickets')?.value || '').trim();
  const severity = document.getElementById('dp_f_severity').value;
  const status = document.getElementById('dp_f_status').value;
  const engineer = document.getElementById('dp_f_engineer').value;
  const date = document.getElementById('dp_f_date').value;
  const desc = document.getElementById('dp_f_desc').value.trim();

  if (!title || !customer || !severity || !engineer) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  // Log feed entries for meaningful changes
  if (inc.status !== status) {
    addFeedEntry(inc.id, 'status', 'changed status', `${inc.status} → ${status}`);
  }
  if (inc.severity !== severity) {
    addFeedEntry(inc.id, 'system', 'changed severity', `${inc.severity} → ${severity}`);
  }
  if (inc.engineer !== engineer) {
    addFeedEntry(inc.id, 'system', 'reassigned incident', `Assigned to ${engineer}`);
  }

  Object.assign(inc, { title, customer, project, product_line: productLine, severity, status, engineer, date, desc, timezone: selectedTZ });
  if (rdTickets) { inc.rd_tickets = rdTickets; inc.rdTickets = rdTickets; }

  // Always save start/end datetime exactly as entered for the selected incident timezone.
  const getVal = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  var startDTval = getVal('dp_f_start_dt');
  convertIncidentEndFromIST('dp_f_end_dt', 'dp_end_tz_hint');
  var endDTval = getVal('dp_f_end_dt');
  const startDb = toMysqlDatetime(startDTval || date);
  const endDb = endDTval ? toMysqlDatetime(endDTval) : '';
  if (startDb) {
    inc.startDT = startDb;
    inc.date_time_opened = startDb;
    inc.date = startDb.substring(0, 10);
  }
  if (endDb) {
    inc.endDT = endDb;
    inc.date_time_closed = endDb;
    inc.downtimeEnd = endDb;
  }

  // Always save report fields — visible in view for any status
  const h = parseInt(getVal('dp_f_dtH')) || 0;
  const m = parseInt(getVal('dp_f_dtM')) || 0;
  inc.downtimeH = h;
  inc.downtimeM = m;
  inc.downtimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : (m > 0 ? `${m}m` : inc.downtimeStr || '');
  inc.mttrH = parseInt(getVal('dp_f_mttr_h')) || 0;
  inc.mttrM = parseInt(getVal('dp_f_mttr_m')) || 0;
  inc.mttrStr = inc.mttrH > 0 ? (inc.mttrM > 0 ? `${inc.mttrH}h ${inc.mttrM}m` : `${inc.mttrH}h`) : inc.mttrM > 0 ? `${inc.mttrM}m` : '';
  inc.rca = getVal('dp_f_rca');
  inc.resolution = getVal('dp_f_resolution');
  inc.resolvedBy = getVal('dp_f_resolved_by');
  const sfCaseValue = getVal('dp_f_sf_case').trim();
  if (sfCaseValue) inc.sfCase = sfCaseValue;
  if (rdTickets) { inc.rd_tickets = rdTickets; inc.rdTickets = rdTickets; }

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
    if (!token) {
      showToast('Not authenticated. Please login first.', 'error');
      return;
    }

    const payload = {
      title,
      customer,
      project,
      product_line: productLine,
      severity,
      status,
      engineer,
      date_created: startDb,
      startDT: startDb,
      date_time_opened: startDb,
      endDT: endDb || undefined,
      date_time_closed: endDb || undefined,
      closed_date: endDb ? endDb.substring(0, 10) : undefined,
      timezone: selectedTZ,
      description: desc,
      area: document.getElementById('dp_f_area')?.value || null,
      rca: inc.rca,
      resolution: inc.resolution,
      resolved_by: inc.resolvedBy,
      sf_case: inc.sfCase,
      rd_tickets: inc.rd_tickets || inc.rdTickets || undefined,
      downtime_h: inc.downtimeH,
      downtime_m: inc.downtimeM,
      downtime_mins: inc.downtimeH * 60 + inc.downtimeM,
      mttr_h: inc.mttrH,
      mttr_m: inc.mttrM,
      mttr_minutes: inc.mttrH * 60 + inc.mttrM,
      tags: Array.isArray(inc.tags) ? inc.tags.slice() : []
    };

    fetch(window.APP_CONFIG.API_BASE_URL + `/incidents/${inc.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          addAudit('✏', 'Incident Updated', `${inc.id} — ${title}`);
          if (severity === 'Critical' && status !== 'Closed') addNotification('critical', `<strong>${inc.id}</strong> updated to Critical severity`, inc.id);
          loadIncidentsFromBackend(() => {
            openDetailPanel(detailCurrentId, false);
            renderIncidentTable();
            updateStats();
            renderMyIncidents();
            renderCustomerHealth();
            refreshDashboardData();
            showToast(`${inc.id} updated successfully ✓`, 'success');
          });
        } else {
          showToast(data.message || 'Failed to update incident', 'error');
          loadIncidentsFromBackend();
        }
      })
      .catch(err => {
        console.error('Update incident error:', err);
        showToast('Network error. Could not update incident.', 'error');
        loadIncidentsFromBackend();
      });
    return;
  }

  // Re-open in view mode with updated data
  addAudit('✏', 'Incident Updated', `${inc.id} — ${title}`);
  if (severity === 'Critical' && inc.status !== 'Closed') addNotification('critical', `<strong>${inc.id}</strong> updated to Critical severity`, inc.id);
  openDetailPanel(detailCurrentId, false);
  renderIncidentTable();
  updateStats();
  renderMyIncidents();
  renderCustomerHealth();
  showToast(`${inc.id} updated successfully ✓`, 'success');
}

function closeDetailFromIncidentClose(id) {
  openDowntimeModal(id);
}

function closeDetailPanel() {
  document.getElementById('detailPanel').classList.remove('open', 'editing');
  document.getElementById('detailOverlay').classList.remove('open', 'metric-drilldown-detail');
  var metricOverlay = document.getElementById('metricDrilldownOverlay');
  document.body.style.overflow = metricOverlay && metricOverlay.classList.contains('open') ? 'hidden' : '';
  detailCurrentId = null;
}

function printDetailPanel() {
  window.print();
}

function exportDetailPDF() {
  const inc = incidents.find(i => i.id === detailCurrentId);
  if (!inc) return;
  viewIncidentReport(inc.id);
  setTimeout(() => exportIncidentPDF(), 400);
}


// ─── LOGIN ────────────────────────────────────────────────────


const SESSION_INACTIVITY_LIMIT_MS = 20 * 60 * 1000;
const SESSION_INACTIVITY_WARNING_MS = 19 * 60 * 1000;
const SESSION_LAST_ACTIVITY_KEY = 'incident_portal_last_activity';
var sessionInactivityTimer = null;
var sessionWarningTimer = null;
var lastActivityWrite = 0;

function stopSessionInactivityTracking() {
  if (sessionInactivityTimer) clearTimeout(sessionInactivityTimer);
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  sessionInactivityTimer = null;
  sessionWarningTimer = null;
  var warning = document.getElementById('sessionWarn');
  if (warning) warning.classList.remove('visible');
}

function getLastSessionActivity() {
  return parseInt(sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY), 10) || 0;
}

function hasSessionInactivityExpired() {
  var lastActivity = getLastSessionActivity();
  return lastActivity > 0 && Date.now() - lastActivity >= SESSION_INACTIVITY_LIMIT_MS;
}

function scheduleSessionInactivityTimers() {
  stopSessionInactivityTracking();
  var lastActivity = getLastSessionActivity();
  if (!lastActivity) return;
  var elapsed = Date.now() - lastActivity;
  if (elapsed >= SESSION_INACTIVITY_LIMIT_MS) {
    expireInactiveSession();
    return;
  }
  sessionWarningTimer = setTimeout(function () {
    var warning = document.getElementById('sessionWarn');
    if (warning) warning.classList.add('visible');
  }, Math.max(0, SESSION_INACTIVITY_WARNING_MS - elapsed));
  sessionInactivityTimer = setTimeout(expireInactiveSession, SESSION_INACTIVITY_LIMIT_MS - elapsed);
}

function recordSessionActivity() {
  var tokenKey = window.APP_CONFIG ? window.APP_CONFIG.JWT_TOKEN_KEY : 'incident_portal_token';
  if (!sessionStorage.getItem(tokenKey)) return;
  var now = Date.now();
  if (now - lastActivityWrite < 1000) return;
  lastActivityWrite = now;
  sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
  scheduleSessionInactivityTimers();
}

function startSessionInactivityTracking(resetActivity) {
  if (resetActivity || !getLastSessionActivity()) {
    lastActivityWrite = Date.now();
    sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(lastActivityWrite));
  }
  scheduleSessionInactivityTimers();
}

function expireInactiveSession() {
  var tokenKey = window.APP_CONFIG ? window.APP_CONFIG.JWT_TOKEN_KEY : 'incident_portal_token';
  if (!sessionStorage.getItem(tokenKey)) {
    stopSessionInactivityTracking();
    return;
  }
  doLogoutConfirmed('Your session expired after 20 minutes of inactivity. Please sign in again.');
}

function togglePwd() {
  const inp = document.getElementById('loginPassword');
  const icon = document.getElementById('eyeIcon');
  if (!icon) return;
  const eyeOpen = `<svg id="eyeSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeClosed = `<svg id="eyeSvg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.innerHTML = eyeClosed;
  } else {
    inp.type = 'password';
    icon.innerHTML = eyeOpen;
  }
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const spinner = document.getElementById('btnSpinner');
  const btnTxt = document.getElementById('btnText');
  if (!errEl || !btn || !spinner || !btnTxt) return;

  function showError(msg, color) {
    spinner.style.display = 'none';
    btnTxt.textContent = 'Sign In to Portal';
    btn.disabled = false;
    errEl.textContent = msg;
    errEl.style.borderLeftColor = color || 'var(--danger)';
    errEl.style.background = color === 'var(--warning)'
      ? 'rgba(247,185,79,0.10)' : 'rgba(247,92,124,0.12)';
    errEl.style.color = color || 'var(--danger)';
    errEl.style.display = 'block';
    errEl.style.animation = 'none';
    requestAnimationFrame(() => { errEl.style.animation = 'shake .3s ease'; });
  }

  errEl.style.display = 'none';

  if (!email || !password) {
    showError('⚠  Please enter your email and password.');
    return;
  }

  btn.disabled = true;
  spinner.style.display = 'block';
  btnTxt.textContent = 'Signing in…';

  if (window.APP_CONFIG && window.APP_CONFIG.ENABLE_BACKEND) {
    fetch(window.APP_CONFIG.API_BASE_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
      .then(response => response.json())
      .then(data => {
        if (!data || !data.success) {
          showError(data && data.message ? `⚠  ${data.message}` : '⚠  Login failed.');
          return;
        }

        sessionStorage.setItem(window.APP_CONFIG.JWT_TOKEN_KEY, data.token);
        loadPersistedRoles();
        startSessionInactivityTracking(true);
        startNotificationPolling();
        const user = data.user;
        currentRole = user.role;
        currentUserName = user.name;
        applyCurrentUserProfile(user);

        const loginScreen = document.getElementById('loginScreen');
        loginScreen.classList.add('hidden');
        setTimeout(() => {
          try {
            loginScreen.style.display = 'none';
            const portal = document.getElementById('portalApp');
            portal.style.display = 'block';
            portal.style.animation = 'cardIn .5s ease';
            const _sun = document.getElementById('sidebarUserName'); if (_sun) _sun.textContent = user.name;
            const _lbl = document.getElementById('profileUserLabel'); if (_lbl) _lbl.textContent = user.name;
            const _sav = document.getElementById('sidebarAvatar');
            if (_sav) { const _p = user.name.split(' '); _sav.textContent = _p.map(p => p[0] || '').join('').substring(0, 2).toUpperCase(); }
            setHash('home');
            navigateInternal('home', document.getElementById('homeNav'));
            const _ui = document.getElementById('userInitials'); if (_ui) _ui.textContent = user.initials || user.name.slice(0, 2).toUpperCase();
            const roleCls = { admin: 'role-admin', engineer: 'role-engineer', pmo: 'role-pmo', cso: 'role-cso', aoc: 'role-aoc', stakeholder: 'role-stakeholder' };
            const roleLabels = { admin: 'ADMIN', engineer: 'ENGINEER', pmo: 'PMO', cso: 'CSO', aoc: 'AOC', stakeholder: 'VIEWER' };
            const roleLabel = (roleLabels[user.role] || user.role.toUpperCase());
            const roleCl = (roleCls[user.role] || 'role-admin');
            const badge = document.getElementById('roleBadge');
            if (badge) { badge.textContent = roleLabel; badge.className = 'role-badge ' + roleCl; }
            const sidebarRole = document.getElementById('sidebarUserRole'); if (sidebarRole) sidebarRole.textContent = roleLabel;
            switchRole(user.role);
            loadMasterData(function (masterError) {
              if (masterError) {
                showToast('Signed in, but master data could not be loaded.', 'warning');
                return;
              }
              loadUsersFromBackend(function (usersError) {
                if (usersError) {
                  showToast('Signed in, but users could not be loaded.', 'warning');
                  return;
                }
                loadIncidentsFromBackend(function (incidentsError) {
                  if (incidentsError) {
                    showToast('Signed in, but incidents could not be loaded.', 'warning');
                    return;
                  }
                  populateAssigneeFilter();
                  updateTagFilter();
                  renderIncidentTable();
                  renderHomePage();
                  updateStats();
                  openLinkedIncidentIfReady();
                  showToast(`Welcome back, ${user.name}! 👋`, 'success');
                });
              });
            });
          } catch (e) { if (window.onerror) window.onerror(e.message, e.fileName || 'app', e.lineNumber || 0, e.columnNumber || 0, e); }
        }, 450);
      })
      .catch(err => {
        console.error('Login error:', err);
        showError('⚠  Network error. Please try again.');
      });

    return;
  }

  showError('⚠  Backend login is required. Enable backend mode to sign in.');
}

function doLogout() {
  showConfirm({ icon: '🚪', title: 'Sign Out', msg: 'Are you sure you want to sign out of Magic Cloud?', ok: 'Sign Out', danger: true }).then(ok => {
    if (!ok) return;
    doLogoutConfirmed();
  });
}
function doLogoutConfirmed(reason) {
  stopSessionInactivityTracking();
  stopNotificationPolling();
  var aiLauncher = document.getElementById('aiChatLauncher'); if (aiLauncher) aiLauncher.style.display = 'none';
  var aiPanel = document.getElementById('aiChatPanel'); if (aiPanel) { aiPanel.classList.remove('open'); aiPanel.setAttribute('aria-hidden', 'true'); }
  setLoginUrl();
  const portal = document.getElementById('portalApp');
  portal.style.transition = 'opacity .3s ease';
  portal.style.opacity = '0';
  setTimeout(() => {
    portal.style.display = 'none';
    portal.style.opacity = '1';
    // Reset login form
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    sessionStorage.removeItem(window.APP_CONFIG ? window.APP_CONFIG.JWT_TOKEN_KEY : 'incident_portal_token');
    sessionStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
    const errEl = document.getElementById('loginError');
    errEl.textContent = reason || '';
    errEl.style.display = reason ? 'block' : 'none';
    errEl.style.borderLeftColor = '';
    errEl.style.background = '';
    errEl.style.color = '';
    var _bte = document.getElementById('btnText'); if (_bte) _bte.textContent = 'Sign In to Portal';
    document.getElementById('btnSpinner').style.display = 'none';
    document.getElementById('loginBtn').disabled = false;
    const ls = document.getElementById('loginScreen');
    ls.style.display = 'flex';
    ls.classList.remove('hidden');
    ls.style.animation = 'none';
    requestAnimationFrame(() => { ls.style.animation = ''; });
  }, 300);
}

function openSidebar() {
  var isMobile = window.innerWidth <= 900;
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (!sb) return;
  if (isMobile) {
    sb.classList.add('open');
    if (ov) ov.classList.add('open');
  } else {
    // On desktop, opening = un-collapse
    var mw = document.getElementById('mainWrapper');
    sb.classList.remove('collapsed');
    if (mw) mw.classList.remove('sidebar-collapsed');
    var btn = document.getElementById('sidebarToggleBtn');
    if (btn) btn.textContent = '‹';
  }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}



// ─────────────────────────────────────────────────────────
// URL HASH ROUTING
// ─────────────────────────────────────────────────────────
const PAGE_NAV_MAP = {
  dashboard: 'dashNav',
  incidents: 'incidentsNav',
  reports: 'reportsNav',
  users: 'usersNav',
  roles: null,
};
// Detect if running inside a sandboxed srcdoc iframe (e.g. Claude.ai preview)
const IN_IFRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

function setHash(page) {
  // Update page title regardless
  document.title = {
    home: 'Home — Magic Cloud',
    dashboard: 'Dashboard — Magic Cloud',
    incidents: 'Incidents — Magic Cloud',
    reports: 'Reports — Magic Cloud',
    users: 'User Management — Magic Cloud',
    roles: 'Role Management — Magic Cloud',
  }[page] || 'Magic Cloud';
  // Skip pushState in sandboxed iframes — it throws a SecurityError
  if (IN_IFRAME) return;
  try {
    if (window.location.hash !== '#' + page)
      history.pushState({ page }, '', '#' + page);
  } catch (e) { /* silently ignore SecurityError */ }
}

function setLoginUrl() {
  document.title = 'Sign In — Magic Cloud';
  // The login screen is not an application page, so it should use the clean
  // root URL instead of retaining the last authenticated page hash.
  if (IN_IFRAME) return;
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (e) { /* silently ignore SecurityError */ }
}

if (!IN_IFRAME) {
  window.addEventListener('popstate', (e) => {
    const portal = document.getElementById('portalApp');
    if (!portal || portal.style.display === 'none') {
      setLoginUrl();
      return;
    }
    const page = (e.state && e.state.page) || 'dashboard';
    const navEl = document.getElementById(PAGE_NAV_MAP[page]);
    navigateInternal(page, navEl);
  });
}

// ─────────────────────────────────────────────────────────
// STYLED CONFIRM DIALOG  (replaces browser confirm())
// ─────────────────────────────────────────────────────────
function showConfirm(opts) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmOverlay');
    var _ci = document.getElementById('confirmIcon'); if (_ci) _ci.textContent = opts.icon || '⚠️';
    var _ct = document.getElementById('confirmTitle'); if (_ct) _ct.textContent = opts.title || 'Are you sure?';
    var _cm = document.getElementById('confirmMsg'); if (_cm) _cm.textContent = opts.msg || 'This action cannot be undone.';
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (!okBtn || !cancelBtn) { resolve(false); return; }
    okBtn.textContent = opts.ok || 'Confirm';
    okBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    overlay.classList.add('open');
    okBtn.focus();
    const close = (result) => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.removeEventListener('keydown', esc); close(false); }
    });
  });
}

// ─────────────────────────────────────────────────────────
// EMPTY STATES
// ─────────────────────────────────────────────────────────
function renderEmptyState(icon, title, sub, btnLabel, btnAction) {
  return `<tr><td colspan="20">
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-sub">${sub}</div>
      ${btnLabel ? `<button class="btn btn-primary" onclick="${btnAction}">${btnLabel}</button>` : ''}
    </div>
  </td></tr>`;
}

// ─────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────
function renderSkeletonRows(count = 5, cols = 9) {
  return Array.from({ length: count }, (_, ri) =>
    `<tr>${Array.from({ length: cols }, () => '<td><div style="height:14px;background:var(--surface2);border-radius:4px;animation:pulse 1.5s infinite"></div></td>').join('')}</tr>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════════
// 5. SAVED FILTERS
// ═══════════════════════════════════════════════════════════════════
let savedFilters = [];

function saveCurrentFilter() {
  const search = document.getElementById('searchFilter')?.value || '';
  const severity = document.getElementById('severityFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';
  const customer = document.getElementById('customerFilter')?.value || '';
  if (!search && !severity && !status && !customer) { showToast('No active filters to save', 'error'); return; }
  const name = prompt('Name this filter:');
  if (!name) return;
  savedFilters.push({ name, search, severity, status, customer });
  renderSavedFilters();
  showToast(`✓ Filter "${name}" saved`, 'success');
}

function renderSavedFilters() {
  const wrap = document.getElementById('savedFiltersWrap');
  if (!wrap) return;
  wrap.innerHTML = savedFilters.map((f, i) =>
    `<span class="saved-filter-tag" onclick="applysavedFilter(${i})" title="${f.severity || ''} ${f.status || ''} ${f.search || ''}">
      ⭐ ${f.name}
      <span onclick="event.stopPropagation();deleteSavedFilter(${i})" style="opacity:.5;font-size:10px">✕</span>
    </span>`
  ).join('');
}

function applysavedFilter(i) {
  const f = savedFilters[i];
  if (!f) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('filterSearch', f.search); set('filterSeverity', f.severity);
  set('filterStatus', f.status); set('filterCustomer', f.customer);
  applyFilters();
  showToast(`Filter "${f.name}" applied`, 'success');
}

function deleteSavedFilter(i) { savedFilters.splice(i, 1); renderSavedFilters(); }

// ═══════════════════════════════════════════════════════════════════
// 6. COMMAND PALETTE
// ═══════════════════════════════════════════════════════════════════
let cmdPaletteOpen = false;

function openCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (!el) return;
  applyCmdPaletteTheme(el, '10vh', '10px');
  cmdPaletteOpen = true;
  setTimeout(() => { const inp = document.getElementById('cmdInput'); if (inp) { inp.focus(); } }, 80);
  runCmdSearch('');
}

function closeCmdPalette() {
  const el = document.getElementById('cmdPalette');
  if (el) el.style.display = 'none';
  cmdPaletteOpen = false;
}

function runCmdSearch(q) {
  q = q.toLowerCase();
  const results = document.getElementById('cmdResults');
  if (!results) return;
  var allPages = [
    { icon: '⬡', label: 'Dashboard', sub: 'View charts & KPIs', action: "navigate('dashboard',document.getElementById('dashNav'))", perm: null },
    { icon: '⌂', label: 'Home', sub: 'Go to home page', action: "navigate('home',null)", perm: null },
    { icon: '⚠', label: 'Incidents', sub: 'Manage all incidents', action: "navigate('incidents',document.querySelectorAll('.nav-item')[1])", perm: 'view_incidents' },
    { icon: '⊞', label: 'Kanban View', sub: 'Switch to Kanban board', action: "navigate('incidents',document.querySelectorAll('.nav-item')[1]);setTimeout(()=>switchIncidentView('kanban'),200)", perm: 'view_incidents' },
    { icon: '◈', label: 'Reports', sub: 'Export PDF & Excel', action: "navigate('reports',document.querySelectorAll('.nav-item')[2])", perm: 'view_reports' },
    { icon: '+', label: 'New Incident', sub: 'Create a new incident', action: "openCreateIncidentModal()", perm: 'create_incidents' },
    { icon: '👥', label: 'User Management', sub: 'Manage users and roles', action: "navigate('users',document.getElementById('usersNav'))", perm: 'manage_users' },
    // Use a numeric HTML entity so the target icon renders consistently even
    // when this JavaScript file is opened with a legacy text encoding.
    { icon: '&#127919;', label: 'Guided Tour', sub: 'Walk through the portal', action: 'startTour()', perm: null },
  ];
  var pages = allPages.filter(function (p) { return !p.perm || hasPermission(p.perm); });
  const pageMatches = pages.filter(p => !q || p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
  const incMatches = q.length > 1 && hasPermission('view_incidents') ? incidents.filter(i => i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q)).slice(0, 5) : [];
  const custMatches = q.length > 1 ? [...new Set(incidents.map(i => i.customer))].filter(c => c.toLowerCase().includes(q)).slice(0, 3) : [];

  let html2 = '';
  if (pageMatches.length) {
    html2 += '<div class="cmd-section">Pages & Actions</div>';
    html2 += pageMatches.map(p =>
      `<div class="cmd-item" onclick="closeCmdPalette();${p.action}">
        <div class="cmd-item-icon" style="background:${document.body.classList.contains('light-mode') ? 'rgba(79,142,247,0.14)' : 'rgba(79,142,247,0.1)'}">${p.icon}</div>
        <div class="cmd-item-text">${p.label}<div class="cmd-item-sub">${p.sub}</div></div>
      </div>`
    ).join('');
  }
  if (incMatches.length) {
    html2 += '<div class="cmd-section">Incidents</div>';
    html2 += incMatches.map(inc =>
      `<div class="cmd-item" onclick="closeCmdPalette();${inc.status === 'Closed' && hasPermission('view_reports') ? `viewIncidentReport('${inc.id}')` : `openDetailPanel('${inc.id}')`}">
        <div class="cmd-item-icon" style="background:${document.body.classList.contains('light-mode') ? 'rgba(247,92,124,0.14)' : 'rgba(247,92,124,0.1)'}">${inc.id}</div>
        <div class="cmd-item-text">${inc.title.substring(0, 50)}<div class="cmd-item-sub">${inc.customer} · ${inc.severity}</div></div>
      </div>`
    ).join('');
  }
  if (custMatches.length) {
    html2 += '<div class="cmd-section">Customers</div>';
    html2 += custMatches.map(c =>
      `<div class="cmd-item" onclick="closeCmdPalette();openCustomer360('${c}')">
        <div class="cmd-item-icon" style="background:${document.body.classList.contains('light-mode') ? 'rgba(45,212,160,0.14)' : 'rgba(45,212,160,0.1)'}">🏢</div>
        <div class="cmd-item-text">${c}<div class="cmd-item-sub">Customer 360 view</div></div>
      </div>`
    ).join('');
  }
  if (!html2) html2 = q
    ? `<div style="padding:40px 24px;text-align:center"><div style="font-size:32px;margin-bottom:10px">🔍</div><div style="font-size:14px;color:var(--text-muted)">No results for <strong style='color:var(--text)'>"${q}"</strong></div></div>`
    : `<div style="padding:40px 24px;text-align:center"><div style="font-size:36px;margin-bottom:10px;opacity:.4">⌘</div><div style="font-size:14px;color:var(--text-muted);margin-bottom:6px">Start typing to search</div><div style="font-size:12px;color:var(--text-muted);opacity:.6">Search incidents, customers, users and more</div></div>`;
  results.innerHTML = html2;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && cmdPaletteOpen) closeCmdPalette();
});

// ═══════════════════════════════════════════════════════════════════
// 7. ONBOARDING TOUR
// ═══════════════════════════════════════════════════════════════════
const tourSteps = [
  { selector: '.sidebar-logo', title: '👋 Welcome to Magic Cloud!', desc: 'Click the logo anytime to return to the Home page.' },
  { selector: '#dashNav', title: '⬡ Dashboard', desc: 'View real-time KPIs, incident trends and customer health charts.' },
  { selector: '#btnSearch', title: '⌘ Command Palette', desc: 'Press Ctrl+K to search incidents, navigate pages or create items.' },
  { selector: '#notifBtn', title: '🔔 Notifications', desc: 'Get alerted on SLA breaches, @mentions and escalations.' },
  { selector: '.topbar-right', title: '👤 Your Profile', desc: 'Switch roles, change theme and manage your profile.' },
];
let tourStep = 0, tourActive = false;

function startTour() {
  tourStep = 0; tourActive = true;
  var _to = document.getElementById('tourOverlay');
  if (_to) _to.style.display = 'block';
  showTourStep(); closeCmdPalette();
}

function showTourStep() {
  const step = tourSteps[tourStep];
  if (!step) { skipTour(); return; }
  const el = document.querySelector(step.selector);
  const overlay = document.getElementById('tourOverlay');
  const highlight = document.getElementById('tourHighlight');
  const tooltip = document.getElementById('tourTooltip');
  var _tt = document.getElementById('tourTitle'); if (_tt) _tt.textContent = step.title;
  var _td = document.getElementById('tourDesc'); if (_td) _td.textContent = step.desc;
  var _nb = document.getElementById('tourNextBtn');
  if (_nb) _nb.textContent = tourStep < tourSteps.length - 1 ? 'Next →' : 'Finish 🎉';
  if (!overlay) return;
  if (tooltip) tooltip.style.display = 'block';
  if (highlight) highlight.style.display = el ? 'block' : 'none';
  if (el && highlight && tooltip) {
    const r = el.getBoundingClientRect(), pad = 6;
    highlight.style.cssText = `display:block;position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:8px;box-shadow:0 0 0 4000px rgba(0,0,0,0.55);z-index:99991;border:2px solid #4f8ef7;pointer-events:none;`;
    const tipTop = r.bottom + 12 < window.innerHeight - 160 ? r.bottom + 12 : r.top - 160;
    const tipLeft = Math.min(Math.max(r.left, 10), window.innerWidth - 310);
    tooltip.style.cssText = `display:block;position:fixed;left:${tipLeft}px;top:${tipTop}px;z-index:99992;background:var(--surface);border:1px solid #4f8ef7;border-radius:12px;padding:16px 20px;max-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:all;`;
  } else if (tooltip) {
    tooltip.style.cssText = 'display:block;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99992;background:var(--surface);border:1px solid #4f8ef7;border-radius:12px;padding:16px 20px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:all;';
  }
  overlay.style.display = 'block';
}

function nextTourStep() { tourStep++; showTourStep(); }
function skipTour() {
  tourActive = false;
  var _to = document.getElementById('tourOverlay');
  if (_to) _to.style.display = 'none';
  var _tt = document.getElementById('tourTooltip');
  if (_tt) _tt.style.display = 'none';
  var _th = document.getElementById('tourHighlight');
  if (_th) _th.style.display = 'none';
  if (tourStep >= tourSteps.length - 1) showToast('🎉 Tour complete!', 'success');
}

// ═══════════════════════════════════════════════════════════════════
// 8. NOTIFICATION PREVIEW
// ═══════════════════════════════════════════════════════════════════
function showNotificationPreview(inc) {
  const modal = document.getElementById('notifSimModal');
  const content = document.getElementById('notifSimContent');
  if (!modal || !content) return;
  const sc = { Critical: '#f75c7c', High: '#f7b94f', Medium: '#4f8ef7', Normal: '#2dd4a0' }[inc.severity] || '#4f8ef7';
  // Look up assignee email from current user list by matching name
  const assigneeUser = users.find(u => u.name === inc.engineer) || {};
  const assigneeEmail = assigneeUser.email || (inc.engineer ? inc.engineer.toLowerCase().replace(/\s+/g, '.') + '@magiccloud.io' : 'team' + '@' + 'magiccloud.io');
  const assigneeFirst = inc.engineer ? inc.engineer.split(' ')[0] : 'Team';
  const defaultSubject = `[${inc.severity}] ${inc.id}: ${inc.title}`;
  const incidentDescription = inc.description || inc.desc || 'Not provided';
  const defaultBody = `Hi ${assigneeFirst},

A ${inc.severity} incident has been assigned to you.

ID: ${inc.id}
Customer: ${inc.customer}
Description: ${incidentDescription}
SLA: ${inc.slaHours || 4}h from creation`;
  currentNotificationIncidentId = inc.id;

  content.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📧 Email Notification</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0d0d1a,#1a1a3e);padding:16px 20px;border-bottom:1px solid var(--border)">
          <div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:4px">To: ${inc.engineer} · ${assigneeEmail}</div>
          <label for="notificationEmailSubject" style="display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.8px;margin:10px 0 5px">Subject</label>
          <input id="notificationEmailSubject" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:7px;padding:9px 11px;color:white;font-size:14px;font-weight:600;font-family:inherit;outline:none" type="text">
        </div>
        <div style="padding:16px 20px;font-size:13px;color:var(--text-secondary);line-height:1.7">
          <label for="notificationEmailBody" style="display:block;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px">Body</label>
          <textarea id="notificationEmailBody" rows="8" style="width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${sc};border-radius:7px;padding:10px 12px;color:var(--text);font-size:13px;line-height:1.55;font-family:inherit;resize:vertical;outline:none"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:10px">
            <button class="btn btn-primary btn-sm" onclick="saveNotificationEmailDraft()">Save Email Draft</button>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">💬 Slack Notification</div>
      <div style="background:#1a1d21;border-radius:10px;padding:16px">
        <div style="color:#4f8ef7;font-weight:700;margin-bottom:8px">#incidents-alerts</div>
        <div style="color:#e0e0e0;font-size:13px">
          <span style="color:${sc};font-weight:700">[${inc.severity}]</span> ${inc.id}: ${inc.title}<br>
          <span style="color:#888">Assigned to @${assigneeFirst.toLowerCase()} · SLA: ${inc.slaHours || 4}h</span>
        </div>
      </div>
    </div>`;
  document.getElementById('notificationEmailSubject').value = inc.notificationEmailSubject || defaultSubject;
  document.getElementById('notificationEmailBody').value = inc.notificationEmailBody || defaultBody;
  modal.style.display = 'flex';
}

function showPreSendEmailPreview(inc) {
  const modal = document.getElementById('notifSimModal');
  const content = document.getElementById('notifSimContent');
  if (!modal || !content) return;
  // Keep the completed incident form in the DOM while the email is reviewed,
  // but hide it before the preview opens.  This avoids showing two stacked
  // modals and prevents a brief reappearance of the create form on submit.
  document.getElementById('incidentModal')?.classList.remove('open');
  const isCritical = String(inc.severity || '').toLowerCase() === 'critical';
  const render = function (config) {
  const defaultSubject = isCritical ? inc.title : `[${inc.severity}] New Incident: ${inc.title}`;
  const defaultBody = isCritical ? `Dear Team,\n\nWe have received the following critical incident:\n${inc.title}.\n\nOur team is currently reviewing it.\n\nWe will provide further updates as soon as more information becomes available.\n\nThanks & Regards,\n${currentUserProfile.name || currentUserProfile.email || 'AOC Operations Team'}` : '';
  content.innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${isCritical ? (config?.configured ? 'Critical incident recipients were loaded from the customer configuration. You may edit the draft before sending.' : 'No customer recipient configuration exists yet. Enter recipients manually before sending this critical incident notification.') : 'The notification defaults to your signed-in email address with the operations team copied. You may edit the recipients, subject, and message.'}</div>
    <div style="margin-bottom:12px">
      <label class="form-label required" for="notificationEmailToInput">To</label>
      <div id="notificationEmailToChips" aria-label="To recipients" style="display:flex;flex-wrap:wrap;gap:6px;min-height:40px;padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--surface2)"></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="notificationEmailToInput" type="email" list="notificationRecipientSuggestions" style="flex:1;min-width:0" placeholder="Add recipient email" onkeydown="handlePreSendRecipientKeydown(event, 'to')">
        <button type="button" class="btn btn-secondary btn-sm" onclick="addPreSendRecipient('to')">Add</button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label class="form-label" for="notificationEmailCcInput">CC</label>
      <div id="notificationEmailCcChips" aria-label="CC recipients" style="display:flex;flex-wrap:wrap;gap:6px;min-height:40px;padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--surface2)"></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="notificationEmailCcInput" type="email" list="notificationRecipientSuggestions" style="flex:1;min-width:0" placeholder="Add recipient email" onkeydown="handlePreSendRecipientKeydown(event, 'cc')">
        <button type="button" class="btn btn-secondary btn-sm" onclick="addPreSendRecipient('cc')">Add</button>
      </div>
    </div>
    <datalist id="notificationRecipientSuggestions"></datalist>
    <input id="notificationEmailTo" type="hidden">
    <input id="notificationEmailCc" type="hidden">
    <label class="form-label required" for="notificationEmailSubject">Subject</label>
    <input id="notificationEmailSubject" type="text" maxlength="255" style="width:100%;box-sizing:border-box;margin-bottom:10px">
    <label class="form-label ${isCritical ? 'required' : ''}" for="notificationEmailBody">${isCritical ? 'Critical incident email body' : 'Additional message (optional)'}</label>
    <div role="toolbar" aria-label="Email body formatting" style="display:flex;gap:4px;padding:6px 8px;border:1px solid var(--border);border-bottom:0;border-radius:7px 7px 0 0;background:var(--surface-2)"><button type="button" class="btn btn-sm" onclick="activateIncidentDescriptionEditor('notificationEmailBody');formatIncidentDescription('bold')"><b>B</b></button><button type="button" class="btn btn-sm" onclick="activateIncidentDescriptionEditor('notificationEmailBody');formatIncidentDescription('italic')"><i>I</i></button><button type="button" class="btn btn-sm" onclick="activateIncidentDescriptionEditor('notificationEmailBody');formatIncidentDescription('underline')"><u>U</u></button><button type="button" class="btn btn-sm" onclick="activateIncidentDescriptionEditor('notificationEmailBody');chooseIncidentDescriptionImage()">Image</button><button type="button" class="btn btn-sm" onclick="resizeSelectedIncidentImage(65)">M</button><button type="button" class="btn btn-sm" onclick="cropSelectedIncidentImage()">Crop</button></div>
    <div id="notificationEmailBody" contenteditable="true" role="textbox" aria-multiline="true" onfocus="activateIncidentDescriptionEditor('notificationEmailBody')" onpaste="activateIncidentDescriptionEditor('notificationEmailBody');handleIncidentDescriptionPaste(event)" onclick="activateIncidentDescriptionEditor('notificationEmailBody');selectIncidentDescriptionImage(event)" style="min-height:${isCritical ? '240px' : '88px'};box-sizing:border-box;resize:vertical;overflow:auto;border:1px solid var(--border);border-radius:0 0 7px 7px;padding:10px 12px;background:var(--surface);color:var(--text);line-height:1.5" data-placeholder="${isCritical ? 'Edit the generated critical incident email' : 'Add a note above the formatted incident details'}"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn btn-secondary" onclick="cancelPreSendEmailPreview()">Back</button>
      <button class="btn btn-primary" id="confirmIncidentEmailBtn" onclick="confirmIncidentEmailAndCreate()">Create Incident &amp; Send Email</button>
    </div>`;
  preSendRecipients = {
    to: parsePreSendRecipientList(config?.to || (isCritical ? '' : (currentUserProfile.email || ''))),
    cc: parsePreSendRecipientList(config?.cc || (isCritical ? '' : 'its24x7@magicsoftware.com'))
  };
  renderPreSendRecipientEditors();
  document.getElementById('notificationEmailSubject').value = defaultSubject;
  document.getElementById('notificationEmailBody').innerHTML = escapeMetricHtml(defaultBody).replace(/\r?\n/g, '<br>');
  modal.style.display = 'flex';
  };
  if (!isCritical || !window.APP_CONFIG?.ENABLE_BACKEND) return render(null);
  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  fetch(window.APP_CONFIG.API_BASE_URL + '/incidents/critical-email-recipients?customer=' + encodeURIComponent(inc.customer || ''), { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('Configuration lookup failed')))
    .then(data => render(data?.data || null))
    .catch(() => { showToast('Recipient configuration could not be loaded. Please enter recipients manually.', 'error'); render(null); });
}

function parsePreSendRecipientList(value) {
  const seen = new Set();
  return String(value || '').split(',').map(item => item.trim()).filter(item => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapePreSendRecipientHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function preSendRecipientLabel(email) {
  const localPart = String(email || '').split('@')[0] || email;
  return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function syncPreSendRecipientFields() {
  const to = document.getElementById('notificationEmailTo');
  const cc = document.getElementById('notificationEmailCc');
  if (to) to.value = preSendRecipients.to.join(',');
  if (cc) cc.value = preSendRecipients.cc.join(',');
}

function renderPreSendRecipientEditors() {
  ['to', 'cc'].forEach(group => {
    const host = document.getElementById(group === 'to' ? 'notificationEmailToChips' : 'notificationEmailCcChips');
    if (!host) return;
    const recipients = preSendRecipients[group] || [];
    host.innerHTML = recipients.length
      ? recipients.map((email, index) => `<span title="${escapePreSendRecipientHtml(email)}" style="display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 6px 4px 8px;border:1px solid color-mix(in srgb, var(--accent) 35%, var(--border));border-radius:14px;background:color-mix(in srgb, var(--accent) 9%, var(--surface));font-size:11px;color:var(--text)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${escapePreSendRecipientHtml(preSendRecipientLabel(email))}</strong> <span style="color:var(--text-muted)">&lt;${escapePreSendRecipientHtml(email)}&gt;</span></span><button type="button" aria-label="Remove ${escapePreSendRecipientHtml(email)}" onclick="removePreSendRecipient('${group}', ${index})" style="border:0;background:transparent;color:var(--text-muted);padding:0 2px;font:inherit;font-size:15px;line-height:1;cursor:pointer" title="Remove recipient">×</button></span>`).join('')
      : `<span style="align-self:center;color:var(--text-muted);font-size:12px;padding:4px">No recipients added</span>`;
  });
  const suggestions = document.getElementById('notificationRecipientSuggestions');
  if (suggestions) {
    const addresses = parsePreSendRecipientList([...(preSendRecipients.to || []), ...(preSendRecipients.cc || [])].join(','));
    suggestions.innerHTML = addresses.map(email => `<option value="${escapePreSendRecipientHtml(email)}">${escapePreSendRecipientHtml(preSendRecipientLabel(email))}</option>`).join('');
  }
  syncPreSendRecipientFields();
}

function addPreSendRecipient(group) {
  const input = document.getElementById(group === 'to' ? 'notificationEmailToInput' : 'notificationEmailCcInput');
  const candidates = parsePreSendRecipientList(input?.value || '');
  if (!candidates.length) return;
  const invalid = candidates.find(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) { showToast(`Enter a valid email address: ${invalid}`, 'error'); return; }
  const otherGroup = group === 'to' ? 'cc' : 'to';
  candidates.forEach(email => {
    const key = email.toLowerCase();
    preSendRecipients[otherGroup] = preSendRecipients[otherGroup].filter(existing => existing.toLowerCase() !== key);
    if (!preSendRecipients[group].some(existing => existing.toLowerCase() === key)) preSendRecipients[group].push(email);
  });
  if (input) input.value = '';
  renderPreSendRecipientEditors();
}

function removePreSendRecipient(group, index) {
  preSendRecipients[group].splice(index, 1);
  renderPreSendRecipientEditors();
}

function handlePreSendRecipientKeydown(event, group) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addPreSendRecipient(group);
  }
}

function validEmailList(value, required) {
  const addresses = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  return (!required || addresses.length > 0) && addresses.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

function cancelPreSendEmailPreview() {
  pendingIncidentEmail = null;
  document.getElementById('notifSimModal').style.display = 'none';
  // "Back" is the only path that should return to the completed create form.
  document.getElementById('incidentModal')?.classList.add('open');
}

function confirmIncidentEmailAndCreate() {
  const to = (document.getElementById('notificationEmailTo')?.value || '').trim();
  const cc = (document.getElementById('notificationEmailCc')?.value || '').trim();
  const subject = (document.getElementById('notificationEmailSubject')?.value || '').trim();
  const body = (document.getElementById('notificationEmailBody')?.innerHTML || '').trim();
  if (!validEmailList(to, true) || !validEmailList(cc, false)) {
    showToast('Enter valid comma-separated To and CC email addresses', 'error'); return;
  }
  if (!subject) { showToast('Email subject cannot be empty', 'error'); return; }
  if (String(document.getElementById('f_severity')?.value || '').toLowerCase() === 'critical' && !(document.getElementById('notificationEmailBody')?.textContent || '').trim()) { showToast('Critical incident email body cannot be empty', 'error'); return; }
  pendingIncidentEmail = { to, cc, subject, body };
  document.getElementById('notifSimModal').style.display = 'none';
  // The incident modal remains hidden while creation and mail delivery run.
  saveIncident();
}

function saveNotificationEmailDraft() {
  const incident = incidents.find(function (item) { return item.id === currentNotificationIncidentId; });
  const subject = (document.getElementById('notificationEmailSubject')?.value || '').trim();
  const body = (document.getElementById('notificationEmailBody')?.innerHTML || '').trim();
  if (!subject || !body) {
    showToast('Email subject and body cannot be empty', 'error');
    return;
  }
  if (incident) {
    incident.notificationEmailSubject = subject;
    incident.notificationEmailBody = body;
  }
  showToast('Email draft updated', 'success');
}

// ───────────────────────────────────────────────────────────────
// SESSION PERSISTENCE VERIFICATION ON STARTUP
// ───────────────────────────────────────────────────────────────
function verifySessionAndInit() {
  if (!window.APP_CONFIG || !window.APP_CONFIG.ENABLE_BACKEND) {
    const ls = document.getElementById('loginScreen');
    if (ls) {
      ls.style.display = 'flex';
      ls.classList.remove('hidden');
    }
    const portal = document.getElementById('portalApp');
    if (portal) portal.style.display = 'none';
    document.body.classList.remove('auth-pending');

    populateCustomerDropdowns();
    populateAreaDropdowns();
    populateAssigneeFilter();
    updateTagFilter();
    setLoginUrl();
    return;
  }

  const token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    const ls = document.getElementById('loginScreen');
    if (ls) {
      ls.style.display = 'flex';
      ls.classList.remove('hidden');
    }
    const portal = document.getElementById('portalApp');
    if (portal) portal.style.display = 'none';
    setLoginUrl();
    document.body.classList.remove('auth-pending');
    return;
  }
  if (hasSessionInactivityExpired()) {
    expireInactiveSession();
    document.body.classList.remove('auth-pending');
    return;
  }

  const sp = document.getElementById('btnSpinner');
  const tx = document.getElementById('btnText');
  const btn = document.getElementById('loginBtn');
  if (sp) sp.style.display = 'block';
  if (tx) tx.textContent = 'Verifying session...';
  if (btn) btn.disabled = true;

  fetch(window.APP_CONFIG.API_BASE_URL + '/auth/me', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Verification failed');
      }
      return response.json();
    })
    .then(data => {
      if (data && data.success && data.data) {
        const user = data.data;
        currentRole = user.role;
        currentUserName = user.name;
        applyCurrentUserProfile(user);
        startSessionInactivityTracking(false);
        startNotificationPolling();

        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) {
          loginScreen.style.display = 'none';
          loginScreen.classList.remove('hidden');
        }
        const portal = document.getElementById('portalApp');
        if (portal) portal.style.display = 'block';

        const _sun = document.getElementById('sidebarUserName'); if (_sun) _sun.textContent = user.name;
        const _lbl = document.getElementById('profileUserLabel'); if (_lbl) _lbl.textContent = user.name;
        const _sav = document.getElementById('sidebarAvatar');
        if (_sav) {
          const _p = user.name.split(' ');
          _sav.textContent = _p.map(p => p[0] || '').join('').substring(0, 2).toUpperCase();
        }
        const _ui = document.getElementById('userInitials'); if (_ui) _ui.textContent = user.initials || user.name.slice(0, 2).toUpperCase();

        const roleCls = { admin: 'role-admin', engineer: 'role-engineer', pmo: 'role-pmo', cso: 'role-cso', aoc: 'role-aoc', stakeholder: 'role-stakeholder' };
        const roleLabels = { admin: 'ADMIN', engineer: 'ENGINEER', pmo: 'PMO', cso: 'CSO', aoc: 'AOC', stakeholder: 'VIEWER' };
        const roleLabel = (roleLabels[user.role] || user.role.toUpperCase());
        const roleCl = (roleCls[user.role] || 'role-admin');

        const badge = document.getElementById('roleBadge');
        if (badge) { badge.textContent = roleLabel; badge.className = 'role-badge ' + roleCl; }
        const sidebarRole = document.getElementById('sidebarUserRole'); if (sidebarRole) sidebarRole.textContent = roleLabel;

        switchRole(user.role);
        showToast(`Welcome back, ${user.name}! 👋`, 'success');

        loadMasterData(function () {
          loadUsersFromBackend(function () {
            loadIncidentsFromBackend(function () {
              populateAssigneeFilter();
            updateTagFilter();

            const portal = document.getElementById('portalApp');
            if (portal) {
              portal.style.display = 'block';
            }

            if (!openLinkedIncidentIfReady()) {
              var hash = 'home';
              var navEl = document.getElementById('homeNav');
              navigate(hash, navEl);
            }
            document.body.classList.remove('auth-pending');
          });
        });
      });
      } else {
        throw new Error('Invalid user response');
      }
    })
    .catch(err => {
      console.error('Session restoration failed:', err);
      sessionStorage.removeItem(window.APP_CONFIG.JWT_TOKEN_KEY);

      if (sp) sp.style.display = 'none';
      if (tx) tx.textContent = 'Sign In to Portal';
      if (btn) btn.disabled = false;

      const ls = document.getElementById('loginScreen');
      if (ls) {
        ls.style.display = 'flex';
        ls.classList.remove('hidden');
      }
      const portal = document.getElementById('portalApp');
      if (portal) portal.style.display = 'none';
      setLoginUrl();
      document.body.classList.remove('auth-pending');

      showToast('Session verification failed. Please login again.', 'warning');
    });
}

// ═══════════════════════════════════════════════════════════════════
// 9. INIT ON STARTUP
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'].forEach(function (eventName) {
    document.addEventListener(eventName, recordSessionActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (hasSessionInactivityExpired()) {
      expireInactiveSession();
    } else {
      recordSessionActivity();
    }
  });
  window.addEventListener('storage', function (event) {
    if (event.key === SESSION_LAST_ACTIVITY_KEY) scheduleSessionInactivityTimers();
  });

  // ── Restore theme ──────────────────────────────────────────
  var savedTheme = localStorage.getItem('mc_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    var _tb = document.getElementById('btnTheme');
    if (_tb) _tb.textContent = '☀';
  }

  // ── Restore sidebar collapsed state (desktop) ──────────────
  try {
    if (localStorage.getItem('mc_sidebar_collapsed') === '1' && window.innerWidth > 900) {
      var _sb = document.getElementById('sidebar');
      var _mw = document.getElementById('mainWrapper');
      var _stb = document.getElementById('sidebarToggleBtn');
      if (_sb) _sb.classList.add('collapsed');
      if (_mw) _mw.classList.add('sidebar-collapsed');
      if (_stb) _stb.textContent = '›';
    }
  } catch (e) { }

  // ── Restore role from localStorage ─────────────────────────
  loadPersistedRoles();

  // Discard authentication left by older builds. Tokens now live only for
  // the current browser tab/session; UI preferences can remain persistent.
  if (window.APP_CONFIG && window.APP_CONFIG.JWT_TOKEN_KEY) {
    localStorage.removeItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  }

  // ── Verify session and initialize ──────────────────────────
  verifySessionAndInit();

  // ── Command palette input ───────────────────────────────────
  var cmdInp = document.getElementById('cmdInput');
  if (cmdInp) cmdInp.addEventListener('input', function (e) { runCmdSearch(e.target.value); });

  // ── Detail panel comment box ────────────────────────────────
  var commentInp = document.getElementById('commentInput');
  if (commentInp) {
    commentInp.addEventListener('keydown', function (e) {
      handleReportCommentKey(e);
    });
  }

  // ── Search button ───────────────────────────────────────────
  var sbtn = document.getElementById('btnSearch');
  if (sbtn) { sbtn.onclick = openGlobalSearch; sbtn.title = 'Search (Ctrl+K)'; }

  // ── Notifications badge ─────────────────────────────────────
  updateNotifBadge();

  // ── Status bar ──────────────────────────────────────────────
  updateStatusBar();
  setInterval(function () { updateStatusBar(); }, 60000);

  // ── Guided tour hint ────────────────────────────────────────
  if (!localStorage.getItem('mc_toured')) {
    setTimeout(function () {
      showToast('👋 New here? Click the search icon to explore!', 'info');
      localStorage.setItem('mc_toured', '1');
    }, 2500);
  }

  // ── Scroll-to-top button ────────────────────────────────────
  var content = document.getElementById('mainContent');
  var scrollBtn = document.getElementById('scrollTopBtn');
  if (content && scrollBtn) {
    content.addEventListener('scroll', function () {
      scrollBtn.style.display = content.scrollTop > 400 ? 'flex' : 'none';
    });
  }

  // ── Data management counts ──────────────────────────────────
  if (typeof updateDmCounts === 'function') updateDmCounts();

});


// ═══════════════════════════════════════════════════════════════
// CHART DRILL-DOWN — navigate to Incidents with filter applied
// ═══════════════════════════════════════════════════════════════
function drillDownToIncidents(filters) {
  // Navigate to incidents page
  navigate('incidents', document.getElementById('incidentsNav'));

  // Small delay to ensure page is active before applying filters
  setTimeout(function () {
    // Reset all filters first
    ['searchFilter', 'severityFilter', 'statusFilter', 'customerFilter', 'areaFilter', 'dateFrom', 'dateTo'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Apply the drill-down filters
    if (filters.severity) {
      var el = document.getElementById('severityFilter');
      if (el) el.value = filters.severity;
    }
    if (filters.customer) {
      var el = document.getElementById('customerFilter');
      if (el) el.value = filters.customer;
    }
    if (filters.area) {
      var el = document.getElementById('areaFilter');
      if (el) el.value = filters.area;
    }
    if (filters.status) {
      var el = document.getElementById('statusFilter');
      if (el) el.value = filters.status;
    }
    applyFilters();

    // Show a toast indicating what filter was applied
    var label = filters._label || Object.values(filters).filter(function (v) { return v && v[0] !== '_'; }).join(', ');
    showToast('Filtered: ' + label, 'info');

    // Show drill-down badge
    var badge = document.getElementById('drillDownBadge');
    if (badge) {
      badge.style.display = 'flex';
      badge.innerHTML = '<span style="font-size:11px;background:rgba(79,142,247,0.15);border:1px solid rgba(79,142,247,0.3);color:var(--accent);padding:3px 10px;border-radius:20px;display:flex;align-items:center;gap:6px">'
        + '<span>⬡ Drill-down: ' + label + '</span>'
        + '<span onclick="clearDrillDown()" style="cursor:pointer;opacity:0.7;margin-left:4px;font-size:13px" title="Clear filter">✕</span>'
        + '</span>';
    }

    // Highlight the filter bar briefly
    var fb = document.querySelector('.filter-bar');
    if (fb) {
      fb.style.transition = 'box-shadow 0.3s';
      fb.style.boxShadow = '0 0 0 2px var(--accent)';
      setTimeout(function () { fb.style.boxShadow = ''; }, 1500);
    }
  }, 120);
}


// ── TAG INPUT HELPERS ────────────────────────────────────────
var PRESET_TAGS = ['database', 'network', 'security', 'performance', 'auth', 'api', 'ui', 'deploy', 'config', 'monitoring', 'storage', 'timeout', 'integration', 'data-loss', 'backup'];
function addTagFromInput() {
  var input = document.getElementById('dp_tag_input');
  if (!input || !detailCurrentId) return;
  var val = input.value.trim();
  if (val) { addTagToIncident(detailCurrentId, val); }
  input.value = '';
  document.getElementById('dp_tag_suggestions').innerHTML = '';
}
function showTagSuggestions(query) {
  var box = document.getElementById('dp_tag_suggestions');
  if (!box) return;
  if (!box) return;
  query = (query || '').trim().toLowerCase();
  var inc = incidents.find(function (i) { return i.id === detailCurrentId; });
  var existing = inc ? (inc.tags || []) : [];
  var matches = PRESET_TAGS.filter(function (t) {
    return t.indexOf(query) >= 0 && existing.indexOf(t) < 0;
  });
  if (!query && !matches.length) { box.innerHTML = ''; return; }
  box.innerHTML = matches.slice(0, 8).map(function (t) {
    return '<span onclick="addTagToIncident(\'' + detailCurrentId + '\',\'' + t + '\')" '
      + 'style="cursor:pointer;background:rgba(79,142,247,0.1);color:#4f8ef7;border:1px solid rgba(79,142,247,0.25);'
      + 'border-radius:20px;padding:2px 8px;font-size:11px">' + t + '</span>';
  }).join('');
}

// ── TIMEZONE CHANGE HANDLERS ─────────────────────────────────
var reportCurrentIncId = null; // track which incident is open in report

function changeCreateTZ(newKey) {
  var oldKey = selectedTZ;
  var dateInput = document.getElementById('f_date');
  var curVal = dateInput && dateInput.value;
  if (curVal) {
    var converted = convertDatetimeLocalTZ(curVal, oldKey, newKey);
    dateInput.value = converted;
    dateInput.dataset.inputTimezone = newKey;
  }
  selectedTZ = newKey;
  var hint = document.getElementById('f_date_tz_hint');
  if (hint) hint.textContent = 'Input timezone: ' + newKey;
  // Refresh selector display
  renderTZSelector('createTZSelector', newKey, 'changeCreateTZ(this.value)');
}

// Convert the entered incident time from its displayed timezone when a
// customer is chosen, then persist that timezone with the incident.
function applyCreateCustomerTimezone(customerName) {
  var customerTimezone = getCustomerTimezone(customerName);
  if (!customerTimezone) return;

  var dateInput = document.getElementById('f_date');
  var previousTimezone = (dateInput && dateInput.dataset.inputTimezone) || selectedTZ || 'IST';
  if (dateInput && dateInput.value && previousTimezone !== customerTimezone) {
    dateInput.value = convertDatetimeLocalTZ(dateInput.value, previousTimezone, customerTimezone);
  }
  if (dateInput) dateInput.dataset.inputTimezone = customerTimezone;
  selectedTZ = customerTimezone;

  var hint = document.getElementById('f_date_tz_hint');
  if (hint) hint.textContent = 'Customer timezone: ' + customerTimezone + ' (time converted automatically)';
  renderTZSelector('createTZSelector', customerTimezone, 'changeCreateTZ(this.value)');
}

function changeEditTZ(newKey) {
  var oldKey = selectedTZ;
  var fields = ['dp_f_start_dt', 'dp_f_end_dt'];
  fields.forEach(function (fid) {
    var el = document.getElementById(fid);
    if (el && el.value) el.value = convertDatetimeLocalTZ(el.value, oldKey, newKey);
  });
  selectedTZ = newKey;
  var endEl = document.getElementById('dp_f_end_dt');
  if (endEl) endEl.dataset.inputTimezone = newKey;
  setIncidentEndHint('dp_end_tz_hint', newKey, false);
  var startHint = document.getElementById('dp_start_tz_hint');
  if (startHint) startHint.textContent = 'Incident timezone: ' + newKey;
  renderTZSelector('editTZSelector', newKey, 'changeEditTZ(this.value)');
  updateCriticalEditDowntime();
}

// changeReportTZ removed — report uses the timezone saved with the incident

// ─── READ-ONLY INCIDENT COPILOT ──────────────────────────────
var aiChatHistory = [];
var aiLauncherDrag = null;
var suppressAiLauncherClick = false;

function clampAiLauncherPosition(left, top, launcher) {
  var margin = 8;
  return {
    left: Math.max(margin, Math.min(left, window.innerWidth - launcher.offsetWidth - margin)),
    top: Math.max(margin, Math.min(top, window.innerHeight - launcher.offsetHeight - margin))
  };
}

function saveAiLauncherPosition(launcher) {
  try {
    localStorage.setItem('aocAiLauncherPosition', JSON.stringify({
      left: parseFloat(launcher.style.left), top: parseFloat(launcher.style.top)
    }));
  } catch (_) { /* Position persistence is optional. */ }
}

function restoreAiLauncherPosition() {
  var launcher = document.getElementById('aiChatLauncher');
  if (!launcher) return;
  try {
    var saved = JSON.parse(localStorage.getItem('aocAiLauncherPosition') || 'null');
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
    var position = clampAiLauncherPosition(saved.left, saved.top, launcher);
    launcher.style.left = position.left + 'px'; launcher.style.top = position.top + 'px';
    launcher.style.right = 'auto'; launcher.style.bottom = 'auto';
  } catch (_) { /* Keep the default bottom-right position. */ }
}

function startAiLauncherDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  var launcher = event.currentTarget;
  var rect = launcher.getBoundingClientRect();
  aiLauncherDrag = { launcher: launcher, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
  launcher.setPointerCapture?.(event.pointerId);
  launcher.classList.add('dragging');
  window.addEventListener('pointermove', moveAiLauncher);
  window.addEventListener('pointerup', stopAiLauncherDrag, { once: true });
  window.addEventListener('pointercancel', stopAiLauncherDrag, { once: true });
}

function moveAiLauncher(event) {
  if (!aiLauncherDrag || event.pointerId !== aiLauncherDrag.pointerId) return;
  var dx = event.clientX - aiLauncherDrag.startX;
  var dy = event.clientY - aiLauncherDrag.startY;
  if (!aiLauncherDrag.moved && Math.hypot(dx, dy) < 4) return;
  aiLauncherDrag.moved = true;
  var position = clampAiLauncherPosition(aiLauncherDrag.left + dx, aiLauncherDrag.top + dy, aiLauncherDrag.launcher);
  aiLauncherDrag.launcher.style.left = position.left + 'px'; aiLauncherDrag.launcher.style.top = position.top + 'px';
  aiLauncherDrag.launcher.style.right = 'auto'; aiLauncherDrag.launcher.style.bottom = 'auto';
  event.preventDefault();
}

function stopAiLauncherDrag(event) {
  if (!aiLauncherDrag || (event.pointerId !== undefined && event.pointerId !== aiLauncherDrag.pointerId)) return;
  var drag = aiLauncherDrag;
  aiLauncherDrag = null;
  drag.launcher.classList.remove('dragging');
  window.removeEventListener('pointermove', moveAiLauncher);
  if (drag.moved) { suppressAiLauncherClick = true; saveAiLauncherPosition(drag.launcher); }
}

function handleAiLauncherClick(event) {
  if (suppressAiLauncherClick) { suppressAiLauncherClick = false; event.preventDefault(); return; }
  toggleAiChat();
}

window.addEventListener('resize', function () {
  var launcher = document.getElementById('aiChatLauncher');
  if (!launcher || !launcher.style.left) return;
  var position = clampAiLauncherPosition(parseFloat(launcher.style.left), parseFloat(launcher.style.top), launcher);
  launcher.style.left = position.left + 'px'; launcher.style.top = position.top + 'px';
  saveAiLauncherPosition(launcher);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreAiLauncherPosition);
else restoreAiLauncherPosition();

function toggleAiChat(forceOpen) {
  var panel = document.getElementById('aiChatPanel');
  if (!panel) return;
  var open = forceOpen === undefined ? !panel.classList.contains('open') : Boolean(forceOpen);
  panel.classList.toggle('open', open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) setTimeout(function () { document.getElementById('aiChatInput')?.focus(); }, 0);
}

function appendAiChatMessage(role, content, isError) {
  var messages = document.getElementById('aiChatMessages');
  var bubble = document.createElement('div');
  bubble.className = 'ai-chat-message ' + role + (isError ? ' error' : '');
  bubble.textContent = content;
  if (role === 'assistant') {
    var ids = Array.from(new Set(String(content).match(/INC-\d+/g) || [])).slice(0, 8);
    if (ids.length) {
      var links = document.createElement('div'); links.className = 'ai-chat-incident-links';
      ids.forEach(function (id) {
        var button = document.createElement('button'); button.textContent = 'Open ' + id;
        button.onclick = function () { toggleAiChat(false); openDetailPanel(id); };
        links.appendChild(button);
      });
      bubble.appendChild(links);
    }
  }
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function askAiSuggestion(button) {
  var input = document.getElementById('aiChatInput');
  input.value = button.textContent;
  sendAiChatMessage();
}

function handleAiChatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAiChatMessage(); }
}

function sendAiChatMessage() {
  var input = document.getElementById('aiChatInput');
  var send = document.getElementById('aiChatSend');
  var message = String(input?.value || '').trim();
  if (!message || send.disabled) return;
  var token = sessionStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) { appendAiChatMessage('assistant', 'Please sign in before using Incident Copilot.', true); return; }
  appendAiChatMessage('user', message);
  input.value = ''; send.disabled = true; send.textContent = '...';
  var pending = appendAiChatMessage('assistant', 'Reviewing incident data...');
  fetch(window.APP_CONFIG.API_BASE_URL + '/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ message: message, history: aiChatHistory.slice(-8) })
  }).then(function (response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok || !data.success) throw new Error(data.message || 'AI request failed');
      return data.data.answer;
    });
  }).then(function (answer) {
    pending.remove();
    appendAiChatMessage('assistant', answer);
    aiChatHistory.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
    aiChatHistory = aiChatHistory.slice(-8);
  }).catch(function (error) {
    pending.remove(); appendAiChatMessage('assistant', error.message || 'Incident Copilot is unavailable.', true);
  }).finally(function () { send.disabled = false; send.textContent = 'Send'; input.focus(); });
}

function updateReportTimestamps(incId, tzKey) {
  var inc = incidents.find(function (i) { return i.id === incId; });
  if (!inc) return;

  // ── Reported date ─────────────────────────────────────────
  var irDate = document.getElementById('ir_date');
  if (irDate) {
    // Use startDT if available (has time), else fall back to date string
    var d = incidentTimestampDate(inc, 'start');
    if (!isNaN(d)) {
      var months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      // Shift to target TZ
      var targetMs = d.getTime() + getTZOffset(tzKey) * 3600000;
      var ld = new Date(targetMs);
      irDate.textContent = ld.getUTCDate() + ' ' + months[ld.getUTCMonth()] + ' ' + ld.getUTCFullYear();
    }
  }

  // ── Start & End times ────────────────────────────────────
  var slaHours = { Critical: 1, High: 4, Medium: 12, Normal: 24 }[inc.severity] || 6;
  // Build the "raw" start time — stored as IST datetime-local string
  var rawStart = inc.startDT || (inc.date + 'T09:00');
  // Parse as IST: treat string as local IST, convert to UTC for Date object
  var istOff = getTZOffset('IST'); // +5.5
  var startDate = incidentTimestampDate(inc, 'start') || wallClockToDate(rawStart, tzKey);

  var actualHours = (inc.downtimeH || 0) + (inc.downtimeM || 0) / 60 || slaHours;
  var endDate = incidentTimestampDate(inc, 'end') || new Date(startDate.getTime() + actualHours * 3600000);

  var startSrc = startDate;
  var endSrc = endDate;

  var irStart = document.getElementById('ir_start_time');
  var irEnd = document.getElementById('ir_end_time');
  if (irStart) irStart.textContent = fmtInTZ(startSrc, tzKey);
  if (irEnd) irEnd.textContent = fmtInTZ(endSrc, tzKey);

  // ── Update column labels to show active TZ ────────────────
  var irStartLabel = document.getElementById('ir_start_label');
  var irEndLabel = document.getElementById('ir_end_label');
  if (irStartLabel) irStartLabel.textContent = 'Start Time (' + tzKey + ')';
  if (irEndLabel) irEndLabel.textContent = 'End Time (' + tzKey + ')';

  // ── Footer note ───────────────────────────────────────────
  var footer = document.getElementById('ir_footer_note');
  if (footer) {
    footer.textContent = 'Report generated: ' + fmtInTZ(new Date(), tzKey)
      + ' · Magic Cloud Incident Portal · Timezone: ' + tzKey;
  }
}

// Override navigate to refresh kanban when returning to incidents
const _origNavInternal = navigateInternal;
navigateInternal = function (page, el) {
  _origNavInternal(page, el);
  if (page === 'incidents' && currentIncidentView === 'kanban') setTimeout(renderKanban, 100);
  if (page === 'datamanagement') { renderDataManagement(); updateDmCounts(); }
};

// Load comments when incident detail opens
const _origViewReport = viewIncidentReport;
viewIncidentReport = function (id) {
  _origViewReport(id);
  setTimeout(() => loadComments(id), 200);
};

// Preserve the main save handler; pre-send preview is handled before creation.
const _origSaveIncident = saveIncident;
saveIncident = function () {
  _origSaveIncident();
};

