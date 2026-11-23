// Layout checks in a real browser: every page at phone, tablet, laptop and wide widths, light and dark.
// Fails on a page wider than the window, a console error, or a stacked table that lost its card layout.
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
//   node test/screens.mjs            (SHOTS=1 also saves screenshots to screens/)
//
// It serves this folder itself on 127.0.0.1 (a free port), so nothing else needs to run.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const PAGES = ['index.html', 'examples/overview.html', 'examples/portfolio.html', 'examples/fleet.html', 'examples/login.html', 'examples/starter.html', 'examples/utilities.html'];
const WIDTHS = [390, 700, 860, 1440];
const shots = process.env.SHOTS === '1';
if (shots) await mkdir(join(root, 'screens'), { recursive: true });

const problems = [];
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
      await ctx.close();
    }
  }
}
await browser.close();
server.close();

const runs = PAGES.length * WIDTHS.length * 2;
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s) in ${runs} page loads`);
  process.exit(1);
}
console.log(`${runs} page loads: no sideways scroll, no console errors, stacked tables right`);
