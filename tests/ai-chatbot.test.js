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

test('local Ollama is a supported private copilot provider', () => {
  const service = read('backend/services/aiService.js');
  const exampleEnv = read('backend/.env.example');
  const { extractOllamaOutputText } = require('../backend/services/aiService');
  assert.match(service, /OLLAMA_BASE_URL/);
  assert.match(service, /\/api\/chat/);
  assert.match(service, /AI_PROVIDER/);
  assert.match(service, /never claim to edit, close, delete, email/);
  assert.match(exampleEnv, /AI_PROVIDER=ollama/);
  assert.equal(extractOllamaOutputText({ message: { content: 'Local answer' } }), 'Local answer');
});

test('Groq is a supported hosted Copilot provider with safe tool-call parsing', () => {
  const service = read('backend/services/aiService.js');
  const exampleEnv = read('backend/.env.example');
  const { extractGroqOutputText, extractGroqToolCalls } = require('../backend/services/aiService');
  assert.match(service, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(service, /GROQ_API_KEY/);
  assert.match(exampleEnv, /GROQ_MODEL=openai\/gpt-oss-20b/);
  assert.equal(extractGroqOutputText({ choices: [{ message: { content: 'Hosted answer' } }] }), 'Hosted answer');
  assert.deepEqual(extractGroqToolCalls({ choices: [{ message: { tool_calls: [{ id: 'call-1', function: { name: 'search_incidents', arguments: '{"status":"Closed"}' } }] } }] }), [{ id: 'call-1', function: { name: 'search_incidents', arguments: { status: 'Closed' } } }]);
});

test('Copilot uses restricted read-only query tools before loading incident context', () => {
  const service = read('backend/services/aiService.js');
  const controller = read('backend/controllers/aiController.js');
  assert.match(service, /name: 'search_incidents'/);
  assert.match(service, /name: 'get_incident_metrics'/);
  assert.match(service, /Always call exactly one provided tool/);
  assert.match(controller, /planIncidentQuestion\(\{ message, history \}\)/);
  assert.match(controller, /executeCopilotTool/);
  assert.match(controller, /SELECT i\.incident_ref AS id/);
  assert.doesNotMatch(controller, /INSERT INTO incidents|UPDATE incidents|DELETE FROM incidents/);
});

test('local AI context is compact, relevant, and includes the incident creator', () => {
  const service = read('backend/services/aiService.js');
  const controller = read('backend/controllers/aiController.js');
  const { compactIncidentContext } = require('../backend/services/aiService');
  const context = compactIncidentContext([
    { id: 'INC-1', customer: 'TileBar', status: 'Closed', created_by: 'Rohan Shelar', description: 'x'.repeat(500) },
    { id: 'INC-2', customer: 'NGC', status: 'New', created_by: 'Someone Else' }
  ], 'closed incidents for TileBar created by Rohan');
  assert.equal(context[0].id, 'INC-1');
  assert.equal(context[0].created_by, 'Rohan Shelar');
  assert.ok(context[0].description.length <= 280);
  assert.match(service, /MAX_CONTEXT_RECORDS = 12/);
  assert.match(controller, /creator\.full_name AS created_by/);
});

test('explicit copilot filters are applied before local AI summarization', () => {
  const { selectIncidentContext } = require('../backend/services/aiService');
  const rows = [
    { id: 'INC-1', status: 'closed', customer: 'TileBar', created_by: 'Rohan Shelar', engineer: 'Babai Chatterjee' },
    { id: 'INC-2', status: 'closed', customer: 'TileBar', created_by: 'Babai Chatterjee', engineer: 'Rohan Shelar' }
  ];
  const created = selectIncidentContext(rows, 'closed incidents created by Rohan Shelar for customer TileBar');
  assert.deepEqual(created.rows.map((row) => row.id), ['INC-1']);
  const assigned = selectIncidentContext(rows, 'closed incidents assigned to Rohan Shelar for customer TileBar');
  assert.deepEqual(assigned.rows.map((row) => row.id), ['INC-2']);
});

test('direct filtered incident-list requests bypass local AI latency', () => {
  const { selectIncidentContext, formatIncidentList, isStructuredIncidentRequest } = require('../backend/services/aiService');
  const context = selectIncidentContext([
    { id: 'INC-1', title: 'Database outage', status: 'closed', severity: 'critical', customer: 'NGC' },
    { id: 'INC-2', title: 'API delay', status: 'closed', severity: 'high', customer: 'SMC' }
  ], 'give me all closed incidents of critical severity');
  assert.deepEqual(context.rows.map((row) => row.id), ['INC-1']);
  assert.equal(isStructuredIncidentRequest('give me all closed incidents of critical severity', context.filters), true);
  assert.match(formatIncidentList(context.rows, context.filters), /INC-1/);
});

test('this-month incident reports use a direct date filter', () => {
  const { selectIncidentContext, isStructuredIncidentRequest } = require('../backend/services/aiService');
  const month = new Date().toISOString().slice(0, 7);
  const context = selectIncidentContext([
    { id: 'INC-1', opened_at: month + '-01 08:00:00', status: 'closed' },
    { id: 'INC-2', opened_at: '2000-01-01 08:00:00', status: 'closed' }
  ], "Can you show me this month's incident reports?");
  assert.deepEqual(context.rows.map((row) => row.id), ['INC-1']);
  assert.equal(isStructuredIncidentRequest("Can you show me this month's incident reports?", context.filters), true);
});

test('opened-incident wording takes the fast database filter path', () => {
  const { selectIncidentContext, isStructuredIncidentRequest } = require('../backend/services/aiService');
  const context = selectIncidentContext([
    { id: 'INC-1', status: 'new', title: 'Open incident' },
    { id: 'INC-2', status: 'resolved', title: 'Resolved incident' },
    { id: 'INC-3', status: 'closed', title: 'Closed incident' }
  ], 'let me know the opened incidents');
  assert.deepEqual(context.rows.map((row) => row.id), ['INC-1']);
  assert.equal(isStructuredIncidentRequest('let me know the opened incidents', context.filters), true);
});

test('chat context is bounded and the UI calls the protected backend', () => {
  const controller = read('backend/controllers/aiController.js');
  const browser = read('js/app.js');
  assert.match(controller, /LIMIT 250/);
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
