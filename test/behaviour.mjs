// What a node test can't see, checked in a real browser: Dash.render keeping focus, typing, open details,
// scroll and a selection; the poll's live status; the chart readout; copy buttons across a re-render; the
// sidebar event; the search count; saved choices in Dash.seg; the static-md top bar and phone stat tiles;
// and from 1.3 Dash.table, tabs, menus, tooltips, dialogs, Dash.search and Dash.key, live times and stacked columns;
// from 1.4 modals, popups (with and without the browser's popovers), menus, and what shows above an open dialog;
// from 1.4.1 lanes (events inside their lane, their pointer target, axis labels on a phone) and lanes and the
// timeline in high contrast (forced colours); from 1.5 Dash.lanes under a strict style-src policy (test/csp.html); from 1.6 every sizing builder there with
// Dash.config.csp, drawn as without the policy, in markup the page or the kit puts in; from 1.7 dash-utils.css next to
// the kit (test/utils.html); from 1.8 the new pieces that need a page (test/components.html): sliders, drops, the
// drawer, the bottom nav, input groups, the stepper on a phone, badges and choices.
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
//   node test/behaviour.mjs          (KIT=<dir> serves dash.css, dash.js and dash-utils.css from <dir> instead: to check a change)
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
  const base = ['/dash.css', '/dash.js', '/dash-utils.css'].includes(path) ? kit : root;
  try {
    // test/csp.html: under a strict style policy, as some dashboards are
    const csp = path === '/test/csp.html' ? { 'Content-Security-Policy': "style-src 'self'" } : {};
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', ...csp }).end(await readFile(join(base, path)));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/test/behaviour.html`;

const results = [];
// a check that throws (a click that times out, say) still ends in a FAIL line and exit code 1
process.on('uncaughtException', (e) => {
  for (const r of results) if (!r.ok) console.log(`FAIL ${r.name}${r.detail ? ' — ' + r.detail : ''}`); // what failed before it
  console.log(`FAIL crashed: ${String(e && e.message).split("\n")[0]}`);
  if (process.env.VERBOSE) console.log(e && e.stack);
  process.exit(1);
});
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const errors = [];
const open = async ({ width = 1200, init, clock = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  // soon(promise): the promise, or 'timed out' after 1.5 s, so a close that never comes fails a check instead of hanging
  await ctx.addInitScript(() => { window.soon = (pr, ms = 1500) => Promise.race([pr, new Promise((ok) => setTimeout(() => ok('timed out'), ms))]); });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  if (init) await ctx.addInitScript(init);
  const tab = await ctx.newPage();
  tab.setDefaultTimeout(5000);
  tab.on('pageerror', (e) => errors.push(process.env.VERBOSE ? e.stack : e.message));
  if (clock) await tab.clock.install();
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

// ---- Dash.table
{
  const tab = await open();
  const r = await tab.evaluate(() => {
    window.clicked = [];
    window.rows = Array.from({ length: 25 }, (_, i) => ({ id: i, name: 'item ' + i, v: (i * 7) % 25, region: i % 2 ? 'eu' : 'us' }));
    window.T = Dash.table('tbl', {
      columns: [{ key: 'name', label: 'Name', main: true, firstDir: 'asc' }, { key: 'v', label: 'Value', num: true, format: (v) => v + ' u' },
        { key: 'region', label: 'Region', sort: false }],
      rows, sort: { key: 'v', dir: 'desc' }, perPage: 10, key: 'id', onRow: (row) => clicked.push(row.id),
    });
    return { n: document.querySelectorAll('#tbl tbody tr').length, first: document.querySelector('#tbl tbody td:nth-child(2)').textContent,
      info: document.querySelector('#tbl .pager-info span').textContent, plain: !document.querySelector('#tbl th:nth-child(3) button') };
  });
  check('table: first page, sorted, plain header for sort: false', r.n === 10 && r.first === '24 u' && r.info.startsWith('1–10 of 25') && r.plain, JSON.stringify(r));
  await tab.click('#tbl [data-sort="v"]');
  const asc = await tab.textContent('#tbl tbody td:nth-child(2)');
  check('table: a header click flips the sort', asc === '0 u', asc);
  await tab.click('#tbl [data-page="3"]');
  const p3 = await tab.evaluate(() => ({ n: document.querySelectorAll('#tbl tbody tr').length, cur: document.querySelector('#tbl [aria-current="page"]').textContent }));
  check('table: the pager pages', p3.n === 5 && p3.cur === '3', JSON.stringify(p3));
  await tab.click('#tbl tbody tr >> nth=1');
  await tab.focus('#tbl tbody tr >> nth=0');
  await tab.keyboard.press('Enter');
  const clicks = await tab.evaluate(() => clicked.length);
  check('table: a row click and Enter call onRow', clicks === 2, String(clicks));
  const kept = await tab.evaluate(() => {
    const key = document.activeElement.dataset.key;
    T.update(rows.map((x) => ({ ...x, name: x.name + '!' })));
    return document.activeElement.dataset.key === key && document.activeElement.tagName === 'TR' && document.querySelector('#tbl tbody td').textContent.endsWith('!');
  });
  check('table: a refresh keeps the focused row', kept);
  const f = await tab.evaluate(() => {
    T.filter((x) => Dash.match(x, 'eu'));
    const c = T.count;
    const csv = T.csv().trim().split('\r\n');
    return { c, page: T.page, head: csv[0], lines: csv.length };
  });
  check('table: filter, count and csv', f.c.shown === 12 && f.c.total === 25 && f.page === 1 && f.head === 'Name,Value,Region' && f.lines === 13, JSON.stringify(f));
  await tab.selectOption('#tbl [data-per-page]', '20');
  const n20 = await tab.evaluate(() => document.querySelectorAll('#tbl tbody tr').length);
  check('table: the rows menu', n20 === 12, String(n20));
  const empty = await tab.evaluate(() => { T.filter(() => false); return document.querySelector('#tbl .empty-row')?.textContent; });
  check('table: the empty state', empty === 'Nothing to show', empty);
  await tab.context().close();
}

// ---- Dash.tabs
{
  const tab = await open({ init: () => localStorage.setItem('tabs.saved', JSON.stringify('two')) });
  const vis = () => tab.evaluate(() => [...document.querySelectorAll('#tab-panels [data-tab]')].filter((p) => !p.hidden).map((p) => p.dataset.tab).join(','));
  await tab.evaluate(() => { window.changes = []; window.TB = Dash.tabs('tabs', { store: 'tabs.saved', hash: 'tab', panels: 'tab-panels', onChange: (v) => changes.push(v) }); });
  check('tabs: the saved tab opens, the others hide', (await vis()) === 'two', await vis());
  await tab.click('#tabs [data-value="three"]');
  const after = await tab.evaluate(() => ({ hash: location.hash, saved: Dash.store.get('tabs.saved'), changes, sel: document.querySelector('#tabs [aria-selected="true"]').dataset.value }));
  check('tabs: a click shows the tab, keeps it in the address and storage', (await vis()) === 'three' && after.hash === '#tab=three' && after.saved === 'three'
    && JSON.stringify(after.changes) === '["three"]' && after.sel === 'three', JSON.stringify(after));
  await tab.focus('#tabs [data-value="three"]');
  await tab.keyboard.press('ArrowRight');
  const kb = await tab.evaluate(() => ({ v: TB.value, focus: document.activeElement.dataset.value }));
  check('tabs: arrow keys move (and wrap)', kb.v === 'one' && kb.focus === 'one' && (await vis()) === 'one', JSON.stringify(kb));
  await tab.evaluate(() => { location.hash = '#tab=two'; });
  await tab.waitForTimeout(100);
  check('tabs: following the address (Back, links)', (await vis()) === 'two' && (await tab.evaluate(() => TB.value)) === 'two');
  await tab.goto(url + '#tab=one');
  await tab.evaluate(() => Dash.tabs('tabs', { store: 'tabs.saved', hash: 'tab', panels: 'tab-panels' }));
  check('tabs: a link with #tab= opens that tab', (await vis()) === 'one', await vis());
  await tab.context().close();
}

// ---- menus, tooltips
{
  const tab = await open();
  const isOpen = () => tab.evaluate(() => document.getElementById('menu').open);
  await tab.click('#menu summary');
  const o1 = await isOpen();
  await tab.click('#outside');
  check('menu: opens, and a click outside closes it', o1 && !(await isOpen()));
  const openMenu = () => tab.evaluate(() => { document.getElementById('menu').open = true; document.querySelector('#menu summary').focus(); });
  await openMenu();
  await tab.click('#menu-item');
  check('menu: choosing an item closes it', !(await isOpen()));
  await openMenu();
  await tab.keyboard.press('Escape');
  const esc = await tab.evaluate(() => ({ open: document.getElementById('menu').open, focus: document.activeElement.tagName }));
  check('menu: Escape closes it, back to its button', !esc.open && esc.focus === 'SUMMARY', JSON.stringify(esc));

  await tab.hover('#tip-left');
  const t1 = await tab.evaluate(() => { const t = document.querySelector('.tooltip'); return { shown: !!t && !t.hidden, text: t?.textContent, by: document.getElementById('tip-left').getAttribute('aria-describedby') }; });
  check('tooltip: shows on hover', t1.shown && t1.text === 'A tooltip with a few words in it' && t1.by === 'dash-tooltip', JSON.stringify(t1));
  await tab.hover('#outside');
  check('tooltip: hides when the pointer leaves', await tab.evaluate(() => document.querySelector('.tooltip').hidden));
  await tab.focus('#menu summary'); // the tab stop before it (the closed menu's items are skipped)
  await tab.keyboard.press('Tab');
  const kf = await tab.evaluate(() => ({ on: document.activeElement.id, shown: !document.querySelector('.tooltip').hidden }));
  check('tooltip: shows on keyboard focus', kf.on === 'tip-left' && kf.shown, JSON.stringify(kf));
  await tab.context().close();

  const phone = await open({ width: 390 });
  await phone.hover('#tip-right');
  const fit = await phone.evaluate(() => { const r = document.querySelector('.tooltip').getBoundingClientRect(); return { left: r.left, right: r.right, w: document.documentElement.clientWidth }; });
  check('tooltip: stays inside a phone screen', fit.left >= 7.5 && fit.right <= fit.w - 7.5, JSON.stringify(fit));
  await phone.context().close();
}

// ---- dialogs
{
  const tab = await open();
  const run = (js) => tab.evaluate((code) => { window.res = 'pending'; (0, eval)(code).then((v) => { window.res = v; }); }, js);
  const res = async () => { await tab.waitForTimeout(80); return tab.evaluate(() => ({ res: window.res, left: document.querySelectorAll('dialog').length })); };
  await run("Dash.confirm('Delete 3 rules?', { ok: 'Delete', tone: 'bad' })");
  const c0 = await tab.evaluate(() => ({ focus: document.activeElement.hasAttribute('data-dismiss'), cls: [...document.querySelectorAll('dialog .btn')].pop().className, title: document.querySelector('dialog h2').textContent }));
  check('confirm: Cancel has the focus; a red Delete', c0.focus && c0.cls === 'btn primary bad' && c0.title === 'Delete 3 rules?', JSON.stringify(c0));
  await tab.keyboard.press('Escape');
  const c1 = await res();
  check('confirm: Escape is no, and the dialog goes away', c1.res === false && c1.left === 0, JSON.stringify(c1));
  await run("Dash.confirm('Delete?', { ok: 'Delete' })");
  await tab.click('dialog .btn.primary');
  check('confirm: the button is yes', (await res()).res === true);
  await run("Dash.ask('New name', { value: 'web-1' })");
  const a0 = await tab.evaluate(() => ({ focus: document.activeElement.name, value: document.activeElement.value }));
  await tab.fill('dialog input', 'web-9');
  await tab.keyboard.press('Enter');
  const a1 = await res();
  check('ask: the input has the focus; Enter answers', a0.focus === 'answer' && a0.value === 'web-1' && a1.res === 'web-9' && a1.left === 0, JSON.stringify([a0, a1]));
  await run("Dash.ask('Name')");
  await tab.click('dialog [data-dismiss]');
  const a4 = await res();
  await run("Dash.dialog({ title: 'Pick', body: '<select name=\"size\"><option>s</option><option selected>m</option></select>', actions: [{ label: 'Use', value: 'use', primary: true }] })");
  await tab.mouse.click(5, 5);
  const d1 = await res();
  await run("Dash.dialog({ title: 'Pick', body: '<select name=\"size\"><option>s</option><option selected>m</option></select>', actions: [{ label: 'Use', value: 'use', tone: 'warn' }] })");
  const toned = await tab.evaluate(() => [...document.querySelectorAll('dialog .btn')].pop().className);
  await tab.click('dialog button[value="use"]');
  const d2 = await res();
  check('dialog: an action with a tone is a primary button in it', toned === 'btn primary warn', toned);
  // last: the browser's "fill out this field" bubble stays a few seconds and covers the buttons under it
  await run("Dash.ask('Name')");
  await tab.keyboard.press('Enter');
  const a2 = await tab.evaluate(() => ({ res: window.res, open: !!document.querySelector('dialog[open]') }));
  await tab.keyboard.press('Escape');
  const a3 = await res();
  check('ask: empty stays open (required); Escape and Cancel are null', a2.res === 'pending' && a2.open && a3.res === null && a4.res === null && a3.left === 0, JSON.stringify([a2, a3, a4]));
  check('dialog: a click outside is null; a button gives its value and the fields', d1.res?.value === null && d2.res?.value === 'use' && d2.res?.fields?.size === 'm', JSON.stringify([d1, d2]));
  await tab.context().close();
}

// ---- search, shortcuts, live times, stacked columns
{
  const tab = await open({ clock: true });
  await tab.evaluate(() => {
    window.qs = [];
    window.S = Dash.search('search2', { onChange: (q) => qs.push(q), store: 'q.saved' });
    window.g = 0;
    window.k = 0;
    Dash.key('g', () => { g++; });
    Dash.key('mod+k', () => { k++; });
  });
  await tab.click('#outside');
  await tab.keyboard.press('/');
  check('search: / jumps to it', await tab.evaluate(() => document.activeElement.id === 'search2'));
  await tab.keyboard.type('web/g');
  await tab.clock.runFor(300);
  const s1 = await tab.evaluate(() => ({ q: qs.at(-1), n: qs.length, saved: Dash.store.get('q.saved'), g }));
  check('search: onChange once typing pauses; / and g are typed, not shortcuts', s1.q === 'web/g' && s1.n === 1 && s1.saved === 'web/g' && s1.g === 0, JSON.stringify(s1));
  await tab.keyboard.press('Escape');
  const s2 = await tab.evaluate(() => ({ v: document.getElementById('search2').value, q: qs.at(-1), focus: document.activeElement.id }));
  await tab.keyboard.press('Escape');
  const s3 = await tab.evaluate(() => document.activeElement.id);
  check('search: Escape clears, a second Escape leaves', s2.v === '' && s2.q === '' && s2.focus === 'search2' && s3 !== 'search2', JSON.stringify([s2, s3]));
  const counts = await tab.evaluate(() => { S.count(3, 1200); const a = document.querySelector('#search2 + .count').textContent; S.count(1200, 1200); return [a, document.querySelector('#search2 + .count').textContent]; });
  check('search: the count', counts[0] === '3 / 1,200' && counts[1] === '1,200', counts.join(' | '));
  await tab.keyboard.press('g');
  await tab.keyboard.press('Control+k');
  const keys = await tab.evaluate(() => [g, k]);
  check('key: shortcuts outside text boxes, mod+k', keys[0] === 1 && keys[1] === 1, keys.join(' '));

  await tab.evaluate(() => Dash.render('times', `<span id="ago">${Dash.ago(Date.now() - 30e3)}</span> <span id="until">${Dash.until(Date.now() + 2 * 3600e3 + 30e3)}</span>`));
  const t0 = await tab.evaluate(() => [document.getElementById('ago').textContent, document.getElementById('until').textContent]);
  await tab.clock.runFor(5 * 60e3);
  const t1 = await tab.evaluate(() => [document.getElementById('ago').textContent, document.getElementById('until').textContent]);
  check('live times: keep themselves current', t0.join('|') === '30 s ago|in 2h 0m' && t1.join('|') === '6 min ago|in 1h 55m', JSON.stringify([t0, t1]));

  const st = await tab.evaluate(() => {
    Dash.render('stacked', Dash.bars([{ label: 'a', parts: [{ value: 3, tone: 'blue' }, { value: 1, tone: 'teal' }] }, { label: 'b', value: 2 }], { max: 4 }));
    const [low, high] = [...document.querySelectorAll('#stacked .stacked u')].map((u) => u.getBoundingClientRect());
    const col = document.querySelector('#stacked .stacked i').getBoundingClientRect();
    return { ratio: low.height / high.height, lowUnder: low.top > high.top, fill: Math.abs(low.height + high.height + 1 - col.height) < 1.5,
      colours: [...document.querySelectorAll('#stacked .stacked u')].map((u) => getComputedStyle(u).backgroundColor) };
  });
  check('stacked columns: parts in proportion, the first at the bottom, in their tones', st.ratio > 2.7 && st.ratio < 3.3 && st.lowUnder && st.fill && st.colours[0] !== st.colours[1], JSON.stringify(st));
  await tab.context().close();
}

// ---- 1.3.1: table rows while text is selected, a remembered search, tooltips in dialogs, a wrapped table's scroll
{
  const tab = await open({ init: () => localStorage.setItem('q.restored', JSON.stringify('eu')) });
  await tab.evaluate(() => {
    window.hits = [];
    window.rows2 = Array.from({ length: 6 }, (_, i) => ({ id: i, name: 'item ' + i, v: i }));
    window.T2 = Dash.table('tbl', { columns: [{ key: 'name', label: 'Name', main: true }, { key: 'v', label: 'Value', num: true }], rows: rows2, key: 'id', onRow: (r) => hits.push(r.id) });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#tbl tbody td'));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    T2.update(rows2.slice().reverse()); // skipped while text is selected there
  });
  await tab.click('#tbl tbody tr >> nth=0'); // the click clears the selection first
  const r1 = await tab.evaluate(() => ({ hit: hits.at(-1), shown: document.querySelector('#tbl tbody td').textContent }));
  check('table: a click while a refresh waits gets the row on screen', r1.shown === 'item ' + r1.hit, JSON.stringify(r1));

  const box = await tab.locator('#tbl tbody tr >> nth=2 >> td >> nth=0').boundingBox();
  const before = await tab.evaluate(() => hits.length);
  await tab.mouse.move(box.x + 2, box.y + box.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 5 });
  await tab.mouse.up();
  const drag = await tab.evaluate(() => ({ n: hits.length, sel: String(getSelection()) }));
  check('table: selecting text in a row is not a row click', drag.n === before && drag.sel.length > 0, JSON.stringify(drag));
  await tab.evaluate(() => getSelection().removeAllRanges());

  const restored = await tab.evaluate(async () => {
    window.seen = [];
    Dash.search('search2', { store: 'q.restored', onChange: (q) => seen.push(q) });
    await new Promise((ok) => setTimeout(ok, 0));
    return { box: document.getElementById('search2').value, seen };
  });
  check('search: a remembered query is applied on load', restored.box === 'eu' && JSON.stringify(restored.seen) === '["eu"]', JSON.stringify(restored));

  await tab.evaluate(() => { Dash.dialog({ title: 'Pick', body: '<button type="button" class="btn" id="tip-in" data-tooltip="Inside the dialog">i</button>', cancel: 'Close' }); });
  await tab.hover('#tip-in');
  const inDlg = await tab.evaluate(() => {
    const t = document.querySelector('.tooltip');
    return { shown: !!t && !t.hidden, inside: !!t && !!t.closest('dialog[open]'), w: t ? t.getBoundingClientRect().width : 0 };
  });
  check('tooltip: shows above an open dialog (drawn inside it)', inDlg.shown && inDlg.inside && inDlg.w > 20, JSON.stringify(inDlg));
  await tab.keyboard.press('Escape');
  await tab.keyboard.press('Escape');
  await tab.hover('#tip-left');
  const back = await tab.evaluate(() => { const t = document.querySelector('.tooltip'); return { shown: !!t && !t.hidden, inBody: !!t && t.parentNode === document.body }; });
  check('tooltip: still works after that dialog is gone', back.shown && back.inBody, JSON.stringify(back));

  const scroll = await tab.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'tbl-wide';
    host.style.width = '300px';
    document.querySelector('main').appendChild(host);
    const cols = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].map((k) => ({ key: k, label: k + ' column label' }));
    const make = (n) => [{ id: 1, first: 'a' + n, second: 'b', third: 'c', fourth: 'd', fifth: 'e', sixth: 'f' }];
    const t = Dash.table('tbl-wide', { columns: cols, rows: make(1), cls: '', wrap: true, key: 'id' });
    const wrap = host.querySelector('.table-wrap');
    wrap.scrollLeft = 60;
    t.update(make(2));
    const after = host.querySelector('.table-wrap');
    return { left: after.scrollLeft, wide: after.scrollWidth > after.clientWidth, redrawn: host.querySelector('tbody td').textContent };
  });
  check("table: wrap keeps its sideways scroll across a refresh", scroll.wide && scroll.left === 60 && scroll.redrawn === 'a2', JSON.stringify(scroll));
  await tab.context().close();
}

