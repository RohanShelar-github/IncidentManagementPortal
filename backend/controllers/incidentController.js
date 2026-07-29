const pool = require('../config/database');
const {
  buildCanonicalValues,
  minutesToHM,
  resolveDurationMinutes
} = require('../services/incidentNormalization');
const { notifyUsers } = require('../services/notificationService');

const CANONICAL_INCIDENT_FIELDS = process.env.CANONICAL_INCIDENT_FIELDS !== 'false';

const IANA_TO_LEGACY_TIMEZONE = {
  'Asia/Kolkata': 'IST',
  'America/New_York': 'EST',
  'America/Chicago': 'CST',
  'America/Denver': 'MST',
  'America/Los_Angeles': 'PST',
  'Etc/UTC': 'UTC'
};
const toLegacyTimezone = value => {
  const timezone = String(value || 'IST').trim() || 'IST';
  return IANA_TO_LEGACY_TIMEZONE[timezone] || (timezone.length <= 10 ? timezone : 'UTC');
};

const STATUS_TO_DB = {
  'New': 'open',
  'Open': 'open',
  'In Progress': 'in_progress',
  'Tier 1 Level Support': 'tier_1_level_support',
  'Further Investigation': 'further_investigation',
  'Escalated to R&D': 'escalated_to_rd',
  'Escalated to CSO Devops': 'escalated_to_cso_devops',
  'Escalated to 3rd Party': 'escalated_to_3rd_party',
  'Resolved': 'resolved',
  'Closed': 'closed'
};

const STATUS_FROM_DB = {
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

const SEVERITY_TO_DB = { Critical: 'critical', High: 'high', Medium: 'medium', Normal: 'normal' };
const SEVERITY_FROM_DB = { critical: 'Critical', high: 'High', medium: 'Medium', normal: 'Normal', low: 'Normal' };

const STATUS_TO_DB_LOWER = Object.keys(STATUS_TO_DB).reduce((result, key) => {
  result[key.toLowerCase()] = STATUS_TO_DB[key];
  return result;
}, {});
const normalizeStatus = (value) => {
  const status = String(value || 'New').trim();
  return STATUS_TO_DB[status] || STATUS_TO_DB_LOWER[status.toLowerCase()] || status.toLowerCase();
};
const normalizeSeverity = (value) => SEVERITY_TO_DB[value] || SEVERITY_TO_DB[String(value || '').trim()] || String(value || 'Medium').toLowerCase();
const displayStatus = (value) => STATUS_FROM_DB[value] || value || 'New';
const displaySeverity = (value) => SEVERITY_FROM_DB[String(value || '').toLowerCase()] || value || 'Medium';
const toDateTimeValue = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate())
      + ' ' + pad(value.getHours()) + ':' + pad(value.getMinutes()) + ':' + pad(value.getSeconds());
  }
  return String(value).replace('T', ' ').substring(0, 19);
};
const toDateOnly = (value) => toDateTimeValue(value).substring(0, 10);
const resolveMttdMinutes = (body) => {
  if (body.mttd_minutes !== undefined && body.mttd_minutes !== null && body.mttd_minutes !== '') return Number(body.mttd_minutes);
  const h = Number(body.mttdH ?? body.mttd_h ?? 0) || 0;
  const m = Number(body.mttdM ?? body.mttd_m ?? 0) || 0;
  const total = h * 60 + m;
  return total > 0 ? total : null;
};

const generateIncidentRef = async () => {
  const [result] = await pool.query("SELECT MAX(CAST(SUBSTRING_INDEX(incident_ref, '-', -1) AS UNSIGNED)) AS max_num FROM incidents WHERE incident_ref LIKE 'INC-%'");
  const maxNum = result[0]?.max_num ? Number(result[0].max_num) : 0;
  return 'INC-' + String(maxNum + 1).padStart(3, '0');
};

