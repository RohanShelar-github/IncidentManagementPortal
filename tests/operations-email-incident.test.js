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

test('No Historian Read alert prefill uses the plant and server details supplied in the alert subject', () => {
  const { isNoHistorianReadAlert, parseNoHistorianReadAlert } = require('../backend/controllers/mailboxController');
  const message = {
    category: 'other',
    subject: 'Azure: FTD No Historian Read [PlantName-APPSVR] [NGCXPILAVM1]',
    body: 'Azure monitor alert rule FTD No Historian Read was triggered.'
  };
  assert.equal(isNoHistorianReadAlert(message), true);
  const prefill = parseNoHistorianReadAlert(message);
  assert.match(prefill.description, /Plant Name: PlantName\[PlantName-APPSVR\]/);
  assert.match(prefill.description, /Alert Details: \[NGCXPILAVM1\]/);
  assert.match(prefill.description, /Data is not flowing into FactoryEye for PlantName/);
  assert.doesNotMatch(prefill.description, /Screenshot will be attached by user at the time incident creation/);
  assert.match(prefill.description, /Steps Taken:/);
});

test('No Historian Read prefill extracts the Azure severity-position plant token', () => {
  const { isNoHistorianReadAlert, parseNoHistorianReadAlert } = require('../backend/controllers/mailboxController');
  const message = {
    category: 'other',
    subject: 'Azure: Activated Severity: 0 MED No Historian Read',
    body: 'FTD No Historian Read was triggered for ngconpremappinsights at August 28, 2026.'
  };
  assert.equal(isNoHistorianReadAlert(message), true);
  const prefill = parseNoHistorianReadAlert(message);
  assert.match(prefill.description, /Plant Name: MED\[MED-APPSVR\]/);
  assert.match(prefill.description, /FactoryEye for MED/);
  assert.match(prefill.description, /Alert Details: \[NGCXPILAVM1\]/);
  assert.match(prefill.description, /Duration: \[insert the time here\] minutes plant MED is down/);
});

test('No Historian Read prefill extracts the plant from a forwarded deactivated Azure alert', () => {
  const { parseNoHistorianReadAlert } = require('../backend/controllers/mailboxController');
  const prefill = parseNoHistorianReadAlert({
    subject: 'Fw: Azure: Deactivated Severity: 0 SHO No Historian Read',
    body: ''
  });
  assert.match(prefill.description, /Plant Name: SHO\[SHO-APPSVR\]/);
  assert.match(prefill.description, /plant SHO is down/);
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
  assert.match(mailService, /new Set\(inbox\.map\(\(message\) => message\.conversationId\)/);
  assert.match(mailService, /mailboxSource: 'sent'/);
  assert.match(mailService, /function enrichInboxConversations\(inbox\)/);
  assert.match(mailService, /listConversationMessages\(conversationId\)/);
  assert.match(mailService, /conversationId eq/);
  assert.match(mailService, /A bounded Inbox page can contain only the newest reply/);
});
