'use strict';

const pool = require('../config/database');
const { hasRolePermission } = require('../middleware/permissions');

const REVIEW_MINUTES = 10;
const ACTIVE_STATUSES = new Set(['reviewing', 'ready', 'resolved']);

function toUtcSql(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function asIsoUtc(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  // MySQL DATETIME values in this table are deliberately UTC wall-clock
  // values, so append Z before exposing them to the browser.
  return text.includes('T') || /Z$|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(' ', 'T') + 'Z';
}

function reviewStatus(row, now = Date.now()) {
  if (row.status !== 'reviewing') return row.status;
  const deadline = new Date(asIsoUtc(row.review_deadline_at)).getTime();
  return Number.isFinite(deadline) && deadline <= now ? 'ready' : 'reviewing';
}

function draftDto(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) { payload = {}; }
  return {
    id: Number(row.id),
    draft_ref: row.draft_ref,
    source_message_id: row.source_message_id,
    is_manual: String(row.source_message_id || '').startsWith('manual:'),
    operations_email_audit_id: row.operations_email_audit_id ? Number(row.operations_email_audit_id) : null,
    source_received_at: asIsoUtc(row.source_received_at),
    review_deadline_at: asIsoUtc(row.review_deadline_at),
    status: reviewStatus(row),
    title: payload.title || '',
    customer: payload.customer || '',
    severity: payload.severity || '',
    payload,
    finalized_incident_ref: row.finalized_incident_ref || null,
    created_at: asIsoUtc(row.created_at),
    updated_at: asIsoUtc(row.updated_at)
  };
}

async function refreshReadyDrafts() {
  await pool.query("UPDATE incident_drafts SET status = 'ready' WHERE status = 'reviewing' AND review_deadline_at <= UTC_TIMESTAMP()");
}

async function listIncidentDrafts(req, res) {
  try {
    await refreshReadyDrafts();
    const [rows] = await pool.query(
      `SELECT d.*, i.incident_ref AS finalized_incident_ref
         FROM incident_drafts d
         LEFT JOIN incidents i ON i.id = d.finalized_incident_id
        WHERE d.deleted_at IS NULL AND d.status <> 'finalized'
        ORDER BY FIELD(d.status, 'reviewing', 'ready', 'resolved', 'finalized'), d.review_deadline_at ASC, d.updated_at DESC`,
      []
    );
    res.json({ success: true, data: rows.map(draftDto) });
  } catch (error) {
    console.error('List incident drafts error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load draft incidents.' });
  }
}

async function getOwnedDraft(id, userId, allowAdmin) {
  const [rows] = await pool.query(
    `SELECT d.*, i.incident_ref AS finalized_incident_ref
       FROM incident_drafts d LEFT JOIN incidents i ON i.id = d.finalized_incident_id
      WHERE d.id = ? AND d.deleted_at IS NULL ${allowAdmin ? '' : 'AND d.created_by = ?'} LIMIT 1`,
    allowAdmin ? [id] : [id, userId]
  );
  return rows[0] || null;
}

async function getIncidentDraft(req, res) {
  try {
    await refreshReadyDrafts();
    const row = await getOwnedDraft(req.params.id, req.user.id, true);
    if (!row) return res.status(404).json({ success: false, message: 'Draft incident not found.' });
    res.json({ success: true, data: draftDto(row) });
  } catch (error) {
    console.error('Get incident draft error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load draft incident.' });
  }
}