// ---- 1.4: what floats above an open dialog; modals; popups (with the browser's popovers and without); menus
{
  const tab = await open();
  // toasts and notices show (and can be clicked) above an open modal dialog
  await tab.evaluate(() => { window.nc = 0; window.m = Dash.modal({ title: 'Layers', body: '<input class="input" name="f" id="m-f">' }); });
  await tab.waitForTimeout(50);
  // checked in the same task as the call: the toast and the notice go up into the dialog themselves
  const now = await tab.evaluate(() => {
    Dash.toast('Saved');
    Dash.notify({ key: 'n1', title: 'Notice', text: 'over the dialog', onClick: () => nc++ });
    return { toast: document.querySelector('.toast').parentNode === m.el, notice: m.el.contains(document.querySelector('.notices')) };
  });
  await tab.waitForTimeout(250);
  const lay = await tab.evaluate(() => ({ toast: document.querySelector('.toast').parentNode === m.el, op: getComputedStyle(document.querySelector('.toast')).opacity }));
  check('layers: a toast shows inside an open modal', now.toast && lay.toast && lay.op === '1', JSON.stringify({ now, lay }));
  await tab.click('.notice-body', { timeout: 1000 }).catch(() => {}); // under the dialog it can't be clicked: the check fails
  check('layers: a notice can be clicked while a modal is open', now.notice && (await tab.evaluate(() => nc)) === 1, JSON.stringify(now));
  await tab.evaluate(() => Dash.notify({ key: 'n2', title: 'Stays' }));
  await tab.evaluate(() => m.close());
  await tab.waitForTimeout(50);
  const back = await tab.evaluate(() => ({ parent: document.querySelector('.notices')?.parentNode === document.body, n: document.querySelectorAll('.notice').length }));
  check('layers: notices move back to the page when the modal closes', back.parent && back.n === 1, JSON.stringify(back));

  // a modal dialog the page opens by itself: the notices already showing move up into it
  await tab.evaluate(() => {
    window.nc2 = 0;
    Dash.notify({ key: 'n3', title: 'Before', onClick: () => nc2++ });
    const d = document.createElement('dialog');
    d.id = 'own-dlg';
    d.innerHTML = '<p>the page’s own</p>';
    document.body.appendChild(d);
    d.showModal();
  });
  await tab.waitForTimeout(50);
  await tab.click('[data-notice="n3"] .notice-body', { timeout: 1000 }).catch(() => {});
  const own = await tab.evaluate(() => ({ nc2, inside: document.getElementById('own-dlg').contains(document.querySelector('.notices')) }));
  check('layers: notices move into a dialog the page opens itself', own.nc2 === 1 && own.inside, JSON.stringify(own));
  await tab.evaluate(() => { const d = document.getElementById('own-dlg'); d.close(); d.remove(); Dash.notify.dismiss('n2'); });

  // Escape on a menu inside a dialog closes the menu, not the dialog
  await tab.evaluate(() => {
    window.r1 = 'open';
    Dash.dialog({ title: 'Menu inside', body: '<details class="menu" id="dm"><summary class="btn">More</summary><div class="menu-list"><button type="button">One</button></div></details><input class="input" name="x" id="dx">' })
      .then((v) => { r1 = v; });
  });
  await tab.click('#dm summary');
  await tab.keyboard.press('Escape');
  const esc1 = await tab.evaluate(() => ({ menu: document.getElementById('dm')?.open ?? 'gone', dialog: !!document.querySelector('dialog[open]') }));
  check('menu: Escape inside a dialog closes only the menu', esc1.menu === false && esc1.dialog, JSON.stringify(esc1));
  if (!esc1.dialog) await tab.evaluate(() => { window.r1 = { value: null, fields: { x: 'typed' } }; Dash.dialog({ title: 'again', body: '<input class="input" name="x" id="dx">' }).then((v) => { r1 = v; }); });
  // pressing in a field and letting go over the backdrop (selecting text) keeps the dialog; a click outside closes it
  await tab.fill('#dx', 'typed');
  const fb = await tab.locator('#dx').boundingBox();
  await tab.mouse.move(fb.x + 10, fb.y + fb.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(6, 6, { steps: 5 });
  await tab.mouse.up();
  const keptField = await tab.evaluate(() => !!document.querySelector('dialog[open]'));
  await tab.evaluate(() => Dash.notify({ key: 'drag', title: 'Press me, let go outside' }));
  const nb = await tab.locator('[data-notice="drag"] .notice-title').boundingBox();
  await tab.mouse.move(nb.x + 5, nb.y + nb.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(6, 6, { steps: 5 });
  await tab.mouse.up();
  const keptNotice = await tab.evaluate(() => { const open = !!document.querySelector('dialog[open]'); Dash.notify.dismiss('drag'); return open; });
  const kept = keptField && keptNotice;
  await tab.mouse.click(6, 6);
  await tab.waitForTimeout(50);
  const shut = await tab.evaluate(() => r1);
  check('dialog: a drag out of a field onto the backdrop keeps it; a click there closes it', kept && shut && shut.value === null && shut.fields.x === 'typed', JSON.stringify({ keptField, keptNotice, shut }));

  // modal: Enter presses the primary action after the fields' own checks; onAction sees the value and fields
  await tab.evaluate(() => {
    window.acts = [];
    window.m = Dash.modal({ title: 'Rename', text: 'A new name', cancel: 'Cancel', body: '<input class="input" name="name" id="m-name" required>',
      actions: [{ label: 'Delete', value: 'delete', tone: 'bad' }, { label: 'Save', value: 'save', primary: true }],
      onAction: (v, mm) => { acts.push([v, mm.fields().name]); } });
  });
  const shape = await tab.evaluate(() => ({ title: m.el.querySelector('.modal-title').textContent, x: !!m.el.querySelector('.modal-x'), focus: document.activeElement.id, btns: [...m.el.querySelectorAll('.modal-foot .btn')].map((b) => b.textContent + ':' + b.type).join() }));
  check('modal: a head with title and ×, the first field focused, Cancel then the actions', shape.title === 'Rename' && shape.x && shape.focus === 'm-name' && shape.btns === 'Cancel:button,Delete:button,Save:submit', JSON.stringify(shape));
  await tab.keyboard.press('Enter');
  const blocked = await tab.evaluate(() => ({ acts: acts.length, open: m.el.open }));
  await tab.fill('#m-name', 'web-2');
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(50);
  const res = await tab.evaluate(async () => ({ acts, closed: await soon(m.closed) }));
  check('modal: Enter waits for required fields, then runs the primary action and closes', blocked.acts === 0 && blocked.open && JSON.stringify(res.acts) === '[["save","web-2"]]' && res.closed.value === 'save' && res.closed.fields.name === 'web-2', JSON.stringify({ blocked, res }));

  // onAction: false keeps it open; an error shows in the foot; while it runs the button is busy
  await tab.evaluate(() => {
    window.step = 'false';
    window.m = Dash.modal({ title: 'Save', actions: [{ label: 'Save', value: 'save', primary: true }], onAction: async () => {
      if (step === 'false') return false;
      if (step === 'throw') throw new Error('Name is taken');
      await new Promise((ok) => { window.finishSave = ok; });
    } });
  });
  await tab.click('.modal-foot .btn.primary', { timeout: 1500 }).catch(() => {}); // a button left disabled fails the check below, not the run
  const k1 = await tab.evaluate(() => m.el.open);
  await tab.evaluate(() => { step = 'throw'; });
  await tab.click('.modal-foot .btn.primary', { timeout: 1500 }).catch(() => {}); // a button left disabled fails the check below, not the run
  await tab.waitForTimeout(30);
  const k2 = await tab.evaluate(() => ({ open: m.el.open, err: m.el.querySelector('.modal-error').textContent }));
  await tab.evaluate(() => { step = 'wait'; });
  await tab.click('.modal-foot .btn.primary', { timeout: 1500 }).catch(() => {}); // a button left disabled fails the check below, not the run
  const busy = await tab.evaluate(() => { const b = m.el.querySelector('.modal-foot .btn.primary'); return { busy: b.getAttribute('aria-busy'), dis: b.disabled, err: m.el.querySelector('.modal-error').textContent }; });
  await tab.evaluate(() => window.finishSave && finishSave());
  const r2 = await tab.evaluate(async () => (await soon(m.closed)).value);
  check('modal: onAction false keeps it open, an error shows, a slow one is busy, then it closes',
    k1 && k2.open && k2.err === 'Name is taken' && busy.busy === 'true' && busy.dis && busy.err === '' && r2 === 'save', JSON.stringify({ k1, k2, busy, r2 }));

  // update() redraws the body like Dash.render: typed text and focus stay
  await tab.evaluate(() => { window.m = Dash.modal({ title: 'Live', body: '<p id="lv">1</p><input class="input" id="lv-in" name="q">' }); });
  await tab.fill('#lv-in', 'half typed');
  await tab.evaluate(() => m.update({ title: 'Live 2', body: '<p id="lv">2</p><input class="input" id="lv-in" name="q">' }));
  const upd = await tab.evaluate(() => ({ p: document.getElementById('lv').textContent, v: document.getElementById('lv-in').value, f: document.activeElement.id, t: m.el.querySelector('.modal-title').textContent }));
  check('modal: update() keeps what is being typed and the focus', upd.p === '2' && upd.v === 'half typed' && upd.f === 'lv-in' && upd.t === 'Live 2', JSON.stringify(upd));
  await tab.evaluate(() => m.close());

  // sizes and the drawer
  const sizes = await tab.evaluate(async () => {
    const out = {};
    for (const size of ['sm', 'md', 'lg', 'xl', 'full']) { const x = Dash.modal({ title: size, size }); out[size] = Math.round(x.el.getBoundingClientRect().width); x.close(); await soon(x.closed); }
    const dr = Dash.modal({ title: 'drawer', drawer: true }); const r = dr.el.getBoundingClientRect(); out.drawer = [Math.round(r.right), Math.round(r.top), Math.round(r.height)].join(); dr.close();
    return out;
  });
  check('modal: sizes sm 400, md 560, lg 760, xl 1040, full the window less 32; the drawer on the right, full height',
    sizes.sm === 400 && sizes.md === 560 && sizes.lg === 760 && sizes.xl === 1040 && sizes.full === 1168 && sizes.drawer === '1200,0,800', JSON.stringify(sizes));

  // not dismissable: no ×, Escape and a click outside leave it open; close(value) ends it
  await tab.evaluate(() => { window.m = Dash.modal({ title: 'Working', body: '<p>please wait</p>', dismissable: false }); });
  await tab.keyboard.press('Escape');
  await tab.keyboard.press('Escape');
  await tab.mouse.click(6, 6);
  const stay = await tab.evaluate(() => ({ open: m.el.open, x: !!m.el.querySelector('.modal-x') }));
  await tab.evaluate(() => m.close('done'));
  const r3 = await tab.evaluate(async () => (await soon(m.closed)).value);
  check('modal: dismissable false ignores Escape and clicks outside, close(value) ends it', stay.open && !stay.x && r3 === 'done', JSON.stringify({ stay, r3 }));

  // a confirm on top of a modal: Escape closes the confirm only
  await tab.evaluate(() => { window.m = Dash.modal({ title: 'Below' }); window.cf = 'open'; Dash.confirm('Sure?').then((v) => { cf = v; }); });
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(30);
  const st = await tab.evaluate(() => ({ cf, below: m.el.open }));
  check('modal: Escape on a confirm above it closes the confirm only', st.cf === false && st.below, JSON.stringify(st));
  await tab.evaluate(() => m.close());

  // Dash.alert, Dash.busy, a toast with an action
  await tab.evaluate(() => { window.al = 'open'; Dash.alert('Copied 3 rows', { title: 'Done' }).then(() => { al = 'read'; }); });
  const alertFocus = await tab.evaluate(() => document.activeElement.textContent);
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(30);
  check('alert: one button, focused; Enter reads it', alertFocus === 'OK' && (await tab.evaluate(() => al)) === 'read', alertFocus);
  const bz = await tab.evaluate(async () => {
    const b = document.getElementById('tip-left');
    let during;
    const v = await Dash.busy(b, async () => { during = [b.disabled, b.getAttribute('aria-busy'), getComputedStyle(b, '::before').animationName]; return 7; });
    const after = [b.disabled, b.getAttribute('aria-busy')];
    let caught = '';
    try { await Dash.busy(b, () => Promise.reject(new Error('nope'))); } catch (e) { caught = e.message; }
    return { during, v, after, caught, again: [b.disabled, b.getAttribute('aria-busy')] };
  });
  check('busy: disabled with a spinner while it runs, back after, errors passed on',
    JSON.stringify(bz) === '{"during":[true,"true","spin"],"v":7,"after":[false,null],"caught":"nope","again":[false,null]}', JSON.stringify(bz));
  await tab.evaluate(() => { window.undone = 0; Dash.toast('Deleted 3 rows', { action: 'Undo', onAction: () => undone++ }); });
  await tab.waitForTimeout(250);
  await tab.click('.toast-act', { timeout: 1000 }).catch(() => {});
  await tab.waitForTimeout(250);
  const ta = await tab.evaluate(() => ({ undone, shown: document.querySelector('.toast').classList.contains('show') }));
  check('toast: an action button runs and hides it', ta.undone === 1 && !ta.shown, JSON.stringify(ta));
  await tab.context().close();
}

// a long modal on a phone: head and foot stay in view, the body scrolls
{
  const tab = await open({ width: 390 });
  const ph = await tab.evaluate(() => {
    const m = Dash.modal({ title: 'A long one', cancel: 'Close', actions: [{ label: 'Save', primary: true }], body: '<p>line</p>'.repeat(80) });
    const r = m.el.getBoundingClientRect();
    const head = m.el.querySelector('.modal-head').getBoundingClientRect();
    const foot = m.el.querySelector('.modal-foot').getBoundingClientRect();
    return { w: Math.round(r.width), inside: r.top >= 0 && r.bottom <= innerHeight, head: head.top >= r.top, foot: foot.bottom <= r.bottom + 1,
      scrolls: m.body.scrollHeight > m.body.clientHeight, side: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check('modal on a phone: fits the window, head and foot show, the body scrolls', ph.w === 374 && ph.inside && ph.head && ph.foot && ph.scrolls && ph.side === 0, JSON.stringify(ph));
  await tab.context().close();
}

// popups, with the browser's own popovers and without (older browsers)
for (const mode of ['native', 'fallback']) {
  const tab = await open({ init: mode === 'fallback' ? () => { delete HTMLElement.prototype.showPopover; } : undefined });
  const tag = `popup (${mode})`;
  await tab.evaluate(() => {
    const mk = (id, css) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = id; b.textContent = id; b.style.cssText = 'position:fixed;' + css; document.body.appendChild(b); return b; };
    mk('pa', 'left:100px;top:100px');
    mk('pb', 'left:100px;bottom:20px');
    mk('pc', 'right:4px;top:200px');
    window.opens = 0;
    document.getElementById('pa').addEventListener('click', () => { opens++; window.pp = Dash.popup('pa', '<p class="popup-text">Hello <button type="button" class="btn sm" id="tip-in-pop" data-tooltip="In the popup">?</button></p>'); });
  });
  const mode1 = await tab.evaluate(() => typeof HTMLElement.prototype.showPopover);
  await tab.click('#pa');
  const at = await tab.evaluate(() => {
    const a = document.getElementById('pa').getBoundingClientRect();
    const r = pp.el.getBoundingClientRect();
    return { dx: Math.round(r.left - a.left), dy: Math.round(r.top - a.bottom), shown: getComputedStyle(pp.el).display !== 'none' && r.width > 100,
      exp: document.getElementById('pa').getAttribute('aria-expanded'), native: pp.el.hasAttribute('popover') };
  });
  check(`${tag}: opens 6 px below its button, left edges lined up`, at.dx === 0 && at.dy === 6 && at.shown && at.exp === 'true' && at.native === (mode1 === 'function'), JSON.stringify(at));
  await tab.hover('#tip-in-pop');
  const tip = await tab.evaluate(() => { const t = document.querySelector('.tooltip'); return { shown: !!t && !t.hidden, inPop: !!t && pp.el.contains(t) }; });
  check(`${tag}: a tooltip inside it shows (drawn inside it)`, tip.shown && tip.inPop, JSON.stringify(tip));
  await tab.click('#pa'); // the press closes it; the click it makes must not open it again
  await tab.waitForTimeout(30);
  const tog = await tab.evaluate(() => ({ open: document.querySelectorAll('.popup').length, opens, exp: document.getElementById('pa').getAttribute('aria-expanded') }));
  await tab.click('#pa');
  const again = await tab.evaluate(() => document.querySelectorAll('.popup').length);
  check(`${tag}: its button toggles it (closed, then open again)`, tog.open === 0 && tog.opens === 2 && tog.exp === 'false' && again === 1, JSON.stringify({ tog, again }));
  await tab.mouse.click(600, 400);
  await tab.waitForTimeout(30);
  check(`${tag}: a click outside closes it`, (await tab.evaluate(() => document.querySelectorAll('.popup').length)) === 0);

  const under = await tab.evaluate(async () => {
    const p = Dash.popup('pa', 'left open');
    const m = Dash.modal({ title: 'Over it' });
    const gone = !p.el.isConnected && document.querySelectorAll('.popup').length === 0;
    m.close();
    await soon(m.closed);
    return gone;
  });
  check(`${tag}: a modal opening closes a popup left open beneath it`, under);
  await tab.evaluate(() => { window.pp = Dash.popup('pa', '<button type="button" class="btn" id="in1">in</button>', { focus: true }); });
  const f1 = await tab.evaluate(() => document.activeElement.id);
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(30);
  const f2 = await tab.evaluate(() => ({ open: document.querySelectorAll('.popup').length, focus: document.activeElement.id }));
  check(`${tag}: focus goes in; Escape closes it and gives the focus back to its button`, f1 === 'in1' && f2.open === 0 && f2.focus === 'pa', JSON.stringify({ f1, f2 }));

  const flip = await tab.evaluate(() => {
    const p = Dash.popup('pb', '<p>'.repeat(3) + 'tall enough to need room</p>');
    const a = document.getElementById('pb').getBoundingClientRect();
    const r = p.el.getBoundingClientRect();
    p.close();
    const q = Dash.popup('pc', 'near the right edge of the window, and long enough to be wide');
    const s = q.el.getBoundingClientRect();
    q.close();
    return { above: Math.round(a.top - r.bottom), right: Math.round(innerWidth - s.right) };
  });
  check(`${tag}: flips above a button near the bottom; kept inside the window`, flip.above === 6 && flip.right >= 8, JSON.stringify(flip));

  // inside a modal: Escape and data-dismiss close the popup only
  await tab.evaluate(() => {
    window.m = Dash.modal({ title: 'With a popup', body: '<button type="button" class="btn" id="mp">open</button>' });
    window.pq = Dash.popup('mp', '<button type="button" class="btn" data-dismiss id="pq-x">close</button>', { focus: true });
  });
  const inModal = await tab.evaluate(() => ({ inside: m.el.contains(pq.el), top: document.elementFromPoint(pq.el.getBoundingClientRect().left + 5, pq.el.getBoundingClientRect().top + 5) === pq.el || pq.el.contains(document.elementFromPoint(pq.el.getBoundingClientRect().left + 5, pq.el.getBoundingClientRect().top + 5)) }));
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(30);
  const e1 = await tab.evaluate(() => ({ pop: document.querySelectorAll('.popup').length, modal: m.el.open }));
  await tab.evaluate(() => { window.pq = Dash.popup('mp', '<button type="button" class="btn" data-dismiss id="pq-x">close</button>'); });
  await tab.click('#pq-x');
  const e2 = await tab.evaluate(() => ({ pop: document.querySelectorAll('.popup').length, modal: m.el.open }));
  check(`${tag}: inside a modal it shows on top; Escape and data-dismiss close only it`,
    inModal.inside && inModal.top && e1.pop === 0 && e1.modal && e2.pop === 0 && e2.modal, JSON.stringify({ inModal, e1, e2 }));
  await tab.evaluate(() => m.close());

  // new content in a popup closes the popups opened from its old content
  const nested = await tab.evaluate(() => {
    const outer = Dash.popup('pa', '<button type="button" class="btn sm" id="nest-b">more</button>');
    let innerClosed = false;
    const inner = Dash.popup('nest-b', 'inner', { onClose: () => { innerClosed = true; } });
    const before = outer.el.contains(inner.el) && inner.el.isConnected;
    outer.update('<p>new content</p>');
    const after = { inner: inner.el.isConnected, closedNow: innerClosed, open: document.querySelectorAll('.popup').length }; // closed at once, not a frame later
    outer.close();
    return { before, after };
  });
  check(`${tag}: new content in a popup closes the ones opened from the old`, nested.before && !nested.after.inner && nested.after.closedNow && nested.after.open === 1, JSON.stringify(nested));

  // a refreshing table: the popup follows the redrawn button, and closes when its row is gone
  const follow = await tab.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'ftbl';
    document.querySelector('main').prepend(host);
    const rows = [{ id: 1, name: 'one' }, { id: 2, name: 'two' }];
    const cols = [{ key: 'name', label: 'Name' }, { key: 'id', label: '', html: (r) => `<button type="button" class="btn sm" data-more="${r.id}">⋯</button>` }];
    const t = Dash.table('ftbl', { columns: cols, rows, key: 'id' });
    const p = Dash.popup(host.querySelector('[data-more="2"]'), 'row two');
    t.update([{ id: 1, name: 'one!' }, { id: 2, name: 'two!' }]);
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const kept = p.el.isConnected && p.anchor.isConnected && p.anchor.getAttribute('aria-expanded') === 'true';
    t.update([{ id: 1, name: 'one' }]);
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const gone = !p.el.isConnected && (await soon(p.closed)) === null;
    host.remove();
    return { kept, gone };
  });
  check(`${tag}: follows its button through a table refresh, closes when the row is gone`, follow.kept && follow.gone, JSON.stringify(follow));

  // menus: keys, a pick, Escape, a right-click, and a scrolling box that doesn't cut them off
  await tab.evaluate(() => {
    window.mv = 'pending';
    Dash.menu('pa', [{ heading: 'Row' }, { label: 'Rename', value: 'rename', hint: 'F2' }, { label: 'Move', disabled: true }, { label: 'Copy id' }, '-', { label: 'Delete', value: 'delete', tone: 'bad' }]).then((v) => { mv = v; });
  });
  const keys = [];
  keys.push(await tab.evaluate(() => document.activeElement.textContent));
  for (const k of ['ArrowDown', 'ArrowDown', 'Home', 'End', 'ArrowDown', 'c']) { await tab.keyboard.press(k); keys.push(await tab.evaluate(() => document.activeElement.textContent)); }
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(30);
  const mvKeys = await tab.evaluate(() => mv);
  check(`${tag}: menu keys (disabled skipped, wrap, Home, End, a first letter), Enter picks`,
    keys.join('|') === 'RenameF2|Copy id|Delete|RenameF2|Delete|RenameF2|Copy id' && mvKeys === 'Copy id', keys.join('|') + ' → ' + mvKeys);
  await tab.evaluate(() => { window.mv = 'pending'; Dash.menu('pa', ['One', 'Two']).then((v) => { mv = v; }); });
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(30);
  const mvEsc = await tab.evaluate(() => ({ mv, focus: document.activeElement.id, menus: document.querySelectorAll('.popup').length }));
  check(`${tag}: Escape leaves a menu with null and the focus on its button`, mvEsc.mv === null && mvEsc.focus === 'pa' && mvEsc.menus === 0, JSON.stringify(mvEsc));
  const ctx = await tab.evaluate(() => {
    window.mv = 'pending';
    const ev = new MouseEvent('contextmenu', { clientX: 300, clientY: 250, bubbles: true });
    Dash.menu(ev, [{ label: 'Open' }, { label: 'Skip', disabled: true }]).then((v) => { mv = v; });
    const r = document.querySelector('.popup.menu-list').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  await tab.click('.popup.menu-list [disabled]', { force: true });
  const still = await tab.evaluate(() => ({ mv, open: document.querySelectorAll('.popup').length }));
  await tab.click('.popup.menu-list >> text=Open');
  await tab.waitForTimeout(30);
  check(`${tag}: a right-click menu opens at the pointer; a disabled item does nothing; a click picks`,
    ctx.x === 300 && ctx.y === 252 && still.mv === 'pending' && still.open === 1 && (await tab.evaluate(() => mv)) === 'Open', JSON.stringify({ ctx, still }));
  const clip = await tab.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.style.cssText = 'position:fixed;left:20px;top:300px;width:300px;height:60px;overflow:auto';
    wrap.innerHTML = '<button type="button" class="btn sm" id="in-wrap">⋯</button>';
    document.body.appendChild(wrap);
    Dash.menu('in-wrap', ['One', 'Two', 'Three', 'Four', 'Five']);
    const items = document.querySelectorAll('.popup.menu-list [role="menuitem"]');
    const last = items[items.length - 1].getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const hit = document.elementFromPoint(last.left + 10, last.top + last.height / 2);
    return { below: last.top > w.bottom, hit: !!hit && items[items.length - 1].contains(hit) };
  });
  check(`${tag}: a menu inside a box that scrolls is not cut off`, clip.below && clip.hit, JSON.stringify(clip));
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(30);

  // confirm beside a button, and a data-popup with a template
  await tab.evaluate(() => { window.cv = 'pending'; Dash.confirm('Delete web-1?', { anchor: 'pa', ok: 'Delete', tone: 'bad' }).then((v) => { cv = v; }); });
  const cf1 = await tab.evaluate(() => ({ focus: document.activeElement.textContent, role: document.querySelector('.popup')?.getAttribute('role') ?? 'no popup' }));
  if (cf1.role !== 'alertdialog') {
    check(`${tag}: confirm beside its button: Cancel focused, OK true, a click away false`, false, JSON.stringify(cf1));
    await tab.keyboard.press('Escape');
  } else {
    await tab.click('.popup .btn.primary');
    await tab.waitForTimeout(30);
    const cv1 = await tab.evaluate(() => cv);
    await tab.evaluate(() => { window.cv = 'pending'; Dash.confirm('Delete web-2?', { anchor: 'pa' }).then((v) => { cv = v; }); });
    await tab.mouse.click(600, 420);
    await tab.waitForTimeout(30);
    check(`${tag}: confirm beside its button: Cancel focused, OK true, a click away false`,
      cf1.focus === 'Cancel' && cv1 === true && (await tab.evaluate(() => cv)) === false, JSON.stringify({ cf1, cv1 }));
  }
  await tab.evaluate(() => {
    const t = document.createElement('template');
    t.id = 'tpl-info';
    t.innerHTML = '<p class="popup-title">From a template</p><p class="popup-text">no code</p>';
    document.body.appendChild(t);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.id = 'dp'; b.dataset.popup = 'tpl-info'; b.textContent = 'info'; b.style.cssText = 'position:fixed;left:400px;top:100px';
    document.body.appendChild(b);
  });
  await tab.click('#dp');
  const dp = await tab.evaluate(() => document.querySelector('.popup .popup-title')?.textContent);
  await tab.click('#dp');
  await tab.waitForTimeout(30);
  check(`${tag}: data-popup opens a template's content, and its button closes it`, dp === 'From a template' && (await tab.evaluate(() => document.querySelectorAll('.popup').length)) === 0, String(dp));
  await tab.context().close();
}

// a popup in the dark: the card colour, not the browser's own popover colours
{
  const tab = await open();
  const dark = await tab.evaluate(() => {
    Dash.theme.set('dark');
    const p = Dash.popup('tip-left', 'dark');
    const cs = getComputedStyle(p.el);
    const panel = getComputedStyle(document.querySelector('.panel'));
    const out = { theme: document.documentElement.dataset.theme, bg: cs.backgroundColor, panel: panel.backgroundColor, color: cs.color, text: getComputedStyle(document.body).color, border: cs.borderTopStyle + ' ' + cs.borderTopWidth };
    p.close();
    return out;
  });
  const lum = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, b) => a + Number(b), 0);
  check('popup in the dark: card background and text colour', dark.theme === 'dark' && lum(dark.bg) < 200 && dark.bg === dark.panel && dark.color === dark.text && dark.border === 'solid 1px', JSON.stringify(dark));
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

// ---- lanes and the timeline (1.4.1)
{
  const tab = await open({ width: 1200 });
  const m = await tab.evaluate(() => {
    const lane = document.getElementById('lane'), mark = document.getElementById('lane-mark');
    lane.scrollIntoView({ block: 'center' });
    const l = lane.getBoundingClientRect(), r = mark.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    return { laneTop: l.top, laneBottom: l.bottom, top: r.top, bottom: r.bottom, h: r.height,
      beside: document.elementFromPoint(cx + 5, cy) === mark && document.elementFromPoint(cx - 5, cy) === mark,
      minor: getComputedStyle(document.getElementById('axis-minor')).display };
  });
  check('lanes: an event stays inside its lane (the logo .mark is 30 px tall)', m.top >= m.laneTop && m.bottom <= m.laneBottom && Math.round(m.h) === Math.round(m.laneBottom - m.laneTop) - 4, `lane ${m.laneTop}-${m.laneBottom}, event ${m.top}-${m.bottom}`);
  check('lanes: the pointer finds an event 5 px beside it', m.beside);
  check('lanes: .minor axis labels show on a wide screen', m.minor !== 'none', m.minor);
  // high contrast: the browser drops background colours, so each piece needs a line or ink of its own
  await tab.emulateMedia({ forcedColors: 'active' });
  const f = await tab.evaluate(() => {
    const cs = (id, pseudo) => getComputedStyle(document.getElementById(id), pseudo);
    const li = document.querySelectorAll('#tl .timeline > li');
    const bg = getComputedStyle(document.body).backgroundColor;
    return { bg, lane: cs('lane').borderTopWidth, span: cs('lane-span').borderTopWidth, mark: cs('lane-mark').backgroundColor, laneBg: cs('lane').backgroundColor,
      dot: getComputedStyle(li[0], '::before').backgroundColor, line: getComputedStyle(li[0], '::after').backgroundColor, forced: matchMedia('(forced-colors: active)').matches };
  });
  const seen = (c) => c !== f.bg && !/^rgba\(.*,\s*0\)$/.test(c); // not the page's colour, not see-through
  check('forced colours: lanes keep their track, runs and events', f.forced && f.lane === '1px' && f.span === '1px' && seen(f.mark) && f.mark !== f.laneBg, JSON.stringify(f));
  check('forced colours: timeline keeps its dots and line', f.forced && seen(f.dot) && seen(f.line), `dot ${f.dot}, line ${f.line}, page ${f.bg}`);
  await tab.context().close();
}
{
  const tab = await open({ width: 390 });
  const d = await tab.evaluate(() => ['axis-minor', 'axis-major'].map((id) => getComputedStyle(document.getElementById(id)).display));
  check('lanes: on a phone .minor axis labels hide, the others stay', d[0] === 'none' && d[1] !== 'none', d.join(' '));
  await tab.context().close();
}

// ---- under Content-Security-Policy: style-src 'self' (test/csp.html): Dash.lanes (1.5), and with Dash.config.csp
// every sizing builder (1.6), drawn as without the policy, wherever the markup goes in, with no policy violations
const SIZED = () => {
  // the same markup and the same measurements on both pages
  window.sample = () => Dash.bar(0.425, 'ok') + Dash.meter(0.3) + Dash.split([{ value: 3, tone: 'ok' }, { value: 1, tone: 'bad' }])
    + Dash.bars([{ label: 'a', value: 3 }, { label: 'b', value: 1 }, { label: 'c', parts: [{ value: 2, tone: 'ok' }, { value: 1.5, tone: 'warn' }] }], { height: 120, ticks: 2 })
    + Dash.spark([1, 3, 2, 5]) + Dash.progress(0.4);
  window.sizedBox = (id) => { const b = document.createElement('div'); b.id = id; b.style.width = '600px'; document.querySelector('main').append(b); return b; };
  window.measure = (box) => {
    const r = (e) => e.getBoundingClientRect(), q = (s) => box.querySelector(s), d = (x) => Math.round(x * 10) / 10;
    const P = r(q('.chart-plot')), W = r(q('.spark').parentElement), D = r(q('.spark ~ .dot'));
    return { bar: d(r(q('.bar > i')).width), meter: d(r(q('.meter > i')).width), split: [...box.querySelectorAll('.split > i')].map((i) => d(r(i).width)),
      plot: d(P.height), cols: [...box.querySelectorAll('.chart-col > i')].map((i) => d(r(i).height)), grid: [...box.querySelectorAll('.chart-grid')].map((g) => d(r(g).top - P.top)),
      parts: [...box.querySelectorAll('.chart-col u')].map((u) => d(r(u).height)), dot: [d(D.left - W.left), d(D.top - W.top), d(D.width), d(D.height)],
      progress: d(r(q('.progress > i')).width) };
  };
};
let reference;
{
  const tab = await open({ width: 1200, init: SIZED }); // the plain page: no policy, the default mode
  reference = await tab.evaluate(() => { const b = sizedBox('ref'); b.innerHTML = sample(); return measure(b); });
  await tab.context().close();
}
{
  const tab = await open({ width: 1200, init: SIZED });
  const refused = [];
  tab.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) refused.push(m.text()); }); // "Refused to apply inline style …" or "Applying inline style violates …"
  await tab.goto(url.replace('behaviour.html', 'csp.html'), { waitUntil: 'load' });
  const DAY = { from: '2026-11-20T00:00:00Z', to: '2026-11-21T00:00:00Z' };
  const rows = [{ label: 'api-eu-west', sub: 'team-a', spans: [{ from: '2026-11-20T06:00:00Z', to: '2026-11-20T12:00:00Z', title: 'load test 1' }],
    marks: [{ at: '2026-11-20T18:00:00Z', title: 'incident at six' }] }];
  const r = await tab.evaluate(([rows, DAY]) => {
    Dash.lanes('box', rows, { ...DAY, labelWidth: '120px' });
    Dash.lanes('own', rows, { ...DAY, labelWidth: 90 });
    let whole = 'ok';
    try { Dash.lanes.place(document); } catch (e) { whole = String(e); } // the whole page, placed again
    const at = (box) => {
      const lane = box.querySelector('.lane').getBoundingClientRect(), span = box.querySelector('.span').getBoundingClientRect(), mark = box.querySelector('.mark').getBoundingClientRect();
      const ax = [...box.querySelectorAll('.lane-axis span')].map((s) => s.getBoundingClientRect());
      const f = (x) => Math.round(((x - lane.left) / lane.width) * 1000) / 10; // percent of the lane
      return { span: [f(span.left), f(span.right)], mark: f((mark.left + mark.right) / 2), first: Math.round(ax[0].left - lane.left), last: Math.round(ax[ax.length - 1].right - lane.right),
        label: Math.round(box.querySelector('.lane-label').getBoundingClientRect().width) };
    };
    return { box: at(document.getElementById('box')), own: at(document.getElementById('own')),
      whole, nested: document.querySelectorAll('#own .lanes').length, wrapped: document.querySelectorAll('#box > .lanes').length };
  }, [rows, DAY]);
  const near = (a, b, d = 0.6) => Math.abs(a - b) <= d;
  for (const k of ['box', 'own']) {
    const b = r[k];
    check(`Dash.lanes under a strict CSP (${k}): the run and the event sit at their times`, near(b.span[0], 25) && near(b.span[1], 50) && near(b.mark, 75), JSON.stringify(b));
    check(`Dash.lanes under a strict CSP (${k}): the first axis label starts at the lane's left, the last ends at its right`, Math.abs(b.first) <= 1 && Math.abs(b.last) <= 1, JSON.stringify(b));
  }
  check('Dash.lanes: labelWidth sets the label column (a number is pixels)', r.box.label === 120 && r.own.label === 90, `${r.box.label} ${r.own.label}`);
  check('Dash.lanes: fills a .lanes box it is given, and makes one in any other box', r.nested === 0 && r.wrapped === 1, `nested ${r.nested}, wrapped ${r.wrapped}`);
  check('Dash.lanes.place(document) places every .lanes box on the page', r.whole === 'ok', r.whole);
  // its titles show as the kit's tooltips
  const m = await tab.evaluate(() => { const b = document.querySelector('#box .mark').getBoundingClientRect(); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }; });
  await tab.mouse.move(m.x, m.y);
  const tip = await tab.evaluate(() => { const t = document.querySelector('.tooltip'); return t && !t.hidden ? t.textContent : null; });
  check('Dash.lanes: an event\'s title shows as a tooltip', tip === 'incident at six', String(tip));
  // calling it again redraws: the same run on a range twice as long sits at half the width
  const again = await tab.evaluate((rows) => {
    Dash.lanes('box', rows, { from: '2026-11-20T00:00:00Z', to: '2026-11-22T00:00:00Z' });
    const lane = document.querySelector('#box .lane').getBoundingClientRect(), s = document.querySelector('#box .span').getBoundingClientRect();
    return Math.round(((s.right - s.left) / lane.width) * 1000) / 10;
  }, rows);
  check('Dash.lanes: called again, it redraws', near(again, 12.5), String(again));
  const empty = await tab.evaluate(() => {
    Dash.lanes('own', [], { empty: 'No runs yet' });
    const e = document.querySelector('#own > .empty');
    return e ? { text: e.textContent, w: Math.round(e.getBoundingClientRect().width), box: Math.round(document.getElementById('own').getBoundingClientRect().width) } : null;
  });
  check('Dash.lanes: with no rows its empty text spans the whole box', empty && empty.text === 'No runs yet' && empty.w >= empty.box - 1, JSON.stringify(empty));

  // the sizing builders with Dash.config.csp, against the same markup on the plain page
  const flat = (o) => Object.values(o).flat();
  const same = (a) => flat(a).length === flat(reference).length && flat(a).every((v, i) => Math.abs(v - flat(reference)[i]) <= 0.6);
  const byPage = await tab.evaluate(() => new Promise((ok) => { Dash.config.csp = true; const b = sizedBox('by-page'); b.innerHTML = sample(); requestAnimationFrame(() => ok(measure(b))); }));
  check('strict CSP: the builders draw as without it, in markup the page puts in (before the next paint)', same(byPage), JSON.stringify({ byPage, reference }));
  const changed = await tab.evaluate(() => new Promise((ok) => {
    const i = document.querySelector('#by-page .bar > i');
    i.setAttribute('data-css-w', '10');
    requestAnimationFrame(() => ok(Math.round(i.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().width * 100)));
  }));
  check('strict CSP: a size the page changes later is set too (before the next paint)', changed === 10, String(changed));
  const byRender = await tab.evaluate(() => { const b = sizedBox('by-render'); Dash.render(b, sample()); return measure(b); });
  check('strict CSP: the builders draw as without it, at once through Dash.render', same(byRender), JSON.stringify({ byRender, reference }));
  const byApply = await tab.evaluate(() => { const b = sizedBox('by-apply'); b.innerHTML = sample(); Dash.applyStyles(b); return measure(b); });
  check('strict CSP: the builders draw as without it, at once after Dash.applyStyles', same(byApply), JSON.stringify({ byApply, reference }));
  const inKit = await tab.evaluate(async () => {
    const chart = () => Dash.bars([{ label: 'a', value: 3 }, { label: 'b', value: 1 }], { height: 120 });
    const h = (root) => { const p = root && root.querySelector('.chart-plot'); return p ? Math.round(p.getBoundingClientRect().height) : null; };
    const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = 'open'; document.querySelector('main').append(btn);
    const pop = Dash.popup(btn, chart()); const popup = h(pop.el); pop.close();
    Dash.dialog({ title: 'A chart', body: chart() }); const dlg = document.querySelector('dialog[open]'); const dialog = h(dlg); dlg.close();
    const n = document.createElement('div'); n.innerHTML = chart();
    const m = Dash.modal({ title: 'A chart', body: n }); const modal = h(m.el); m.close();
    await new Promise((ok) => setTimeout(ok, 50));
    return { popup, dialog, modal };
  });
  check('strict CSP: a chart has its full height the moment a popup, a dialog or a modal opens', inKit.popup === 120 && inKit.dialog === 120 && inKit.modal === 120, JSON.stringify(inKit));
  const foreign = await tab.evaluate(() => {
    const box = sizedBox('foreign');
    // not the kit's pieces; and on its pieces, values that are not numbers (a custom property would take "1em" as it is)
    box.innerHTML = '<p data-css-w="50">not the kit\'s</p><div class="x"><i data-css-w="50"></i></div><div class="bar"><i data-css-w="1px;color:red"></i></div>'
      + '<div class="chart-plot" data-css-chart-h="1em"></div><div class="chart-plot" data-css-chart-h=""></div>';
    Dash.applyStyles(box);
    return [...box.querySelectorAll('[data-css-w], [data-css-chart-h]')].map((e) => e.style.cssText);
  });
  check('strict CSP: data-css-* sets only numbers, and only on the kit\'s own pieces', foreign.every((x) => x === ''), JSON.stringify(foreign));
  // last: violations (reported a moment later), then a style="" put in on purpose, to show that one would be seen
  await tab.waitForTimeout(300);
  const seen = await tab.evaluate(() => violations.slice());
  check('strict CSP: no policy violations (Dash.lanes, the builders, popups, dialogs, modals)', seen.length === 0 && refused.length === 0, JSON.stringify({ seen, refused }));
  await tab.evaluate(() => document.querySelector('main').insertAdjacentHTML('beforeend', '<p id="blocked" style="color: rgb(1, 2, 3)">blocked</p>'));
  await tab.waitForTimeout(300);
  const control = await tab.evaluate(() => ({ color: getComputedStyle(document.getElementById('blocked')).color, seen: violations.length }));
  check('strict CSP: the policy is on, and a style="" in markup is seen', control.color !== 'rgb(1, 2, 3)' && control.seen >= 1 && refused.length >= 1, JSON.stringify({ ...control, refused: refused.length }));
  await tab.context().close();
}

