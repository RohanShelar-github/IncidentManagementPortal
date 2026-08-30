const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer name matching treats hyphens and spaces as equivalent before Jira-code fallback', () => {
  const { matchingCustomersByName } = require('../backend/controllers/mailboxController');
  const customers = [
    { id: 1, customer_name: 'Ramat-Gan Municipality', jira_project_code: 'RGM' },
    { id: 2, customer_name: 'TileBar', jira_project_code: 'TIL' }
  ];
  const matches = matchingCustomersByName(customers, 'Coralogix Alert on magic / Ramat Gan Municipality - Pod Memory Utilization Exceeded 6 GB');
  assert.deepEqual(matches.map((customer) => customer.customer_name), ['Ramat-Gan Municipality']);
});

test('Operations emails provide a protected create-incident prefill endpoint with Azure NATGYP handling', () => {
  const routes = read('backend/routes/mailboxRoutes.js');
  const controller = read('backend/controllers/mailboxController.js');
  assert.match(routes, /post\('\/inbox\/:id\/incident-prefill', prepareMailboxIncident\)/);
  assert.match(controller, /hasRolePermission\(req, 'create_incidents'\)/);
  assert.match(controller, /message\.category === 'azure'/);
  assert.match(controller, /parseCustomerRaisedTicket/);
  assert.match(controller, /description\\s\*\[-:\]/);
  assert.match(controller, /NATGYP/);
  assert.match(controller, /jira_project_code/);
  assert.match(controller, /matchingCustomersByName/);
  assert.match(controller, /shared project key/);
  assert.match(controller, /operations_email_incident_audit/);
});

test('Operations email creation keeps the normal incident form editable and links the completed incident to its audit record', () => {
  const ui = read('js/app.js');
  const incidentController = read('backend/controllers/incidentController.js');
  assert.match(ui, /Create Incident/);
  assert.match(ui, /openCreateIncidentFromOperationsEmail/);
  assert.doesNotMatch(ui, /f_jira_project_code/);
  assert.match(ui, /operations_email_audit_id: pendingOperationsEmailAuditId/);
  assert.match(incidentController, /operations_email_incident_audit/);
  assert.match(incidentController, /operations_email_incident_created/);
});

test('Operations mailbox groups messages by Graph conversation identifier', () => {
  const ui = read('js/app.js');
  const mailService = read('backend/services/emailService.js');
  assert.match(ui, /function mailboxConversations\(\)/);
  assert.match(ui, /message\.conversationId \|\| \('message:'/);
  assert.match(ui, /expandedMailboxConversationIds/);
  assert.match(mailService, /conversationIds = new Set/);
  assert.match(mailService, /mailboxSource: 'sent'/);
});
