'use strict';

// Double-clicking an email in the Operations mailbox list pops it out into
// its own, larger same-origin browser window (like Outlook's "open in new
// window"), so there's more room to read the body and, if replying, more
// room to write. The popout is just the same SPA loaded again with
// ?popoutMail=<id>&popoutFolder=<inbox|sent> in the URL — window.open() from
// a script copies sessionStorage to a same-origin window per the HTML spec,
// so the popout's normal login/session bootstrap authenticates it for free;
// it only needs to decide what to show once that bootstrap reaches "home".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('popOutMailboxMessage opens the same app in a new same-origin window, keyed by folder and message id, reusing one window per message', () => {
  assert.match(frontend, /function popOutMailboxMessage\(message\) \{/);
  assert.match(frontend, /var folder = mailboxMessageFolder\(message\);/);
  assert.match(frontend, /var url = window\.location\.pathname \+ '\?popoutMail=' \+ encodeURIComponent\(message\.id\) \+ '&popoutFolder=' \+ folder;/);
  assert.match(frontend, /window\.open\(url, 'mailpopout_' \+ message\.id, 'width=1040,height=860,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'\);/);
});

test('openMailPopoutIfReady reads popoutMail/popoutFolder from the URL, flags the body as popout mode, and opens straight to that message in the mailbox page', () => {
  assert.match(frontend, /function openMailPopoutIfReady\(\) \{/);
  const start = frontend.indexOf('function openMailPopoutIfReady');
  const end = frontend.indexOf('\n}', start);
  const body = frontend.slice(start, end);
  assert.match(body, /id = params\.get\('popoutMail'\) \|\| '';/);
  assert.match(body, /folder = params\.get\('popoutFolder'\) \|\| '';/);
  assert.match(body, /if \(!id\) return false;/);
  assert.match(body, /document\.body\.classList\.add\('mail-popout-mode'\);/);
  assert.match(body, /mailboxActiveView = folder === 'sent' \? 'sent' : 'all';/);
  assert.match(body, /navigateInternal\('mailbox', document\.getElementById\('mailboxNav'\)\);/);
  assert.match(body, /setTimeout\(function \(\) \{ openMailboxMessage\(id\); \}, 0\);/);
  assert.match(body, /return true;/);
});

test('openMailPopoutIfReady is checked right alongside openLinkedIncidentIfReady in the post-login bootstrap, so a popout URL wins over the normal "go home" default', () => {
  assert.match(frontend, /if \(!openLinkedIncidentIfReady\(\) && !openMailPopoutIfReady\(\)\) \{/);
});

test('the mailbox list wires dblclick (not just click) on both a top-level row and an expanded conversation thread message to pop that email out, leaving the existing single-click select-in-pane behavior untouched', () => {
  assert.match(frontend, /row\.onclick = function \(\) \{ openMailboxMessage\(latest\.id\); \}; row\.ondblclick = function \(event\) \{ event\.preventDefault\(\); popOutMailboxMessage\(latest\); \};/);
  assert.match(frontend, /child\.onclick = function \(\) \{ openMailboxMessage\(message\.id\); \}; child\.ondblclick = function \(event\) \{ event\.preventDefault\(\); popOutMailboxMessage\(message\); \};/);
});

test('in popout mode, opening a message sets the window title to its subject so the popout is identifiable from the taskbar/alt-tab', () => {
  assert.match(frontend, /if \(document\.body\.classList\.contains\('mail-popout-mode'\)\) document\.title = message\.subject \|\| 'Email';/);
});

test('in popout mode, successfully sending a reply/forward auto-closes the window shortly after, instead of leaving an empty popped-out reading pane open', () => {
  assert.match(frontend, /if \(document\.body\.classList\.contains\('mail-popout-mode'\)\) setTimeout\(function \(\) \{ window\.close\(\); \}, 1200\);/);
});

test('a dedicated CSS rule set hides the sidebar/topbar/operations nav/message list and maximizes the reading pane to fill the popout window, mirroring the existing @media print chrome-hiding approach', () => {
  assert.match(css, /body\.mail-popout-mode \.sidebar,\s*\n\s*body\.mail-popout-mode \.sidebar-overlay,\s*\n\s*body\.mail-popout-mode \.topbar,\s*\n\s*body\.mail-popout-mode \.status-bar,\s*\n\s*body\.mail-popout-mode #operationsNav,\s*\n\s*body\.mail-popout-mode \.mailbox-list-card,\s*\n\s*body\.mail-popout-mode \.page-header \{ display: none !important; \}/);
  assert.match(css, /body\.mail-popout-mode \.mailbox-layout \{ grid-template-columns: 1fr !important;/);
  assert.match(css, /body\.mail-popout-mode \.mailbox-message-card \{ border-radius: 0 !important;/);
});
