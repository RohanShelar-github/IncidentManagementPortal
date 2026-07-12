const pool = require('../config/database');

const STATUS_TO_DB = {
  'New': 'open',
  'Open': 'open',
  'In Progress': 'in_progress',
  'Further Investigation': 'further_investigation',
  'Escalated to R&D': 'escalated_to_rd',
  'Escalated to 3rd Party': 'escalated_to_3rd_party',
  'Resolved': 'resolved',
  'Closed': 'closed'
};

const STATUS_FROM_DB = {
  open: 'New',
  in_progress: 'In Progress',
  further_investigation: 'Further Investigation',
  escalated_to_rd: 'Escalated to R&D',
  escalated_to_3rd_party: 'Escalated to 3rd Party',
  resolved: 'Resolved',
  closed: 'Closed'
};

const SEVERITY_TO_DB = { Critical: 'critical', High: 'high', Medium: 'medium', Normal: 'medium', Low: 'low' };
const SEVERITY_FROM_DB = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

const normalizeStatus = (value) => STATUS_TO_DB[value] || STATUS_TO_DB[String(value || '').trim()] || String(value || 'New').toLowerCase();
const normalizeSeverity = (value) => SEVERITY_TO_DB[value] || SEVERITY_TO_DB[String(value || '').trim()] || String(value || 'Medium').toLowerCase();
const displayStatus = (value) => STATUS_FROM_DB[value] || value || 'New';
const displaySeverity = (value) => SEVERITY_FROM_DB[value] || value || 'Medium';
const toDateOnly = (value) => value ? String(value).substring(0, 10) : '';
const minutesToHM = (mins) => {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return '';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return h > 0 ? (m > 0 ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
};
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

function mapIncident(row) {
  const ref = row.incident_ref || ('INC-' + String(row.id).padStart(3, '0'));
  const downtimeH = Number(row.downtime_hours || 0);
  const downtimeM = Number(row.downtime_minutes || 0);
  const mttdMinutes = row.mttd_minutes === null || row.mttd_minutes === undefined ? null : Number(row.mttd_minutes);
  const mttdH = Number.isFinite(mttdMinutes) && mttdMinutes > 0 ? Math.floor(mttdMinutes / 60) : 0;
  const mttdM = Number.isFinite(mttdMinutes) && mttdMinutes > 0 ? Math.round(mttdMinutes % 60) : 0;
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
    date_created: row.date_time_opened || row.start_dt || row.created_at,
    date: toDateOnly(row.date_time_opened || row.start_dt || row.created_at),
    startDT: row.start_dt || row.date_time_opened || '',
    endDT: row.end_dt || row.date_time_closed || '',
    date_time_opened: row.date_time_opened || '',
    date_time_closed: row.date_time_closed || '',
    closed_date: row.closed_date || '',
    timezone: row.timezone || '',
    description: row.description || '',
    desc: row.description || '',
    components: row.components || '',
    applications: row.applications || '',
    sla_hours: row.sla_hours,
    slaHours: row.sla_hours,
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
    downtime_h: downtimeH,
    downtime_m: downtimeM,
    downtimeH,
    downtimeM,
    downtime_mins: row.downtime_mins,
    downtimeStr: row.downtime_str || (downtimeH ? downtimeH + 'h' + (downtimeM ? ' ' + downtimeM + 'm' : '') : (downtimeM ? downtimeM + 'm' : '')),
    mttdStr: row.mttd_str || minutesToHM(mttdMinutes),
    mttd_minutes: mttdMinutes,
    mttdH,
    mttdM,
    mttrStr: row.mttr_str || '',
    account_name: row.account_name || '',
    internal_status: row.internal_status || '',
    rd_tickets: row.rd_tickets || '',
    tags: parseTags(row.tags),
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
    const mttdMinutes = resolveMttdMinutes(b);

    await pool.query(
      `INSERT INTO incidents
       (incident_ref, legacy_case_number, title, description, severity, status, assigned_to, case_owner, created_by,
        customer_id, customer, project, project_area, area_id, area, product_line, components, applications, sla_hours, tags,
        start_dt, date_time_opened, end_dt, date_time_closed, closed_date, timezone, sf_case_no, incident_report_status,
        downtime_mins, mttd_minutes, account_name, internal_status, rd_tickets)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentRef,
        b.legacy_case_number || b.sf_case || b.sfCase || null,
        b.title,
        b.description || null,
        normalizeSeverity(b.severity),
        normalizeStatus(b.status || 'New'),
        assignedTo,
        b.case_owner || b.engineer || null,
        req.user.id,
        resolvedCustomer.id,
        resolvedCustomer.name || b.customer || null,
        b.project || null,
        b.project_area || null,
        resolvedArea.id,
        resolvedArea.name || b.area || null,
        b.product_line || null,
        b.components || null,
        b.applications || null,
        b.sla_hours || null,
        JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
        start,
        b.date_time_opened || start || null,
        b.endDT || b.date_time_closed || null,
        b.date_time_closed || null,
        b.closed_date || null,
        b.timezone || 'IST',
        b.sf_case || b.sfCase || b.legacy_case_number || null,
        b.incident_report_status || null,
        b.downtime_mins || 0,
        mttdMinutes,
        b.account_name || null,
        b.internal_status || null,
        b.rd_tickets || null
      ]
    );

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
    const { customer, area, severity, status, search, limit = 50, offset = 0 } = req.query;
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
    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
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
    const [logs] = await pool.query('SELECT l.*, u.full_name AS author FROM activity_logs l LEFT JOIN users u ON u.id = l.action_by WHERE l.incident_id = ? ORDER BY l.created_at DESC', [dbId]);
    incident.comments = logs.map(l => ({ id: l.id, incident_id: incident.id, author: l.author, action: l.action_type, detail: l.detail, type: l.action_type, created_at: l.created_at }));
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
    const updates = [];
    const values = [];
    const add = (column, value) => { updates.push(column + ' = ?'); values.push(value); };
    const b = req.body;
    if (b.title !== undefined) add('title', b.title);
    if (b.customer !== undefined || b.customer_id !== undefined) {
      const resolvedCustomer = await resolveCustomer(b.customer_id || b.customer);
      add('customer_id', resolvedCustomer.id);
      add('customer', resolvedCustomer.name || b.customer || null);
    }
    if (b.project !== undefined) add('project', b.project || null);
    if (b.project_area !== undefined) add('project_area', b.project_area || null);
    if (b.severity !== undefined) add('severity', normalizeSeverity(b.severity));
    if (b.status !== undefined) add('status', normalizeStatus(b.status));
    if (b.engineer !== undefined) add('assigned_to', await resolveUserId(b.engineer));
    if (b.case_owner !== undefined) add('case_owner', b.case_owner || null);
    if (b.description !== undefined) add('description', b.description || null);
    if (b.components !== undefined) add('components', b.components || null);
    if (b.applications !== undefined) add('applications', b.applications || null);
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
    if (b.timezone !== undefined) add('timezone', b.timezone || 'IST');
    if (b.rca !== undefined) add('rca', b.rca || null);
    if (b.resolution !== undefined) add('resolution', b.resolution || null);
    if (b.resolved_by !== undefined) add('resolved_by', b.resolved_by || null);
    if (b.sf_case !== undefined || b.sfCase !== undefined) add('sf_case_no', b.sf_case || b.sfCase || null);
    if (b.incident_report_status !== undefined) add('incident_report_status', b.incident_report_status || null);
    if (b.downtime_h !== undefined || b.downtimeH !== undefined) add('downtime_hours', b.downtime_h ?? b.downtimeH ?? 0);
    if (b.downtime_m !== undefined || b.downtimeM !== undefined) add('downtime_minutes', b.downtime_m ?? b.downtimeM ?? 0);
    if (b.downtime_mins !== undefined) add('downtime_mins', b.downtime_mins ?? 0);
    if (b.downtimeStr !== undefined) add('downtime_str', b.downtimeStr || null);
    if (b.mttdStr !== undefined) add('mttd_str', b.mttdStr || null);
    if (b.mttd_minutes !== undefined || b.mttdH !== undefined || b.mttdM !== undefined || b.mttd_h !== undefined || b.mttd_m !== undefined) add('mttd_minutes', resolveMttdMinutes(b));
    if (b.mttrStr !== undefined) add('mttr_str', b.mttrStr || null);
    if (b.account_name !== undefined) add('account_name', b.account_name || null);
    if (b.internal_status !== undefined) add('internal_status', b.internal_status || null);
    if (b.rd_tickets !== undefined) add('rd_tickets', b.rd_tickets || null);
    if (b.tags !== undefined) add('tags', JSON.stringify(Array.isArray(b.tags) ? b.tags : []));
    if (updates.length) {
      values.push(dbId);
      await pool.query('UPDATE incidents SET ' + updates.join(', ') + ' WHERE id = ?', values);
      await pool.query('INSERT INTO activity_logs (incident_id, action_type, action_by, detail) VALUES (?, ?, ?, ?)', [dbId, 'edit', req.user.id, 'Incident updated']);
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
    await pool.query('DELETE FROM activity_logs WHERE incident_id = ?', [dbId]);
    await pool.query('DELETE FROM incidents WHERE id = ?', [dbId]);
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
    return res.status(200).json({ success: true, data: { total: totalResult[0].count, open: openResult[0].count, critical: criticalResult[0].count, statusBreakdown, severityBreakdown, areaBreakdown } });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const addComment = async (req, res) => {
  try {
    const dbId = await findIncidentDbId(req.params.id);
    if (!dbId) return res.status(404).json({ success: false, message: 'Incident not found' });
    await pool.query('INSERT INTO activity_logs (incident_id, action_type, action_by, detail) VALUES (?, ?, ?, ?)', [dbId, req.body.action || 'comment', req.user.id, req.body.detail || req.body.comment_text || null]);
    return res.status(201).json({ success: true, message: 'Comment added successfully' });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

module.exports = { createIncident, getIncidents, getIncidentById, updateIncident, deleteIncident, getDashboardStats, addComment };