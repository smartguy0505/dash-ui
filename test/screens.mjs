// Layout checks in a real browser: every page at phone, tablet, laptop and wide widths, light and dark.
// Fails on a page wider than the window, a console error, a stacked table that lost its card layout, or text that can't
// be read (below 4.5:1 against what is really behind it).
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
//   node test/screens.mjs            (SHOTS=1 also saves screenshots to screens/; KIT=<dir> takes dash.css, dash.js and dash-utils.css from there)
//
// It serves this folder itself on 127.0.0.1 (a free port), so nothing else needs to run.
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('needs playwright-core: npm i --no-save playwright-core && npx playwright-core install --only-shell chromium');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const kit = process.env.KIT || root;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(/^\/dash(-utils)?\.(css|js)$/.test(path) ? kit : root, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const PAGES = ['index.html', 'examples/overview.html', 'examples/portfolio.html', 'examples/fleet.html', 'examples/login.html', 'examples/starter.html', 'examples/utilities.html',
  ...(await readdir(join(root, 'docs'))).filter((f) => f.endsWith('.html')).sort().map((f) => 'docs/' + f)];
const WIDTHS = [390, 700, 860, 1440];
const shots = process.env.SHOTS === '1';
if (shots) await mkdir(join(root, 'screens'), { recursive: true });

// All the text of a page (placeholders too), and where it is below 4.5:1 on what is really behind it (3:1 for large text).
// What is see-through, a colour or an element with opacity, is laid over what is under it, as the screen does.
// Not counted: what is off (disabled), what only a screen reader gets, what is blurred on purpose, and text on a gradient
// or a picture. seen counts the faint and the accent texts, so that a check that finds none of them says so.
function lowText() {
  for (const d of document.querySelectorAll('details')) d.open = true;
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const known = new Map();
  const rgba = (s) => {
    if (!known.has(s)) {
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = s;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      known.set(s, [d[0], d[1], d[2], d[3] / 255]);
    }
    return known.get(s);
  };
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const mix = (top, under, a) => top.slice(0, 3).map((v, i) => v * a + under[i] * (1 - a));
  // the colour of the text and of what is behind it as they are on the screen, or null where that can't be told
  const onScreen = (e, color) => {
    const ancestors = [];
    for (let n = e; n; n = n.parentElement) ancestors.unshift(n);
    let back = [255, 255, 255], unsure = false;
    const groups = [];
    for (const n of ancestors) {
      const s = getComputedStyle(n);
      if (/blur/.test(s.filter) || s.mixBlendMode !== 'normal') return null;
      if (Number(s.opacity) < 1) groups.push([Number(s.opacity), back, unsure]);
      const c = rgba(s.backgroundColor);
      if (c[3]) { back = mix(c, back, c[3]); if (c[3] === 1) unsure = false; }
      if (s.backgroundImage !== 'none') unsure = true;
    }
    const c = rgba(color);
    let text = mix(c, back, c[3]);
    for (const [o, before, was] of groups.reverse()) { text = mix(text, before, o); back = mix(back, before, o); unsure ||= was; }
    return unsure ? null : [text, back];
  };
  const tokens = getComputedStyle(document.documentElement);
  const names = Object.fromEntries(['faint', 'accent'].map((k) => [rgba(tokens.getPropertyValue('--' + k).trim()).join(), k]));
  const seen = { faint: 0, accent: 0, all: 0 }, low = new Set();
  const look = (e, color, s = getComputedStyle(e)) => {
    if (e.closest(':disabled, [aria-disabled="true"], label:has(:disabled), :has(> :is(input, select, textarea):disabled), .private, .ip:not(.shown)')) return;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) return; // .sr-only
    const both = onScreen(e, color);
    if (!both) return;
    const name = names[rgba(color).join()];
    if (name) seen[name]++;
    seen.all++;
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
    const x = ratio(...both);
    if (x < (large ? 3 : 4.5)) low.add(`${name ? name + ' ' : ''}text in ${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().replace(/\s+/g, '.') : ''} is ${x.toFixed(2)}:1`);
  };
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const e = walk.currentNode.parentElement;
    if (!walk.currentNode.nodeValue.trim() || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|OPTION|OPTGROUP)$/.test(e.tagName) || !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const s = getComputedStyle(e);
    look(e, e instanceof SVGElement ? s.fill : s.color, s);
  }
  for (const e of document.querySelectorAll('input, textarea')) if (e.placeholder && !e.value && e.checkVisibility()) look(e, getComputedStyle(e, '::placeholder').color);
  return { seen, low: [...low] };
}

