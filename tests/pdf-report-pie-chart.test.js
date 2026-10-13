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

// A single category holding 100% of the filtered incidents (e.g. every
// incident in the current filter is Critical, or every one is Closed — both
// common in practice) used to render as a completely blank pie chart in the
// Incident Management Report PDF export. Root cause: the arc-path math draws
// an SVG <path> whose start point is M(cx,cy) -> L(x1,y1) and whose arc ends
// at (x2,y2) — for a full 2π sweep, (x2,y2) is mathematically identical to
// (x1,y1) (cos/sin are periodic), and an SVG elliptical-arc command with
// coincident start/end points is defined to render nothing at all. Only the
// legend ("Critical (49)") showed; the pie itself was invisible.
test('makePieChart draws a plain filled circle (not a degenerate 360° arc path) when a single category holds 100% of the data', () => {
  const impl = slice('function makePieChart(', 'function makeBarChart(');
  assert.match(impl, /const nonZeroSlices = slices\.filter\(s => s\.value > 0\);/);
  assert.match(impl, /if \(nonZeroSlices\.length === 1\) \{/);
  assert.match(impl, /paths = `<circle cx="\$\{cx\}" cy="\$\{cy\}" r="\$\{r\}" fill="\$\{only\.color\}" stroke="white" stroke-width="2"\/>`/);
  assert.match(impl, /<text x="\$\{cx\}" y="\$\{\(cy \+ 4\)\.toFixed\(1\)\}" text-anchor="middle" fill="white" font-size="11" font-weight="700">100%<\/text>/);
  // The legend still shows the real count, same as the multi-slice path.
  assert.match(impl, /legend = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:10px;height:10px;border-radius:2px;background:\$\{only\.color\};flex-shrink:0"><\/div><div style="font-size:11px;color:#444">\$\{only\.label\} \(\$\{only\.value\}\)<\/div><\/div>`;/);
});

test('makePieChart keeps the original multi-slice arc-path rendering unchanged for 2+ non-zero categories', () => {
  const impl = slice('function makePieChart(', 'function makeBarChart(');
  assert.match(impl, /\} else \{\s*\n\s*slices\.forEach\(s => \{/);
  assert.match(impl, /const sweep = \(s\.value \/ total\) \* Math\.PI \* 2;/);
  assert.match(impl, /paths \+= `<path d="M\$\{cx\},\$\{cy\} L\$\{x1\.toFixed\(1\)\},\$\{y1\.toFixed\(1\)\} A\$\{r\},\$\{r\} 0 \$\{large\},1 \$\{x2\.toFixed\(1\)\},\$\{y2\.toFixed\(1\)\} Z" fill="\$\{s\.color\}" stroke="white" stroke-width="2"\/>`;/);
});

test('makePieChart still shows "No data" when every slice is zero, unaffected by the single-slice fix', () => {
  const impl = slice('function makePieChart(', 'function makeBarChart(');
  assert.match(impl, /if \(!total\) return '<div style="text-align:center;color:#aaa;font-size:12px;padding:20px">No data<\/div>';/);
});

// Centered, horizontal x-axis labels collided once a bar chart (Incidents by
// Area, Top Customers by Incidents) had more than a handful of categories —
// each bar's own column is narrow, but a centered label's text width has no
// relation to that column width, so neighboring labels routinely spilled
// into each other and became illegible ("InfrastNGC - MNGC - AHistoria...").
//
// Two rotation schemes were tried and rejected before this one:
//  1. Negative rotation, end-anchored: the far end of the label swings
//     DOWNWARD from the anchor (confirmed by hand-rotating the point
//     formula), spilling labels below the chart card entirely.
//  2. Positive rotation, end-anchored: fixed the overflow (swings upward,
//     back toward the bars) but put each label's FIRST character — what a
//     reader's eye lands on first — floating in open space, with only the
//     LAST character pinned under its own bar, making it unclear which
//     label belonged to which bar.
// Anchoring at the label's FIRST character instead, right at its own bar's
// tick, and cascading the rest of the text down-and-right from there (the
// standard Excel/Chart.js rotated-category-label convention) keeps both
// properties at once: no overflow, and an unambiguous label-to-bar link.
test('makeBarChart anchors each x-axis label at its own tick (first character, not centered or end-anchored) and rotates it down-and-right into the reserved margin, so it stays both legible and unambiguously linked to its own bar', () => {
  const impl = slice('function makeBarChart(', '// ── Build chart data');
  assert.match(impl, /const bottomMargin = 60;/);
  assert.match(impl, /const y = 10 \+ \(H - bottomMargin\) \* \(1 - i \/ steps\);/);
  assert.match(impl, /const bH = \(\(b\.value \/ max\) \* \(H - bottomMargin\)\);/);
  assert.match(impl, /const lbl = b\.label\.length > 10 \? b\.label\.substring\(0, 10\) \+ '…' : b\.label;/);
  assert.match(impl, /const lx = \(x \+ bW \/ 2\)\.toFixed\(0\);/);
  assert.match(impl, /const ly = 10 \+ \(H - bottomMargin\) \+ 10;/);
  assert.match(impl, /xLabels \+= `<text x="\$\{lx\}" y="\$\{ly\}" fill="#666" font-size="8" transform="rotate\(40 \$\{lx\} \$\{ly\}\)">\$\{lbl\}<\/text>`;/);
  assert.doesNotMatch(impl, /text-anchor="(middle|end)" fill="#666" font-size="8"/, 'must use the default start-anchor, not center or end, so the first character pins to the bar\'s own tick');
});
