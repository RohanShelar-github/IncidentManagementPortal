const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { classifyOperationsMessage, extractJiraIssueKey, isJiraCustomerTicketSubject } = require('../backend/services/operationsMailClassificationService');

test('Operations source classification uses structured sender addresses before Jira subject matching', () => {
  assert.equal(classifyOperationsMessage({ from: 'ALERTS@CORALOGIX.COM', subject: 'A new support issue OPS-7 was reported by the customer' }).category, 'coralogix');
  assert.equal(classifyOperationsMessage({ from: 'azure-noreply@microsoft.com', subject: 'A new support issue OPS-8 was reported by the customer' }).category, 'azure');
  assert.equal(classifyOperationsMessage({ from: 'notifications@example.com', subject: 'A new support issue CSO-1234 was reported by the customer' }).category, 'jira');
  assert.equal(classifyOperationsMessage({ from: 'notifications@example.com', subject: 'Coralogix mentioned in a normal email' }).category, 'other');
});

test('Jira customer ticket classification and issue extraction remain conservative', () => {
  assert.equal(isJiraCustomerTicketSubject('A new support issue CSO-1234 was reported by the customer'), true);
  assert.equal(isJiraCustomerTicketSubject('Re: A new support issue TOR-269 was reported by the customer'), true);
  assert.equal(isJiraCustomerTicketSubject('FW: Re: A new support issue TOR-269 was reported by the customer'), true);
  assert.equal(isJiraCustomerTicketSubject('A new support issue CSO-1234 was updated'), false);
  assert.equal(extractJiraIssueKey('A new support issue CSO-1234 was reported by the customer'), 'CSO-1234');
  assert.equal(extractJiraIssueKey('No key here'), '');
});

test('Operations endpoints reuse the protected mailbox routes for counts, Sent Items, read state, and new mail', () => {
  const routes = fs.readFileSync('backend/routes/mailboxRoutes.js', 'utf8');
  const controller = fs.readFileSync('backend/controllers/mailboxController.js', 'utf8');
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(routes, /router\.get\('\/sent', listSentMailbox\)/);
  assert.match(routes, /router\.get\('\/operations-counts', getMailboxOperationsCounts\)/);
  assert.match(routes, /router\.post\('\/send', sendNewMailbox\)/);
  assert.match(routes, /router\.patch\('\/inbox\/:id\/read', markMailboxMessageRead\)/);
  assert.match(routes, /router\.patch\('\/inbox\/:id\/read-state', setMailboxMessageReadState\)/);
  assert.match(controller, /requireMailboxPermission\(req, res, 'send_mailbox'\)/);
  assert.match(controller, /async function setMailboxMessageReadState/);
  assert.match(service, /async function sendNewMailboxMessage/);
  assert.match(service, /async function setInboxMessageReadState/);
  assert.match(service, /saveToSentItems/);
  assert.match(service, /contains\(subject,'was reported by the customer'\)/);
  assert.match(service, /selectedCategory === 'jira' && folder === 'inbox'/);
  assert.match(service, /query\.set\('\$filter', jiraFilter\)/);
  assert.match(service, /query\.delete\('\$orderby'\)/);
});

test('Sent Items supports the same reply, reply-all, forward, and attachment actions as Inbox', () => {
  const routes = fs.readFileSync('backend/routes/mailboxRoutes.js', 'utf8');
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  const ui = fs.readFileSync('js/app.js', 'utf8');
  const selectedMessageRenderer = ui.slice(ui.lastIndexOf('function openMailboxMessage(id)'));
  assert.match(routes, /router\.post\('\/sent\/:id\/reply', replyToMailboxMessage\)/);
  assert.match(routes, /router\.get\('\/sent\/:id\/attachments\/:attachmentId\/download', downloadMailboxAttachment\)/);
  assert.match(routes, /router\.get\('\/sent\/:id', getMailboxMessage\)/);
  assert.match(service, /cc: \(message\?\.ccRecipients \|\| \[\]\)/);
  assert.match(service, /if \(to\) updates\.toRecipients = graphRecipients\(to\);/);
  assert.match(ui, /function mailboxMessageFolder\(message\)/);
  assert.match(ui, /var sentItem = mailboxMessageFolder\(message\) === 'sent';/);
  assert.match(ui, /to\.value = sentItem \? \(message\.to \|\| ''\) : \(message\.from \|\| ''\)/);
  assert.match(ui, /Original To and CC recipients are included/);
  assert.match(ui, /mailboxMessagePath\(message, '\/reply'\)/);
  assert.match(selectedMessageRenderer, /mailboxMessagePath\(selectedMessage\)/);
  assert.match(selectedMessageRenderer, /if \(hasMailboxPermission\('send_mailbox'\)\) actions\.append/);
});

test('Operations mailbox provides an Outlook-style read filter with a persistent unread action', () => {
  const ui = fs.readFileSync('js/app.js', 'utf8');
  assert.match(ui, /function ensureMailboxReadFilterUi/);
  assert.match(ui, /mailboxReadFilter = 'all'/);
  assert.match(ui, /setMailboxReadFilter/);
  assert.match(ui, /\['all', 'All'\], \['unread', 'Unread'\], \['read', 'Read'\]/);
  assert.match(ui, /setMailboxMessageReadStateInUi/);
  assert.match(ui, /Mark as unread/);
});

test('Operations compose supports image formatting and sends pasted images as Graph inline attachments', () => {
  const ui = fs.readFileSync('js/app.js', 'utf8');
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(ui, /function addMailboxComposeImageTools/);
  assert.match(ui, /configureMailboxComposeImageEditor\(editor, 'mailboxReplyEditor'\)/);
  assert.match(ui, /configureMailboxComposeImageEditor\(editor, 'mailboxNewMailEditor'\)/);
  assert.match(ui, /Resize selected image to full width/);
  assert.match(service, /const inline = inlineDataImagesForEmail\(html\)/);
  assert.match(service, /contentDisposition: 'inline'/);
});
