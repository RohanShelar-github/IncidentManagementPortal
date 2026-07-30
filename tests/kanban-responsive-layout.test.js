const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('Kanban wraps status columns so Closed is accessible without horizontal scrolling', () => {
  assert.match(frontend, /board\.innerHTML = '<div class="kanban-columns">' \+ cols \+ '<\/div>'/);
  assert.match(styles, /\.kanban-columns\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(220px,1fr\)\)/);
  assert.match(styles, /\.kanban-board\{display:block;min-height:400px;overflow-x:hidden\}/);
  assert.doesNotMatch(frontend, /display:flex;gap:12px;overflow-x:auto;padding-bottom:8px/);
});