const resolveUserId = async (nameOrId) => {
  if (!nameOrId) return null;
  if (/^\d+$/.test(String(nameOrId))) return Number(nameOrId);
  const [rows] = await pool.query('SELECT id FROM users WHERE full_name = ? OR email = ? LIMIT 1', [nameOrId, nameOrId]);
  return rows.length ? rows[0].id : null;
};

const resolveCustomer = async (nameOrId) => {
  if (!nameOrId) return { id: null, name: null };
  if (/^\d+$/.test(String(nameOrId))) {
    const [rows] = await pool.query('SELECT id, customer_name FROM customers WHERE id = ? LIMIT 1', [Number(nameOrId)]);
    return rows.length ? { id: rows[0].id, name: rows[0].customer_name } : { id: null, name: String(nameOrId) };
  }
  const [rows] = await pool.query('SELECT id, customer_name FROM customers WHERE customer_name = ? OR customer_code = ? LIMIT 1', [nameOrId, nameOrId]);
  return rows.length ? { id: rows[0].id, name: rows[0].customer_name } : { id: null, name: String(nameOrId) };
};

const resolveArea = async (nameOrId) => {
  if (!nameOrId) return { id: null, name: null };
  if (/^\d+$/.test(String(nameOrId))) {
    const [rows] = await pool.query('SELECT id, area_name FROM area WHERE id = ? LIMIT 1', [Number(nameOrId)]);
    return rows.length ? { id: rows[0].id, name: rows[0].area_name } : { id: null, name: String(nameOrId) };
  }
  const [rows] = await pool.query('SELECT id, area_name FROM area WHERE area_name = ? OR area_code = ? LIMIT 1', [nameOrId, nameOrId]);
  return rows.length ? { id: rows[0].id, name: rows[0].area_name } : { id: null, name: String(nameOrId) };
};

const incidentSelect = `
  SELECT i.*, assignee.full_name AS engineer_name, creator.full_name AS created_by_name,
         ${CANONICAL_INCIDENT_FIELDS
    ? "DATE_FORMAT(i.opened_at_utc, '%Y-%m-%d %H:%i:%s') AS opened_at_utc_text, DATE_FORMAT(i.closed_at_utc, '%Y-%m-%d %H:%i:%s') AS closed_at_utc_text,"
    : "NULL AS opened_at_utc_text, NULL AS closed_at_utc_text,"}
         customer_master.customer_name, area_master.area_name
    FROM incidents i
    LEFT JOIN users assignee ON assignee.id = i.assigned_to
    LEFT JOIN users creator ON creator.id = i.created_by
    LEFT JOIN customers customer_master ON customer_master.id = i.customer_id
    LEFT JOIN area area_master ON area_master.id = i.area_id
`;

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch (_) { return []; }
}

