'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI route is authenticated and mounted', () => {
  const route = read('backend/routes/aiRoutes.js');
  const server = read('backend/server.js');
  assert.match(route, /router\.use\(authenticateToken\)/);
  assert.match(route, /router\.post\('\/chat', chat\)/);
  assert.match(server, /app\.use\('\/api\/ai', aiRoutes\)/);
});

test('OpenAI request remains server-side and privacy constrained', () => {
  const service = read('backend/services/aiService.js');
  const browser = read('js/app.js');
  assert.match(service, /api\.openai\.com\/v1\/responses/);
  assert.match(service, /process\.env\.OPENAI_API_KEY/);
  assert.match(service, /safety_identifier/);
  assert.match(service, /store: false/);
  assert.match(service, /never claim to edit, close, delete, email/);
  assert.doesNotMatch(browser, /OPENAI_API_KEY/);
});

test('chat context is bounded and the UI calls the protected backend', () => {
  const controller = read('backend/controllers/aiController.js');
  const browser = read('js/app.js');
  assert.match(controller, /LIMIT 60/);
  assert.match(controller, /recent\.length >= 10/);
  assert.match(browser, /\/ai\/chat/);
  assert.match(browser, /Authorization': 'Bearer '/);
  assert.match(browser, /bubble\.textContent = content/);
});

test('chat controls are present and only displayed after login', () => {
  const html = read('index.html');
  const browser = read('js/app.js');
  assert.match(html, /id="aiChatLauncher"/);
  assert.match(html, /id="aiChatPanel"/);
  assert.match(browser, /aiLauncher\.style\.display = 'block'/);
  assert.match(browser, /aiLauncher\.style\.display = 'none'/);
});

test('chatbot launcher can be dragged safely and remembers its position', () => {
  const html = read('index.html');
  const browser = read('js/app.js');
  const css = read('css/styles.css');
  assert.match(html, /onpointerdown="startAiLauncherDrag\(event\)"/);
  assert.match(browser, /function moveAiLauncher\(event\)/);
  assert.match(browser, /clampAiLauncherPosition/);
  assert.match(browser, /aocAiLauncherPosition/);
  assert.match(browser, /suppressAiLauncherClick/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /cursor:grabbing/);
});

test('response text extraction supports Responses API output', () => {
  const { extractOutputText } = require('../backend/services/aiService');
  assert.equal(extractOutputText({ output_text: 'Direct answer' }), 'Direct answer');
  assert.equal(extractOutputText({ output: [{ content: [{ type: 'output_text', text: 'Nested answer' }] }] }), 'Nested answer');
});
