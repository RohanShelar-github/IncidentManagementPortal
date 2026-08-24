'use strict';

const pool = require('../config/database');
const { answerIncidentQuestion, planIncidentQuestion, configured, selectIncidentContext, formatIncidentList, isStructuredIncidentRequest } = require('../services/aiService');

const requestWindows = new Map();

function rateLimited(userId) {
  const now = Date.now();
  const recent = (requestWindows.get(userId) || []).filter((time) => now - time < 60000);
  if (recent.length >= 10) return true;
  recent.push(now);
  requestWindows.set(userId, recent);
  return false;
}

function cleanText(value, limit = 120) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function dateWindow(preset) {
  const today = new Date();
  const asDate = (date) => date.toISOString().slice(0, 10);
  if (preset === 'current_month') return [asDate(new Date(today.getFullYear(), today.getMonth(), 1)), asDate(new Date(today.getFullYear(), today.getMonth() + 1, 1))];
  if (preset === 'previous_month') return [asDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), asDate(new Date(today.getFullYear(), today.getMonth(), 1))];
  if (preset === 'last_7_days' || preset === 'last_30_days') {
    const from = new Date(today);
    from.setDate(from.getDate() - (preset === 'last_7_days' ? 7 : 30));
    return [asDate(from), asDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))];
  }
  return null;
}

function buildWhere(rawArgs) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const clauses = [];
  const params = [];
  const labels = [];
  const equalFilters = [
    ['customer', 'i.customer', 'customer'], ['created_by', 'creator.full_name', 'created by'],
    ['assigned_to', 'i.case_owner', 'assigned to'], ['status', 'i.status', 'status'], ['severity', 'i.severity', 'severity']
  ];
  equalFilters.forEach(([key, column, label]) => {
    const value = cleanText(args[key]);
    if (!value) return;
    clauses.push(`LOWER(COALESCE(${column}, '')) = LOWER(?)`);
    params.push(value);
    labels.push(`${label} ${value}`);
  });
  const incidentId = cleanText(args.incident_id);
  if (incidentId) { clauses.push('LOWER(i.incident_ref) = LOWER(?)'); params.push(incidentId); labels.push(`incident ${incidentId}`); }
  const text = cleanText(args.text);
  if (text) {
    const like = `%${text}%`;
    clauses.push('(i.incident_ref LIKE ? OR i.title LIKE ? OR i.description LIKE ? OR i.rca LIKE ? OR i.resolution LIKE ?)');
    params.push(like, like, like, like, like);
    labels.push(`matching “${text}”`);
  }
  const window = dateWindow(args.date_preset);
  if (window) {
    clauses.push('DATE(COALESCE(i.date_time_opened, i.created_at)) >= ? AND DATE(COALESCE(i.date_time_opened, i.created_at)) < ?');
    params.push(...window);
    labels.push(String(args.date_preset).replace(/_/g, ' '));
  }
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params, labels };
}

function formatSearchResult(rows, labels) {
  if (!rows.length) return `No incidents found${labels.length ? ' for ' + labels.join('; ') : ''}.`;
  const bySeverity = Object.entries(rows.reduce((all, row) => { all[row.severity || 'Unspecified'] = (all[row.severity || 'Unspecified'] || 0) + 1; return all; }, {})).map(([key, value]) => `${key}: ${value}`).join(', ');
  const lines = rows.map((row) => `- ${row.id}: ${row.title || 'Untitled'} | ${row.severity || 'Unspecified'} | ${row.status || 'Unspecified'} | ${row.customer || 'No customer'}${row.created_by ? ' | Created by: ' + row.created_by : ''}`);
  return `Found ${rows.length} incident(s)${labels.length ? ' for ' + labels.join('; ') : ''}.\nSeverity breakdown: ${bySeverity}.\n\n${lines.join('\n')}`;
}

