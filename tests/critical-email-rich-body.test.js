const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inlineDataImagesForEmail, safeIncidentEmailHtml, sanitizeSignatureLayoutHtml } = require('../backend/services/emailService');

test('critical email rich bodies preserve safe formatting instead of rendering tags as text', () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'controllers', 'incidentController.js'), 'utf8');
  assert.match(controller, /function criticalEmailBodyHtml\(body\)/);
  assert.match(controller, /return safeIncidentEmailHtml\(content\)/);
  assert.doesNotMatch(controller, /const intro = paragraphs\(/);
  const rich = safeIncidentEmailHtml('Dear Team,<br><br><strong>Investigating</strong>');
  assert.equal(rich, 'Dear Team,<br><br><strong>Investigating</strong>');
});

test('saved signature layout preserves safe table cells and intended logo width', () => {
  const signature = safeIncidentEmailHtml('<table><tr><td><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" width="78"></td><td><strong>Support Engineer</strong></td></tr></table>', { preserveSignatureLayout: true });
  assert.match(signature, /<table>/);
  assert.match(signature, /<td>/);
  assert.match(signature, /width="78"/);
});

test('saved signature removes Outlook viewer controls and blank paragraph gaps', () => {
  const compact = sanitizeSignatureLayoutHtml('<p>Best Regards,</p><p><span><br></span></p><button title="Show original size">↗</button><table><tr><td>Logo</td><td>Name</td></tr></table>');
  assert.doesNotMatch(compact, /Show original size|↗/);
  assert.doesNotMatch(compact, /<br>/);
  assert.match(compact, /<p style="margin:0 0 8px">Best Regards,<\/p>/);
});

test('pasted data images become Graph inline CID attachments', () => {
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  const result = inlineDataImagesForEmail(`<p>Screenshot</p><img src="data:image/png;base64,${data}" alt="Alert screenshot">`);
  assert.match(result.html, /src="cid:incident-inline-1"/);
  assert.equal(result.attachments.length, 1);
  assert.deepEqual(result.attachments[0], {
    name: 'incident-image-1.png', contentType: 'image/png', contentBytes: data, isInline: true, contentId: 'incident-inline-1'
  });
});

test('wrapped Base64 signature images become Graph inline CID attachments', () => {
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  const result = inlineDataImagesForEmail(`<img src="data:image/png;base64,${data.slice(0, 12)}\n${data.slice(12)}">`);
  assert.match(result.html, /src="cid:incident-inline-1"/);
  assert.equal(result.attachments[0].contentBytes, data);
});

test('Graph critical-email attachments mark pasted images as inline', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'services', 'emailService.js'), 'utf8');
  assert.match(service, /inlineDataImagesForEmail\(html\)/);
  assert.match(service, /isInline: true, contentId: attachment\.contentId/);
});

test('standard incident emails move the user signature to the end and inline its images for Graph delivery', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'services', 'emailService.js'), 'utf8');
  assert.match(service, /data-aoc-user-signature/);
  assert.match(service, /body: String\(incident\.emailBody \|\| defaults\.body\)\.trim\(\)\.slice\(0, 500000\)/);
  assert.match(service, /defaults\.html\.replace\('<\/body>'/);
  assert.match(service, /const inline = inlineDataImagesForEmail\(html\)/);
  assert.match(service, /isInline: true, contentId: attachment\.contentId/);
});

test('description image insertion preserves the selected caret position instead of appending', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(ui, /function saveIncidentDescriptionSelection/);
  assert.match(ui, /function restoreIncidentDescriptionSelection/);
  assert.match(ui, /range\.insertNode\(fragment\)/);
  assert.doesNotMatch(ui, /editor\.appendChild\(img\)/);
});

