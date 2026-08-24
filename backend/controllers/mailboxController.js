'use strict';

const pool = require('../config/database');
const { deleteInboxMessage, getInboxAttachment, getInboxMessage, listInboxMessages, replyToInboxMessage } = require('../services/emailService');
const { notifyMailboxUsers } = require('../services/notificationService');

let knownMailboxMessageIds = null;
let mailboxPollTimer = null;
let mailboxPollInFlight = false;

async function requireMailboxPermission(req, res, permission) {
  const [rows] = await pool.query(`SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id = r.id WHERE r.role_key = ? AND rp.permission_key = ? LIMIT 1`, [req.user?.role, permission]);
  if (rows.length) return true;
  res.status(403).json({ success: false, message: permission === 'send_mailbox' ? 'Your role cannot send mailbox replies.' : 'Your role cannot access the mailbox.' });
  return false;
}

async function listMailbox(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const messages = await listInboxMessages(req.query.limit);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Mailbox list error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the Microsoft 365 mailbox.' });
  }
}

async function getMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try { res.json({ success: true, data: await getInboxMessage(req.params.id) }); }
  catch (error) {
    console.error('Mailbox message error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to load the mailbox message.' });
  }
}

async function replyToMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'send_mailbox')) return;
  try { res.json({ success: true, data: await replyToInboxMessage(req.params.id, req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to send reply.' }); }
}

async function downloadMailboxAttachment(req, res) {
  if (!await requireMailboxPermission(req, res, 'view_mailbox')) return;
  try {
    const attachment = await getInboxAttachment(req.params.id, req.params.attachmentId);
    res.set({ 'Content-Type': attachment.contentType, 'Content-Length': String(attachment.data.length), 'Content-Disposition': `attachment; filename="${attachment.name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' });
    res.send(attachment.data);
  } catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to download attachment.' }); }
}

async function deleteMailboxMessage(req, res) {
  if (!await requireMailboxPermission(req, res, 'delete_mailbox')) return;
  try { res.json({ success: true, data: await deleteInboxMessage(req.params.id) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to delete email.' }); }
}

async function pollMailboxForNotifications() {
  if (mailboxPollInFlight || String(process.env.MAIL_PROVIDER || '').toLowerCase() !== 'graph') return;
  mailboxPollInFlight = true;
  try {
    const messages = await listInboxMessages(50);
    const currentIds = new Set(messages.map((message) => message.id));
    if (knownMailboxMessageIds) {
      const newMessages = messages.filter((message) => !knownMailboxMessageIds.has(message.id));
      for (const message of newMessages) {
        await notifyMailboxUsers({ fromName: message.fromName || message.from, subject: message.subject });
        // Conversation ID is Graph's authoritative thread key.  Messages which
        // do not belong to a critical-incident conversation remain mailbox-only.
        if (message.conversationId) {
          const [threads] = await pool.query('SELECT id, incident_id FROM incident_email_threads WHERE conversation_id = ? LIMIT 1', [message.conversationId]);
          if (threads.length) {
            await pool.query('INSERT IGNORE INTO incident_email_messages (thread_id, incident_id, direction, action_type, graph_message_id, internet_message_id, subject, sender, body_preview, status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [threads[0].id, threads[0].incident_id, 'inbound', 'reply_received', message.id, message.internetMessageId || null, message.subject, message.from, message.preview, 'received', message.receivedAt || new Date()]);
            await pool.query('INSERT INTO activity_logs (incident_id, action_type, detail) VALUES (?, ?, ?)', [threads[0].incident_id, 'critical_email_received', `Email reply received: ${message.subject}`]);
          }
        }
      }
    }
    knownMailboxMessageIds = currentIds;
  } catch (error) {
    console.error('Mailbox notification poll error:', error.message);
  } finally { mailboxPollInFlight = false; }
}

function startMailboxNotificationPolling() {
  if (mailboxPollTimer) return;
  pollMailboxForNotifications();
  mailboxPollTimer = setInterval(pollMailboxForNotifications, 60000);
}

module.exports = { deleteMailboxMessage, downloadMailboxAttachment, getMailboxMessage, listMailbox, replyToMailboxMessage, startMailboxNotificationPolling };
