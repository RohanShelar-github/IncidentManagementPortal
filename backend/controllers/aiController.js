'use strict';

const pool = require('../config/database');
const { answerIncidentQuestion, configured } = require('../services/aiService');

const requestWindows = new Map();

function rateLimited(userId) {
  const now = Date.now();
  const recent = (requestWindows.get(userId) || []).filter((time) => now - time < 60000);
  if (recent.length >= 10) return true;
  recent.push(now);
  requestWindows.set(userId, recent);
  return false;
}

async function chat(req, res) {
  try {
    if (!configured()) return res.status(503).json({ success: false, message: 'AI assistant is not configured. Add OPENAI_API_KEY on the backend.' });
    if (rateLimited(req.user.id)) return res.status(429).json({ success: false, message: 'Too many AI requests. Please wait a minute and try again.' });
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 2000) return res.status(400).json({ success: false, message: 'Enter a question up to 2,000 characters.' });
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const [rows] = await pool.query(`
      SELECT incident_ref AS id, title, severity, status, customer, project, area,
             case_owner AS engineer, description, rca, resolution, resolved_by,
             downtime_str AS downtime, mttd_str AS mttd, mttr_str AS mttr,
             date_time_opened AS opened_at, date_time_closed AS closed_at
        FROM incidents
       ORDER BY COALESCE(date_time_opened, created_at) DESC
       LIMIT 60`);
    const result = await answerIncidentQuestion({ message, history, incidents: rows, user: req.user });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('AI chat error:', error.message);
    const status = error.name === 'TimeoutError' ? 504 : (error.status === 401 ? 502 : 500);
    return res.status(status).json({ success: false, message: status === 504 ? 'AI request timed out. Please try again.' : 'AI assistant is temporarily unavailable.' });
  }
}

module.exports = { chat, rateLimited };