test('incident detail view renders a safe rich description instead of showing image markup as text', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(ui, /function safeIncidentDescriptionHtml/);
  assert.match(ui, /data:image/);
  assert.match(ui, /dpDescription\.innerHTML = safeIncidentDescriptionHtml\(inc\.desc/);
  assert.doesNotMatch(ui, /_s\('dp_desc', inc\.desc/);
});

test('incident detail view renders root cause and resolution rich content instead of literal markup', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(ui, /rcaView\.innerHTML = safeIncidentDescriptionHtml\(inc\.rca/);
  assert.match(ui, /resolutionView\.innerHTML = safeIncidentDescriptionHtml\(inc\.resolution/);
  assert.doesNotMatch(ui, /document\.getElementById\('dp_f_rca'\)\.textContent/);
});

test('incident reports safely render rich Summary, RCA, and Resolution content including inline images', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(ui, /function safeIncidentDescriptionHtml\(value\)/);
  assert.match(ui, /_richReport\('ir_desc', inc\.desc, 'No description provided\.'\)/);
  assert.match(ui, /_richReport\('ir_rca', inc\.rca,/);
  assert.match(ui, /_richReport\('ir_resolution', inc\.resolution,/);
});

test('close incident dialog uses rich RCA and Resolution editors rather than textareas', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'styles.css'), 'utf8');
  assert.match(html, /id="dtm_rca" data-rich-incident-editor="true" contenteditable="true"/);
  assert.match(html, /id="dtm_resolution" data-rich-incident-editor="true" contenteditable="true"/);
  assert.match(ui, /closeRca\.innerHTML = safeIncidentDescriptionHtml\(inc\.rca \|\| ''\)/);
  assert.match(ui, /closeResolution\.innerHTML = safeIncidentDescriptionHtml\(inc\.resolution \|\| ''\)/);
  assert.match(ui, /document\.getElementById\('dtm_rca'\)\?\.innerHTML/);
  assert.match(ui, /document\.getElementById\('dtm_resolution'\)\?\.innerHTML/);
  assert.match(css, /\.incident-description-toolbar button \{/);
  assert.match(css, /\.incident-description-toolbar button:hover/);
});

test('all user-facing incident timestamp formatters use a 12-hour clock', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(ui, /function formatUiDateTime\(value\)/);
  assert.match(ui, /hour12: true/);
  assert.match(ui, /return `\$\{dateParts\[2\]\}-\$\{dateParts\[1\]\}-\$\{dateParts\[0\]\} \$\{hour12\}:\$\{timeParts\[1\]\} \$\{meridiem\}`/);
  assert.match(ui, /function mailboxDate\(value\) \{ try \{ return formatUiDateTime\(value\);/);
});

test('native date and time picker icons remain visible in both portal themes', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'styles.css'), 'utf8');
  assert.match(css, /input\[type="datetime-local"\] \{ color-scheme: dark; \}/);
  assert.match(css, /::-webkit-calendar-picker-indicator \{ cursor: pointer; opacity: 1; filter: invert\(1\) brightness\(1\.8\); \}/);
  assert.match(css, /body\.light-mode input\[type="datetime-local"\] \{ color-scheme: light; \}/);
});

test('incident edit mode gives description, root cause, and resolution the full rich-text toolset', () => {
  const ui = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="dp_f_desc"[^>]*contenteditable="true"/);
  assert.match(html, /id="dp_f_rca" data-rich-incident-editor="true" contenteditable="true"/);
  assert.match(html, /id="dp_f_resolution" data-rich-incident-editor="true" contenteditable="true"/);
  assert.match(html, /activateIncidentDescriptionEditor\('dp_f_rca'\);chooseIncidentDescriptionImage\(\)/);
  assert.match(html, /activateIncidentDescriptionEditor\('dp_f_resolution'\);chooseIncidentDescriptionImage\(\)/);
  assert.match(ui, /editDescription\.innerHTML = safeIncidentDescriptionHtml\(inc\.desc/);
  assert.match(ui, /editRca\.innerHTML = safeIncidentDescriptionHtml\(inc\.rca/);
  assert.match(ui, /editResolution\.innerHTML = safeIncidentDescriptionHtml\(inc\.resolution/);
  assert.match(ui, /document\.getElementById\('dp_f_desc'\)\?\.innerHTML/);
  assert.match(ui, /document\.getElementById\('dp_f_rca'\)\?\.innerHTML/);
  assert.match(ui, /document\.getElementById\('dp_f_resolution'\)\?\.innerHTML/);
});
