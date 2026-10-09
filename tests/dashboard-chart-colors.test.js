'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const frontend = fs.readFileSync('js/app.js', 'utf8');

function slice(fnStart, fnEnd) {
  const start = frontend.indexOf(fnStart);
  const end = frontend.indexOf(fnEnd, start);
  return frontend.slice(start, end);
}

// Three charts used red (#f75c7c) vs green (#2dd4a0) as the ONLY signal
// distinguishing two states (Opened/Closed, Breached/On-time, Open/Closed by
// area) — indistinguishable for red-green colorblind viewers, with no
// pattern/label fallback. Green is swapped for blue (#4f8ef7, the app's own
// --accent) on the "resolved/good" side, keeping red for "needs attention"
// consistent with the rest of the app (badges, severity colors).

test('Incident Trend\'s Closed series uses blue (#4f8ef7), not green, paired against Opened\'s red', () => {
  // Ends at the shared SEVERITY_CHART_COLORS constant (declared right after
  // _drawTrend, before the SEVERITY DONUT comment) rather than at the
  // comment itself, so this slice doesn't swallow that constant's own
  // (intentional, untouched) '#2dd4a0' for Normal severity.
  const impl = slice('function _drawTrend(', 'var SEVERITY_CHART_COLORS');
  assert.match(impl, /drawSeries\(dClosed, '#4f8ef7', 'rgba\(79,142,247,0\.25\)', 'rgba\(79,142,247,0\.02\)', 'Closed'\);/);
  assert.match(impl, /drawSeries\(dOpen, '#f75c7c', 'rgba\(247,92,124,0\.25\)', 'rgba\(247,92,124,0\.02\)', 'Opened'\);/);
  assert.match(impl, /\[\['Opened', '#f75c7c'\], \['Closed', '#4f8ef7'\]\]\.forEach/, 'legend pills must match the series colors');
  assert.match(impl, /\[\[pOpen\[best\], '#f75c7c'\], \[pClosed\[best\], '#4f8ef7'\]\]\.forEach/, 'hover-highlighted dots must match the series colors');
  assert.match(impl, /background:#4f8ef7;display:inline-block.+Closed/, 'tooltip dot must match the series color');
  assert.doesNotMatch(impl, /#2dd4a0|rgba\(45,212,160/, 'no trace of the old green should remain in this chart');
});

test('SLA Breach by Severity\'s On-time bar uses blue (#4f8ef7), not green, paired against Breached\'s red', () => {
  const impl = slice('function _drawSLABreach(', 'function _drawMTTR(');
  assert.match(impl, /grad\.addColorStop\(0, 'rgba\(79,142,247,0\.9\)'\); grad\.addColorStop\(1, 'rgba\(79,142,247,0\.4\)'\);/);
  assert.match(impl, /grad2\.addColorStop\(0, 'rgba\(247,92,124,0\.9\)'\); grad2\.addColorStop\(1, 'rgba\(247,92,124,0\.5\)'\);/);
  assert.match(impl, /\[\['On-time', 'rgba\(79,142,247,0\.8\)'\], \['Breached', 'rgba\(247,92,124,0\.8\)'\]\]\.forEach/);
  assert.doesNotMatch(impl, /rgba\(45,212,160/, 'no trace of the old green should remain in this chart');
});

test('Area Breakdown\'s Closed bar uses blue (#4f8ef7), not green, paired against Open\'s red', () => {
  const impl = slice('function _drawAreaBreakdown(', 'function _drawDow(');
  assert.match(impl, /g2\.addColorStop\(0, 'rgba\(79,142,247,0\.9\)'\); g2\.addColorStop\(1, 'rgba\(79,142,247,0\.3\)'\);/);
  assert.match(impl, /\[\['Open', 'rgba\(247,92,124,0\.8\)'\], \['Closed', 'rgba\(79,142,247,0\.8\)'\]\]\.forEach/);
  assert.doesNotMatch(impl, /rgba\(45,212,160/, 'no trace of the old green should remain in this chart');
});

// The severity (Critical/High/Medium/Normal) 4-color palette is intentionally
// left untouched — those are labeled categories, not a color-only binary.
test('the Donut, Customer Distribution, and Resolution Timeline severity palettes are untouched (still red/amber/blue/green for Critical/High/Medium/Normal)', () => {
  assert.match(frontend, /var SEVERITY_CHART_COLORS = \{ Critical: '#f75c7c', High: '#f7b94f', Medium: '#4f8ef7', Normal: '#2dd4a0' \};/);
  const donut = slice('function _drawDonut(', '/* ── 3. CUSTOMER VERTICAL BAR CHART');
  assert.match(donut, /var colors = sevs\.map\(function \(s\) \{ return SEVERITY_CHART_COLORS\[s\]; \}\);/);
  const customer = slice('function _drawCustomer(', 'function _drawResolution(');
  assert.match(customer, /var sevColors = SEVERITY_CHART_COLORS;/);
  assert.match(customer, /var legendItems = sevOrder\.map\(function \(s\) \{ return \[s, sevColors\[s\]\]; \}\);/);
  const resolutionHead = frontend.slice(frontend.indexOf('function _drawResolution('), frontend.indexOf('function _drawResolution(') + 400);
  assert.match(resolutionHead, /var severityColors = SEVERITY_CHART_COLORS;/);
});

// Glow (shadowBlur) was concentrated almost entirely in Incident Trend (line
// 8, dots 10, legend dots 6, hover-highlight dots 16 — the most extreme
// single value in the file) plus MTTR Trend's line (6). Halved rather than
// removed, so a constantly-visible ops dashboard isn't visually tiring to
// stare at all day while still keeping some of the glow's visual pop.
test('Incident Trend and MTTR Trend glow (shadowBlur) intensities are halved from their original values', () => {
  const trend = slice('function _drawTrend(', '/* ── 2. SEVERITY DONUT');
  assert.match(trend, /ctx\.shadowColor = color; ctx\.shadowBlur = 4;/, 'line glow 8 -> 4');
  assert.match(trend, /ctx\.shadowColor = color; ctx\.shadowBlur = 5;/, 'dot glow 10 -> 5');
  assert.match(trend, /ctx\.shadowColor = item\[1\]; ctx\.shadowBlur = 3;/, 'legend dot glow 6 -> 3');
  assert.match(trend, /ctx\.shadowColor = item\[1\]; ctx\.shadowBlur = 8;/, 'hover-highlight dot glow 16 -> 8');
  assert.doesNotMatch(trend, /shadowBlur = 8;\n.*bezierLine|shadowBlur = 10;\n.*beginPath\(\); ctx\.arc\(pt\.x|shadowBlur = 16;/);

  const mttr = slice('function _drawMTTR(', 'function _drawAreaBreakdown(');
  assert.match(mttr, /ctx\.shadowColor = '#f7b94f'; ctx\.shadowBlur = 3;/, 'line glow 6 -> 3');
});

// Four colors were hardcoded regardless of theme and already misbehaved in
// light mode: the Donut's center "Total" number, Incident Trend's hover
// crosshair line and highlighted-dot inner punch-out, and Customer
// Distribution's column background wash and segment separator lines.
test('four previously theme-blind chart colors are now theme-aware', () => {
  const donut = slice('function _drawDonut(', '/* ── 3. CUSTOMER VERTICAL BAR CHART');
  assert.match(donut, /ctx\.fillStyle = document\.body\.classList\.contains\('light-mode'\) \? '#333' : '#e0e0f0';/);

  const trend = slice('function _drawTrend(', '/* ── 2. SEVERITY DONUT');
  assert.match(trend, /ctx\.strokeStyle = isLightMode \? 'rgba\(0,0,0,0\.2\)' : 'rgba\(255,255,255,0\.2\)';/);
  assert.match(trend, /ctx\.fillStyle = isLightMode \? '#ffffff' : '#0d0d1a'; ctx\.fill\(\);/);

  const customer = slice('function _drawCustomer(', 'function _drawResolution(');
  assert.match(customer, /var isLightMode = document\.body\.classList\.contains\('light-mode'\);/);
  assert.match(customer, /colBg\.addColorStop\(0, isLightMode \? 'rgba\(0,0,0,0\.03\)' : 'rgba\(255,255,255,0\.02\)'\);/);
  assert.match(customer, /ctx\.strokeStyle = isLightMode \? 'rgba\(0,0,0,0\.15\)' : 'rgba\(255,255,255,0\.15\)';/);
});
