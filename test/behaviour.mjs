// What a node test can't see, checked in a real browser: Dash.render keeping focus, typing, open details,
// scroll and a selection; the poll's live status; the chart readout; copy buttons across a re-render; the
// sidebar event; the search count; saved choices in Dash.seg; the static-md top bar and phone stat tiles;
// and from 1.3 Dash.table, tabs, menus, tooltips, dialogs, Dash.search and Dash.key, live times and stacked columns.
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
// a check that throws (a click that times out, say) still ends in a FAIL line and exit code 1
process.on('uncaughtException', (e) => {
  console.log(`FAIL crashed: ${String(e && e.message).split("\n")[0]}`);
  if (process.env.VERBOSE) console.log(e && e.stack);
  process.exit(1);
});
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const errors = [];
const open = async ({ width = 1200, init, clock = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  if (init) await ctx.addInitScript(init);
  const tab = await ctx.newPage();
  tab.setDefaultTimeout(5000);
  tab.on('pageerror', (e) => errors.push(e.message));
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