async function executeCopilotTool(call) {
  const name = call?.function?.name;
  const args = call?.function?.arguments && typeof call.function.arguments === 'object' ? call.function.arguments : {};
  const { where, params, labels } = buildWhere(args);
  if (name === 'search_incidents') {
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
    const [rows] = await pool.query(`
      SELECT i.incident_ref AS id, i.title, i.severity, i.status, i.customer, i.project, i.area,
             i.case_owner AS engineer, creator.full_name AS created_by, i.date_time_opened AS opened_at,
             i.date_time_closed AS closed_at
        FROM incidents i LEFT JOIN users creator ON creator.id = i.created_by
        ${where} ORDER BY COALESCE(i.date_time_opened, i.created_at) DESC LIMIT ${limit}`, params);
    return formatSearchResult(rows, labels);
  }
  if (name === 'get_incident_metrics') {
    const dimensions = {
      severity: "COALESCE(i.severity, 'Unspecified')", status: "COALESCE(i.status, 'Unspecified')",
      customer: "COALESCE(i.customer, 'Unspecified')", creator: "COALESCE(creator.full_name, 'Unspecified')",
      assignee: "COALESCE(i.case_owner, 'Unassigned')", month: "DATE_FORMAT(COALESCE(i.date_time_opened, i.created_at), '%Y-%m')"
    };
    const groupBy = dimensions[args.group_by];
    if (!groupBy) throw new Error('Unsupported Copilot metric grouping');
    const [rows] = await pool.query(`SELECT ${groupBy} AS label, COUNT(*) AS count FROM incidents i LEFT JOIN users creator ON creator.id = i.created_by ${where} GROUP BY ${groupBy} ORDER BY count DESC, label ASC LIMIT 50`, params);
    const description = labels.length ? ' for ' + labels.join('; ') : '';
    return rows.length ? `Incident count by ${args.group_by}${description}:\n\n${rows.map((row) => `- ${row.label || 'Unspecified'}: ${row.count}`).join('\n')}` : `No incidents found${description}.`;
  }
  throw new Error('Unsupported Copilot tool');
}

async function chat(req, res) {
  try {
    if (!configured()) return res.status(503).json({ success: false, message: 'AI assistant is not configured. Check the selected AI provider settings on the backend.' });
    if (rateLimited(req.user.id)) return res.status(429).json({ success: false, message: 'Too many AI requests. Please wait a minute and try again.' });
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 2000) return res.status(400).json({ success: false, message: 'Enter a question up to 2,000 characters.' });
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    // Resolve direct list/filter requests first. This is a database-only path
    // and avoids waiting for a local model to recognise a simple query.
    const [rows] = await pool.query(`
      SELECT i.incident_ref AS id, i.title, i.severity, i.status, i.customer, i.project, i.area,
             i.case_owner AS engineer, creator.full_name AS created_by,
             i.description, i.rca, i.resolution, i.resolved_by,
             i.downtime_str AS downtime, i.mttd_str AS mttd, i.mttr_str AS mttr,
             i.date_time_opened AS opened_at, i.date_time_closed AS closed_at
        FROM incidents i
        LEFT JOIN users creator ON creator.id = i.created_by
       ORDER BY COALESCE(i.date_time_opened, i.created_at) DESC
       LIMIT 250`);
    const context = selectIncidentContext(rows, message);
    if (context.filters.length && !context.rows.length) {
      return res.json({
        success: true,
        data: {
          model: 'portal-filter',
          answer: 'No incidents match the requested filters: ' + context.filters.join('; ') + '.'
        }
      });
    }
    if (isStructuredIncidentRequest(message, context.filters)) {
      return res.json({
        success: true,
        data: { model: 'portal-filter', answer: formatIncidentList(context.rows, context.filters) }
      });
    }
    // For broader natural-language requests, the model may plan one of the
    // restricted read-only tools. It never gets direct database access.
    try {
      const calls = await planIncidentQuestion({ message, history });
      if (calls.length) {
        const answer = await executeCopilotTool(calls[0]);
        return res.json({ success: true, data: { model: 'portal-query', answer } });
      }
    } catch (planningError) {
      console.warn('Copilot tool planner unavailable; using bounded fallback:', planningError.message);
    }
    const result = await answerIncidentQuestion({ message, history, incidents: context.rows, user: req.user });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('AI chat error:', error.message);
    const status = error.name === 'TimeoutError' ? 504 : (error.status === 401 ? 502 : 500);
    return res.status(status).json({ success: false, message: status === 504 ? 'AI request timed out. Please try again.' : 'AI assistant is temporarily unavailable.' });
  }
}

module.exports = { chat, rateLimited };
