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
const toMysqlDateTime = (value) => value ? String(value).replace('T', ' ').substring(0, 19) : null;
const toDateOnly = (value) => value ? String(value).substring(0, 10) : '';

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

const incidentSelect = `
  SELECT i.*, assignee.full_name AS engineer_name, creator.full_name AS created_by_name
    FROM incidents i
    LEFT JOIN users assignee ON assignee.id = i.assigned_to
    LEFT JOIN users creator ON creator.id = i.created_by
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
  return {
    db_id: row.id,
    id: ref,
    incident_ref: ref,
    title: row.title,
    customer: row.customer,
    project: row.project,
    severity: displaySeverity(row.severity),
    status: displayStatus(row.status),
    engineer: row.engineer_name || row.resolved_by || '',
    assigned_to: row.assigned_to,
    date_created: row.start_dt || row.created_at,
    date: toDateOnly(row.start_dt || row.created_at),
    startDT: row.start_dt || '',
    endDT: row.end_dt || '',
    timezone: row.timezone || 'IST',
    description: row.description || '',
    desc: row.description || '',
    components: row.components || '',
    applications: row.applications || '',
    sla_hours: row.sla_hours,
    slaHours: row.sla_hours,
    area: row.area || '',
    rca: row.rca || '',
    resolution: row.resolution || '',
    resolved_by: row.resolved_by || '',
    resolvedBy: row.resolved_by || '',
    sf_case: row.sf_case_no || '',
    sfCase: row.sf_case_no || '',
    downtime_h: downtimeH,
    downtime_m: downtimeM,
    downtimeH,
    downtimeM,
    downtimeStr: row.downtime_str || (downtimeH ? downtimeH + 'h' + (downtimeM ? ' ' + downtimeM + 'm' : '') : (downtimeM ? downtimeM + 'm' : '')),
    mttdStr: row.mttd_str || '',
    mttrStr: row.mttr_str || '',
    tags: parseTags(row.tags),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const createIncident = async (req, res) => {
  try {
    const { title, customer, project, severity, status, engineer, description, components, applications, sla_hours, area, tags, date_created, date, startDT, timezone, sf_case, sfCase } = req.body;
    if (!title || !severity) return res.status(400).json({ success: false, message: 'Title and severity are required' });

    const incidentRef = await generateIncidentRef();
    const assignedTo = await resolveUserId(engineer);
    const start = startDT || date_created || date || new Date().toISOString().substring(0, 16);

    await pool.query(
      `INSERT INTO incidents
       (incident_ref, title, description, severity, status, assigned_to, created_by, customer, project, area, components, applications, sla_hours, tags, start_dt, timezone, sf_case_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [incidentRef, title, description || null, normalizeSeverity(severity), normalizeStatus(status || 'New'), assignedTo, req.user.id, customer || null, project || null, area || null, components || null, applications || null, sla_hours || null, JSON.stringify(Array.isArray(tags) ? tags : []), start, timezone || 'IST', sf_case || sfCase || null]
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
    if (customer) { query += ' AND i.customer = ?'; params.push(customer); }
    if (area) { query += ' AND i.area = ?'; params.push(area); }
    if (severity) { query += ' AND i.severity = ?'; params.push(normalizeSeverity(severity)); }
    if (status) { query += ' AND i.status = ?'; params.push(normalizeStatus(status)); }
    if (search) { query += ' AND (i.incident_ref LIKE ? OR i.title LIKE ? OR i.description LIKE ? OR i.customer LIKE ?)'; params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%'); }
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
    if (b.customer !== undefined) add('customer', b.customer || null);
    if (b.project !== undefined) add('project', b.project || null);
    if (b.severity !== undefined) add('severity', normalizeSeverity(b.severity));
    if (b.status !== undefined) add('status', normalizeStatus(b.status));
    if (b.engineer !== undefined) add('assigned_to', await resolveUserId(b.engineer));
    if (b.description !== undefined) add('description', b.description || null);
    if (b.components !== undefined) add('components', b.components || null);
    if (b.applications !== undefined) add('applications', b.applications || null);
    if (b.sla_hours !== undefined) add('sla_hours', b.sla_hours || null);
    if (b.area !== undefined) add('area', b.area || null);
    const start = b.startDT || b.date_created || b.date;
    if (start !== undefined) add('start_dt', start || null);
    if (b.endDT !== undefined || b.closed_at !== undefined) add('end_dt', b.endDT || b.closed_at || null);
    if (b.timezone !== undefined) add('timezone', b.timezone || 'IST');
    if (b.rca !== undefined) add('rca', b.rca || null);
    if (b.resolution !== undefined) add('resolution', b.resolution || null);
    if (b.resolved_by !== undefined) add('resolved_by', b.resolved_by || null);
    if (b.sf_case !== undefined || b.sfCase !== undefined) add('sf_case_no', b.sf_case || b.sfCase || null);
    if (b.downtime_h !== undefined || b.downtimeH !== undefined) add('downtime_hours', b.downtime_h ?? b.downtimeH ?? 0);
    if (b.downtime_m !== undefined || b.downtimeM !== undefined) add('downtime_minutes', b.downtime_m ?? b.downtimeM ?? 0);
    if (b.downtimeStr !== undefined) add('downtime_str', b.downtimeStr || null);
    if (b.mttdStr !== undefined) add('mttd_str', b.mttdStr || null);
    if (b.mttrStr !== undefined) add('mttr_str', b.mttrStr || null);
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
    const [areaBreakdown] = await pool.query('SELECT area, COUNT(*) as count FROM incidents WHERE area IS NOT NULL GROUP BY area');
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