async function createIncidentDraft(req, res) {
  try {
    const body = req.body || {};
    if (!body.title || !body.customer || !body.severity || !body.engineer) return res.status(400).json({ success: false, message: 'Complete all required incident fields before saving a draft.' });
    const manualDraft = Boolean(body.manual_draft);
    let sourceMessageId = String(body.source_message_id || '').trim();
    let sourceReceivedAt = toUtcSql(body.source_received_at);
    if (manualDraft) {
      sourceMessageId = `manual:${req.user.id}:${Date.now()}`;
      sourceReceivedAt = toUtcSql(new Date().toISOString());
    }
    if (!sourceMessageId || !sourceReceivedAt) return res.status(400).json({ success: false, message: 'Draft incidents created from Operations email require the email received time.' });

    await refreshReadyDrafts();
    const [existing] = await pool.query(
      `SELECT d.*, i.incident_ref AS finalized_incident_ref
         FROM incident_drafts d LEFT JOIN incidents i ON i.id = d.finalized_incident_id
        WHERE d.source_message_id = ? AND d.created_by = ? AND d.deleted_at IS NULL
          AND d.status IN ('reviewing', 'ready', 'resolved')
        ORDER BY d.updated_at DESC LIMIT 1`,
      [sourceMessageId, req.user.id]
    );
    if (existing.length) return res.status(200).json({ success: true, message: 'A draft already exists for this email.', data: draftDto(existing[0]) });

    const safePayload = { ...body };
    delete safePayload.notification_email;
    delete safePayload.source_received_at;
    delete safePayload.source_message_id;
    delete safePayload.draft_id;
    delete safePayload.manual_draft;
    const received = new Date(sourceReceivedAt.replace(' ', 'T') + 'Z');
    const deadline = new Date(received.getTime() + REVIEW_MINUTES * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const [insert] = await pool.query(
      `INSERT INTO incident_drafts (draft_ref, source_message_id, operations_email_audit_id, source_received_at, review_deadline_at, status, payload_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['DRF-' + Date.now().toString(36).toUpperCase(), sourceMessageId, Number(body.operations_email_audit_id) || null, sourceReceivedAt, deadline, manualDraft ? 'ready' : 'reviewing', JSON.stringify(safePayload), req.user.id]
    );
    const row = await getOwnedDraft(insert.insertId, req.user.id, false);
    res.status(201).json({ success: true, message: manualDraft ? 'Manual draft saved and ready to create.' : 'Draft saved. Review starts from the email received time.', data: draftDto(row) });
  } catch (error) {
    console.error('Create incident draft error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to save draft incident.' });
  }
}

async function setIncidentDraftResolved(req, res) {
  try {
    const row = await getOwnedDraft(req.params.id, req.user.id, true);
    if (!row) return res.status(404).json({ success: false, message: 'Draft incident not found.' });
    if (row.status === 'finalized') return res.status(409).json({ success: false, message: 'This draft has already been created as an incident.' });
    await pool.query("UPDATE incident_drafts SET status = 'resolved', resolved_at = UTC_TIMESTAMP(), resolved_by = ? WHERE id = ?", [req.user.id, row.id]);
    const updated = await getOwnedDraft(row.id, req.user.id, true);
    res.json({ success: true, message: 'Draft marked resolved. Delete it if no incident is required.', data: draftDto(updated) });
  } catch (error) {
    console.error('Resolve incident draft error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update draft incident.' });
  }
}

async function deleteIncidentDraft(req, res) {
  try {
    const row = await getOwnedDraft(req.params.id, req.user.id, String(req.user?.role || '').toLowerCase() === 'admin');
    if (!row) return res.status(404).json({ success: false, message: 'Draft incident not found.' });
    if (row.status === 'finalized') return res.status(409).json({ success: false, message: 'Created incidents cannot be deleted from Draft Review.' });
    await pool.query('UPDATE incident_drafts SET deleted_at = UTC_TIMESTAMP(), deleted_by = ? WHERE id = ?', [req.user.id, row.id]);
    res.json({ success: true, message: 'Draft deleted. No incident or notification email was created.' });
  } catch (error) {
    console.error('Delete incident draft error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to delete draft incident.' });
  }
}

async function getReadyDraftForFinalization(id, user) {
  await refreshReadyDrafts();
  const canCreateIncidents = await hasRolePermission(user?.role, 'create_incidents');
  const row = await getOwnedDraft(id, user.id, canCreateIncidents);
  if (!row) return { error: 'Draft incident not found.', status: 404 };
  if (row.status !== 'ready') return { error: row.status === 'resolved' ? 'This alert was marked resolved; delete the draft instead.' : 'This draft is still in its 10-minute review period.', status: 409 };
  return { row };
}

async function finalizeIncidentDraft(id, incidentId) {
  await pool.query("UPDATE incident_drafts SET status = 'finalized', finalized_incident_id = ? WHERE id = ? AND status = 'ready'", [incidentId, id]);
}

module.exports = { createIncidentDraft, deleteIncidentDraft, finalizeIncidentDraft, getIncidentDraft, getReadyDraftForFinalization, listIncidentDrafts, setIncidentDraftResolved };
