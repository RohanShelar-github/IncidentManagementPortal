'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const emailService = fs.readFileSync(path.join(root, 'backend', 'services', 'emailService.js'), 'utf8');
const mailboxController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'mailboxController.js'), 'utf8');
const aiController = fs.readFileSync(path.join(root, 'backend', 'controllers', 'aiController.js'), 'utf8');

test('Microsoft Graph continuation cursor is requested as-is, not rebuilt through the mailbox path composer', () => {
  assert.match(emailService, /async function graphInboxRequestByUrl\(url, extraHeaders = \{\}\)/);
  assert.match(emailService, /data = await graphInboxRequestByUrl\(cursor, extraHeaders\);/);
});

test('listMailboxFolderMessages accepts a cursor and returns the next continuation link', () => {
  assert.match(emailService, /async function listMailboxFolderMessages\(folder, limit = 50, category = 'all', cursor = null\)/);
  assert.match(emailService, /return \{ messages, nextLink: data\['@odata\.nextLink'\] \|\| null \};/);
});

test('listInboxMessages and listSentMessages thread the cursor through and still enrich conversations', () => {
  assert.match(emailService, /async function listInboxMessages\(limit = 50, category = 'all', cursor = null\)/);
  assert.match(emailService, /const \{ messages: inbox, nextLink \} = await listMailboxFolderMessages\('inbox', limit, category, cursor\);/);
  assert.match(emailService, /const messages = await enrichInboxConversations\(inbox\);/);
  assert.match(emailService, /async function listSentMessages\(limit = 50, cursor = null\)/);
});

test('the AI copilot and the notification poller unwrap the new {messages, nextLink} shape without pagination', () => {
  assert.match(aiController, /listInboxMessages\(50, 'all'\)/);
  assert.match(aiController, /const \{ messages \} = await listInboxMessages/);
  assert.match(mailboxController, /const \{ messages \} = await listInboxMessages\(50\);/);
});

test('the inbox and sent mailbox routes accept a cursor and return nextCursor to the client', () => {
  assert.match(mailboxController, /const cursor = typeof req\.query\.cursor === 'string' && req\.query\.cursor \? req\.query\.cursor : null;/);
  assert.match(mailboxController, /const \{ messages, nextLink \} = await listInboxMessages\(req\.query\.limit, req\.query\.category, cursor\);/);
  assert.match(mailboxController, /data: await attachMailboxIncidentLinks\(messages\), nextCursor: nextLink/);
  assert.match(mailboxController, /const \{ messages, nextLink \} = await listSentMessages\(req\.query\.limit, cursor\);/);
});

test('the mailbox UI has a Load More control and frontend state to drive it', () => {
  assert.match(html, /id="mailboxLoadMoreWrap"/);
  assert.match(html, /id="mailboxLoadMoreBtn"[^>]*onclick="loadMoreMailbox\(\)"/);
  assert.match(frontend, /var mailboxNextCursor = null;/);
  assert.match(frontend, /var mailboxHistoryExpanded = false;/);
  assert.match(frontend, /function loadMoreMailbox\(\) \{/);
  assert.match(frontend, /function mailboxViewSupportsLoadMore\(\) \{/);
  assert.match(frontend, /return mailboxReadFilter !== 'incident_sent';/);
});

test('Load More appends older messages instead of replacing the current list', () => {
  assert.match(frontend, /var isLoadMore = Boolean\(options\.loadMore\) && mailboxNextCursor && mailboxViewSupportsLoadMore\(\);/);
  assert.match(frontend, /var existingIds = new Set\(mailboxMessages\.map\(function \(message\) \{ return message\.id; \}\)\);/);
  assert.match(frontend, /incoming\.forEach\(function \(message\) \{ if \(!existingIds\.has\(message\.id\)\) mailboxMessages\.push\(message\); \}\);/);
});

test('background polling pauses once the user has expanded history with Load More', () => {
  assert.match(frontend, /page\.classList\.contains\('active'\) && !mailboxHistoryExpanded\)/);
  assert.match(frontend, /mailboxHistoryExpanded = true;\s*loadMailbox\(\{ loadMore: true \}\);/);
});
