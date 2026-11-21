// What a node test can't see, checked in a real browser: Dash.render keeping focus, typing, open details,
// scroll and a selection; the poll's live status; the chart readout; copy buttons across a re-render; the
// sidebar event; the search count; saved choices in Dash.seg; and the static-md top bar and phone stat tiles.
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
//   node test/behaviour.mjs          (KIT=<dir> serves dash.css and dash.js from <dir> instead: to check a change)
//
// It serves this folder itself on 127.0.0.1 (a free port), using test/behaviour.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = path === '/dash.css' || path === '/dash.js' ? kit : root;
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(join(base, path)));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/test/behaviour.html`;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const errors = [];
const open = async ({ width = 1200, init } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  if (init) await ctx.addInitScript(init);
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(url, { waitUntil: 'load' });
  return tab;
};

// ---- Dash.render
{
  const tab = await open();
  const r = await tab.evaluate(() => {
    const html = (n) => `<p class="t">refresh ${n}</p><button type="button" data-key="b2">keyed</button><button type="button" data-select="7">plain</button>`
      + `<input id="q" type="search" value=""><details data-key="d1"><summary>more</summary>inside</details>`
      + `<details data-key="d2" open><summary>more</summary>inside</details><div id="scroller" style="height:40px;overflow:auto"><div style="height:400px">tall</div></div>`;
    const out = {};
    Dash.render('box', html(1));
    const first = document.querySelector('#box .t');
    out.skip = Dash.render('box', html(1)) === false && document.querySelector('#box .t') === first;
    document.querySelector('[data-key="b2"]').focus();
    Dash.render('box', html(2));
    out.focusKey = document.activeElement.dataset.key === 'b2';
    document.querySelector('[data-select="7"]').focus();
    Dash.render('box', html(3));
    out.focusSig = document.activeElement.dataset.select === '7';
    const q = document.getElementById('q');
    q.focus(); q.value = 'hello'; q.setSelectionRange(2, 4);
    Dash.render('box', html(4));
    const q2 = document.getElementById('q');
    out.typing = document.activeElement === q2 && q2.value === 'hello' && q2.selectionStart === 2 && q2.selectionEnd === 4;
    q2.blur();
    document.querySelector('[data-key="d1"]').open = true;
    document.querySelector('[data-key="d2"]').open = false;
    document.getElementById('scroller').scrollTop = 50;
    Dash.render('box', html(5));
    out.details = document.querySelector('[data-key="d1"]').open === true && document.querySelector('[data-key="d2"]').open === false;
    out.scroll = document.getElementById('scroller').scrollTop === 50;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#box .t'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    out.paused = Dash.render('box', html(6)) === false && document.querySelector('#box .t').textContent === 'refresh 5';
    out.forced = Dash.render('box', html(7), { force: true }) === true && document.querySelector('#box .t').textContent === 'refresh 7';
    range.selectNodeContents(document.getElementById('outside'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    out.outside = Dash.render('box', html(8)) === true;
    getSelection().removeAllRanges();
    return out;
  });
  for (const [k, v] of Object.entries(r)) check('render: ' + k, v);
  await tab.context().close();
}

// ---- Dash.poll's live status
{
  const tab = await open();
  const state = () => tab.evaluate(() => ({ s: document.getElementById('live').dataset.state, t: document.getElementById('live').textContent }));
  await tab.evaluate(() => {
    window.poller = Dash.poll(async () => {
      if (mode === 'fail') throw new Error('HTTP 502');
      if (mode === 'hang') return new Promise(() => {});
      await new Promise((ok) => setTimeout(ok, 150));
    }, 200, { live: 'live', staleAfter: 700 });
  });
  const s0 = await state();
  check('poll: connecting before the first run', s0.s === 'connecting', JSON.stringify(s0));
  await tab.waitForTimeout(400);
  const s1 = await state();
  check('poll: live after a run', s1.s === 'on' && s1.t === 'Live', JSON.stringify(s1));
  await tab.evaluate(() => { mode = 'fail'; });
  await tab.waitForTimeout(600);
  const s2 = await state();
  check('poll: the error after a failed run', s2.s === 'off' && s2.t.includes('HTTP 502'), JSON.stringify(s2));
  await tab.evaluate(() => { mode = 'ok'; });
  await tab.waitForTimeout(600);
  const s3 = await state();
  check('poll: live again', s3.s === 'on', JSON.stringify(s3));
  await tab.evaluate(() => { mode = 'hang'; });
  await tab.waitForTimeout(1800);
  const s4 = await state();
  check('poll: stale when runs stop arriving', s4.s === 'stale' && /No update since/.test(s4.t), JSON.stringify(s4));
  await tab.context().close();
}

// ---- chart readout, search count, seg, copy, side event
{
  const tab = await open({ init: () => {
    localStorage.setItem('seg.a', '7d'); // a plain string, as an older page saved it
    localStorage.setItem('seg.b', '30'); // a JSON number
    localStorage.setItem('seg.c', '"y"'); // JSON, as Dash.store writes it
  } });
  const readText = () => tab.textContent('#kit-chart .chart-read');
  check('chart: readout shows its own text', (await readText()) === 'Total 8');
  await tab.hover('#kit-chart .chart-col >> nth=1');
  check('chart: hovering a column shows its title', (await readText()) === 'col b', await readText());
  await tab.hover('#outside');
  check('chart: leaving puts the text back', (await readText()) === 'Total 8', await readText());
  await tab.hover('#own-chart .chart-col');
  await tab.hover('#outside');
  const own = await tab.textContent('#own-read');
  check("chart: a page's own readout is left alone", own === 'own: own col', own);

  const fit = await tab.evaluate(() => {
    const input = document.getElementById('search'), count = document.querySelector('.search .count');
    const r = input.getBoundingClientRect();
    return { textRight: r.right - parseFloat(getComputedStyle(input).paddingRight), countLeft: count.getBoundingClientRect().left };
  });
  check('search: typed text stops before the count', fit.textRight <= fit.countLeft, JSON.stringify(fit));

  const seg = await tab.evaluate(() => ['a', 'b', 'c', 'd'].map((k) => Dash.seg('seg-' + k, { value: k === 'd' ? 2 : undefined, store: 'seg.' + k }).value));
  check('seg: a saved plain string', seg[0] === '7d', seg[0]);
  check('seg: a saved number', seg[1] === '30', seg[1]);
  check('seg: saved JSON', seg[2] === 'y', seg[2]);
  check('seg: a number as the default value', seg[3] === '2', seg[3]);

  await tab.evaluate(() => Dash.render('copy-box', Dash.copyButton('abc') + Dash.copyButton('quiet text', 'Copy id', { quiet: true })));
  await tab.click('#copy-box [data-copy="abc"]');
  await tab.waitForTimeout(150);
  const toastShown = await tab.evaluate(() => !!document.querySelector('.toast.show'));
  await tab.evaluate(() => Dash.render('copy-box', Dash.copyButton('abc') + Dash.copyButton('quiet text', 'Copy id', { quiet: true }) + '<span>redrawn</span>'));
  const redrawn = (await tab.textContent('#copy-box [data-copy="abc"]')).trim();
  await tab.waitForTimeout(1500);
  const later = (await tab.textContent('#copy-box [data-copy="abc"]')).trim();
  check('copy: "Copied ✓" survives a re-render', redrawn === 'Copied ✓', redrawn);
  check('copy: and goes back afterwards', later === 'Copy', later);
  check('copy: a toast by default', toastShown);
  await tab.evaluate(() => document.querySelector('.toast')?.classList.remove('show'));
  await tab.click('#copy-box [data-copy="quiet text"]');
  await tab.waitForTimeout(150);
  const quiet = await tab.evaluate(() => ({ toast: !!document.querySelector('.toast.show'), label: document.querySelector('[data-copy="quiet text"]').textContent, clip: '' }));
  quiet.clip = await tab.evaluate(() => navigator.clipboard.readText());
  check('copy: quiet copies without a toast', !quiet.toast && quiet.label === 'Copied ✓' && quiet.clip === 'quiet text', JSON.stringify(quiet));

  await tab.click('[data-toggle-side]');
  await tab.click('[data-toggle-side]');
  const side = await tab.evaluate(() => sideEvents);
  check('side: one dash:side event per click', JSON.stringify(side) === '[true,false]', JSON.stringify(side));
  await tab.context().close();
}

// ---- top bar and phone tiles
for (const [width, md, plain] of [[700, 'static', 'sticky'], [1000, 'sticky', 'sticky']]) {
  const tab = await open({ width });
  const pos = await tab.evaluate(() => ['bar-md', 'bar-plain'].map((id) => getComputedStyle(document.getElementById(id)).position));
  check(`topbar at ${width}: .static-md ${md}, plain ${plain}`, pos[0] === md && pos[1] === plain, pos.join(' '));
  await tab.context().close();
}
{
  const tab = await open({ width: 390 });
  const cols = await tab.evaluate(() => ['stats-default', 'stats-one'].map((id) => new Set([...document.querySelectorAll(`#${id} .stat`)].map((s) => Math.round(s.getBoundingClientRect().left))).size));
  check('stats on a phone: two across, one with --stat-min-sm: 100%', cols[0] === 2 && cols[1] === 1, cols.join(' '));
  await tab.context().close();
}

await browser.close();
server.close();
for (const e of errors) results.push({ name: 'page error', ok: false, detail: e });
const failed = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`${results.length - failed.length}/${results.length} behaviour checks passed`);
process.exit(failed.length ? 1 : 0);
