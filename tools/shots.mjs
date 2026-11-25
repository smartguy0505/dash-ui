// The pictures in the README: node tools/shots.mjs [name …] writes screenshots/<name>-light.webp and -dark.webp.
// Each page is taken at a fixed time and with fixed random numbers, so that a picture only changes when its page does.
// It serves this folder itself on 127.0.0.1 (a free port). The letters are those of this machine's system-ui.
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright-core').catch(() => {
  console.error('needs playwright-core: npm i --no-save playwright-core && npx playwright-core install --only-shell chromium');
  process.exit(2);
});

// in: the part of the page that is taken (the window, if there is none); at: what is scrolled to, below the top bar;
// do: what is done on the page first
const SHOTS = [
  { name: 'overview', page: 'examples/overview.html' },
  { name: 'portfolio', page: 'examples/portfolio.html' },
  { name: 'fleet', page: 'examples/fleet.html' },
  { name: 'docs', page: 'docs/fields.html' },
  { name: 'charts', page: 'index.html', at: '#charts' },
  { name: 'tables', page: 'index.html', at: '#tables' },
  { name: 'forms', page: 'index.html', at: '#forms' },
  { name: 'lists', page: 'index.html', at: '#lists' },
  { name: 'heatmap', page: 'docs/charts.html', at: '#heatmap' },
  { name: 'board', page: 'docs/lists.html', in: '.panel:has(> #week-board)', async do(tab) {
    const at = async (q, x, y) => { const b = await tab.locator(q).boundingBox(); return [b.x + b.width * x, b.y + b.height * y]; };
    await tab.locator('#week-board').scrollIntoViewIfNeeded();
    const from = await at('#week-board li[data-key="2"]', 0.4, 0.5);
    await tab.mouse.move(...from);
    await tab.mouse.down();
    await tab.mouse.move(from[0] + 8, from[1] + 5);
    await tab.mouse.move(...await at('#week-board li[data-key="4"]', 0.3, 1.25), { steps: 6 });
  } },
  { name: 'palette', page: 'index.html', async do(tab) { await tab.keyboard.press('Control+k'); } },
  { name: 'overview-phone', page: 'examples/overview.html', phone: true },
  { name: 'portfolio-phone', page: 'examples/portfolio.html', phone: true },
  { name: 'fleet-phone', page: 'examples/fleet.html', phone: true },
];
const only = process.argv.slice(2);

const root = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(join(root, 'screenshots'), { recursive: true });

const browser = await chromium.launch();
const press = await (await browser.newContext()).newPage(); // makes WebP of a PNG
const webp = (png) => press.evaluate(async (data) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d').drawImage(img, 0, 0);
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: 0.9 })).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}, png.toString('base64'));

let bad = 0;
for (const shot of SHOTS.filter((s) => !only.length || only.includes(s.name))) {
  for (const colorScheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
      ...(shot.phone ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 }) });
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => { bad++; console.error(`${shot.name} ${colorScheme}: ${e.message}`); });
    await tab.addInitScript(() => { let x = 7; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
    await tab.clock.setFixedTime(new Date('2026-11-25T09:41:00Z'));
    await tab.goto(base + shot.page, { waitUntil: 'load' });
    await tab.waitForTimeout(500);
    if (shot.at) await tab.evaluate((q) => { const top = document.querySelector('.topbar')?.offsetHeight || 0; scrollTo(0, document.querySelector(q).getBoundingClientRect().top + scrollY - top - 12); }, shot.at);
    if (shot.do) await shot.do(tab);
    await tab.waitForTimeout(300);
    const png = shot.in ? await tab.locator(shot.in).screenshot() : await tab.screenshot();
    const out = Buffer.from(await webp(png), 'base64');
    await writeFile(join(root, 'screenshots', `${shot.name}-${colorScheme}.webp`), out);
    console.log(`${shot.name}-${colorScheme}.webp ${Math.round(out.length / 1024)} KB`);
    await ctx.close();
  }
}
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
