'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { cleanAddressList, configured, incidentEmail, xmlEscape } = require('../backend/services/emailService');

const controller = fs.readFileSync('backend/controllers/incidentController.js', 'utf8');
const frontend = fs.readFileSync('js/app.js', 'utf8');
const example = fs.readFileSync('backend/.env.example', 'utf8');

test('incident creation sends mail only after the database insert and preserves incident success on mail failure', () => {
  const start = controller.indexOf('const createIncident');
  const end = controller.indexOf('const getIncidents', start);
  const implementation = controller.slice(start, end);
  assert.ok(implementation.indexOf('INSERT INTO incidents') < implementation.indexOf('sendIncidentCreatedEmail'));
  assert.match(implementation, /catch \(mailError\)/);
  assert.match(implementation, /success: true[\s\S]*data: \{ id: incidentRef, email \}/);
});

test('mail is addressed through server-side environment configuration', () => {
  assert.match(example, /MAIL_FROM=/);
  assert.match(example, /MAIL_TO=/);
  assert.match(example, /MAIL_CC=/);
  assert.match(example, /EWS\.AccessAsUser\.All/);
  assert.doesNotMatch(frontend, /MAIL_CLIENT_SECRET|MAIL_OAUTH_REFRESH_TOKEN/);
});

test('generated incident email includes operational incident details and escapes XML', () => {
  const previousUrl = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = 'http://portal.example:5500';
  const email = incidentEmail({ id: 'INC-999', title: 'Test & verify', severity: 'High', customer: 'NGC', description: 'Details', mttd: '5m' });
  assert.match(email.subject, /INC-999/);
  assert.match(email.body, /Customer: NGC/);
  assert.match(email.body, /MTTD: 5m/);
  assert.match(email.body, /incident=INC-999/);
  assert.match(email.html, /Incident Created/);
  assert.match(email.html, /Open Incident INC-999/);
  assert.equal(xmlEscape('A&B<test>'), 'A&amp;B&lt;test&gt;');
  if (previousUrl === undefined) delete process.env.PORTAL_BASE_URL;
  else process.env.PORTAL_BASE_URL = previousUrl;
});

test('email link survives login and opens the referenced incident', () => {
  assert.match(example, /PORTAL_BASE_URL=/);
  assert.match(frontend, /URLSearchParams\(window\.location\.search\)\.get\('incident'\)/);
  assert.match(frontend, /openDetailPanel\(incidentId\)/);
  assert.match(controller, /mttd: mttd\.text \|\| 'Not recorded'/);
});

test('final subject includes the assigned incident ID', () => {
  const service = fs.readFileSync('backend/services/emailService.js', 'utf8');
  assert.match(service, /requestedSubject\.includes\(String\(incident\.id\)\)/);
  assert.match(service, /`\$\{incident\.id\} \| \$\{requestedSubject\}`/);
});

test('formatted email does not repeat the generated incident summary above the details table', () => {
  const email = incidentEmail({ id: 'INC-1000', title: 'No duplicate summary', severity: 'Normal' });
  assert.doesNotMatch(email.html, /A new incident has been created in the portal/);
  assert.match(email.html, /data-additional-message/);
  assert.match(email.html, /Incident ID/);
});

test('mail configuration never becomes active without OAuth token material', () => {
  const previous = { ...process.env };
  process.env.MAIL_ENABLED = 'true';
  process.env.MAIL_TENANT_ID = 'tenant'; process.env.MAIL_CLIENT_ID = 'client';
  process.env.MAIL_CLIENT_SECRET = 'secret'; process.env.MAIL_FROM = 'from@example.com';
  process.env.MAIL_TO = 'to@example.com';
  delete process.env.MAIL_OAUTH_REFRESH_TOKEN; delete process.env.MAIL_OAUTH_ACCESS_TOKEN;
  assert.equal(configured(), false);
  Object.keys(process.env).forEach((key) => { if (!(key in previous)) delete process.env[key]; });
  Object.assign(process.env, previous);
});

test('frontend reports whether post-creation email was sent, failed, or skipped', () => {
  assert.match(frontend, /data\.data\.email\.sent/);
  assert.match(frontend, /email failed/);
  assert.match(frontend, /email not sent/);
});

test('reviewed recipients are validated and forwarded to the mail service', () => {
  assert.equal(cleanAddressList('one@example.com, two@example.com'), 'one@example.com,two@example.com');
  assert.equal(cleanAddressList('', ''), '');
  assert.throws(() => cleanAddressList('invalid-address'), /invalid/);
  assert.match(controller, /emailTo: b\.notification_email\?\.to \|\| req\.user\.email/);
  assert.match(controller, /emailCc: b\.notification_email\?\.cc === undefined \? INCIDENT_NOTIFICATION_CC/);
  assert.match(controller, /emailSubject: b\.notification_email\?\.subject/);
});

test('incident mail recipients default to the authenticated creator and operations CC', () => {
  assert.match(controller, /const INCIDENT_NOTIFICATION_CC = 'its24x7@magicsoftware\.com'/);
  assert.match(controller, /emailTo: b\.notification_email\?\.to \|\| req\.user\.email/);
  assert.match(controller, /emailCc: b\.notification_email\?\.cc === undefined \? INCIDENT_NOTIFICATION_CC/);
});

test('closing an incident sends one closure email only on the transition to Closed', () => {
  assert.match(controller, /sendIncidentClosedEmail/);
  assert.match(controller, /transitionedToClosed = closed && normalizeStatus\(current\.status\) !== 'closed'/);
  assert.match(controller, /if \(transitionedToClosed\)/);
  assert.match(controller, /emailTo: current\.creator_email \|\| req\.user\.email/);
  assert.match(controller, /emailCc: INCIDENT_NOTIFICATION_CC/);
});

test('closed email contains resolution metrics and the incident link', () => {
  const previousUrl = process.env.PORTAL_BASE_URL;
  process.env.PORTAL_BASE_URL = 'http://portal.example:5500';
  const email = incidentEmail({ emailType: 'closed', id: 'INC-1001', title: 'Recovered', severity: 'High', downtime: '12m', mttr: '10m', mttd: '2m', resolution: 'Service restarted' });
  assert.match(email.subject, /\[Closed\] INC-1001/);
  assert.match(email.html, /Incident Closed/);
  assert.match(email.html, /Downtime/);
  assert.match(email.html, /12m/);
  assert.match(email.html, /Service restarted/);
  assert.match(email.html, /Open Incident INC-1001/);
  if (previousUrl === undefined) delete process.env.PORTAL_BASE_URL;
  else process.env.PORTAL_BASE_URL = previousUrl;
});