function parseComments(comments) {
  if (!comments) return [];
  if (Array.isArray(comments)) return comments;
  try {
    const parsed = JSON.parse(comments);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function mapIncident(row) {
  const ref = row.incident_ref || ('INC-' + String(row.id).padStart(3, '0'));
  const downtime = minutesToHM(
    row.downtime_mins === null || row.downtime_mins === undefined
      ? Number(row.downtime_hours || 0) * 60 + Number(row.downtime_minutes || 0)
      : row.downtime_mins
  );
  const mttdMinutes = row.mttd_minutes === null || row.mttd_minutes === undefined ? null : Number(row.mttd_minutes);
  const mttd = minutesToHM(mttdMinutes);
  const mttrMinutes = row.mttr_minutes === null || row.mttr_minutes === undefined
    ? resolveDurationMinutes({ mttrStr: row.mttr_str }, 'mttr', null)
    : Number(row.mttr_minutes);
  const mttr = minutesToHM(mttrMinutes);
  const openedAt = toDateTimeValue(row.date_time_opened || row.start_dt || row.created_at);
  const startDT = toDateTimeValue(row.start_dt || row.date_time_opened);
  const endDT = toDateTimeValue(row.end_dt || row.date_time_closed);
  const closedAt = toDateTimeValue(row.date_time_closed);
  const slaHours = row.sla_minutes === null || row.sla_minutes === undefined
    ? row.sla_hours
    : Number(row.sla_minutes) / 60;
  return {
    db_id: row.id,
    id: ref,
    incident_ref: ref,
    legacy_case_number: row.legacy_case_number || row.sf_case_no || '',
    title: row.title,
    customer_id: row.customer_id,
    customer: row.customer_name || row.customer,
    project: row.project,
    project_area: row.project_area || '',
    severity: displaySeverity(row.severity),
    status: displayStatus(row.status),
    engineer: row.engineer_name || row.case_owner || row.resolved_by || '',
    assigned_to: row.assigned_to,
    case_owner: row.case_owner || '',
    date_created: openedAt,
    date: toDateOnly(openedAt),
    startDT,
    endDT,
    date_time_opened: toDateTimeValue(row.date_time_opened),
    date_time_closed: closedAt,
    closed_date: row.closed_date || '',
    timezone: row.timezone || '',
    source_timezone: row.source_timezone || '',
    opened_at_utc: row.opened_at_utc_text ? row.opened_at_utc_text.replace(' ', 'T') + 'Z' : '',
    closed_at_utc: row.closed_at_utc_text ? row.closed_at_utc_text.replace(' ', 'T') + 'Z' : '',
    description: row.description || '',
    desc: row.description || '',
    sla_minutes: row.sla_minutes === null || row.sla_minutes === undefined ? null : Number(row.sla_minutes),
    sla_hours: slaHours,
    slaHours,
    area_id: row.area_id,
    area: row.area_name || row.area || '',
    product_line: row.product_line || '',
    rca: row.rca || '',
    resolution: row.resolution || '',
    resolved_by: row.resolved_by || '',
    resolvedBy: row.resolved_by || '',
    sf_case: row.sf_case_no || row.legacy_case_number || '',
    sfCase: row.sf_case_no || row.legacy_case_number || '',
    incident_report_status: row.incident_report_status || '',
    downtime_h: downtime.hours,
    downtime_m: downtime.minutes,
    downtimeH: downtime.hours,
    downtimeM: downtime.minutes,
    downtime_mins: downtime.total,
    downtime_minutes_total: downtime.total,
    downtimeStr: downtime.text,
    mttdStr: mttd.text,
    mttd_minutes: mttdMinutes,
    mttdH: mttd.hours,
    mttdM: mttd.minutes,
    mttr_minutes: mttrMinutes,
    mttrH: mttr.hours,
    mttrM: mttr.minutes,
    mttrStr: mttr.text,
    account_name: row.account_name || '',
    internal_status: row.internal_status || '',
    rd_tickets: row.rd_tickets || '',
    rdTickets: row.rd_tickets || '',
    tags: parseTags(row.tags),
    comments: parseComments(row.comments),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const createIncident = async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || !b.severity) return res.status(400).json({ success: false, message: 'Title and severity are required' });

    const incidentRef = await generateIncidentRef();
    const assignedTo = await resolveUserId(b.engineer);
    const resolvedCustomer = await resolveCustomer(b.customer_id || b.customer);
    const resolvedArea = await resolveArea(b.area_id || b.area);
    const start = b.startDT || b.date_created || b.date || new Date().toISOString().substring(0, 16);
    const canonical = buildCanonicalValues({ ...b, date_time_opened: b.date_time_opened || start }, null);
    const downtime = minutesToHM(canonical.downtime_mins);
    const mttd = minutesToHM(canonical.mttd_minutes);
    const mttr = minutesToHM(canonical.mttr_minutes);
    const columns = [
      'incident_ref', 'legacy_case_number', 'title', 'description', 'severity', 'status', 'assigned_to', 'case_owner', 'created_by',
      'customer_id', 'customer', 'project', 'project_area', 'area_id', 'area', 'product_line',
      'sla_hours', 'tags', 'start_dt', 'date_time_opened', 'end_dt', 'date_time_closed', 'closed_date', 'timezone',
      'sf_case_no', 'incident_report_status', 'downtime_hours', 'downtime_minutes', 'downtime_mins', 'downtime_str',
      'mttd_str', 'mttd_minutes', 'mttr_str', 'account_name', 'internal_status', 'rd_tickets'
    ];
    const values = [
      incidentRef, b.legacy_case_number || b.sf_case || b.sfCase || null, b.title, b.description || null,
      normalizeSeverity(b.severity), normalizeStatus(b.status || 'New'), assignedTo, b.case_owner || b.engineer || null,
      req.user.id, resolvedCustomer.id, resolvedCustomer.name || b.customer || null, b.project || null,
      b.project_area || null, resolvedArea.id, resolvedArea.name || b.area || null, b.product_line || null,
      b.sla_hours || null,
      JSON.stringify(Array.isArray(b.tags) ? b.tags : []), start, b.date_time_opened || start || null,
      b.endDT || b.date_time_closed || null, b.date_time_closed || null, b.closed_date || null, toLegacyTimezone(b.timezone || canonical.source_timezone),
      b.sf_case || b.sfCase || b.legacy_case_number || null, b.incident_report_status || null,
      downtime.hours, downtime.minutes, downtime.total, downtime.text || null,
      mttd.text || null, canonical.mttd_minutes, mttr.text || null,
      b.account_name || null, b.internal_status || null, b.rd_tickets || b.rdTickets || null
    ];
    if (CANONICAL_INCIDENT_FIELDS) {
      columns.push('opened_at_utc', 'closed_at_utc', 'source_timezone', 'sla_minutes', 'mttr_minutes');
      values.push(canonical.opened_at_utc, canonical.closed_at_utc, canonical.source_timezone, canonical.sla_minutes, canonical.mttr_minutes);
    }
    await pool.query(
      'INSERT INTO incidents (' + columns.join(', ') + ') VALUES (' + columns.map(() => '?').join(', ') + ')',
      values
    );
    await notifyUsers({
      actorId: req.user.id,
      message: `${req.user.name || req.user.email} created ${incidentRef}: ${b.title}`,
      type: 'create',
      incidentRef,
      mentionText: (Array.isArray(b.tags) ? b.tags : []).join(' ')
    });

    const [created] = await pool.query('SELECT id FROM incidents WHERE incident_ref = ?', [incidentRef]);
    if (created.length) {
      await pool.query('INSERT INTO activity_logs (incident_id, action_type, action_by, detail) VALUES (?, ?, ?, ?)', [created[0].id, 'create', req.user.id, 'Incident created']);
    }
    return res.status(201).json({ success: true, message: 'Incident created successfully', data: { id: incidentRef } });
  } catch (error) {
    console.error('Create incident error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const getIncidents = async (req, res) => {
  try {
    const { customer, area, severity, status, search, limit, offset = 0 } = req.query;
    let query = incidentSelect + ' WHERE 1=1';
    const params = [];
    if (customer) { query += ' AND (i.customer = ? OR customer_master.customer_name = ? OR i.customer_id = ?)'; params.push(customer, customer, Number(customer) || 0); }
    if (area) { query += ' AND (i.area = ? OR area_master.area_name = ? OR i.area_id = ?)'; params.push(area, area, Number(area) || 0); }
    if (severity) { query += ' AND i.severity = ?'; params.push(normalizeSeverity(severity)); }
    if (status) { query += ' AND i.status = ?'; params.push(normalizeStatus(status)); }
    if (search) {
      query += ' AND (i.incident_ref LIKE ? OR i.legacy_case_number LIKE ? OR i.title LIKE ? OR i.description LIKE ? OR i.customer LIKE ? OR customer_master.customer_name LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    query += ' ORDER BY i.created_at DESC';
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      query += ' LIMIT ? OFFSET ?';
      params.push(parsedLimit, Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0);
    }
    const [rows] = await pool.query(query, params);
    return res.status(200).json({ success: true, data: rows.map(mapIncident) });
  } catch (error) {
    console.error('Get incidents error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const findIncidentDbId = async (idOrRef) => {
  const [rows] = await pool.query('SELECT id FROM incidents WHERE incident_ref = ? OR id = ? LIMIT 1', [idOrRef, Number(idOrRef) || 0]);
  return rows.length ? rows[0].id : null;
};

const getIncidentById = async (req, res) => {
  try {
    const dbId = await findIncidentDbId(req.params.id);
    if (!dbId) return res.status(404).json({ success: false, message: 'Incident not found' });
    const [rows] = await pool.query(incidentSelect + ' WHERE i.id = ?', [dbId]);
    const incident = mapIncident(rows[0]);
    return res.status(200).json({ success: true, data: incident });
  } catch (error) {
    console.error('Get incident error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const updateIncident = async (req, res) => {
  try {
    const dbId = await findIncidentDbId(req.params.id);
    if (!dbId) return res.status(404).json({ success: false, message: 'Incident not found' });
    const [currentRows] = await pool.query('SELECT * FROM incidents WHERE id = ? LIMIT 1', [dbId]);
    const current = currentRows[0] || {};
    const updates = [];
    const values = [];
    const add = (column, value) => { updates.push(column + ' = ?'); values.push(value); };
    const b = req.body;
    const canonicalBody = { ...b };
    const timezoneTouched = b.timezone !== undefined || b.source_timezone !== undefined;
    if (timezoneTouched && b.date_time_opened === undefined && b.startDT === undefined && b.date_created === undefined && b.date === undefined) {
      canonicalBody.date_time_opened = current.date_time_opened || current.start_dt;
    }
    if (timezoneTouched && b.date_time_closed === undefined && b.endDT === undefined && b.closed_at === undefined) {
      canonicalBody.date_time_closed = current.date_time_closed || current.end_dt;
    }
    const canonical = buildCanonicalValues(canonicalBody, current);

    if (b.title !== undefined) add('title', b.title);
    if (b.customer !== undefined || b.customer_id !== undefined) {
      const resolvedCustomer = await resolveCustomer(b.customer_id || b.customer);
      add('customer_id', resolvedCustomer.id);
      add('customer', resolvedCustomer.name || b.customer || null);
    }
    if (b.project !== undefined && String(b.project || '').trim() !== '') add('project', String(b.project).trim());
    if (b.project_area !== undefined) add('project_area', b.project_area || null);
    if (b.severity !== undefined) add('severity', normalizeSeverity(b.severity));
    const normalizedStatus = b.status !== undefined ? normalizeStatus(b.status) : undefined;
    if (b.status !== undefined) add('status', normalizedStatus);
    if (b.engineer !== undefined) add('assigned_to', await resolveUserId(b.engineer));
    if (b.case_owner !== undefined) add('case_owner', b.case_owner || null);
    if (b.description !== undefined) add('description', b.description || null);
    if (b.sla_hours !== undefined) add('sla_hours', b.sla_hours || null);
    if (b.area !== undefined || b.area_id !== undefined) {
      const resolvedArea = await resolveArea(b.area_id || b.area);
      add('area_id', resolvedArea.id);
      add('area', resolvedArea.name || b.area || null);
    }
    if (b.product_line !== undefined) add('product_line', b.product_line || null);
    if (b.legacy_case_number !== undefined) add('legacy_case_number', b.legacy_case_number || null);
    const start = b.startDT || b.date_created || b.date;
    if (start !== undefined) add('start_dt', start || null);
    if (b.endDT !== undefined || b.closed_at !== undefined) add('end_dt', b.endDT || b.closed_at || null);
    if (b.date_time_opened !== undefined) add('date_time_opened', b.date_time_opened || null);
    if (b.date_time_closed !== undefined) add('date_time_closed', b.date_time_closed || null);
    if (b.closed_date !== undefined) add('closed_date', b.closed_date || null);
    if (b.timezone !== undefined) add('timezone', toLegacyTimezone(b.timezone));
    if (b.rca !== undefined) add('rca', b.rca || null);
    if (b.resolution !== undefined) add('resolution', b.resolution || null);
    if (b.resolved_by !== undefined) add('resolved_by', b.resolved_by || null);
    if ((b.sf_case !== undefined || b.sfCase !== undefined) && String(b.sf_case || b.sfCase || '').trim() !== '') add('sf_case_no', String(b.sf_case || b.sfCase).trim());
    if (b.incident_report_status !== undefined) {
      const reportStatus = String(b.incident_report_status || '').trim();
      add('incident_report_status', reportStatus || null);
    }

    const downtimeTouched = ['downtime_mins', 'downtime_minutes_total', 'downtime_h', 'downtimeH', 'downtime_m', 'downtimeM', 'downtimeStr', 'downtime_str']
      .some((key) => b[key] !== undefined);
    if (downtimeTouched) {
      const duration = minutesToHM(canonical.downtime_mins);
      add('downtime_hours', duration.hours);
      add('downtime_minutes', duration.minutes);
      add('downtime_mins', duration.total);
      add('downtime_str', duration.text || null);
    }
    const mttdTouched = ['mttd_minutes', 'mttdH', 'mttd_h', 'mttdM', 'mttd_m', 'mttdStr', 'mttd_str']
      .some((key) => b[key] !== undefined);
    if (mttdTouched) {
      add('mttd_minutes', canonical.mttd_minutes);
      add('mttd_str', minutesToHM(canonical.mttd_minutes).text || null);
    }
    const mttrTouched = ['mttr_minutes', 'mttrH', 'mttr_h', 'mttrM', 'mttr_m', 'mttrStr', 'mttr_str']
      .some((key) => b[key] !== undefined);
    if (mttrTouched) add('mttr_str', minutesToHM(canonical.mttr_minutes).text || null);
    if (b.account_name !== undefined) add('account_name', b.account_name || null);
    if (b.internal_status !== undefined) add('internal_status', b.internal_status || null);
    if ((b.rd_tickets !== undefined || b.rdTickets !== undefined) && String(b.rd_tickets || b.rdTickets || '').trim() !== '') add('rd_tickets', String(b.rd_tickets || b.rdTickets).trim());
    if (b.tags !== undefined) add('tags', JSON.stringify(Array.isArray(b.tags) ? b.tags : []));

    if (CANONICAL_INCIDENT_FIELDS) {
      if (canonical.opened_at_utc !== undefined) add('opened_at_utc', canonical.opened_at_utc);
      if (canonical.closed_at_utc !== undefined) add('closed_at_utc', canonical.closed_at_utc);
      if (timezoneTouched || canonical.opened_at_utc !== undefined || canonical.closed_at_utc !== undefined) add('source_timezone', canonical.source_timezone);
      if (b.sla_hours !== undefined || b.sla_minutes !== undefined) add('sla_minutes', canonical.sla_minutes);
      if (mttrTouched) add('mttr_minutes', canonical.mttr_minutes);
    }
    if (updates.length) {
      values.push(dbId);
      await pool.query('UPDATE incidents SET ' + updates.join(', ') + ' WHERE id = ?', values);
      await pool.query('INSERT INTO activity_logs (incident_id, action_type, action_by, detail) VALUES (?, ?, ?, ?)', [dbId, 'edit', req.user.id, 'Incident updated']);
      const incidentRef = current.incident_ref || req.params.id;
      const closed = normalizedStatus === 'closed';
      await notifyUsers({
        actorId: req.user.id,
        message: `${req.user.name || req.user.email} ${closed ? 'closed' : 'updated'} ${incidentRef}`,
        type: closed ? 'close' : 'edit',
        incidentRef,
        mentionText: Array.isArray(b.tags) ? b.tags.join(' ') : ''
      });
    }
    return res.status(200).json({ success: true, message: 'Incident updated successfully' });
  } catch (error) {
    console.error('Update incident error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const deleteIncident = async (req, res) => {
  try {
    const dbId = await findIncidentDbId(req.params.id);
    if (!dbId) return res.status(404).json({ success: false, message: 'Incident not found' });
    const [incidentRows] = await pool.query('SELECT incident_ref, title FROM incidents WHERE id = ?', [dbId]);
    await pool.query('DELETE FROM activity_logs WHERE incident_id = ?', [dbId]);
    await pool.query('DELETE FROM incidents WHERE id = ?', [dbId]);
    const deleted = incidentRows[0] || { incident_ref: req.params.id, title: '' };
    await notifyUsers({
      actorId: req.user.id,
      message: `${req.user.name || req.user.email} deleted ${deleted.incident_ref}: ${deleted.title}`,
      type: 'delete',
      incidentRef: deleted.incident_ref
    });
    return res.status(200).json({ success: true, message: 'Incident deleted successfully' });
  } catch (error) {
    console.error('Delete incident error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const [totalResult] = await pool.query('SELECT COUNT(*) as count FROM incidents');
    const [openResult] = await pool.query("SELECT COUNT(*) as count FROM incidents WHERE status != 'closed'");
    const [criticalResult] = await pool.query("SELECT COUNT(*) as count FROM incidents WHERE severity = 'critical' AND status != 'closed'");
    const [statusBreakdown] = await pool.query('SELECT status, COUNT(*) as count FROM incidents GROUP BY status');
    const [severityBreakdown] = await pool.query('SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity');
    const [areaBreakdown] = await pool.query('SELECT COALESCE(area.area_name, incidents.area) AS area, COUNT(*) as count FROM incidents LEFT JOIN area ON area.id = incidents.area_id GROUP BY COALESCE(area.area_name, incidents.area)');
    return res.status(200).json({ success: true, data: { total: totalResult[0].count, open: openResult[0].count, critical: criticalResult[0].count, statusBreakdown, severityBreakdown: severityBreakdown.map((item) => ({ ...item, severity: displaySeverity(item.severity) })), areaBreakdown } });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const addComment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const dbId = await findIncidentDbId(req.params.id);
    if (!dbId) return res.status(404).json({ success: false, message: 'Incident not found' });
    const text = String(req.body.detail || req.body.comment_text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT comments FROM incidents WHERE id = ? FOR UPDATE', [dbId]);
    const comments = parseComments(rows[0] && rows[0].comments);
    const comment = {
      author: req.user.name || req.user.email || 'User',
      author_id: req.user.id,
      action: 'commented',
      type: 'comment',
      detail: text,
      created_at: new Date().toISOString()
    };
    comments.push(comment);
    await connection.query('UPDATE incidents SET comments = ? WHERE id = ?', [JSON.stringify(comments), dbId]);
    await connection.query(
      'INSERT INTO activity_logs (incident_id, action_type, action_by, detail) VALUES (?, ?, ?, ?)',
      [dbId, 'comment', req.user.id, text]
    );
    await connection.commit();
    await notifyUsers({
      actorId: req.user.id,
      message: `${req.user.name || req.user.email} commented on ${req.params.id}: ${text}`,
      type: 'comment',
      incidentRef: req.params.id,
      mentionText: text
    });
    return res.status(201).json({ success: true, message: 'Comment added successfully', data: comment });
  } catch (error) {
    await connection.rollback();
    console.error('Add comment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  } finally {
    connection.release();
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  getDashboardStats,
  addComment,
  _test: { mapIncident }
};