// ---- dash-utils.css next to the kit (1.7): every rule parses, utilities beat the kit's rules, the kit's modifiers
// keep their meaning, [hidden] and inline styles still win, widths, dark (both ways), hover, focus and print
{
  const page = url.replace('behaviour.html', 'utils.html');
  const at = async (width, { scheme = 'light', theme = null, media = 'screen' } = {}) => {
    const tab = await open({ width });
    await tab.emulateMedia({ colorScheme: scheme, media });
    await tab.goto(page, { waitUntil: 'load' });
    if (theme) await tab.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    return tab;
  };
  const cs = (tab, id, prop) => tab.evaluate(([id, prop]) => getComputedStyle(document.getElementById(id))[prop], [id, prop]);
  const tab = await at(1200);
  const parsed = await tab.evaluate(() => {
    const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith('/dash-utils.css'));
    let rules = 0; const empty = [];
    const walk = (list) => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) { rules++; if (!r.style.length) empty.push(r.selectorText); } } };
    walk(sheet.cssRules);
    return { rules, empty: empty.slice(0, 5) };
  });
  const written = (await readFile(join(kit, 'dash-utils.css'), 'utf8')).split('\n').filter((l) => /\{ .*; \}$/.test(l)).length;
  check('utilities: the browser keeps every rule of dash-utils.css, none of them empty', parsed.rules === written && !parsed.empty.length, JSON.stringify({ ...parsed, written }));
  const k = await tab.evaluate(() => {
    const g = (id) => getComputedStyle(document.getElementById(id));
    return { btn: [g('btn').paddingLeft, g('btn').paddingTop], btnSm: g('btn-sm').paddingLeft, panel: g('panel').paddingTop,
      grid: [g('kit-grid').columnGap, g('kit-grid').gridTemplateColumns.split(' ').length] };
  });
  check('utilities beat the kit\'s own rules: btn px-8, btn sm px-8, panel p-0, the kit\'s grid with gap-2 grid-cols-3',
    k.btn[0] === '32px' && k.btn[1] === '6px' && k.btnSm === '32px' && k.panel === '0px' && k.grid[0] === '8px' && k.grid[1] === 3, JSON.stringify(k));
  const m = await tab.evaluate(() => {
    const g = (id) => getComputedStyle(document.getElementById(id));
    return { btnBlock: [g('btn-block').display, Math.round(document.getElementById('btn-block').getBoundingClientRect().width) === Math.round(document.querySelector('main').getBoundingClientRect().width - parseFloat(getComputedStyle(document.querySelector('main')).paddingLeft) - parseFloat(getComputedStyle(document.querySelector('main')).paddingRight))],
      statsFixed: g('stats-fixed').position, tableSticky: g('table-sticky').position, fixed: g('fixed').position, sticky: g('sticky').position, block: g('block').display };
  });
  check('utilities: block, fixed and sticky keep the kit\'s meaning on .btn, .stats and .table, and work everywhere else',
    m.btnBlock[0] === 'inline-flex' && m.btnBlock[1] && m.statsFixed === 'static' && m.tableSticky === 'static' && m.fixed === 'fixed' && m.sticky === 'sticky' && m.block === 'block', JSON.stringify(m));
  const w = await tab.evaluate(() => {
    const g = (id) => getComputedStyle(document.getElementById(id));
    const kids = [...document.querySelectorAll('#space > li')].map((li) => getComputedStyle(li).marginBottom);
    return { hiddenFlex: g('hidden-flex').display, hiddenMd: g('hidden-md').display, inline: g('inline-style').paddingTop, tint: g('tint').backgroundColor, kids,
      p: [g('order-p').paddingTop, g('order-p').paddingLeft], inset: [g('order-inset').top, g('order-inset').left], overflow: [g('order-overflow').overflowX, g('order-overflow').overflowY] };
  });
  check('utilities: the hidden attribute still hides a flex or md:flex element, and an inline style still wins', w.hiddenFlex === 'none' && w.hiddenMd === 'none' && w.inline === '1px', JSON.stringify(w));
  check('utilities: a shorthand comes before its parts (p-4 px-2, inset-0 top-2, overflow-hidden overflow-x-auto)',
    w.p[0] === '16px' && w.p[1] === '8px' && w.inset[0] === '8px' && w.inset[1] === '0px' && w.overflow[0] === 'auto' && w.overflow[1] === 'hidden', JSON.stringify(w));
  check('utilities: bg-blue/10 is the blue at 10 %, space-y-4 spaces all but the last', /0\.1\)$/.test(w.tint) && w.kids[0] === '16px' && w.kids[1] === '0px', JSON.stringify(w));
  // hover, group-hover and focus-visible
  const before = { bg: await cs(tab, 'btn-sm', 'backgroundColor'), kid: await cs(tab, 'group-kid', 'visibility'), ring: await cs(tab, 'ring', 'boxShadow') };
  await tab.hover('#btn-sm');
  const hovered = await cs(tab, 'btn-sm', 'backgroundColor');
  const blue = await tab.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--blue)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
  await tab.hover('#group');
  const kid = await cs(tab, 'group-kid', 'visibility');
  await tab.focus('#ring');
  const ring = await cs(tab, 'ring', 'boxShadow');
  check('utilities: hover:bg-blue, group-hover:visible and focus-visible:ring-2', before.bg !== blue && hovered === blue && before.kid === 'hidden' && kid === 'visible' && before.ring !== ring && /2px/.test(ring),
    JSON.stringify({ before, hovered, blue, kid, ring }));
  await tab.context().close();
  // widths: sm 641, md 901 (past the kit's own 640 and 900), max-sm up to 640
  const widths = {};
  for (const width of [390, 700, 860, 1000]) {
    const t = await at(width);
    widths[width] = [await cs(t, 'resp', 'display'), await cs(t, 'max-sm', 'display'), await cs(t, 'md-grid', 'display')];
    await t.context().close();
  }
  check('utilities: hidden md:flex and hidden md:grid show from 901 px; max-sm:hidden hides up to 640 px',
    widths[390].join() === 'none,none,none' && widths[700].join() === 'none,block,none' && widths[860].join() === 'none,block,none' && widths[1000].join() === 'flex,block,grid', JSON.stringify(widths));
  // dark: the system setting unless the page is set to light; data-theme="dark" whatever the system says
  const dark = {};
  for (const [name, opts] of Object.entries({ light: {}, system: { scheme: 'dark' }, forcedLight: { scheme: 'dark', theme: 'light' }, forcedDark: { theme: 'dark' } })) {
    const t = await at(1200, opts);
    dark[name] = [await cs(t, 'dark', 'display'), (await cs(t, 'dark-text', 'color')) === (await t.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--blue)'; document.body.append(i); return getComputedStyle(i).color; }))];
    await t.context().close();
  }
  check('utilities: dark: follows the system setting and data-theme both ways',
    dark.light.join() === 'block,false' && dark.system.join() === 'none,true' && dark.forcedLight.join() === 'block,false' && dark.forcedDark.join() === 'none,true', JSON.stringify(dark));
  const pr = await at(1200, { media: 'print' });
  check('utilities: print:hidden', (await cs(pr, 'print', 'display')) === 'none', await cs(pr, 'print', 'display'));
  await pr.context().close();
}

