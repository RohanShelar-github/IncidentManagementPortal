'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { applyMailboxIncidentLinks } = require('../backend/controllers/mailboxController');

test('mailbox incident links mark only the matching Graph message and preserve other messages', () => {
  const messages = [
    { id: 'graph-message-1', subject: 'Linked alert' },
    { id: 'graph-message-2', subject: 'Unrelated alert' }
  ];
  const linked = applyMailboxIncidentLinks(messages, [{ graph_message_id: 'graph-message-1', incident_ref: 'INC-999' }]);
  assert.deepEqual(linked[0], { id: 'graph-message-1', subject: 'Linked alert', incidentCreated: true, incidentRef: 'INC-999' });
  assert.deepEqual(linked[1], messages[1]);
});

test('mailbox link is persisted after incident creation and exposed in the mailbox DTO', () => {
  const mailboxController = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const incidentController = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');
  const frontend = fs.readFileSync('js/app.js', 'utf8');
  assert.match(mailboxController, /operations_email_incident_audit a/);
  assert.match(mailboxController, /a\.status = 'created'/);
  assert.match(mailboxController, /attachMailboxIncidentLinks\(messages\)/);
  assert.match(incidentController, /UPDATE operations_email_incident_audit SET incident_id = \?, status = \?, created_at = CURRENT_TIMESTAMP/);
  assert.match(incidentController, /operations_email_link: operationsEmailLink/);
  assert.match(frontend, /function mailboxIncidentCreatedBadge/);
  assert.match(frontend, /Incident Created · /);
  assert.match(frontend, /function mailboxIncidentCreatedAction/);
  assert.match(frontend, /Incident Created from this email/);
  assert.match(frontend, /latest\.incidentCreated \? mailboxIncidentCreatedAction/);
  assert.match(frontend, /operations_email_link_error/);
});