const problems = [];
const quiet = { light: { faint: 0, accent: 0, all: 0 }, dark: { faint: 0, accent: 0, all: 0 } };
const browser = await chromium.launch();
for (const page of PAGES) {
  for (const scheme of ['light', 'dark']) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const tab = await ctx.newPage();
      const where = `${page} ${width} ${scheme}`;
      tab.on('pageerror', (e) => problems.push(`${where}: ${e.message}`));
      tab.on('console', (m) => { if (m.type() === 'error') problems.push(`${where}: console: ${m.text()}`); });
      await tab.goto(base + page, { waitUntil: 'load' });
      await tab.waitForTimeout(300);
      const over = await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) problems.push(`${where}: ${over}px wider than the window`);
      // stacked tables: header hidden and each row a block exactly when their breakpoint says so
      const tables = await tab.evaluate(() => [...document.querySelectorAll('table.stack')].map((t) => ({
        md: t.classList.contains('stack-md'),
        headHidden: t.tHead ? getComputedStyle(t.tHead).display === 'none' : null,
        rowBlock: t.tBodies[0]?.rows[0] ? getComputedStyle(t.tBodies[0].rows[0]).display === 'block' : null,
        actionsInCorner: (() => {
          const tr = [...t.querySelectorAll('tbody tr')].find((r) => r.querySelector(':scope > td.actions'));
          if (!tr) return null;
          const a = tr.querySelector(':scope > td.actions').getBoundingClientRect();
          const r = tr.getBoundingClientRect();
          return a.top - r.top < 20 && r.right - a.right < 30;
        })(),
      })));
      for (const t of tables) {
        const stacked = width <= (t.md ? 900 : 640);
        if (t.headHidden !== null && t.headHidden !== stacked) problems.push(`${where}: table header ${t.headHidden ? 'hidden' : 'shown'} (stacked should be ${stacked})`);
        if (t.rowBlock !== null && t.rowBlock !== stacked) problems.push(`${where}: rows ${t.rowBlock ? 'are' : 'are not'} cards (should be ${stacked})`);
        if (stacked && t.actionsInCorner === false) problems.push(`${where}: td.actions is not in the card's corner`);
      }
      if (shots) await tab.screenshot({ path: join(root, 'screens', `${page.replace(/\W+/g, '_')}-${width}-${scheme}.png`), fullPage: true });
      if (width === WIDTHS[0] || width === WIDTHS.at(-1)) {
        const { seen, low } = await tab.evaluate(lowText);
        for (const k in seen) quiet[scheme][k] += seen[k];
        for (const t of low) problems.push(`${where}: ${t}`);
      }
      await ctx.close();
    }
  }
}
for (const s in quiet) for (const k in quiet[s]) if (!quiet[s][k]) problems.push(`no ${k} text found in ${s}: the check for it looks at nothing`);
await browser.close();
server.close();

const runs = PAGES.length * WIDTHS.length * 2;
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s) in ${runs} page loads`);
  process.exit(1);
}
console.log(`${runs} page loads: no sideways scroll, no console errors, stacked tables right, ${quiet.light.all + quiet.dark.all} texts readable (${quiet.light.faint + quiet.dark.faint} faint, ${quiet.light.accent + quiet.dark.accent} accent)`);