// ---- 1.8 components that need a page (test/components.html): slider values, file drops, the drawer, the bottom nav,
// select arrows, input groups, the stepper on a phone, badges, choices
{
  const page = url.replace('behaviour.html', 'components.html');
  const at = async (width) => { const tab = await open({ width }); await tab.goto(page, { waitUntil: 'load' }); return tab; };
  const tab = await at(1200);
  // slider: the number beside it follows the value
  await tab.evaluate(() => Dash.render('slider-box', Dash.slider({ label: 'Volume', name: 'vol', min: 0, max: 10, value: 4, unit: ' dB' })));
  await tab.focus('#slider-box input');
  await tab.keyboard.press('ArrowRight');
  await tab.keyboard.press('ArrowRight');
  const out = await tab.textContent('#slider-box output');
  check('1.8 slider: the value beside it follows the slider', out === '6 dB', out);
  // drop zone: dropped files go into the input as if chosen (only what accept= allows), and their names show
  const drop = await tab.evaluate(async () => {
    const z = document.getElementById('zone'), input = document.getElementById('files');
    const dt = new DataTransfer();
    for (const [name, type] of [['a.png', 'image/png'], ['notes.txt', 'text/plain'], ['b.csv', 'text/csv']]) dt.items.add(new File(['x'], name, { type }));
    let changed = 0;
    input.addEventListener('change', () => changed++);
    const dragover = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    z.dispatchEvent(dragover);
    const over = z.classList.contains('over') && dragover.defaultPrevented;
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    z.dispatchEvent(ev);
    return { over, after: z.classList.contains('over'), names: [...input.files].map((f) => f.name), changed, shown: z.querySelector('.files').textContent, prevented: ev.defaultPrevented };
  });
  check('1.8 dropzone: a drop fills the input (as accept= allows), fires change, and lists the names',
    drop.over && !drop.after && drop.names.join() === 'a.png,b.csv' && drop.changed === 1 && drop.shown === 'a.png, b.csv' && drop.prevented, JSON.stringify(drop));
  // select arrow, input group, badges, choice
  const look = await tab.evaluate(() => {
    const g = (s, p) => getComputedStyle(document.querySelector(s), p);
    const parts = [...document.querySelectorAll('#group > *')].map((e) => e.getBoundingClientRect());
    document.querySelector('#choice input').click();
    const blue = (() => { const i = document.createElement('i'); i.style.color = 'var(--blue)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; })();
    return { arrow: g('#select', '::after').content, appearance: g('#select select').appearance,
      joined: Math.round(parts[1].left - parts[0].right) === -1 && Math.round(parts[2].left - parts[1].right) === -1,
      radius: [g('#group .affix').borderTopRightRadius, g('#group .input').borderTopLeftRadius, g('#group .input').borderTopRightRadius, g('#group .btn').borderTopLeftRadius, g('#group .btn').borderTopRightRadius],
      badge: [g('#badge', '::after').content, g('#badge', '::after').position], dot: g('#dot', '::after').width, choice: g('#choice').borderTopColor === blue };
  });
  check('1.8 select arrow, joined input group, badges and a chosen choice', look.arrow === '""' && look.appearance === 'none' && look.joined
    && look.radius.join() === '0px,0px,0px,0px,9px' && look.badge.join() === '"3",absolute' && look.dot === '9px' && look.choice, JSON.stringify(look));
  // the drawer at 1200 px is the sidebar: the toggle still makes it a rail
  const press = async (pg, sel) => { try { await pg.click(sel, { timeout: 1500 }); return true; } catch { return false; } }; // false: it couldn't be clicked
  const wideClicks = [await press(tab, '#toggle')];
  const wide = await tab.evaluate(() => ({ rail: document.getElementById('shell').classList.contains('collapsed'), open: document.getElementById('shell').classList.contains('side-open') }));
  wideClicks.push(await press(tab, '#toggle')); // back, for the next pages (the choice is saved)
  check('1.8 offcanvas: wider than 900 px the toggle still collapses the sidebar to a rail', wide.rail && !wide.open && wideClicks.every(Boolean), JSON.stringify({ wide, wideClicks }));
  await tab.context().close();

  const phone = await at(700);
  const state = () => phone.evaluate(() => {
    const s = document.getElementById('shell'), side = document.getElementById('side').getBoundingClientRect();
    return { open: s.classList.contains('side-open'), shown: side.right > 0 && getComputedStyle(document.getElementById('side')).visibility === 'visible', focus: document.activeElement.id,
      inert: document.getElementById('content').inert, topInert: document.querySelector('.topbar').inert, expanded: document.getElementById('toggle').getAttribute('aria-expanded') };
  });
  const first = await state();
  const clicks = [];
  clicks.push(await press(phone, '#toggle'));
  await phone.waitForTimeout(350);
  const opened = await state();
  await phone.keyboard.press('Escape');
  await phone.waitForTimeout(350);
  const escaped = await state();
  clicks.push(await press(phone, '#toggle'));
  await phone.waitForTimeout(350);
  await phone.mouse.click(650, 400); // the backdrop, right of the drawer
  await phone.waitForTimeout(350);
  const outside = await state();
  clicks.push(await press(phone, '#toggle'));
  await phone.waitForTimeout(350);
  clicks.push(await press(phone, '#nav-two'));
  await phone.waitForTimeout(350);
  const linked = await state();
  check('1.8 offcanvas: up to 900 px the toggle opens the sidebar as a drawer (focus in it, the page behind inert); Escape, the backdrop and a link close it',
    !first.open && !first.shown && first.expanded === 'false'
    && opened.open && opened.shown && opened.focus === 'nav-one' && opened.inert && opened.topInert && opened.expanded === 'true'
    && !escaped.open && !escaped.shown && escaped.focus === 'toggle' && !escaped.inert && !escaped.topInert && escaped.expanded === 'false'
    && !outside.open && !linked.open && !linked.inert && clicks.every(Boolean), JSON.stringify({ first, opened, escaped, outside, linked, clicks }));
  const bottomWide = await phone.evaluate(() => getComputedStyle(document.getElementById('bottom')).display);
  await phone.context().close();

  const small = await at(390);
  await small.evaluate(() => Dash.render('stepper-box', Dash.stepper(['Account', 'Plan', 'Pay'], 1)));
  const s = await small.evaluate(() => ({
    labels: [...document.querySelectorAll('#stepper-box li > span')].map((x) => (x.getBoundingClientRect().width <= 1 ? 'clipped' : 'shown')),
    read: [...document.querySelectorAll('#stepper-box li > span')].map((x) => getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility !== 'hidden'),
    bottom: getComputedStyle(document.getElementById('bottom')).display, pad: parseFloat(getComputedStyle(document.body).paddingBottom),
    fab: window.innerHeight - document.getElementById('fab').getBoundingClientRect().bottom,
  }));
  check('1.8 phone: the bottom nav shows only up to 640 px with room under the page, the button sits above it, the stepper shows only the current name (the others still read out)',
    bottomWide === 'none' && s.bottom === 'flex' && s.pad >= 64 && s.fab >= 78 && s.labels.join() === 'clipped,shown,clipped' && s.read.every(Boolean), JSON.stringify({ bottomWide, ...s }));
  await small.context().close();
}

// ---- 1.9 combobox and date picker (test/components.html): keyboard, mouse, ARIA, strict mode, server search, min/max
{
  const page = url.replace('behaviour.html', 'components.html');
  const tab = await open({ width: 1200 });
  await tab.goto(page, { waitUntil: 'load' });
  await tab.evaluate(() => {
    window.picks = [];
    window.cb = Dash.combobox('combo', { options: ['Amsterdam', { label: 'Berlin', sub: 'Germany', value: 'ber' }, 'Bern', 'Brussels', 'Budapest'], onPick: (o) => picks.push(o.value), strict: true });
  });
  const aria = () => tab.evaluate(() => {
    const i = document.getElementById('combo'), list = document.getElementById(i.getAttribute('aria-controls'));
    const act = i.getAttribute('aria-activedescendant');
    return { role: i.getAttribute('role'), expanded: i.getAttribute('aria-expanded'), listRole: list && list.getAttribute('role'), visible: Boolean(list && list.checkVisibility && list.checkVisibility()),
      options: list ? [...list.querySelectorAll('[role="option"]')].map((o) => o.textContent) : [], active: act ? document.getElementById(act).textContent : null,
      selected: list ? [...list.querySelectorAll('[aria-selected="true"]')].length : 0, focus: document.activeElement.id, value: i.value };
  });
  await tab.focus('#combo');
  await tab.keyboard.type('u');
  const typed = await aria();
  await tab.keyboard.press('ArrowDown');
  await tab.keyboard.press('ArrowDown');
  const moved = await aria();
  await tab.keyboard.press('Enter');
  const picked = await aria();
  check('1.9 combobox: typing opens matching suggestions; arrows move (aria-activedescendant); Enter picks and closes',
    typed.role === 'combobox' && typed.expanded === 'true' && typed.listRole === 'listbox' && typed.visible && typed.options.join() === 'Brussels,Budapest' && typed.active === null
    && moved.active === 'Budapest' && moved.selected === 1 && picked.expanded === 'false' && !picked.visible && picked.value === 'Budapest' && picked.focus === 'combo',
    JSON.stringify({ typed, moved, picked }));
  await tab.fill('#combo', '');
  await tab.keyboard.type('ber');
  const sub = await aria();
  await tab.click(`#${await tab.getAttribute('#combo', 'aria-controls')} [role="option"]:first-child`); // a click picks, and the box keeps the focus
  const clicked = await aria();
  await tab.keyboard.type('x');
  await tab.keyboard.press('Escape');
  const escaped = await aria();
  await tab.focus('#behind'); // strict: leaving with text that matches nothing puts the pick back
  await tab.waitForTimeout(30); // the blur is handled a moment later, so a click in the list counts as staying
  const left = await aria();
  check('1.9 combobox: a click picks (focus stays), Escape closes only the list, strict puts the last pick back on leaving',
    sub.options[0] === 'BerlinGermany' && clicked.value === 'Berlin' && clicked.focus === 'combo' && escaped.expanded === 'false' && escaped.value === 'Berlinx'
    && left.value === 'Berlin' && JSON.stringify(await tab.evaluate(() => picks)) === '["Budapest","ber"]', JSON.stringify({ sub, clicked, escaped, left }));
  // 1.9.1: an emptied strict box stays empty; typing over a pick forgets it (strict or not)
  await tab.fill('#combo', '');
  await tab.focus('#behind');
  await tab.waitForTimeout(30);
  const emptied = { text: await tab.inputValue('#combo'), value: await tab.evaluate(() => cb.value) };
  const typedOver = await tab.evaluate(() => {
    const i = document.createElement('input'); i.className = 'input'; i.id = 'loose'; i.setAttribute('aria-label', 'loose'); document.querySelector('main').append(i);
    const c = Dash.combobox(i, { options: ['Oslo', 'Ostrava'] });
    c.set('Oslo');
    const before = c.value && c.value.label;
    i.value = 'Paris'; i.dispatchEvent(new Event('input'));
    const after = c.value;
    c.close();
    return { before, after };
  });
  check('1.9.1 combobox: an emptied strict box stays empty with no pick; typing over a pick forgets it',
    emptied.text === '' && emptied.value === null && typedOver.before === 'Oslo' && typedOver.after === null, JSON.stringify({ emptied, typedOver }));
  // a server search: answers that come back late, for a query typed over, are dropped
  const late = await tab.evaluate(async () => {
    const i = document.createElement('input'); i.className = 'input'; i.id = 'remote'; i.setAttribute('aria-label', 'remote'); document.querySelector('main').append(i);
    const asked = [];
    Dash.combobox(i, { debounce: 10, options: (q) => { asked.push(q); return new Promise((ok) => setTimeout(() => ok([`${q} one`, `${q} two`]), q === 'a' ? 200 : 20)); } });
    i.focus();
    i.value = 'a'; i.dispatchEvent(new Event('input'));
    await new Promise((ok) => setTimeout(ok, 40));
    i.value = 'ab'; i.dispatchEvent(new Event('input'));
    await new Promise((ok) => setTimeout(ok, 400));
    const list = document.getElementById(i.getAttribute('aria-controls'));
    return { asked, options: [...list.querySelectorAll('[role="option"]')].map((o) => o.textContent) };
  });
  check('1.9 combobox: with a function, suggestions come from it, and a late answer for older text is dropped', late.asked.join() === 'a,ab' && late.options.join() === 'ab one,ab two', JSON.stringify(late));
  // in a dialog: the first Escape closes the suggestions only, the next one the dialog
  await tab.evaluate(() => { Dash.modal({ title: 'Pick a city', body: '<input class="input" id="dlg-combo" aria-label="City">', cancel: 'Close' }); Dash.combobox('dlg-combo', { options: ['Oslo', 'Ostrava'] }); });
  await tab.focus('#dlg-combo');
  await tab.keyboard.type('os');
  const listShown = () => tab.evaluate(() => document.getElementById(document.getElementById('dlg-combo')?.getAttribute('aria-controls'))?.checkVisibility() || false);
  const listOpen = await listShown();
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(150);
  const afterOne = { list: await listShown(), dialog: await tab.evaluate(() => Boolean(document.querySelector('dialog[open]'))), focus: await tab.evaluate(() => document.activeElement.id) };
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(150);
  const afterTwo = await tab.evaluate(() => Boolean(document.querySelector('dialog[open]')));
  check('1.9 combobox: in a dialog, Escape closes only the list; the next Escape closes the dialog',
    listOpen && !afterOne.list && afterOne.dialog && afterOne.focus === 'dlg-combo' && !afterTwo, JSON.stringify({ listOpen, afterOne, afterTwo }));
  if (afterTwo) await tab.evaluate(() => document.querySelector('dialog[open]').close());

  // date picker
  await tab.evaluate(() => { window.days = []; window.dp = Dash.datepicker('when', { min: '2026-11-05', max: '2026-12-20', onPick: (d) => days.push(d) }); });
  await tab.fill('#when', '2026-11-18');
  await tab.click('#when + .date-btn');
  const cal = () => tab.evaluate(() => {
    const p = [...document.querySelectorAll('.popup.calendar')].find((x) => x.checkVisibility()); // a closed one is hidden at once, removed a moment later
    const f = document.activeElement;
    return { open: Boolean(p), title: p && p.querySelector('.cal-title').textContent, focus: f && f.dataset ? f.dataset.date || f.getAttribute('aria-label') : null,
      selected: p && p.querySelector('[aria-selected="true"] button')?.dataset.date, disabled: p ? p.querySelectorAll('[aria-disabled="true"]').length : 0,
      cols: p ? p.querySelectorAll('thead th').length : 0, next: Boolean(p && p.querySelector('[data-cal="1"]').disabled), value: document.getElementById('when').value };
  });
  const opened = await cal();
  await tab.keyboard.press('ArrowRight');
  await tab.keyboard.press('ArrowDown');
  const keyed = await cal();
  await tab.keyboard.press('PageDown'); // December 26: after max, so it can be focused but not picked
  await tab.keyboard.press('Enter');
  const past = await cal();
  await tab.keyboard.press('Home'); // the week's Monday, December 21
  await tab.keyboard.press('ArrowLeft');
  await tab.keyboard.press('Enter');
  const chose = await cal();
  check('1.9 datepicker: opens on the box\'s date; arrows, PageDown and Home move; days outside min/max are marked and not picked; Enter picks, closes and gives the focus back',
    opened.open && opened.title === 'November 2026' && opened.focus === '2026-11-18' && opened.selected === '2026-11-18' && opened.cols === 7 && opened.disabled === 4 && !opened.next
    && keyed.focus === '2026-11-26' && past.open && past.title === 'December 2026' && past.focus === '2026-12-26' && past.disabled === 11 && past.next
    && !chose.open && chose.value === '2026-12-20' && chose.focus === 'Choose a date' && JSON.stringify(await tab.evaluate(() => days)) === '["2026-12-20"]',
    JSON.stringify({ opened, keyed, past, chose }));
  await tab.fill('#when', '2026-11-31'); // in range, but November has 30 days
  await tab.focus('#behind');
  const invalid = await tab.getAttribute('#when', 'aria-invalid');
  await tab.fill('#when', '2026-12-1');
  await tab.focus('#behind');
  const fixed = [await tab.inputValue('#when'), await tab.getAttribute('#when', 'aria-invalid')];
  await tab.click('#when + .date-btn');
  await tab.keyboard.press('Escape');
  const esc = await cal();
  check('1.9 datepicker: a typed day that doesn\'t exist is aria-invalid, a short one is written out, Escape closes',
    invalid === 'true' && fixed[0] === '2026-12-01' && fixed[1] === null && !esc.open && esc.focus === 'Choose a date', JSON.stringify({ invalid, fixed, esc }));
  await tab.context().close();
}

// ---- the docs site (docs/): the search finds a name and goes there; an example's phone and theme previews run the kit
{
  const tab = await open({ width: 1200 });
  await tab.goto(url.replace('test/behaviour.html', 'docs/index.html'), { waitUntil: 'load' });
  await tab.keyboard.press('/');
  const focused = await tab.evaluate(() => document.activeElement.id);
  await tab.keyboard.type('datepicker');
  const shown = await tab.evaluate(() => [...document.querySelectorAll('.combo-list [role="option"]')].map((o) => o.textContent));
  await tab.keyboard.press('ArrowDown');
  await Promise.all([tab.waitForNavigation({ timeout: 3000 }).catch(() => null), tab.keyboard.press('Enter')]);
  const went = new URL(tab.url());
  check('docs: "/" focuses the search, it finds a name, and Enter goes to its section',
    focused === 'docs-search' && shown.some((t) => t.startsWith('Dash.datepicker')) && went.pathname.endsWith('/docs/forms.html') && went.hash === '#datepicker',
    JSON.stringify({ focused, shown: shown.slice(0, 4), went: went.pathname + went.hash }));

  await tab.goto(url.replace('test/behaviour.html', 'docs/buttons.html'), { waitUntil: 'load' });
  const look = async (how) => {
    await tab.click(`.example >> nth=0 >> [data-preview="${how}"]`);
    const frame = await tab.waitForSelector('dialog[open] iframe.preview-frame', { timeout: 3000 }).catch(() => null);
    if (!frame) return { opened: false };
    const inner = await (await frame.contentFrame()).waitForFunction(() => window.Dash && document.querySelector('.btn') && document.readyState === 'complete', null, { timeout: 3000 })
      .then(async () => (await frame.contentFrame()).evaluate(() => ({ width: innerWidth, kit: Dash.version, dark: getComputedStyle(document.body).backgroundColor, buttons: document.querySelectorAll('.btn').length })))
      .catch((e) => ({ error: String(e.message).split('\n')[0] }));
    const outer = await tab.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await tab.keyboard.press('Escape');
    await tab.waitForTimeout(100);
    return { opened: true, ...inner, outer, closed: await tab.evaluate(() => !document.querySelector('dialog[open]')) };
  };
  const phone = await look('phone');
  const other = await look('theme');
  check('docs: an example\'s Phone preview runs the kit at phone width, Other theme in the other theme; Escape closes them',
    phone.opened && phone.kit === (await tab.evaluate(() => Dash.version)) && phone.width <= 400 && phone.buttons > 0 && phone.closed
    && other.opened && other.buttons > 0 && other.dark !== other.outer && other.closed, JSON.stringify({ phone, other }));
  await tab.context().close();
}

await browser.close();
server.close();
for (const e of errors) results.push({ name: 'page error', ok: false, detail: e });
const failed = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`${results.length - failed.length}/${results.length} behaviour checks passed`);
process.exit(failed.length ? 1 : 0);
