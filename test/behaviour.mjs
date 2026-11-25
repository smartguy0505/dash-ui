// What a node test can't see, checked in a real browser: Dash.render keeping focus, typing, open details,
// scroll and a selection; the poll's live status; the chart readout; copy buttons across a re-render; the
// sidebar event; the search count; saved choices in Dash.seg; the static-md top bar and phone stat tiles;
// and from 1.3 Dash.table, tabs, menus, tooltips, dialogs, Dash.search and Dash.key, live times and stacked columns;
// from 1.4 modals, popups (with and without the browser's popovers), menus, and what shows above an open dialog;
// from 1.4.1 lanes (events inside their lane, their pointer target, axis labels on a phone) and lanes and the
// timeline in high contrast (forced colours); from 1.5 Dash.lanes under a strict style-src policy (test/csp.html); from 1.6 every sizing builder there with
// Dash.config.csp, drawn as without the policy, in markup the page or the kit puts in; from 1.7 dash-utils.css next to
// the kit (test/utils.html); from 1.8 the new pieces that need a page (test/components.html): sliders, drops, the
// drawer, the bottom nav, input groups, the stepper on a phone, badges and choices; from 1.9.2 what shows in high contrast
// (test/contrast.html), narrow pages, targets and times to come; from 1.10 values the reader hides (test/private.html);
// from 1.11 line charts (test/lines.html); from 1.12 table rows to pick and to open (test/rows.html); from 1.13 forms that
// say what is wrong (test/forms.html); from 1.14 trees, lists, the sidebar (test/lists.html) and the docs' own; from 1.15
// more fields (test/fields.html); from 1.16 dashboard tools (test/tools.html).
//
//   npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
//   node test/behaviour.mjs          (KIT=<dir> serves dash.css, dash.js and dash-utils.css from <dir> instead: to check a change)
//
// It serves this folder itself on 127.0.0.1 (a free port), using test/behaviour.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

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
    const csp = ['/test/csp.html', '/test/csp-forms.html', '/test/csp-lists.html', '/test/csp-fields.html', '/test/csp-tools.html'].includes(path) ? { 'Content-Security-Policy': "style-src 'self'" } : {};
    const body = await readFile(join(base, path)); // first: a missing file is a 404
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', ...csp }).end(body);
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
  // typed with real keys, drawn again after each with what was typed as its value: an email or a number box has no caret
  // to read and put back
  for (const [type, text] of [['email', 'ab@example.com'], ['number', '1234'], ['text', 'hello']]) {
    await tab.evaluate((t) => { getSelection().removeAllRanges(); window.drawBox = () => Dash.render('box', `<p>${Math.random()}</p><input id="typed" type="${t}" value="${document.getElementById('typed')?.value ?? ''}">`); document.getElementById('typed')?.remove(); drawBox(); document.getElementById('typed').focus(); }, type);
    for (const k of text) { await tab.keyboard.type(k); await tab.evaluate(() => drawBox()); }
    const got = await tab.evaluate(() => document.getElementById('typed').value);
    check(`render: typing on in a box of type ${type}`, got === text, got);
  }
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
    focused === 'docs-search' && shown.some((t) => t.startsWith('Dash.datepicker')) && went.pathname.endsWith('/docs/fields.html') && went.hash === '#datepicker',
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

// ---- 1.9.2 high contrast (test/contrast.html): states, amounts and tones that were only a background still show.
// Pixels, not computed styles: those don't say what forced colours do. One picture per mode, its pairs compared in it.
{
  // a PNG from the browser (8-bit RGB or RGBA) as { width, row(y, x0, x1) }
  const decode = (png) => {
    let at = 8, width = 0, height = 0, bytes = 4;
    const parts = [];
    while (at < png.length) {
      const n = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + n);
      if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bytes = data[9] === 6 ? 4 : 3; }
      if (type === 'IDAT') parts.push(data);
      at += 12 + n;
    }
    const raw = inflateSync(Buffer.concat(parts)), line = width * bytes, px = Buffer.alloc(height * line);
    for (let y = 0, r = 0; y < height; y++) {
      const filter = raw[r++];
      for (let x = 0; x < line; x++) {
        const a = x >= bytes ? px[y * line + x - bytes] : 0, b = y ? px[(y - 1) * line + x] : 0, c = x >= bytes && y ? px[(y - 1) * line + x - bytes] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        px[y * line + x] = raw[r++] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      }
    }
    return { width, height, row: (y, x0, x1) => px.subarray(y * line + x0 * bytes, y * line + x1 * bytes) };
  };
  const page = url.replace('behaviour.html', 'contrast.html');
  const looks = {};
  for (const forcedColors of ['none', 'active']) for (const colorScheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 900 }, colorScheme, forcedColors, reducedMotion: 'reduce' });
    const tab = await ctx.newPage(); // a fresh one each: only the first page a tab loads gets the real forced colours
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(page, { waitUntil: 'load' });
    await tab.waitForTimeout(150);
    const real = await tab.evaluate(() => { const probe = document.createElement('i'); probe.style.backgroundColor = 'Canvas'; document.body.append(probe); const c = getComputedStyle(probe).backgroundColor; probe.remove(); return getComputedStyle(document.body).backgroundColor === c; });
    const pairs = await tab.$$eval('.pair', (l) => l.map((e) => ({ name: e.dataset.name, sides: ['.a', '.b'].map((s) => { const q = e.querySelector(s).getBoundingClientRect(); return [q.left + scrollX, q.top + scrollY, q.width, q.height].map(Math.round); }) })));
    const img = decode(await tab.screenshot({ fullPage: true, animations: 'disabled' }));
    for (const { name, sides: [a, b] } of pairs) {
      let differ = false;
      for (let y = 0; y < a[3] && !differ; y++) differ = !img.row(a[1] + y, a[0], a[0] + a[2]).equals(img.row(b[1] + y, b[0], b[0] + b[2]));
      (looks[name] ||= {})[`${forcedColors} ${colorScheme}`] = differ;
    }
    if (forcedColors === 'active') {
      check(`forced colours are on (${colorScheme})`, real);
      await tab.focus('[data-name="text box: wrong"] .b input');
      const ring = await tab.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle === 'solid' && parseFloat(s.outlineWidth) >= 2; });
      check(`forced colours: a focused text box has a ring (${colorScheme})`, ring);
      // the pairs only say that two looks differ, if by a shade: what must be plain has a line in the system's own colours
      const plain = await tab.evaluate(() => {
        const sys = (name) => { const i = document.createElement('i'); i.style.color = name; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
        const bad = [];
        const line = (sel, pseudo, colour = 'CanvasText') => {
          const e = document.querySelector('#pairs ' + sel), s = e && getComputedStyle(e, pseudo);
          if (!s || s.outlineStyle !== 'solid' || parseFloat(s.outlineWidth) < 1 || s.outlineColor !== sys(colour)) bad.push(sel);
        };
        for (const sel of ['.bar', '.meter', '.split', '.progress', '.chart-col:not(.zero) i', '.legend-item:not(.line-chart .legend-item) > i', '.dot', '.banner .badge', '.pill', '.callout', '.toast', '.ring', '.switch input:not(:checked, :disabled) + .track']) line(sel);
        line('.skel', null, 'GrayText');
        for (const sel of ['.line-svg path', '.line-dot', '.line-ref', '.line-val > i']) if (getComputedStyle(document.querySelector('#pairs ' + sel)).forcedColorAdjust !== 'none') bad.push(sel + ' (its colour)');
        line('.stepper > li[aria-current="step"]', '::before');
        const on = document.querySelector('#pairs .switch input:checked:not(:disabled) + .track');
        if (!on || getComputedStyle(on).backgroundColor !== sys('Highlight')) bad.push('a switch that is on');
        return bad;
      });
      check(`forced colours: a line around what shows data, and the highlight on a switch (${colorScheme})`, !plain.length, plain.join(', '));
    }
    await ctx.close();
  }
  check('high contrast: every pair was looked at', Object.keys(looks).length >= 37, Object.keys(looks).length);
  for (const [name, seen] of Object.entries(looks)) {
    check(`high contrast: ${name}`, Object.values(seen).every(Boolean), Object.entries(seen).filter(([, v]) => !v).map(([k]) => k).join(', '));
  }
}

// ---- 1.9.2 targets and narrow pages
{
  const tab = await open({ width: 320 });
  await tab.evaluate(() => {
    document.body.innerHTML = `<div class="topbar"><div class="top-right"><button class="top-link" id="tl" type="button">Sign out</button></div></div>
      <main class="page"><nav class="chips" id="chips"><a class="chip" href="#">A chip whose label is far longer than the whole row it stands in</a><a class="chip" href="#">Short one</a></nav>
      <div class="panel"><div class="vstack" id="vs"><div class="row"><span class="topstat"><b>Session storage</b> <span class="meter"><i></i></span> <span class="v">42%</span> <span class="muted">resets at 19:00 today</span></span></div><div id="sib">${Dash.bar(0.5)}</div></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th><button type="button" id="th" data-sort="a">Name</button></th><th aria-sort="descending"><button type="button" data-sort="b">Value</button></th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table></div></main>`;
  });
  const narrow = await tab.evaluate(() => {
    const at = (x, y) => document.elementFromPoint(x, y);
    const th = document.getElementById('th').getBoundingClientRect(), tl = document.getElementById('tl').getBoundingClientRect();
    const reach = (r, id) => ['top', 'bottom'].map((side) => at(r.left + r.width / 2, side === 'top' ? r.top - 5 : r.bottom + 5)?.id === id).every(Boolean);
    const one = document.querySelectorAll('#chips .chip');
    return { over: document.documentElement.scrollWidth - innerWidth, th: reach(th, 'th'), tl: reach(tl, 'tl'), tall: one[0].offsetHeight > one[1].offsetHeight * 1.5,
      sib: document.getElementById('sib').getBoundingClientRect().right <= document.getElementById('vs').getBoundingClientRect().right + 0.5, arrow: getComputedStyle(document.querySelector('[aria-sort] button'), '::after').content };
  });
  const wide = await tab.evaluate(() => {
    document.body.innerHTML = '<main class="page"><div class="vstack" id="vs"><div style="white-space:nowrap">A line that may not wrap, and is far wider than the narrow page it is on</div><div id="sib">Its neighbour</div></div></main>';
    return document.getElementById('sib').getBoundingClientRect().right - document.getElementById('vs').getBoundingClientRect().right;
  });
  check('320 px: one wide child doesn\'t widen the rest of a stack', wide <= 0.5, wide);
  check('320 px: a long chip wraps inside itself and a wide row doesn\'t widen its neighbours or the page', narrow.over <= 0 && narrow.tall && narrow.sib, JSON.stringify(narrow));
  check('a column heading and a top link can be pressed a little outside their text, and the sort arrow stays', narrow.th && narrow.tl && narrow.arrow.includes('▼'), JSON.stringify(narrow));
  const near = await tab.evaluate(() => {
    const now = Date.now();
    document.body.innerHTML = Dash.timeline([{ title: 'Later', time: now + 3 * 3600e3 + 5 * 60e3 + 500 }, { title: 'A clock ahead', time: now + 30e3 }, { title: 'Before', time: now - 12 * 60e3 }, { title: 'Words', time: 'Tomorrow' }]);
    return [...document.querySelectorAll('.timeline-time')].map((e) => e.textContent);
  });
  check('timeline: a time to come reads "in 3h 5m"; half a minute ahead is now, not the future', near[0].startsWith('in 3h') && near[1] === 'just now' && near[2] === '12 min ago' && near[3] === 'Tomorrow', JSON.stringify(near));
  await tab.context().close();
}
{
  // a time to come passes while the page is open
  const tab = await open({ clock: true });
  const at = (f) => tab.evaluate(f);
  await at(() => { document.body.innerHTML = Dash.timeline([{ title: 'Soon', time: Date.now() + 5 * 60e3 }]); });
  const before = await at(() => document.querySelector('.timeline-time').textContent);
  await tab.clock.runFor(7 * 60e3);
  const after = await at(() => document.querySelector('.timeline-time').textContent);
  check('timeline: "in 5m" becomes "2 min ago" by itself', before.startsWith('in ') && after === '2 min ago', `${before} → ${after}`);
  await tab.context().close();
}

// ---- 1.10 values the reader can hide (test/private.html)
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const openPrivate = async () => { const t = await ctx.newPage(); t.on('pageerror', (e) => errors.push(e.message)); await t.goto(url.replace('behaviour.html', 'private.html'), { waitUntil: 'load' }); return t; };
  const tab = await openPrivate();
  const at = (f, a) => tab.evaluate(f, a);
  const eye = () => at(() => { const b = document.getElementById('eye'), w = document.getElementById('words'); return { label: b.getAttribute('aria-label'), title: b.title, pressed: b.getAttribute('aria-pressed'), svg: b.querySelectorAll('svg').length, slash: b.querySelectorAll('path').length === 2, words: w.textContent, wordsPressed: w.getAttribute('aria-pressed') }; });
  const before = await eye();
  check('1.10 hidden values: shown to begin with, and the eye says what it does', await at(() => left()) && before.label === 'Hide balances' && before.title === before.label && before.pressed === null && before.svg === 1 && before.slash, JSON.stringify(before));
  check('1.10 hidden values: a button with its own words keeps them', before.words === 'Private mode' && before.wordsPressed === 'false', JSON.stringify(before));

  // a refresh that waits for the selection, with a newer value in it, then hiding
  await at(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('total')); getSelection().removeAllRanges(); getSelection().addRange(r); big = 911817391.5; sum(); });
  const held = await at(() => document.getElementById('total').textContent);
  await at(() => Dash.privacy.set(true));
  await tab.waitForTimeout(100);
  const heldAfter = await at(() => ({ left: left(), total: document.getElementById('total').textContent }));
  check('1.10 hidden values: a refresh that was waiting for a selection doesn\'t bring one back', held.includes('247,823') && !heldAfter.left && heldAfter.total === '000.00hidden', JSON.stringify([held, heldAfter]));
  await at(() => { big = 247823.7391; Dash.privacy.set(false); });
  // hidden while the reader has text selected in a part that Dash.render draws, and in the table
  await at(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('total')); getSelection().removeAllRanges(); getSelection().addRange(r); window.n0 = drawn; });
  await at(() => Dash.privacy.toggle());
  const hid = await at(() => ({ left: left(), n: drawn - n0, stored: localStorage.getItem('dash.private'), sel: String(getSelection()), total: document.getElementById('total').innerHTML, title: document.getElementById('total').title, chg: document.getElementById('chg').textContent, none: document.getElementById('none').innerHTML }));
  check('1.10 hidden values: none is left in the page, even with one selected', !hid.left && hid.sel === '' && hid.n === 1, JSON.stringify(hid));
  check('1.10 hidden values: a stand-in, and words for a screen reader', /^<span class="private" aria-hidden="true">000\.00<\/span><span class="sr-only">hidden<\/span>$/.test(hid.total) && hid.title === 'hidden' && hid.chg === '00change hidden' && hid.none === '—', JSON.stringify(hid));
  const after = await eye();
  check('1.10 hidden values: the eye then says "Show balances"', after.label === 'Show balances' && after.title === after.label && !after.slash && after.wordsPressed === 'true', JSON.stringify(after));
  const look = await at(() => { const s = getComputedStyle(document.querySelector('.private')); return { filter: s.filter, select: s.userSelect }; });
  check('1.10 hidden values: the stand-in is blurred and can\'t be selected', look.filter.startsWith('blur') && look.select === 'none', JSON.stringify(look));

  // the table
  const cells = () => at(() => [...document.querySelectorAll('#table tbody tr')].map((r) => [...r.cells].map((c) => c.textContent)));
  const masked = await cells();
  check('1.10 hidden values: a table\'s private columns, in the same order, with nothing to hide left as it is', JSON.stringify(masked) === JSON.stringify([['Savings', '000.00hidden', 'Somebodyhidden'], ['Main', '000.00hidden', 'Somebodyhidden'], ['Empty', '—', '']]), JSON.stringify(masked));
  check('1.10 hidden values: the table\'s CSV still holds them', (await at(() => table.csv())).includes('173912'), '');
  await at(() => Dash.privacy.set(false));
  await at(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#table tbody td:nth-child(2)')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await tab.click('#eye');
  check('1.10 hidden values: a press on the eye hides them, in a table with one selected too', !(await at(() => left())) && (await at(() => document.activeElement.id)) === 'eye', '');

  // remembered, and the mark is there before the page draws
  await tab.reload({ waitUntil: 'load' });
  check('1.10 hidden values: still hidden after a reload, from the first paint', !(await at(() => left())) && (await at(() => early)) === 'hidden', await at(() => early));
  check('1.10 hidden values: the eye is right after a reload', (await eye()).label === 'Show balances', '');

  // text boxes
  const dots = (id) => at((i) => getComputedStyle(document.getElementById(i)).webkitTextSecurity === 'disc', id);
  check('1.10 hidden values: text boxes show dots', await dots('acct') && await dots('note'), '');
  await tab.focus('#table th:last-child button');
  await tab.keyboard.press('Tab');
  check('1.10 hidden values: Tab into a box keeps its dots', (await at(() => document.activeElement.id)) === 'acct' && await dots('acct'), '');
  await tab.keyboard.press('End');
  await tab.keyboard.type('9');
  check('1.10 hidden values: typing shows what is typed', !(await dots('acct')), '');
  await tab.keyboard.press('Tab');
  check('1.10 hidden values: leaving a box hides it again', await dots('acct') && await dots('note'), '');
  await tab.click('#note');
  check('1.10 hidden values: a click in a box shows it', !(await dots('note')), '');
  await at(() => { Dash.privacy.set(true); });
  check('1.10 hidden values: hiding again hides a box the reader is in', await dots('note'), '');
  await tab.click('#other');
  await at(() => { const i = document.getElementById('acct'); i.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); });
  check('1.10 hidden values: a finger that starts a scroll on a box doesn\'t show it', await dots('acct'), '');
  await at(() => document.getElementById('acct').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  check('1.10 hidden values: its tap does', !(await dots('acct')), '');
  await at(() => { const i = document.getElementById('acct'); i.focus(); i.blur(); i.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); });
  check('1.10 hidden values: the mouse shows one as it goes down, so the caret lands where the text is', !(await dots('acct')), '');
  await at(() => { const i = document.getElementById('acct'); i.focus(); i.blur(); });
  await at(() => { const i = document.getElementById('acct'), v = i.value; i.value = ''; window.empty = getComputedStyle(i).webkitTextSecurity; i.value = v; });
  check('1.10 hidden values: a placeholder is left readable', (await at(() => empty)) === 'none', await at(() => empty));
  await at(() => { const i = document.getElementById('acct'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  check('1.10 hidden values: a box the browser fills in while the reader is elsewhere stays hidden', await dots('acct'), '');
  await at(() => document.getElementById('dlg').showModal());
  await tab.click('#in-dlg');
  const inDlg = await dots('in-dlg');
  await at(() => new Promise((ok) => { const d = document.getElementById('dlg'); d.addEventListener('close', () => setTimeout(ok), { once: true }); d.close(); })); // (its event comes with the next frame)
  await at(() => document.getElementById('dlg').showModal());
  await at(() => document.activeElement.blur());
  check('1.10 hidden values: a dialog that closes hides its boxes again', !inDlg && await dots('in-dlg'), '');
  await at(() => document.getElementById('in-dlg').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })));
  const inDlg2 = await dots('in-dlg');
  await at(() => new Promise((ok) => { const d = document.getElementById('dlg'); d.addEventListener('close', () => setTimeout(ok), { once: true }); d.close(); d.showModal(); }));
  check('1.10 hidden values: one that closes without its box losing the focus too', !inDlg2 && await dots('in-dlg'), '');
  await at(() => document.getElementById('dlg').close());

  // another tab
  const other = await openPrivate();
  await other.evaluate(() => Dash.privacy.set(false));
  await tab.waitForFunction(() => !Dash.privacy.on, null, { timeout: 4000 }).catch(() => {});
  check('1.10 hidden values: another tab\'s choice is followed, and the page is drawn again', await at(() => left()) && (await eye()).label === 'Hide balances', '');
  await other.evaluate(() => Dash.privacy.set(true));
  await tab.waitForFunction(() => Dash.privacy.on, null, { timeout: 4000 }).catch(() => {});
  check('1.10 hidden values: and its hiding too', !(await at(() => left())), '');
  await other.evaluate(() => { localStorage.removeItem('dash.private'); localStorage.clear(); });
  await tab.waitForTimeout(300);
  check('1.10 hidden values: cleared storage doesn\'t show them', !(await at(() => left())), '');
  await other.close();
  // a page the browser kept for the back button, while the choice changed elsewhere
  await at(() => { Dash.privacy.set(false); localStorage.setItem('dash.private', 'true'); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  check('1.10 hidden values: a page brought back by the back button reads the choice again', !(await at(() => left())) && (await at(() => Dash.privacy.on)), '');

  // one part's mistake, and a listener that stops
  const safe = await at(async () => {
    Dash.privacy.set(false);
    const seen = [];
    const caught = [];
    addEventListener('error', (e) => { caught.push(e.message); e.preventDefault(); });
    const stop1 = Dash.privacy.onChange(() => { throw new Error('a part that breaks'); });
    const stop2 = Dash.privacy.onChange((on) => seen.push(on));
    try { Dash.privacy.set(true); } catch { caught.push('thrown to the caller', 'x'); }
    Dash.privacy.set(true);
    stop1(); stop2();
    Dash.privacy.set(false); Dash.privacy.set(true);
    await new Promise((ok) => setTimeout(ok, 50));
    return { seen, caught: caught.length, left: left() };
  });
  check('1.10 hidden values: a part that breaks doesn\'t keep another showing; a stopped one isn\'t told', JSON.stringify(safe.seen) === '[true]' && safe.caught === 1 && !safe.left, JSON.stringify(safe));
  const i = errors.findIndex((e) => e.includes('a part that breaks'));
  if (i >= 0) errors.splice(i, 1);
  // a tip that was open goes away
  await at(() => { Dash.privacy.set(false); const b = document.getElementById('other'); b.dataset.tooltip = 'total 7391'; });
  await tab.hover('#other');
  await tab.waitForTimeout(400);
  const tip = await at(() => [...document.querySelectorAll('.tooltip')].some((t) => t.checkVisibility() && t.textContent.includes('7391')));
  await at(() => Dash.privacy.set(true));
  await tab.waitForTimeout(300);
  const tipAfter = await at(() => [...document.querySelectorAll('.tooltip')].some((t) => t.checkVisibility() || t.textContent.includes('7391')));
  check('1.10 hidden values: an open tip goes away, and its words with it', tip && !tipAfter, `${tip} ${tipAfter}`);
  // a big number's blur isn't cut off; a table made again in the same place
  const clip = await at(() => {
    document.getElementById('sum').innerHTML = `<div class="stat"><div class="value">${Dash.mask('$1')}</div></div>`;
    const value = getComputedStyle(document.querySelector('#sum .value')).overflow;
    Dash.table('table', { columns: [{ key: 'n', label: 'Number' }], rows: [{ n: 5 }] });
    Dash.privacy.set(false);
    return { value, table: document.querySelector('#table tbody').textContent };
  });
  check('1.10 hidden values: a stat\'s blur isn\'t cut off at its edge', clip.value === 'visible', clip.value);
  check('1.10 hidden values: a table made again in its place isn\'t drawn over by the old one', clip.table === '5', clip.table);
  await ctx.close();
}

// ---- 1.11 Dash.lines (test/lines.html): in one time zone, at one moment
{
  const openLines = async ({ width = 1100, height = 2000, zone = 'Europe/Riga', page = 'lines.html' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: zone, locale: 'en-US' });
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.clock.install({ time: new Date('2026-11-24T12:00:00Z') });
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openLines();
  const at = (f, a) => tab.evaluate(f, a);
  const texts = (sel) => at((s) => [...document.querySelectorAll(s)].map((e) => e.textContent), sel);
  const box = (sel) => tab.locator(sel).first().boundingBox();
  check('1.11 lines: round numbers on one axis, from zero', JSON.stringify(await texts('#two .chart-grid span')) === JSON.stringify(['0 ms', '50 ms', '100 ms', '150 ms', '200 ms']), JSON.stringify(await texts('#two .chart-grid span')));
  check('1.11 lines: round local times, midnight as its date', JSON.stringify(await texts('#two .line-x span')) === JSON.stringify(['18:00', 'Nov 24', '06:00', '12:00']), JSON.stringify(await texts('#two .line-x span')));
  check('1.11 lines: the legend has the latest values, in the order given', JSON.stringify(await texts('#four .legend-item')) === JSON.stringify(['North 56', 'South 93', 'East 136', 'West 164']), JSON.stringify(await texts('#four .legend-item')));
  const names = await at(() => [...document.querySelectorAll('#four .line-ends span')].map((s) => { const q = s.getBoundingClientRect(), d = [...document.querySelectorAll('#four .line-dot:not(.on)')].map((x) => x.getBoundingClientRect()); return [s.textContent, Math.min(...d.map((x) => Math.abs(x.top + 4 - (q.top + q.height / 2))))]; }));
  check('1.11 lines: names at the line ends, each level with its dot', names.length === 4 && names.every(([, d]) => d <= 1), JSON.stringify(names));
  check('1.11 lines: one series has no legend and no names', (await texts('#one .legend, #one .line-ends')).length === 0, '');
  const tones = await at(() => ['1', '2', '3', '4'].map((n) => getComputedStyle(document.querySelector(`#four .line-svg path.series-${n}`)).stroke));
  check('1.11 lines: four colours, one per series', new Set(tones).size === 4, tones.join(' '));
  const room = await at(() => [...document.querySelectorAll('.line-chart .chart-grid span')].every((e) => e.getBoundingClientRect().left >= e.closest('.line-chart').getBoundingClientRect().left - 0.5));
  check('1.11 lines: the axis has room for its longest label', room);

  // the crosshair: where the data is, not where the pointer is
  const plot = await box('#two .line-plot');
  const hover = async (fx) => { await tab.mouse.move(plot.x + plot.width * fx, plot.y + 70); return at(() => { const r = document.querySelector('#two .line-plot').getBoundingClientRect(); const q = (e) => { const b = e.getBoundingClientRect(); return { x: (b.left + b.width / 2 - r.left) / r.width, y: (b.top + b.height / 2 - r.top) / r.height, l: b.left, r: b.right }; };
    return { hidden: document.querySelector('#two .line-cross').hidden, cross: q(document.querySelector('#two .line-cross')), dots: [...document.querySelectorAll('#two .line-dot.on')].map(q), tip: q(document.querySelector('#two .line-tip')), text: document.querySelector('#two .line-tip').innerText.split('\n').filter(Boolean), plotL: r.left, plotR: r.right, now: document.querySelector('#two .line-plot').getAttribute('aria-valuetext') }; }); };
  const h1 = await hover(0.3005);
  const want = await at(() => { const i = Math.round(0.3005 * 288); return { x: i / 288, web: two[0].points[i][1], api: two[1].points[i][1], t: new Date(two[0].points[i][0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) }; });
  check('1.11 lines: the crosshair snaps to the nearest point', !h1.hidden && Math.abs(h1.cross.x - want.x) < 0.001, JSON.stringify([h1.cross.x, want.x]));
  check('1.11 lines: a dot on every line, at its value', h1.dots.length === 2 && Math.abs(h1.dots[0].y - (1 - want.web / 200)) < 0.004 && Math.abs(h1.dots[1].y - (1 - want.api / 200)) < 0.004, JSON.stringify([h1.dots, want]));
  check('1.11 lines: one readout with the time and every series', JSON.stringify(h1.text) === JSON.stringify([want.t, `${want.web} ms`, 'Web', `${want.api} ms`, 'API']) && h1.now === `${want.t}: Web ${want.web} ms, API ${want.api} ms`, JSON.stringify([h1.text, h1.now]));
  const h2 = await hover(0.93);
  check('1.11 lines: the readout stays inside the plot, on the roomier side', h1.tip.l > plot.x + plot.width * 0.3 && h1.tip.r < h1.plotR && h2.tip.r < plot.x + plot.width * 0.93 && h2.tip.l > h2.plotL, JSON.stringify([h1.tip, h2.tip]));
  await tab.mouse.move(plot.x + 200, plot.y - 14); // the legend, still inside the chart's box
  check('1.11 lines: it goes when the pointer is on the legend', await at(() => document.querySelector('#two .line-tip').hidden));
  await hover(0.4);
  await tab.mouse.move(plot.x + 200, plot.y - 60);
  check('1.11 lines: it goes when the pointer leaves the plot', await at(() => document.querySelector('#two .line-tip').hidden && document.querySelector('#two .line-cross').hidden));

  // the keyboard, and what a screen reader hears
  const slider = () => at(() => { const p = document.querySelector('#two .line-plot'); return { now: Number(p.getAttribute('aria-valuenow')), max: Number(p.getAttribute('aria-valuemax')), text: p.getAttribute('aria-valuetext'), name: p.getAttribute('aria-label'), role: p.getAttribute('role'), open: !document.querySelector('#two .line-tip').hidden, focus: document.activeElement === p }; });
  await at(() => document.querySelector('#two .line-plot').focus());
  await tab.keyboard.press('Shift+Tab');
  await tab.keyboard.press('Tab');
  const k0 = await slider();
  check('1.11 lines: Tab shows the latest point; it is a named slider', k0.focus && k0.open && k0.role === 'slider' && k0.name === 'Response time' && k0.now === 289 && k0.max === 289 && k0.text === '14:00: Web 117 ms, API 51 ms', JSON.stringify(k0));
  await tab.keyboard.press('ArrowLeft');
  const k1 = await slider();
  await tab.keyboard.press('PageDown');
  const k2 = await slider();
  await tab.keyboard.press('Home');
  await tab.keyboard.press('ArrowLeft');
  const k3 = await slider();
  check('1.11 lines: arrow keys, Page Down and Home move it, and it stops at the ends', k1.now === 288 && k1.text.startsWith('13:55') && k2.now === 259 && k3.now === 1 && k3.text.startsWith('14:00'), JSON.stringify([k1, k2, k3]));
  await tab.keyboard.press('Escape');
  const k4 = await slider();
  check('1.11 lines: Escape puts it away, and the focus stays', !k4.open && k4.focus && k4.now === 289, JSON.stringify(k4));

  // a refresh under the reader
  await tab.keyboard.press('Home');
  await tab.keyboard.press('ArrowRight');
  const kept = await at(() => { two[0].points.push([T0 + 290 * 300e3, 150]); two[1].points.push([T0 + 290 * 300e3, 60]); chart.update(two); return { focus: document.activeElement === document.querySelector('#two .line-plot'), text: document.querySelector('#two .line-plot').getAttribute('aria-valuetext'), open: !document.querySelector('#two .line-tip').hidden, max: document.querySelector('#two .line-plot').getAttribute('aria-valuemax') }; });
  check('1.11 lines: a refresh keeps the reader at their point, with the focus', kept.focus && kept.open && kept.text.startsWith('14:05') && kept.max === '290', JSON.stringify(kept));
  await tab.focus('#after');
  check('1.11 lines: it goes when the focus leaves', !(await slider()).open);
  const sel = await at(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#two .legend')); getSelection().removeAllRanges(); getSelection().addRange(r); two[0].points.push([T0 + 600 * 300e3, 10]); chart.update(two); const p = document.querySelector('#two .line-plot'); p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: p.getBoundingClientRect().right, clientY: p.getBoundingClientRect().top + 5 })); const t = p.getAttribute('aria-valuetext'); getSelection().removeAllRanges(); two[0].points.pop(); chart.update(two); return t; });
  check('1.11 lines: while a refresh waits for a selection, the crosshair reads the chart on screen', sel.startsWith('14:10: Web 150 ms'), sel);

  // a finger: what it reads stays after it lifts, until a press elsewhere
  const touch = await at(() => { const p = document.querySelector('#two .line-plot'), r = p.getBoundingClientRect(); const ev = (k, x) => p.dispatchEvent(new PointerEvent(k, { bubbles: k !== 'pointerleave', pointerType: 'touch', clientX: r.left + r.width * x, clientY: r.top + 20 })); p.focus(); ev('pointerdown', 0.5); document.querySelector('#two').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' })); return { open: !document.querySelector('#two .line-tip').hidden, action: getComputedStyle(p).touchAction }; });
  await tab.focus('#after');
  check('1.11 lines: a finger\'s reading stays, until a press elsewhere; the page still scrolls', touch.open && touch.action === 'pan-y' && !(await slider()).open, JSON.stringify(touch));

  // gaps, lone points, other cadences
  const gaps = await at(() => { const p = (s) => document.querySelector('#gaps path' + s), n = (e) => (e ? e.getAttribute('d').split('M').length - 1 : 0); return { sensor: n(p('.series-1:not(.lone)')), lone: document.querySelectorAll('#gaps path.lone.series-1').length, dashed: p('.dashed') ? getComputedStyle(p('.dashed')).strokeDasharray : '', forecast: n(p('.dashed')) }; });
  check('1.11 lines: a null and a long silence break the line, and a point alone is a dot', gaps.sensor === 3 && gaps.lone === 1 && gaps.forecast === 1 && gaps.dashed.startsWith('5'), JSON.stringify(gaps));
  await at(() => document.querySelector('#gaps .line-plot').focus());
  await tab.keyboard.press('Home');
  await tab.keyboard.press('ArrowRight');
  const other = await at(() => [document.querySelector('#gaps .line-plot').getAttribute('aria-valuetext'), document.querySelector('#gaps .line-tip').innerText.split('\n').filter(Boolean)]);
  check('1.11 lines: a value from another moment says which', other[0] === '15:00: Sensor 4, Forecast 2 (at 14:00)' && other[1][4] === 'Forecast · 14:00', JSON.stringify(other));
  check('1.11 lines: below zero, the zero line is solid', await at(() => getComputedStyle(document.querySelector('#days .chart-grid.zero') || document.body).borderTopStyle === 'solid' && document.querySelectorAll('#days .chart-grid.zero').length === 1 && !document.querySelector('#two .chart-grid.zero')));
  check('1.11 lines: weeks are marked on Mondays', JSON.stringify(await texts('#days .line-x span')) === JSON.stringify(['Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2', 'Nov 9']), JSON.stringify(await texts('#days .line-x span')));
  check('1.11 lines: daily points read as dates', (await at(() => document.querySelector('#days .line-plot').getAttribute('aria-valuetext'))) === 'Nov 9: Change +6%', await at(() => document.querySelector('#days .line-plot').getAttribute('aria-valuetext')));
  check('1.11 lines: nothing to show says so', (await texts('#none .empty'))[0] === 'No readings yet');

  // the range, limits, scale
  const cut = await at(() => { const b = document.getElementById('one'); Dash.lines(b, [{ label: 'x', points: [[T0, 0], [T0 + 10 * H, 100]] }], { from: T0 + 2 * H, to: T0 + 4 * H, label: 'Cut' }); const p = b.querySelector('.line-plot'), r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 50, clientY: r.top + 5 })); return { d: b.querySelector('path').getAttribute('d'), role: p.getAttribute('role'), tab: p.hasAttribute('tabindex'), tip: b.querySelector('.line-tip').hidden }; });
  check('1.11 lines: a line that crosses the edges of the range is cut there, at the value it has; with no point to read it is a picture', cut.d === 'M0 500L1000 0' && cut.role === 'img' && !cut.tab && cut.tip, JSON.stringify(cut));
  const scale = await at(() => { const b = document.getElementById('one'); const y = () => [...b.querySelectorAll('.chart-grid span')].map((e) => e.textContent); const P = [[T0, 1043], [T0 + H, 1090]]; const out = {};
    Dash.lines(b, [{ points: P }], { min: 'auto', format: String }); out.auto = y();
    Dash.lines(b, [{ points: P }], { min: 1050, max: 1080, format: String }); out.fixed = [y(), b.querySelector('.line-svg').classList.contains('clip'), getComputedStyle(b.querySelector('.line-svg')).overflow];
    Dash.lines(b, [{ points: [[T0, 0], [T0 + H, 0]] }], { format: String }); out.flat = y();
    Dash.lines(b, [{ points: [[T0, 7]] }], { format: String }); out.single = [b.querySelector('path.lone') != null, b.querySelector('.line-dot')?.style.left];
    Dash.lines(b, [{ points: [[T0, 3], [T0 + H, 4]] }], { refs: [{ value: 9, label: 'Limit' }], format: String }); out.ref = [y().at(-1), b.querySelector('.line-ref')?.style.top];
    Dash.lines(b, [{ points: [[T0, -3], [T0 + H, -4]] }], { format: String }); out.neg = y();
    Dash.lines(b, [{ label: 'A', points: [0, 1, 2, 3, 4, 5].map((i) => [T0 + i * H, i]) }, { label: 'B', points: [[T0, 8], [T0 + H, 9]] }], { format: String }); out.gone = b.querySelector('.line-plot').getAttribute('aria-valuetext');
    return out; });
  check('1.11 lines: the y axis fits the data when asked, takes limits, and copes with one value or none', JSON.stringify(scale.auto) === '["1040","1060","1080","1100"]' && JSON.stringify(scale.fixed) === '[["1050","1060","1070","1080"],true,"hidden"]' && scale.flat[0] === '0' && scale.flat.length > 1 && JSON.stringify(scale.single) === '[true,"50%"]' && JSON.stringify(scale.ref) === '["10","10%"]' && scale.neg.at(-1) === '0', JSON.stringify(scale));
  check('1.11 lines: a series with nothing near that moment reads —', scale.gone === '19:00: A 5, B —', scale.gone);
  const meet = await at(() => { const b = document.getElementById('one'); Dash.lines(b, [{ label: 'A', points: [[T0, 1], [T0 + H, 5]] }, { label: 'B', points: [[T0, 9], [T0 + H, 5.1]] }]); const close = b.querySelector('.line-ends'); Dash.lines(b, [{ label: 'A', points: [[T0, 1], [T0 + H, 5]] }, { label: 'B', points: [[T0, 9], [T0 + H / 2, 9]] }]); return [close, b.querySelector('.line-ends')]; });
  check('1.11 lines: no names at the ends where they would touch, or where a line stops early', meet[0] === null && meet[1] === null);
  const evil = await at(() => { const b = document.getElementById('one'); Dash.lines(b, [{ label: '<img src=x onerror="window.pwned=1">', points: [[T0, 1], [T0 + H, 5]], tone: '"><b>' }, { label: 'B', points: [[T0, 2], [T0 + H, 1]] }], { label: '"><i id=evil>', format: (v) => `<u>${v}</u>`, refs: [{ value: 3, label: '<s>limit</s>' }] }); b.querySelector('.line-plot').focus(); return { img: b.querySelectorAll('img, u, s, #evil').length, tip: b.querySelector('.line-tip').textContent.includes('<u>5</u>') }; });
  await tab.keyboard.press('ArrowLeft');
  check('1.11 lines: names and values are text', evil.img === 0 && (await at(() => document.querySelectorAll('#one img, #one u, #one s, #evil').length)) === 0 && (await at(() => document.querySelector('#one .line-tip').textContent.includes('<u>1</u>'))), JSON.stringify(evil));
  const csv = await at(() => Dash.lines('one', [{ label: 'A', points: [[T0, 1], [T0 + H, null]] }, { label: 'B', points: [[T0, 2], [T0 + H, 3]] }]).csv().trim().split(/\r?\n/));
  check('1.11 lines: the numbers as CSV', JSON.stringify(csv) === JSON.stringify(['Time,A,B', '2026-11-23T12:00:00.000Z,1,2', '2026-11-23T13:00:00.000Z,,3']), JSON.stringify(csv));
  check('1.11 lines: called again on its box, it listens once', await at(() => { const b = document.getElementById('one'); let n = 0; const p = b.querySelector('.line-plot'); const add = b.addEventListener; b.addEventListener = (...a) => { n += 1; add.apply(b, a); }; Dash.lines(b, [{ points: [[T0, 1], [T0 + H, 2]] }]); Dash.lines(b, [{ points: [[T0, 1], [T0 + H, 3]] }]); delete b.addEventListener; return n === 0 && p != null; }));

  // hidden values: the numbers go, the shape stays
  const priv = await at(() => { const b = document.getElementById('one'); Dash.privacy.set(false); Dash.lines(b, [{ label: 'A', points: [[T0, 7391], [T0 + H, 7392]] }, { label: 'B', points: [[T0, 7393], [T0 + H, 7394]] }], { private: true, format: (v) => v + ' kr' }); const shown = b.innerHTML.includes('7392 kr'); b.querySelector('.line-plot').focus(); Dash.privacy.set(true); const p = b.querySelector('.line-plot'); p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); const out = { shown, left: /739\d|\d kr/.test(b.innerHTML), masks: b.querySelectorAll('.private').length, path: !!b.querySelector('path.series-1'), tip: b.querySelector('.line-tip').textContent }; Dash.privacy.set(false); out.back = b.innerHTML.includes('7392 kr'); return out; });
  check('1.11 lines: private ones lose every number while values are hidden, in the readout too', priv.shown && !priv.left && priv.masks >= 6 && priv.path && priv.back, JSON.stringify(priv));

  // clocks that change: labels stay round, and never repeat
  const dst = await at(() => [['2026-10-24T12:00:00Z', '2026-10-25T12:00:00Z'], ['2026-03-28T12:00:00Z', '2026-03-29T12:00:00Z'], ['2026-10-20T00:00:00Z', '2026-10-30T00:00:00Z'], ['2026-03-20T00:00:00Z', '2026-04-03T00:00:00Z'], ['2026-03-28T22:30:00Z', '2026-03-29T04:00:00Z']].map(([a, z]) => { const b = document.getElementById('one'); Dash.lines(b, [{ points: [[a, 1], [z, 2]] }]); return [...b.querySelectorAll('.line-x span')].map((e) => [e.textContent, parseFloat(e.style.left)]); }));
  const rising = (l) => l.length >= 3 && l.every(([, x], i) => !i || x > l[i - 1][1]) && new Set(l.map(([t]) => t)).size === l.length;
  check('1.11 lines: round labels through a clock change, by the hour and by the day', dst.every(rising) && JSON.stringify(dst[0].map((x) => x[0])) === '["18:00","Oct 25","06:00","12:00"]' && JSON.stringify(dst[1].map((x) => x[0])) === '["18:00","Mar 29","06:00","12:00"]' && JSON.stringify(dst[2].map((x) => x[0])) === '["Oct 21","Oct 23","Oct 25","Oct 27","Oct 29"]' && dst[3].every(([t]) => /^(Mar|Apr) \d+$/.test(t)) && JSON.stringify(dst[4].map((x) => x[0])) === '["01:00","02:00","04:00","05:00","06:00","07:00"]', JSON.stringify(dst));
  const ranges = await at(() => [10e3, 90e3, 20 * 60e3, 5 * H, 3 * 24 * H, 45 * 24 * H, 200 * 24 * H, 900 * 24 * H, 12 * 366 * 24 * H].map((r) => { const b = document.getElementById('one'); Dash.lines(b, [{ points: [[T0 - r, 1], [T0, 2]] }]); return [...b.querySelectorAll('.line-x span')].map((e) => [e.textContent, parseFloat(e.style.left)]); }));
  check('1.11 lines: two to eight round labels for ten seconds up to twelve years', ranges.every((l) => l.length >= 2 && l.length <= 8 && l.every(([, x], i) => x >= 0 && x <= 100 && (!i || x > l[i - 1][1]))) && /^\d\d:\d\d:\d\d$/.test(ranges[0][0][0]) && /^[A-Z][a-z]{2} 2026$/.test(ranges[6][0][0]) && /^\d{4}$/.test(ranges[8][0][0]), JSON.stringify(ranges.map((l) => l.map((x) => x[0]))));
  await tab.context().close();

  // a phone
  const phone = await openLines({ width: 390 });
  const ph = await phone.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, ends: getComputedStyle(document.querySelector('#four .line-ends')).display, minor: [...document.querySelectorAll('#two .line-x span')].map((e) => getComputedStyle(e).visibility).join(), apart: [...document.querySelectorAll('.line-x')].every((x) => { const l = [...x.children].filter((e) => getComputedStyle(e).visibility === 'visible').map((e) => e.getBoundingClientRect()); return l.every((r, i) => r.right <= innerWidth && (!i || r.left >= l[i - 1].right + 2)); }) }));
  check('1.11 lines: on a phone the names at the ends and every other label go, and nothing overlaps', ph.over <= 0 && ph.ends === 'none' && ph.minor === 'visible,hidden,visible,hidden' && ph.apart, JSON.stringify(ph));
  await phone.context().close();

  // a strict style policy
  const plain = await openLines({ page: 'lines.html' });
  const strictTab = await openLines({ page: 'csp.html' });
  const draw = () => { const H = 3600e3, T = Date.UTC(2026, 10, 23, 12); const b = document.createElement('div'); b.id = 'csp-lines'; document.querySelector('main').append(b); Dash.config.csp = location.pathname.endsWith('csp.html'); Dash.lines(b, [{ label: 'A', points: [[T, 10], [T + 6 * H, 30], [T + 12 * H, 20]] }, { label: 'B', points: [[T, 60], [T + 6 * H, 80], [T + 12 * H, 90]] }], { height: 180, refs: [{ value: 50, label: 'Limit' }] }); b.querySelector('.line-plot').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); const r = b.querySelector('.line-plot').getBoundingClientRect(); return [...b.querySelectorAll('.chart-grid, .line-ref, .line-dot, .line-x span, .line-ends span, .line-cross, .line-tip')].map((e) => { const q = e.getBoundingClientRect(); return [e.className, +((q.left - r.left) / r.width).toFixed(2), Math.round(q.top - r.top)].join(' '); }).concat([Math.round(r.height)]); };
  const a = await plain.evaluate(draw), b = await strictTab.evaluate(draw);
  await strictTab.waitForTimeout(300);
  const bad = await strictTab.evaluate(() => violations.slice());
  check('1.11 lines: under a strict style policy it draws the same, and breaks nothing', a.length > 12 && JSON.stringify(a) === JSON.stringify(b) && bad.length === 0, JSON.stringify([a.filter((x, i) => x !== b[i]), b.filter((x, i) => x !== a[i]), bad]));
  await plain.context().close();
  await strictTab.context().close();
}

// ---- 1.12 Dash.table's rows to pick and to open (test/rows.html)
{
  const openRows = async ({ width = 1100, height = 900, page = 'rows.html', ...more } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', ...more });
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => { if (e.message !== 'made to fail') errors.push(e.message); });
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openRows();
  const at = (f, a) => tab.evaluate(f, a);
  const row = (name, t = 'both') => `#${t} tbody tr[data-key="${['amber', 'birch', 'cedar', 'delta', 'ember', 'fjord', 'grove'].indexOf(name) + 1}"]`;
  const ids = (t = 'both') => at((n) => window[n].selected.map((r) => r.id).join(','), t);
  const bar = (t = 'both') => at((n) => { const b = document.querySelector(`#${n} > .table-bar`); return b.hidden ? null : [b.querySelector('b'), b.querySelector('.tone'), b.querySelector('[data-all]')].map((e) => (e.hidden ? '' : e.textContent)).join('|'); }, t);
  const head = (t = 'both') => at((n) => { const b = document.querySelector(`#${n} th.row-pick input`); return b.indeterminate ? 'some' : b.checked ? 'all' : 'none'; }, t);
  const reset = () => at(() => { while (both.sort.key !== 'name' || both.sort.dir !== 'asc') both.sort.toggle('name'); both.update(make()); both.filter(null); both.goto(1); both.select([]); for (const r of both.expanded) both.expand(r.id, false); log.length = 0; });

  // picking
  check('1.12 rows: no bar before anything is picked', (await bar()) === null && (await head()) === 'none', '');
  await tab.click(row('amber') + ' .row-pick input');
  const one = { ids: await ids(), bar: await bar(), head: await head(), cls: await at((s) => document.querySelector(s).className, row('amber')), say: await at(() => document.querySelector('#both > [role="status"]').textContent), label: await at((s) => document.querySelector(s).getAttribute('aria-label'), row('amber') + ' .row-pick input') };
  check('1.12 rows: a box picks its row; the header box is partly on, and the bar and the status say how many', one.ids === '1' && one.bar === '1 selected||Select all 22 servers' && one.head === 'some' && one.cls.includes('row-picked') && one.say === '1 selected' && one.label === 'Select amber', JSON.stringify(one));
  await at(() => { window.kept = document.querySelector('#both tbody tr'); });
  const cell = await tab.locator(row('birch') + ' .row-pick').boundingBox();
  await tab.mouse.click(cell.x + 3, cell.y + 3);
  check('1.12 rows: the whole cell is the box', (await ids()) === '1,2' && (await at(() => document.activeElement.getAttribute('aria-label'))) === 'Select birch', await ids());
  check('1.12 rows: picking a row leaves the others\' elements alone', await at(() => window.kept === document.querySelector('#both tbody tr')), '');
  await tab.keyboard.press('Space');
  check('1.12 rows: Space unpicks it', (await ids()) === '1', await ids());
  await tab.click(row('amber') + ' .row-pick input');
  check('1.12 rows: with none picked the bar is gone', (await bar()) === null && (await at(() => document.querySelector('#both > [role="status"]').textContent)) === 'None selected', String(await bar()));
  // a range
  await tab.click(row('birch') + ' .row-pick input');
  const far = await tab.locator(row('grove') + ' .row-pick').boundingBox();
  await tab.keyboard.down('Shift');
  await tab.mouse.click(far.x + 3, far.y + 3);
  await tab.keyboard.up('Shift');
  const range = { ids: await ids(), text: await at(() => String(getSelection())) };
  check('1.12 rows: Shift-click picks the rows between, but not one that can\'t be picked, and selects no text', range.ids === '2,3,4,6,7' && range.text === '', JSON.stringify(range));
  await tab.click(row('delta') + ' .row-pick input', { modifiers: ['Shift'] });
  check('1.12 rows: Shift-click on a picked one unpicks the rows between', (await ids()) === '2,3', await ids());
  await tab.click(row('ember') + ' .row-pick', { force: true });
  check('1.12 rows: a row that can\'t be picked has a box that is off', (await ids()) === '2,3' && await at((s) => document.querySelector(s).disabled, row('ember') + ' .row-pick input'), await ids());
  // the header box, other pages, all
  await tab.click('#both th.row-pick', { position: { x: 4, y: 4 } });
  check('1.12 rows: the header box picks this page', (await ids()) === '1,2,3,4,6,7,8' && (await head()) === 'all', await ids());
  await tab.click('#both [data-page="2"]');
  const page2 = { bar: await bar(), head: await head() };
  check('1.12 rows: on another page they stay picked, and the bar says they are not there', page2.bar === '7 selected|7 not on this page|Select all 22 servers' && page2.head === 'none', JSON.stringify(page2));
  await tab.click('#both [data-all]');
  const all = { n: (await ids()).split(',').length, bar: await bar(), focus: await at(() => document.activeElement.textContent) };
  check('1.12 rows: all of them can be picked; then the focus is on Clear', all.n === 22 && all.bar === '22 selected|14 not on this page|' && all.focus === 'Clear', JSON.stringify(all));
  await tab.keyboard.press('Enter');
  const cleared = { ids: await ids(), focus: await at(() => document.activeElement.getAttribute('aria-label')), bar: await bar() };
  check('1.12 rows: Clear unpicks them, and the focus goes back to the table', cleared.ids === '' && cleared.bar === null && cleared.focus === 'Select all on this page', JSON.stringify(cleared));
  // Shift-clicking a cell's edge, after a click in the text: no text is selected
  await reset();
  await tab.click(row('amber') + ' td.main');
  const edge = await tab.locator(row('delta') + ' .row-pick').boundingBox();
  await tab.keyboard.down('Shift');
  await tab.mouse.click(edge.x + 3, edge.y + 3);
  await tab.keyboard.up('Shift');
  check('1.12 rows: Shift-clicking a box\'s cell selects no text', (await at(() => String(getSelection()))) === '' && (await ids()) === '4', await at(() => String(getSelection())));
  await tab.mouse.dblclick(edge.x + 3, edge.y + 3);
  check('1.12 rows: nor does a double click on it (a selection would hold refreshes back)', await at(() => getSelection().isCollapsed) && (await ids()) === '4', await at(() => JSON.stringify(String(getSelection()))));
  await at(() => { getSelection().removeAllRanges(); document.activeElement.blur(); });
  await tab.click(row('fjord') + ' .row-pick input', { modifiers: ['Shift'] });
  check('1.12 rows: a Shift-clicked box has the focus', (await at(() => document.activeElement.getAttribute('aria-label'))) === 'Select fjord', await at(() => document.activeElement.outerHTML.slice(0, 80)));
  const tall = await at(() => ['[data-all]', '[data-none]'].map((q) => Math.round(document.querySelector('#both > .table-bar ' + q).getBoundingClientRect().height)));
  check('1.12 rows: the bar\'s links are tall enough to press', Math.min(...tall) >= 24, tall.join());
  await at(() => both.select([4]));
  const offCell = await tab.locator(row('ember') + ' .row-pick').boundingBox();
  await tab.mouse.click(offCell.x + 3, offCell.y + 3);
  check('1.12 rows: nor does its cell pick a row that can\'t be', (await ids()) === '4' && await at((s) => document.querySelector(s).disabled, row('ember') + ' .row-pick input'), await ids());
  // through a refresh
  await reset();
  await at(() => both.select([2, 12]));
  await tab.focus(row('birch') + ' .row-pick input');
  const kept = await at(() => { const was = document.querySelector('#both tbody tr'); both.update(make()); const same = was === document.querySelector('#both tbody tr'); both.update(make(5)); return { same, focus: document.activeElement.getAttribute('aria-label'), checked: document.activeElement.checked, ids: both.selected.map((r) => r.id + ':' + r.cpu).join(), log: log.join(' ') }; });
  check('1.12 rows: a refresh that changes nothing writes nothing; one that does keeps what is picked, with the new rows, and the focus', kept.same && kept.focus === 'Select birch' && kept.checked && kept.ids === '2:42,12:12' && kept.log === '2,12', JSON.stringify(kept));
  await tab.click('#both [data-sort="cpu"]');
  const sorted = await at(() => both.selected.map((r) => r.id).join() + '|' + [...document.querySelectorAll('#both tr.row-picked')].map((t) => t.querySelector('.main').textContent).join());
  check('1.12 rows: sorting keeps what is picked on the right rows', /^2,12\|/.test(sorted) && await at(() => [...document.querySelectorAll('#both tbody tr[data-i]')].every((t) => t.classList.contains('row-picked') === ['birch', 'larch'].includes(t.querySelector('.main').textContent) && t.querySelector('input').checked === t.classList.contains('row-picked'))), sorted);
  const filtered = await at(() => { both.filter((r) => r.region === 'eu'); const b = document.querySelector('#both > .table-bar'); const out = [b.textContent.slice(0, 40), both.selected.length]; both.filter(null); return out; });
  check('1.12 rows: a row the filter hides stays picked, and the bar says it is not there', filtered[0].startsWith('2 selected2 not on this page') && filtered[1] === 2, JSON.stringify(filtered));
  const lost = await at(async () => { log.length = 0; both.update(make().filter((r) => r.id !== 2)); await null; const a = both.selected.map((r) => r.id).join(); both.update(make()); const b = both.selected.map((r) => r.id).join(); both.update(make().map((r) => ({ ...r, state: r.id === 12 ? 'locked' : 'ok' }))); await null; return { a, b, c: both.selected.length, log: log.join('|') }; });
  check('1.12 rows: a row that leaves the data, or may not be picked any more, is no longer picked, and onChange hears it', lost.a === '12' && lost.b === '12' && lost.c === 0 && lost.log === '12|', JSON.stringify(lost));
  // a refresh waiting for selected text: a click is for the row on screen
  await reset();
  const held = await at(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#both tbody td.main')); getSelection().removeAllRanges(); getSelection().addRange(r); both.update(make().reverse().slice(0, 4).concat(make().slice(0, 3))); const tr = [...document.querySelectorAll('#both tbody tr')].find((t) => t.querySelector('.main').textContent === 'birch'); tr.querySelector('.row-pick input').click(); const gone = [...document.querySelectorAll('#both tbody tr')].find((t) => t.querySelector('.main').textContent === 'fjord').querySelector('.row-pick input'); gone.click(); const out = [both.selected.map((x) => x.name).join(), document.querySelector('#both > .table-bar b').textContent, gone.checked]; getSelection().removeAllRanges(); return out; });
  check('1.12 rows: a box clicked while a refresh waits is for the row on screen; a row that is gone by then isn\'t picked', JSON.stringify(held) === '["birch","1 selected",false]', JSON.stringify(held));
  const bare = await at(() => { both.select([1, 3]); both.filter(() => false); const t = document.querySelector('#both table'), e = t.querySelector('tbody td'), h = t.querySelector('thead input'); const out = [e.colSpan === t.querySelector('thead tr').cells.length, h.checked, h.disabled, document.querySelector('#both > .table-bar .tone').textContent, document.querySelector('#both .table-pick-all')]; both.filter(null); both.update([]); out.push(both.selected.length, document.querySelector('#both > .table-bar').hidden); return out; });
  check('1.12 rows: with no rows on screen the header box is off and the bar says where the picked ones are', JSON.stringify(bare) === '[true,false,true,"2 not on this page",null,0,true]', JSON.stringify(bare));
  // from the page, and the CSV
  await reset();
  const api = await at(() => { const out = []; both.select((r) => r.cpu > 80); out.push(both.selected.map((r) => r.id).join()); both.select(['3', 5, 99]); out.push(both.selected.map((r) => r.id).join()); out.push(both.csv(both.selected).trim().split('\r\n').length, both.csv().trim().split('\r\n').length); both.select(4); both.select(4); out.push(both.selected.map((r) => r.id).join(), log.join('|')); both.select(); out.push(both.selected.length); return out; });
  check('1.12 rows: select() takes keys or a test, and only what may be picked; onChange only when it changed', JSON.stringify(api) === JSON.stringify(['6,9,14,17', '3', 2, 24, '4', '6,9,14,17|3|4', 0]), JSON.stringify(api));
  const noKey = await at(() => { const n = document.createElement('div'); const out = []; for (const o of [{ select: true }, { expand: () => '' }]) try { Dash.table(n, { columns, ...o }); out.push('made'); } catch (e) { out.push(e.message.includes('key')); } return out; });
  check('1.12 rows: without a key it says so', noKey[0] === true && noKey[1] === true, JSON.stringify(noKey));
  // actions
  await reset();
  await at(() => both.select([1, 2]));
  await tab.click('#both [data-action="0"]');
  const busy = await at(() => document.querySelector('#both [data-action="0"]').getAttribute('aria-busy'));
  await tab.waitForTimeout(250);
  const done = await at(() => [log.at(-1), document.querySelector('#both [data-action="0"]').getAttribute('aria-busy'), document.activeElement.textContent]);
  const toned = await at(() => ['0', '1'].map((k) => getComputedStyle(document.querySelector(`#both [data-action="${k}"]`)).color));
  check('1.12 rows: an action with a tone has its colour', toned[1] === await at(() => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }) && toned[0] !== toned[1], toned.join(' '));
  check('1.12 rows: an action gets the picked rows, its button is busy until it ends, and keeps the focus', busy === 'true' && done[0] === 'restart 2' && done[1] === null && done[2] === 'Restart', JSON.stringify([busy, done]));
  await tab.click('#both [data-action="2"]');
  await tab.waitForTimeout(60);
  check('1.12 rows: an action\'s error shows', (await at(() => document.querySelector('.toast')?.textContent || '')).includes('No room left'), '');
  await tab.focus('#both [data-action="1"]');
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(60);
  const removed = await at(() => ({ rows: both.rows.length, bar: document.querySelector('#both > .table-bar').hidden, focus: document.activeElement.getAttribute('aria-label') }));
  check('1.12 rows: an action that removes the rows: the bar goes and the focus goes back to the table', removed.rows === 21 && removed.bar && removed.focus === 'Select all on this page', JSON.stringify(removed));
  // onRow, and a table made again
  await at(() => { log.length = 0; });
  const wc = await tab.locator(row('cedar', 'wrap') + ' .row-pick').boundingBox();
  await tab.mouse.click(wc.x + 3, wc.y + 3);
  await tab.click(row('cedar', 'wrap') + ' td.main');
  check('1.12 rows: a click on the box\'s cell is no row click; one on the row is', (await at(() => log.join())) === 'row 3' && (await ids('wrapped')) === '3' && (await at(() => wrapped.expanded.length)) === 0, await at(() => log.join()));
  const again = await at(() => { const n = document.createElement('div'); document.querySelector('main').append(n); const hits = []; const o = { columns, rows: make().slice(0, 3), key: 'id', onRow: (r) => hits.push(r.id) }; Dash.table(n, o); Dash.table(n, { ...o, select: true }); n.querySelector('tbody td.main').click(); Dash.table(n, { ...o, select: true }); const bars = n.querySelectorAll('.table-bar').length + '/' + n.querySelectorAll('table').length; Dash.table(n, o); n.querySelector('tbody td.main').click(); const out = [hits.join(), bars, n.querySelectorAll('.table-bar, .row-pick').length]; n.remove(); return out; });
  check('1.12 rows: a table made again in its place: the old one is gone, bar and clicks', JSON.stringify(again) === '["1,1","1/1",0]', JSON.stringify(again));
  const esc = await at(() => { const n = document.createElement('div'); Dash.table(n, { columns: [{ key: 'n', label: 'N', html: () => 'x' }], rows: [{ id: '"><i>', n: '"><b id="bad">' }, { id: 2, n: {} }], key: 'id', noun: '<i>', select: { actions: [{ label: '<i id="bad2">', run() {} }] }, expand: () => '' }); return { bad: n.querySelectorAll('#bad, #bad2, td i').length, labels: [...n.querySelectorAll('td [aria-label]')].map((e) => e.getAttribute('aria-label')).join('|') }; });
  check('1.12 rows: names, keys and labels are escaped; a row without a name has its number', esc.bad === 0 && esc.labels === 'Select "><b id="bad">|Details of "><b id="bad">|Select row 2|Details of row 2', JSON.stringify(esc));
  const plain = await at(() => ({ html: document.getElementById('plain').innerHTML.replace(/ class="table stack"/, ''), extra: document.querySelectorAll('#plain .row-pick, #plain .row-turn, #plain .table-bar, #plain .table-host').length }));
  check('1.12 rows: a table with neither has none of it', plain.extra === 0 && plain.html.startsWith('<table><thead><tr><th><button type="button" data-sort="name">Server</button></th>') && plain.html.includes('<tr data-i="0" data-key="1" class="click" tabindex="0"><td class="main">amber</td>'), plain.html.slice(0, 200));

  // the bar stays in view, and the focus doesn't go under it
  await reset();
  await tab.setViewportSize({ width: 1100, height: 420 });
  await at(() => { both.select([1]); scrollTo(0, 0); });
  const stuck = await at(() => { const q = document.querySelector('#both > .table-bar').getBoundingClientRect(); return { bottom: Math.round(innerHeight - q.bottom), below: document.querySelector('#both').getBoundingClientRect().bottom > innerHeight }; });
  check('1.12 rows: the bar stays at the bottom of the window while the table goes on below', stuck.below && stuck.bottom === 12, JSON.stringify(stuck));
  await tab.focus(row('amber') + ' .row-pick input');
  let under = 0;
  for (let i = 0; i < 14; i++) { await tab.keyboard.press('Tab'); under = Math.max(under, await at(() => { const a = document.activeElement, q = a.getBoundingClientRect(), b = document.querySelector('#both > .table-bar').getBoundingClientRect(); return a.closest('#both tbody') ? q.bottom - b.top : -1; })); }
  check('1.12 rows: tabbing down the rows never puts the focus under the bar', under <= 0, String(under));
  await tab.setViewportSize({ width: 1100, height: 900 });

  // opening
  await reset();
  await tab.click(row('birch') + ' .row-turn button');
  const opened = await at((s) => { const b = document.querySelector(s + ' .row-turn button'), d = document.querySelector(s).nextElementSibling; return { exp: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'), next: d.className === 'row-detail' && d.id !== '' && b.getAttribute('aria-controls') === d.id, text: d.textContent, span: d.cells[0].colSpan, cols: document.querySelector('#both thead tr').cells.length, w: Math.round(d.cells[0].getBoundingClientRect().width - document.querySelector('#both table').getBoundingClientRect().width), api: both.expanded.map((r) => r.id).join() }; }, row('birch'));
  check('1.12 rows: a button opens its row\'s details, right under it and across the table', opened.exp === 'true' && opened.label === 'Details of birch' && opened.next && opened.text.startsWith('birch at 37%, 1 job') && opened.span === opened.cols && opened.w === 0 && opened.api === '2', JSON.stringify(opened));
  await tab.click(row('cedar') + ' td.main');
  await tab.click('#both tr.row-detail b >> nth=0');
  check('1.12 rows: without onRow a click on the row opens it; a click in the details closes nothing', (await at(() => both.expanded.map((r) => r.id).join())) === '2,3', await at(() => both.expanded.map((r) => r.id).join()));
  check('1.12 rows: a row with no details has no button, and can\'t be opened', await at((s) => { both.expand(1); return !document.querySelector(s + ' .row-turn button') && both.expanded.length === 2 && !document.querySelector(s).classList.contains('click'); }, row('amber')), '');
  await tab.click(row('birch') + ' .row-turn button');
  const shut = await at((s) => { const b = document.querySelector(s + ' .row-turn button'); return [b.getAttribute('aria-expanded'), b.hasAttribute('aria-controls'), document.querySelectorAll('#both tr.row-detail').length, document.querySelector(s).className.trim()]; }, row('birch'));
  check('1.12 rows: and closes them', JSON.stringify(shut) === '["false",false,1,"click"]', JSON.stringify(shut));
  // what is in the details stays through a refresh
  await tab.fill('#both tr.row-detail input', 'half a no');
  await at(() => { const i = document.querySelector('#both tr.row-detail input'); i.setSelectionRange(4, 4); window.kept = document.querySelector('#both tr.row-detail .row-box'); both.update(make(3)); });
  const typing = await at(() => ({ same: window.kept === document.querySelector('#both tr.row-detail .row-box'), value: document.activeElement.value, caret: document.activeElement.selectionStart, text: document.querySelector('#both tr.row-detail').textContent.slice(0, 12) }));
  check('1.12 rows: a refresh draws the details with the new row, and keeps what is being typed there', typing.same && typing.value === 'half a no' && typing.caret === 4 && typing.text === 'cedar at 77%', JSON.stringify(typing));
  const moved = await at(() => { both.sort.toggle('cpu'); both.redraw(); const tr = document.querySelector('#both tr.row-detail'); const a = tr ? tr.previousElementSibling.querySelector('.main').textContent : ''; both.filter((r) => r.name !== 'cedar'); const b = document.querySelectorAll('#both tr.row-detail').length; both.filter(null); const c = document.querySelectorAll('#both tr.row-detail').length; both.update(make().filter((r) => r.id !== 3)); both.update(make()); const d = both.expanded.length; both.sort.toggle('name'); both.sort.toggle('name'); return { a, b, c, d }; });
  check('1.12 rows: open details follow their row, come back with it, and close when it leaves the data', moved.a === 'cedar' && moved.b === 0 && moved.c === 1 && moved.d === 0, JSON.stringify(moved));
  await reset();
  await at(() => { both.expand(2); document.querySelector('#both tr.row-detail input').focus(); both.expand(2, false); });
  check('1.12 rows: closing details with the focus in them puts it on their button', (await at(() => document.activeElement.getAttribute('aria-label'))) === 'Details of birch', '');
  // what the reader changed there, while they are elsewhere on the page
  const form = await at(async () => {
    const n = document.createElement('div');
    document.querySelector('main').append(n);
    const t = Dash.table(n, { columns, rows: make().slice(0, 2), key: 'id', expand: (r) => `<p>${r.cpu}%</p><input data-key="note"><textarea name="why"></textarea><input type="checkbox" name="days" value="mon" checked><input type="checkbox" name="days" value="tue">
      <input type="radio" name="size" value="s" checked><input type="radio" name="size" value="l"><select name="kind"><option disabled value="">Pick</option><option value="a">A</option><option value="b">B</option></select>
      <select name="many" multiple><option value="x" selected>X</option><option value="y">Y</option></select><select name="lost"><option value="p">P</option><option value="r" selected>R</option>${r.cpu === 0 ? '<option value="q">Q</option>' : ''}</select>
      <input name="saved" value="${r.cpu}"><input name="twin"><input name="twin"><input type="file" data-key="file"><input name="same" value="as it was"><input type="hidden" name="at" value="${r.cpu}"><select name="top">${r.cpu === 0 ? '<option>a<option>b' : '<option>b<option>a'}</select><button type="button" data-key="save">Save</button>` });
    t.expand(1);
    const f = (q) => n.querySelector(q), all = (q) => [...n.querySelectorAll(q)];
    const read = () => [f('[data-key="note"]').value, f('textarea').value, all('[name="days"]').map((e) => e.checked).join(), all('[name="size"]').find((e) => e.checked).value, f('[name="kind"]').value, [...f('[name="many"]').selectedOptions].map((o) => o.value).join(), f('[name="lost"]').value, f('[name="saved"]').value, all('[name="twin"]').map((e) => e.value).join('/'), f('[name="same"]').value, f('[name="at"]').value, f('[name="top"]').value].join('|');
    const start = read(), was = f('.row-box').firstElementChild;
    t.update(make(3).slice(0, 2));
    const untouched = read();
    t.update(make().slice(0, 2));
    f('[data-key="note"]').value = 'a note'; f('textarea').value = 'because'; all('[name="days"]').forEach((e) => { e.checked = !e.checked; }); all('[name="size"]')[1].checked = true; f('[name="kind"]').value = 'b';
    for (const o of f('[name="many"]').options) o.selected = !o.selected;
    f('[name="lost"]').value = 'q'; f('[name="saved"]').value = 'mine'; all('[name="twin"]')[1].value = 'two'; f('[name="at"]').value = 'set by the page';
    const files = new DataTransfer(); files.items.add(new File(['x'], 'x.txt')); f('[type="file"]').files = files.files;
    f('[data-key="save"]').focus();
    t.update(make(5).slice(0, 2));
    const now = read(), focus = document.activeElement === f('[data-key="save"]'), drawn = f('.row-box').firstElementChild !== was && f('.row-box').firstElementChild.textContent;
    t.update(make(6).slice(0, 2));
    f('[data-key="note"]').value = '';
    t.update(make(7).slice(0, 2));
    const twice = read();
    f('[name="kind"]').value = 'a'; f('[name="kind"]').focus();
    t.update(make(8).slice(0, 2));
    const onIt = [f('[name="kind"]').value, document.activeElement === f('[name="kind"]')].join();
    n.remove();
    return { start, untouched, now, focus, drawn, twice, onIt };
  });
  check('1.12 rows: a refresh draws the details of a row nobody changed as the page gives them', form.start === '||true,false|s|a|x|r|0|/|as it was|0|a' && form.untouched === '||true,false|s|a|x|r|3|/|as it was|3|b', JSON.stringify(form));
  check('1.12 rows: and keeps what the reader typed, ticked and chose there while they are elsewhere; a value the page changed is the page\'s', form.drawn === '5%' && form.focus && form.now === 'a note|because|false,true|l|b|y|r|5|/|as it was|5|b', JSON.stringify(form));
  check('1.12 rows: through one refresh after another; a box emptied again stays empty; a choice they are still on, too', form.twice === '|because|false,true|l|b|y|r|7|/|as it was|7|b' && form.onIt === 'a,true', JSON.stringify(form));
  const point = await at(() => { const n = document.createElement('div'), T = Date.UTC(2026, 10, 24); document.querySelector('main').append(n); const t = Dash.table(n, { columns, rows: make().slice(0, 1), key: 'id', expand: (r, box) => { Dash.lines(box, [{ points: Array.from({ length: 9 }, (_, i) => [T + i * 6e4, i + r.cpu]) }], { label: 'x' }); } }); t.expand(1); const plot = () => n.querySelector('.line-plot'), key = (k) => plot().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); plot().focus(); key('Home'); key('ArrowRight'); const was = plot().getAttribute('aria-valuenow'); t.update(make(2).slice(0, 1)); t.update(make(4).slice(0, 1)); const out = [was, plot().getAttribute('aria-valuenow'), document.activeElement === plot(), n.querySelector('.line-tip').hidden, n.querySelector('.line-tip').textContent.includes('5')]; plot().blur(); out.push(n.querySelector('.line-tip').hidden); n.remove(); return out; });
  check('1.12 rows: a chart in the details keeps the reader at their point through a refresh, and lets go when they leave', JSON.stringify(point) === '["2","2",true,false,true,true]', JSON.stringify(point));
  const scrolled = await at(() => { const n = document.createElement('div'); document.querySelector('main').append(n); const t = Dash.table(n, { columns, rows: make().slice(0, 2), key: 'id', expand: () => '<div data-x style="height:40px;overflow:auto"><div style="height:200px">long</div></div>' }); t.expand(1); n.querySelector('[data-x]').scrollTop = 60; t.update(make(9).slice(0, 2)); const out = n.querySelector('[data-x]').scrollTop; n.remove(); return out; });
  check('1.12 rows: a refresh keeps the scrolling in the details', scrolled === 60, String(scrolled));
  // a table in the details is its own
  await tab.click(row('birch', 'wrap') + ' .row-turn button');
  await tab.click('#wrap .row-box [data-page="2"]');
  await tab.click('#wrap .row-box [data-sort="job"]');
  await tab.click('#wrap .row-box tbody .row-pick input >> nth=0');
  await at(() => { log.length = 0; });
  await tab.click('#wrap .row-box tbody td.main >> nth=0');
  const inner = await at(() => { const before = document.querySelector('#wrap .row-box'); wrapped.update(make(4).slice(0, 4)); const n = document.querySelector('#wrap .row-box'); return { same: n === before, sort: n.querySelector('th[aria-sort]')?.textContent, outer: document.querySelector('#wrap > .table-host > .table-wrap > table > thead th[aria-sort]') === null, bar: n.querySelector(':scope > .table-bar b').textContent, picked: wrapped.selected.map((r) => r.id).join(), rows: document.querySelectorAll('#wrap > .table-host > .table-wrap > table > tbody > tr[data-i]').length, log: log.join(), head: document.querySelector('#wrap > .table-host > .table-wrap > table > thead input').indeterminate }; });
  check('1.12 rows: a table in the details sorts, pages and picks by itself, and a refresh keeps it', inner.same && inner.sort === 'Job' && inner.outer && inner.bar === '1 selected' && inner.picked === '3' && inner.rows === 4 && inner.log === '' && inner.head, JSON.stringify(inner));
  await tab.hover('#wrap .row-box tbody tr >> nth=0'); // (the picked one)
  const look = await at(() => { const bg = (e) => getComputedStyle(e).backgroundColor; const t = [...document.querySelectorAll('#wrap .row-box tbody tr')]; return { a: bg(t[1].cells[1]), hover: bg(t[0].cells[1]), detail: bg(document.querySelector('#wrap tr.row-detail > td')), border: getComputedStyle(t[0].cells[1]).borderBottomWidth }; });
  check('1.12 rows: pointing at one of its rows lights that one only', look.a === 'rgba(0, 0, 0, 0)' && look.hover !== look.a && look.border === '1px', JSON.stringify(look));
  await at(() => wrapped.expand(4));
  check('1.12 rows: one: true keeps one row open', (await at(() => wrapped.expanded.map((r) => r.id).join())) === '4' && (await at(() => document.querySelectorAll('#wrap .row-detail').length)) === 1, '');

  // details that take a moment
  await tab.click(row('amber', 'opens') + ' .row-turn button');
  const wait = await at(() => { const b = document.querySelector('#opens .row-box'); return [b.textContent, b.getAttribute('aria-busy')]; });
  await at(() => { opens.update(make(2).slice(0, 5)); answer[1].ok('<p>First <b>answer</b></p>'); });
  await tab.waitForTimeout(30);
  const got = await at(() => { const b = document.querySelector('#opens .row-box'); return [b.innerHTML, b.getAttribute('aria-busy'), asked.join()]; });
  check('1.12 rows: details from a promise: a note, then the answer; a refresh doesn\'t ask again', wait[0] === 'Loading…' && wait[1] === 'true' && got[0] === '<p>First <b>answer</b></p>' && got[1] === null && got[2] === '1', JSON.stringify([wait, got]));
  const late = await at(async () => { opens.expand(1, false); opens.expand(1); const old = answer[1]; opens.expand(1, false); opens.expand(1); old.ok('too late'); await new Promise((ok) => setTimeout(ok, 20)); const a = document.querySelector('#opens .row-box').textContent; answer[1].ok('in time'); await new Promise((ok) => setTimeout(ok, 20)); const b = document.querySelector('#opens .row-box').textContent; opens.redraw(); const c = document.querySelector('#opens .row-box').textContent; answer[1].ok('anew'); await new Promise((ok) => setTimeout(ok, 20)); return [a, b, c, document.querySelector('#opens .row-box').textContent, asked.join()]; });
  check('1.12 rows: an answer for details closed since is dropped; opening them again, or redraw(), asks again', JSON.stringify(late) === '["Loading…","in time","Loading…","anew","1,1,1,1"]', JSON.stringify(late));
  await at(() => { opens.expand(3); answer[3].no(new Error('<i>HTTP 503</i>')); });
  await tab.waitForTimeout(30);
  const fail = await at(() => document.querySelectorAll('#opens .row-box')[1].textContent.trim());
  await tab.click('#opens [data-retry]');
  const retry = await at(() => [document.querySelectorAll('#opens .row-box')[1].textContent, document.activeElement.getAttribute('aria-label'), asked.at(-1)]);
  check('1.12 rows: one that fails says why and can be tried again', fail === 'Couldn’t load this: <i>HTTP 503</i> Try again' && JSON.stringify(retry) === '["Loading…","Details of cedar",3]', JSON.stringify([fail, retry]));
  // asked for again: what was changed there comes back with the answer, and the focus isn't lost meanwhile
  const asks = await at(async () => {
    const n = document.createElement('div'), go = [];
    document.querySelector('main').append(n);
    const t = Dash.table(n, { columns, rows: make().slice(0, 2), key: 'id', expand: () => new Promise((ok) => go.push(ok)) });
    const soon = () => new Promise((ok) => setTimeout(ok, 10)), html = (k) => `<p>${k}</p><input data-key="note">`;
    t.expand(2); go[0](html(1)); await soon();
    n.querySelector('.row-box input').value = 'typed'; n.querySelector('.row-box input').focus();
    t.redraw();
    const focus = document.activeElement.getAttribute('aria-label'), text = n.querySelector('.row-box').textContent;
    t.redraw(); // (asked twice, before the first answer)
    go[1](html(2)); go[2](html(3)); await soon();
    const out = [focus, text, n.querySelector('.row-box p').textContent, n.querySelector('.row-box input').value];
    t.redraw(); go[3](Promise.reject(new Error('no answer'))); await soon();
    const said = n.querySelector('.row-box').textContent.trim();
    n.querySelector('[data-retry]').click(); go[4](html(4)); await soon();
    out.push(said, n.querySelector('.row-box p').textContent, n.querySelector('.row-box input').value);
    n.querySelector('.row-box input').value = 'later'; t.redraw(); go[5](html(5)); await soon();
    out.push(n.querySelector('.row-box input').value);
    n.remove();
    return out;
  });
  check('1.12 rows: details asked for again keep what was typed, and the focus goes to their button', JSON.stringify(asks.slice(0, 4)) === '["Details of birch","Loading…","3","typed"]', JSON.stringify(asks));
  check('1.12 rows: also when the answer fails first and is asked for once more', JSON.stringify(asks.slice(4)) === '["Couldn’t load this: no answer Try again","4","typed","later"]', JSON.stringify(asks));
  const own = await at(async () => { const n = document.createElement('div'); document.querySelector('main').append(n); const t = Dash.table(n, { columns, rows: make().slice(0, 4), key: 'id', expand: (r, box) => { if (r.id === 1) throw new Error('made to fail'); if (r.id === 2) { const e = document.createElement('p'); e.textContent = 'an element'; return e; } if (r.id === 3) return (async () => { await null; box.textContent = 'drawn'; })(); return (async () => { await null; })(); } }); for (const k of [1, 2, 3, 4]) try { t.expand(k); } catch { /* (it should not reach the page) */ } await new Promise((ok) => setTimeout(ok, 20)); const out = [...n.querySelectorAll('.row-box')].map((b) => b.textContent.trim()); n.remove(); return out; });
  check('1.12 rows: details may be an element, be drawn into the box, or be nothing; an error in one leaves the others', JSON.stringify(own) === JSON.stringify(['Couldn’t load this: made to fail Try again', 'an element', 'drawn', '']), JSON.stringify(own));

  const second = await at(async () => { const n = document.createElement('div'); document.querySelector('main').append(n); let k = 0; const t = Dash.table(n, { columns, rows: make().slice(0, 2), key: 'id', expand: () => { if (!k++) throw new Error('made to fail'); return 'there'; } }); t.expand(2); const b = n.querySelector('[data-retry]'); b.focus(); b.click(); await new Promise((ok) => setTimeout(ok, 10)); const out = [n.querySelector('.row-box').textContent, document.activeElement.getAttribute('aria-label')]; n.remove(); return out; });
  check('1.12 rows: trying again what failed at once draws it, with the focus on its button', JSON.stringify(second) === '["there","Details of birch"]', JSON.stringify(second));

  // hidden values
  await at(() => { both.expand(2); picks.select([1]); opens.expand(1, false); opens.expand(1); answer[1].ok('<p>costs $53.50</p>'); });
  await tab.waitForTimeout(30);
  const seen = await at(() => [document.querySelector('#both .cost').textContent, document.querySelector('#opens .row-box').textContent, document.querySelector('#picks td input').getAttribute('aria-label')]);
  await tab.click('#eye');
  const hid = await at(() => ({ both: document.querySelector('#both .cost').textContent, opens: document.querySelector('#opens .row-box').textContent, label: document.querySelector('#picks td input').getAttribute('aria-label'), left: ['53.50'].filter((v) => document.querySelector('main').innerHTML.includes(v)), name: document.querySelector('#picks').innerHTML.includes('amber'), checked: document.querySelector('#picks td input').checked }));
  check('1.12 rows: hidden values: not in open details, not in those from a promise, not in a box\'s name', seen[0] === '$53.50' && seen[1] === 'costs $53.50' && seen[2] === 'Select amber' && hid.both === '000.00hidden' && hid.opens === 'Loading…' && hid.label === 'Select row 1' && hid.left.length === 0 && !hid.name && hid.checked, JSON.stringify([seen, hid]));
  await tab.click('#eye');
  await tab.context().close();

  // a phone
  const phone = await openRows({ width: 390, height: 780, hasTouch: true, isMobile: true });
  const pa = (f, a) => phone.evaluate(f, a);
  await pa(() => { wrapped.select([2]); wrapped.expand(1); });
  const card = await pa(() => {
    const q = (e) => e.getBoundingClientRect(), tr = document.querySelector('#wrap > .table-host > .table-wrap > table > tbody > tr'), title = document.createRange();
    title.selectNodeContents(tr.querySelector('.main'));
    const t = title.getBoundingClientRect(), pick = q(tr.querySelector('.row-pick input')), turn = q(tr.querySelector('.row-turn button')), act = q(tr.querySelector('.actions button')), hit = q(tr.querySelector('.row-pick')), mid = (r) => r.top + r.height / 2;
    const region = document.createRange(); region.selectNodeContents(tr.cells[3]);
    const box = document.querySelector('#wrap .row-box'), note = document.querySelector('#wrap .row-detail > td');
    return { apart: pick.right <= turn.left && turn.right <= t.left && t.right <= act.left, level: Math.max(Math.abs(mid(pick) - mid(t)), Math.abs(mid(turn) - mid(t))), hit: Math.min(hit.width, hit.height), left: getComputedStyle(note).textAlign, gap: Math.round(q(document.querySelector('#wrap .row-detail')).top - q(tr).bottom), over: document.documentElement.scrollWidth - innerWidth,
      all: [...document.querySelectorAll('.table-pick-all')].map((e) => getComputedStyle(e).display).join(), head: getComputedStyle(document.querySelector('#both thead')).display, tint: getComputedStyle(document.querySelectorAll('#wrap > .table-host > .table-wrap > table > tbody > tr[data-i]')[1]).backgroundColor !== getComputedStyle(document.querySelectorAll('#wrap > .table-host > .table-wrap > table > tbody > tr[data-i]')[2]).backgroundColor };
  });
  check('1.12 rows: on a phone a card has its box, its button, its title and its own buttons apart, on one line', card.apart && card.level <= 3 && card.hit >= 44 && card.over <= 0, JSON.stringify(card));
  check('1.12 rows: its details are right under it and read from the left; a picked card is tinted', card.left === 'left' && card.gap === 0 && card.tint, JSON.stringify(card));
  await phone.tap('#both .table-pick-all', { timeout: 3000 }).catch(() => {});
  check('1.12 rows: a box above the cards picks them all, as the header is gone', card.head === 'none' && card.all === 'flex,flex,flex,flex' && (await pa(() => both.selected.length)) === 7 && (await pa(() => document.querySelector('#both .table-pick-all input').checked)), JSON.stringify([card.all, await pa(() => both.selected.length)]));
  const inPanel = await pa(() => { const tr = document.querySelector('#both tbody tr'), q = (e) => e.getBoundingClientRect(); const region = tr.querySelector('[data-label]'); return { box: Math.round(q(tr.querySelector('.row-pick input')).left - q(tr).left), top: Math.round(q(document.querySelector('#both .table-pick-all input')).left - q(tr).left), pad: getComputedStyle(region).paddingLeft }; });
  check('1.12 rows: in a panel the boxes line up with its edge', inPanel.box === inPanel.top && Math.abs(inPanel.box) <= 1 && inPanel.pad === '0px', JSON.stringify(inPanel));
  const plainIn = await pa(() => { const n = document.createElement('div'); document.querySelector('main').append(n); const t = Dash.table(n, { columns, rows: make().slice(0, 2), key: 'id', expand: () => '<table class="table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' }); t.expand(1); const i = n.querySelector('.row-box table'); const out = [getComputedStyle(i).display, getComputedStyle(i.querySelector('thead')).display, getComputedStyle(i.querySelector('td')).display]; n.remove(); return out; });
  check('1.12 rows: a plain table in a card\'s details stays a table', JSON.stringify(plainIn) === '["table","table-header-group","table-cell"]', JSON.stringify(plainIn));
  const nav = await pa(() => { const n = document.createElement('nav'); n.className = 'bottom-nav'; n.innerHTML = '<a href="#">Home</a>'; document.body.append(n); both.select([1]); scrollTo(0, 0); return document.querySelector('.bottom-nav').getBoundingClientRect().top - document.querySelector('#both > .table-bar').getBoundingClientRect().bottom; });
  check('1.12 rows: the bar is above the navigation at the bottom', nav >= 4, String(nav));
  await phone.context().close();
  const tablet = await openRows({ width: 800 });
  const md = await tablet.evaluate(() => { const n = document.createElement('div'); n.className = 'panel'; document.querySelector('main').append(n); const t = Dash.table(n.appendChild(document.createElement('div')), { columns, rows: make().slice(0, 2), key: 'id', cls: 'stack stack-md', select: true, expand: () => 'x' }); t.expand(2); const q = (e) => e.getBoundingClientRect(), tr = n.querySelector('tbody tr'); return { all: getComputedStyle(n.querySelector('.table-pick-all')).display, other: getComputedStyle(document.querySelector('#both .table-pick-all')).display, box: Math.round(q(tr.querySelector('.row-pick input')).left - q(tr).left), pad: getComputedStyle(tr.querySelector('.main')).paddingLeft, text: getComputedStyle(n.querySelector('.row-detail > td')).textAlign }; });
  check('1.12 rows: .stack-md cards are the same from 900 px down', md.all === 'flex' && md.other === 'none' && Math.abs(md.box) <= 1 && md.pad === '66px' && md.text === 'left', JSON.stringify(md));
  await tablet.context().close();

  // a strict style policy
  const strictTab = await openRows({ page: 'csp.html' });
  const strict = await strictTab.evaluate(async () => { const n = document.createElement('div'); document.querySelector('main').append(n); const t = Dash.table(n, { columns: [{ key: 'a', label: 'A', main: true }], rows: [{ a: 1 }, { a: 2 }], key: 'a', select: { actions: [{ label: 'Go', run() {} }] }, expand: async () => '<p>x</p>' }); t.select([1]); t.expand(2); await new Promise((ok) => setTimeout(ok, 200)); return [violations.length, n.querySelector('.row-box').textContent, n.querySelector('.table-bar b').textContent, n.innerHTML.includes('style=')]; });
  check('1.12 rows: under a strict style policy it breaks nothing', JSON.stringify(strict) === '[0,"x","1 selected",false]', JSON.stringify(strict));
  await strictTab.context().close();
}

// ---- 1.13 Dash.form (test/forms.html)
{
  const openForms = async ({ width = 1000, height = 900, page = 'forms.html', ...more } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', ...more });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(5000);
    tab.on('pageerror', (e) => { if (e.message !== 'made to fail') errors.push(e.message); });
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openForms();
  // a page that hangs (an endless redraw) ends in a FAIL line
  const at = async (f, a) => { let t; try { return await Promise.race([tab.evaluate(f, a), new Promise((_, no) => { t = setTimeout(() => no(new Error('the page hangs')), 10000); })]); } finally { clearTimeout(t); } };
  const errs = (n = 'account') => at((k) => JSON.stringify(window[k].errors), n);
  const logged = () => at(() => log.splice(0).join('|'));
  const tick = (ms = 40) => tab.waitForTimeout(ms);
  const active = () => at(() => document.activeElement.id || document.activeElement.name || document.activeElement.tagName);
  const about = (id) => at((i) => { const e = document.getElementById(i); return { bad: e.getAttribute('aria-invalid'), text: (e.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map((k) => document.getElementById(k)?.textContent ?? '?').join(' + '), field: e.closest('.field')?.classList.contains('invalid') ?? null }; }, id);
  const type = async (id, text) => { await tab.fill('#' + id, ''); await tab.focus('#' + id); await tab.keyboard.type(text); };
  const good = async () => { // everything right, as the reader would leave it
    await at(() => { account.clear(); send = null; log.length = 0; for (const [id, v] of Object.entries({ 'a-name': 'Treasury', 'a-email': 'a@example.com', 'a-pw': 'secret', 'a-again': 'secret', 'a-handle': 'ada', 'a-count': '2', 'a-region': 'eu', 'a-day': '2026-01-15', 'a-owner': 'Ada', 'a-note': '' })) document.getElementById(id).value = v;
      for (const e of document.querySelectorAll('#account [name="days"]')) e.checked = e.value === 'tue'; document.querySelector('#account [name="plan"][value="l"]').checked = true; document.querySelector('[name="terms"]').checked = true; document.querySelector('[name="limit"]').value = '10'; document.querySelector('[name="low"]').value = '1'; document.querySelector('[name="high"]').value = '9'; document.querySelector('[name="nick"]').value = ''; document.querySelector('[name="version"]').value = '7'; });
  };
  const save = async (say = '') => { await tab.click('#a-save'); await tick(); await at((t) => { for (const k of Object.keys(answer)) answer[k].ok(t); answer = {}; }, say); await tick(); };

  const served0 = { ...(await about('h-x')), text2: await at(() => document.getElementById('auto2').noValidate) };
  check('1.13 forms: what the server wrote into a data-validate form is marked at load', served0.bad === 'true' && served0.text === 'From the server.' && served0.text2, JSON.stringify(served0));
  const voice = await at(() => { const v = document.querySelectorAll('[data-dash-voice]'); return [v.length, v[0]?.parentElement.tagName, v[0]?.getAttribute('role'), v[0]?.textContent, document.querySelectorAll('#old [role]').length].join(); });
  check('1.13 forms: one line for a screen reader, there before it speaks, outside the forms', voice === '1,BODY,status,,0', voice);

  // nothing until there is something to say
  const rest = await at(() => ({ marks: document.querySelectorAll('#account [aria-invalid], #account .field-err, #account .field.invalid').length, asked: document.getElementById('account').noValidate, old: document.getElementById('old').noValidate, words: document.querySelector('#old .err').textContent, flag: document.getElementById('old').hasAttribute('data-dash-form') }));
  check('1.13 forms: nothing shows at the start, and a form that was not asked about is left alone', rest.marks === 0 && rest.asked && !rest.old && rest.words === 'The page’s own words' && !rest.flag, JSON.stringify(rest));
  await tab.focus('#a-name');
  for (let i = 0; i < 3; i++) await tab.keyboard.press('Tab');
  await tick();
  check('1.13 forms: going through fields without touching them says nothing', (await errs()) === '{}', await errs());

  // leaving a changed field; putting it right
  await type('a-name', 'ab');
  const typing = await about('a-name');
  await tab.keyboard.press('Tab');
  await tick();
  const left = await about('a-name');
  check('1.13 forms: nothing while typing; leaving a field says what is wrong, after its hint', typing.bad === null && left.bad === 'true' && left.text === 'Shown in the list. + Use at least 3 characters.' && left.field && (await active()) === 'a-email', JSON.stringify([typing, left, await active()]));
  check('1.13 forms: a screen reader hears it, with the field\'s name', (await at(() => document.querySelector('body > [data-dash-voice]')?.textContent)) === 'Name: Use at least 3 characters.', await at(() => document.querySelector('body > [data-dash-voice]')?.textContent));
  await tab.focus('#a-name');
  await tab.keyboard.press('End');
  await tab.keyboard.type('c');
  const right = await about('a-name');
  check('1.13 forms: putting it right takes it away at once, and the hint stays', right.bad === null && right.text === 'Shown in the list.' && !right.field && (await at(() => document.querySelector('#a-name').closest('.field').querySelector('.err').hidden)), JSON.stringify(right));
  await type('a-name', 'a b c');
  await tab.keyboard.press('Tab');
  await tick();
  const spaces = (await about('a-name')).text;
  await type('a-name', 'admin');
  await tab.keyboard.press('Tab');
  await tick();
  const admin = (await about('a-name')).text;
  await type('a-name', '    ');
  await tab.keyboard.press('Tab');
  await tick();
  check('1.13 forms: rules in order, and spaces alone are not an answer', spaces.endsWith('Leave out the spaces.') && admin.endsWith('Not that one.') && (await about('a-name')).text.endsWith('Fill this in.'), JSON.stringify([spaces, admin, (await about('a-name')).text]));
  await type('a-email', 'abc');
  await tab.keyboard.press('Tab');
  await tick();
  check('1.13 forms: the kit\'s own words, never with what was typed; into the field\'s own .err', (await about('a-email')).text === 'Enter an email address, like name@example.com.' && (await at(() => document.querySelectorAll('#a-email-err').length === 1 && document.querySelector('#a-email').closest('.field').querySelectorAll('.err').length === 1)), JSON.stringify(await about('a-email')));
  // a field about another field
  await type('a-pw', 'secret');
  await type('a-again', 'secreT');
  await tab.keyboard.press('Tab');
  await tick();
  const differ = (await about('a-again')).text;
  await type('a-pw', 'secreT');
  const agree = (await about('a-again')).text;
  await type('a-pw', 'other');
  const still = (await about('a-again')).text;
  await tab.keyboard.press('Tab');
  await tick();
  check('1.13 forms: a field about another one: says so when left, goes when the other is put right, comes back when that changes again', differ === 'The passwords differ.' && agree === '' && still === '' && (await about('a-again')).text === 'The passwords differ.', JSON.stringify([differ, agree, still, await about('a-again')]));

  // a rule that asks: one that is async isn't asked on any key, also when the field showed something before
  await good();
  await type('a-handle', 'BOB');
  await tab.keyboard.press('Tab');
  await tick();
  const small = [(await about('a-handle')).text, await logged()];
  await type('a-handle', 'bob');
  const keys = await logged();
  await tab.keyboard.press('Tab');
  await tick();
  const asking = { log: await logged(), ...(await about('a-handle')), busy: await at(() => document.querySelector('#a-handle').closest('.field').querySelector('.err').hasAttribute('data-checking')), color: await at(() => getComputedStyle(document.querySelector('#a-handle').closest('.field').querySelector('.err')).color === getComputedStyle(document.querySelector('#a-name-hint')).color) };
  check('1.13 forms: a rule that asks waits until the browser\'s checks are fine and the field is left; meanwhile it says so', small[0] === 'Use small letters and digits.' && small[1] === '' && keys === '' && asking.log === 'ask bob' && asking.text === 'Checking…' && asking.bad === null && asking.busy && asking.color, JSON.stringify([small, keys, asking]));
  await at(() => { window.first = answer.bob; first.ok('That name is taken.'); });
  await tick();
  const taken = await about('a-handle');
  await tab.focus('#a-handle');
  await tab.keyboard.type('by');
  const typed = [(await about('a-handle')).text, await logged()];
  await tab.keyboard.press('Tab');
  await tick();
  await type('a-handle', 'cy');
  await tab.keyboard.press('Tab');
  await tick();
  await at(() => { answer.bobby.ok('too late'); answer.cy.ok(''); });
  await tick();
  check('1.13 forms: its answer shows; it isn\'t asked on every key; a late answer about an older text is dropped', taken.text === 'That name is taken.' && taken.bad === 'true' && typed.join() === ',' && (await logged()) === 'ask bobby|ask cy' && (await about('a-handle')).text === '', JSON.stringify([taken, typed, await about('a-handle')]));
  await tab.focus('#a-handle');
  await tab.keyboard.press('Tab');
  await tab.focus('#a-name');
  await tick();
  check('1.13 forms: an answer that is in isn\'t asked for again', (await logged()) === '', '');

  await at(() => { account.clear(); }); // (what was said before isn't what is heard now)
  await type('a-handle', 'dee');
  await tab.keyboard.press('Tab');
  await tick();
  await tab.keyboard.type('1');
  await at(() => { answer.dee?.ok('That name is taken.'); });
  await tick();
  check('1.13 forms: its answer is heard, though the reader types on in the next field', (await at(() => document.querySelector('body > [data-dash-voice]')?.textContent)) === 'Handle: That name is taken.', await at(() => document.querySelector('body > [data-dash-voice]')?.textContent));

  // submitting
  await at(() => { document.getElementById('account').reset(); account.clear(); log.length = 0; });
  await tab.click('#a-save');
  await tick();
  const empty = { e: JSON.parse(await errs()), focus: await active(), log: await logged(), say: await at(() => document.querySelector('body > [data-dash-voice]')?.textContent) };
  check('1.13 forms: submitting checks all and goes to the first problem; nothing is sent, and the page\'s own listener isn\'t told', Object.keys(empty.e).join() === 'name,email,password,handle,region,owner,plan,days,terms' && empty.e.region === 'Choose one.' && empty.e.terms === 'Tick this to go on.' && empty.focus === 'a-name' && empty.log === '' && empty.say === '9 fields to fix', JSON.stringify(empty));
  const groups = await at(() => ({ days: document.querySelector('#days > .field-err')?.textContent, dayMarks: [...document.querySelectorAll('[name="days"]')].map((e) => e.getAttribute('aria-describedby')), plan: document.querySelector('#account .choices + .field-err')?.textContent, terms: document.querySelector('#terms + .field-err')?.textContent, inLabel: document.querySelectorAll('#account label.choice .field-err, #account label.checkline .field-err').length, all: document.querySelectorAll('#account .field-err').length }));
  check('1.13 forms: a group has one message, outside its labels', groups.days === 'Choose a day.' && groups.dayMarks[0] && groups.dayMarks[0] === groups.dayMarks[1] && groups.plan === 'Choose one.' && groups.terms === 'Tick this to go on.' && groups.inLabel === 0 && groups.all === 3, JSON.stringify(groups));
  await tab.click('#account [name="plan"][value="s"]');
  await tab.click('#account [name="days"][value="mon"]');
  await tab.selectOption('#a-region', 'eu');
  const fixed = JSON.parse(await errs());
  await tab.click('#account [name="days"][value="mon"]');
  await tab.focus('#account [name="days"][value="tue"]');
  await tick();
  const unticked = JSON.parse(await errs()).days;
  await tab.focus('#a-note');
  await tick();
  check('1.13 forms: choosing takes a message away; a group of checkboxes is judged once it is left', !fixed.plan && !fixed.days && !fixed.region && unticked === undefined && JSON.parse(await errs()).days === 'Choose a day.', JSON.stringify([fixed, unticked, await errs()]));
  await tab.focus('#terms input');
  await tab.keyboard.press('Space');
  const ticked = JSON.parse(await errs()).terms;
  await tab.keyboard.press('Space');
  check('1.13 forms: a box that is unticked is judged at once', ticked === undefined && JSON.parse(await errs()).terms === 'Tick this to go on.' && (await at(() => document.activeElement.name)) === 'terms', JSON.stringify([ticked, await errs()]));
  const held2 = await at(async () => { const stop = (e) => e.preventDefault(); document.getElementById('account').addEventListener('reset', stop); document.getElementById('a-reset').click(); await new Promise((ok) => setTimeout(ok, 20)); document.getElementById('account').removeEventListener('reset', stop); return Object.keys(account.errors).length; });
  check('1.13 forms: a reset that is called off takes nothing away', held2 > 3, String(held2));
  const red = await at(() => { document.activeElement.blur(); const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.append(i); const bad = getComputedStyle(i).color; i.remove(); const t = document.querySelector('#terms input'), s = getComputedStyle(t); return [s.outlineStyle, s.outlineColor === bad, getComputedStyle(document.querySelector('#terms + .field-err')).color === bad, getComputedStyle(document.querySelector('label[for="a-name"]'), '::after').content.includes('*'), getComputedStyle(document.querySelector('label[for="a-email"]'), '::after').content].join(); });
  check('1.13 forms: a box to tick, its words and the star are red', red === 'solid,true,true,true,none', red);
  await tab.click('#a-reset');
  await tick();
  check('1.13 forms: a reset takes all messages away', (await errs()) === '{}' && (await at(() => document.querySelectorAll('#account [aria-invalid], #account .field.invalid, #account .field-err:not([hidden])').length)) === 0 && (await at(() => document.querySelector('body > [data-dash-voice]').textContent)) === '', await errs());
  await tab.focus('#a-name');
  await tab.keyboard.press('Enter');
  await tick();
  check('1.13 forms: Enter in a field submits, and is checked too', JSON.parse(await errs()).email === 'Fill this in.' && (await logged()) === '', await errs());

  await good();
  await tab.click('#a-save');
  await tick();
  const waiting = await at(() => ({ busy: document.getElementById('a-save').getAttribute('aria-busy'), off: document.getElementById('a-save').disabled, log: log.join('|') }));
  await at(() => document.getElementById('account').requestSubmit());
  await at(() => { answer.ada?.ok(''); });
  await tick();
  const sent = await at(() => JSON.stringify(sent));
  check('1.13 forms: while a rule is asked the button is busy, and a second submit does nothing', waiting.busy === 'true' && waiting.off && waiting.log === 'ask ada' && (await logged()) === 'ask ada|save save' && (await at(() => !document.getElementById('a-save').disabled)) && (await active()) === 'a-save', JSON.stringify(waiting));
  check('1.13 forms: the values: numbers, true and false, lists, files; buttons left out', sent === '{"name":"Treasury","email":"a@example.com","password":"secret","again":"secret","handle":"ada","seats":2,"region":"eu","day":"2026-01-15","owner":"Ada","low":1,"high":9,"nick":"","limit":"10","plan":"l","days":["tue"],"terms":true,"alerts":false,"file":null,"note":"","version":"7"}', sent);
  await tab.click('#a-save');
  await tick();
  check('1.13 forms: with nothing to wait for it is sent at once; with onSubmit the event ends there', (await logged()) === 'save save' && (await at(() => lastSubmit.defaultPrevented)), '');
  const list = await at(() => { const f = document.createElement('form'); f.innerHTML = '<input name="tag" value="a"><input name="tag" value="b"><input type="checkbox" name="one[]" value="x" checked><input name="solo[]" value="s"><select name="many" multiple><option selected>p</option><option selected>q</option></select><input name="n" type="number"><input id="noname" value="z"><input type="checkbox" name="__proto__" checked>'; document.body.append(f); const h = Dash.form(f); const v = h.values(); f.remove(); return JSON.stringify(v) + Object.keys(v).length; });
  check('1.13 forms: a repeated name, name[] and a list of choices are lists; an empty number is null', list === '{"tag":["a","b"],"one[]":["x"],"solo[]":["s"],"many":["p","q"],"n":null,"__proto__":true}6', list);

  // what comes back from the server
  await good();
  await at(() => { send = async () => { throw Object.assign(new Error('Not saved'), { errors: { handle: 'That name is taken.', other: ['No.', 'x'], days: '' } }); }; });
  await save();
  const back = { e: JSON.parse(await errs()), focus: await active(), line: await at(() => { const p = document.querySelector('#account .form-error'); return p ? [p.textContent, p.getAttribute('role'), p.nextElementSibling.contains(document.getElementById('a-save')), getComputedStyle(p).display].join('|') : 'none'; }) };
  check('1.13 forms: errors by field land on the fields, the rest on a line above the buttons', back.e.handle === 'That name is taken.' && !back.e.days && back.focus === 'a-handle' && back.line === 'other: No.|alert|true|block', JSON.stringify(back));
  await tab.keyboard.press('End');
  await tab.keyboard.type('1');
  const gone = JSON.parse(await errs()).handle;
  await tab.keyboard.press('Backspace');
  await at(() => { send = null; log.length = 0; });
  await save();
  const again = [await logged(), await errs(), await at(() => document.querySelector('#account .form-error')?.hidden ?? true)];
  check('1.13 forms: changing the field takes it away, and it doesn\'t stop the next save', gone === undefined && again[0] === 'save save' && again[1] === '{}' && again[2], JSON.stringify([gone, again]));
  await at(() => { send = async () => { throw Object.assign(new Error('HTTP 422'), { body: { errors: { email: ['Not known here.', 'x'] } } }); }; });
  await save();
  const body = JSON.parse(await errs());
  check('1.13 forms: also from the body of Dash.api\'s error', body.email === 'Not known here.' && body[''] === undefined && (await active()) === 'a-email', JSON.stringify(body));
  await at(() => { send = async () => { throw Object.assign(new Error('Server <b>down</b>'), { status: 503 }); }; });
  await save();
  const down = { e: JSON.parse(await errs()), focus: await active(), html: await at(() => document.querySelector('#account .form-error')?.innerHTML), lines: await at(() => document.querySelectorAll('#account .form-error').length) };
  check('1.13 forms: any other error is the line, as text; the focus is back on the button', down.e[''] === 'Server <b>down</b>' && Object.keys(down.e).length === 1 && down.focus === 'a-save' && down.html === 'Server &lt;b&gt;down&lt;/b&gt;' && down.lines === 1, JSON.stringify(down));
  await at(() => { send = null; });
  await save();
  check('1.13 forms: the next save takes the line away', (await errs()) === '{}', await errs());

  // a rule that can't answer
  await good();
  await type('a-handle', 'zed');
  await tab.keyboard.press('Tab');
  await tick();
  await at(() => { answer.zed?.no(new Error('offline')); answer = {}; });
  await tick();
  const quiet = await errs();
  await at(() => { log.length = 0; });
  await tab.click('#a-save');
  await tick();
  await at(() => { answer.zed?.no(new Error('offline')); answer = {}; });
  await tick();
  const cant = [JSON.parse(await errs()).handle, await logged()];
  await save();
  check('1.13 forms: a rule that can\'t answer is quiet when the field is left, stops a save, and is asked again', quiet === '{}' && cant[0] === 'Couldn’t check this: offline' && cant[1] === 'ask zed' && (await logged()) === 'ask zed|save save', JSON.stringify([quiet, cant]));
  // the reader goes on typing while it is asked
  await good();
  await at(() => { document.getElementById('a-handle').value = 'max'; });
  await tab.click('#a-save');
  await tick();
  await tab.focus('#a-handle');
  await tab.keyboard.press('End');
  await tab.keyboard.type('i');
  await at(() => { answer.max.ok(''); });
  await tick();
  const second = await logged();
  await at(() => { answer.maxi?.ok('Not that.'); answer = {}; });
  await tick();
  check('1.13 forms: what the reader changed while a save waits is checked too, before anything is sent', second === 'ask max|ask maxi' && JSON.parse(await errs()).handle === 'Not that.' && (await logged()) === '', JSON.stringify([second, await errs()]));
  const bug = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<input name="x" value="1">'; document.body.append(f); let sent = 0; const h = Dash.form(f, { rules: { x: () => { throw new Error('made to fail'); } }, onSubmit: () => { sent++; } }); f.requestSubmit(); const out = [h.errors.x, sent]; f.remove(); return out; });
  check('1.13 forms: a rule with a mistake in it lets nothing through', bug[0] === 'Couldn’t check this: made to fail' && bug[1] === 0, JSON.stringify(bug));

  // about the form as a whole; a button that skips the checks
  await good();
  await at(() => { document.getElementById('a-count').value = '12'; });
  await save();
  const whole = [JSON.parse(await errs()), await logged()];
  await tab.selectOption('#a-region', 'us');
  check('1.13 forms: a rule about the whole form is the line, and goes when it is put right', whole[0][''] === 'Frankfurt has ten seats.' && whole[1] === 'ask ada' && (await errs()) === '{}', JSON.stringify([whole, await errs()]));
  const wholeAsks = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<input class="input" name="x" aria-label="X"><button class="btn">Go</button>'; document.querySelector('main').append(f); let n = 0, heard = 0; Dash.form(f, { rules: { '': async (all) => { n += 1; if (n > 20) throw new Error('again and again'); return all.x === 'no' && 'Not that.'; } } }); f.addEventListener('submit', (e) => { e.preventDefault(); heard += 1; }); f.elements.x.value = 'no'; f.requestSubmit(); await new Promise((ok) => setTimeout(ok, 30)); const out = [n, heard, f.querySelector('.form-error').textContent]; f.elements.x.value = 'yes'; f.requestSubmit(); await new Promise((ok) => setTimeout(ok, 30)); out.push(n, heard); f.remove(); return out.join(); });
  check('1.13 forms: a rule about the whole form that asks: once per submit', wholeAsks === '1,0,Not that.,2,1', wholeAsks);
  await at(() => { document.getElementById('a-name').value = ''; log.length = 0; });
  await tab.click('#a-draft');
  await tick();
  check('1.13 forms: a button with formnovalidate skips the checks', (await logged()) === 'save ' && (await errs()) === '{}', await errs());

  const spots = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<fieldset id="fs"><legend>L</legend><label class="checkline"><input type="checkbox" name="a" value="1">1</label><label class="checkline"><input type="checkbox" name="a" value="2">2</label></fieldset><div id="mixed"><label class="checkline"><input type="radio" name="r" value="1" required>1</label><input class="input" name="other" aria-label="Other"><label class="checkline" id="last"><input type="radio" name="r" value="2" required>2</label></div><button class="btn">Go</button>'; document.querySelector('main').append(f); const h = Dash.form(f, { rules: { a: (v) => !v.length && 'Tick one.' } }); await h.check(); const out = [f.querySelector('#fs').lastElementChild.textContent, f.querySelector('#last').nextElementSibling?.className, f.querySelector('#last').nextElementSibling?.textContent]; f.remove(); return out.join(); });
  check('1.13 forms: the words of a group: in its fieldset; after the last one when other fields are between', spots === 'Tick one.,field-err,Choose one.', spots);

  // the kinds of fields
  await good();
  const kinds = await at(async () => { const out = {}; const set = async (id, v, name) => { const e = document.getElementById(id) || document.querySelector(`#account [name="${id}"]`); const was = e.value; e.value = v; await account.check(name || id); out[`${name || id} ${v}`] = account.errors[name || id]; e.value = was; await account.check(name || id); };
    await set('a-count', '0', 'seats'); await set('a-count', '21', 'seats'); await set('a-count', '2.5', 'seats'); await set('a-day', '2026-02-30', 'day'); await set('a-day', '2026-01-09', 'day'); await set('a-day', '2026/1/12', 'day'); await set('nick', 'far too long', 'nick'); await set('version', '8', 'version'); await set('high', '1', 'high'); await set('a-note', 'bad', 'note'); return out; });
  check('1.13 forms: the words for each kind', JSON.stringify(kinds) === JSON.stringify({ 'seats 0': 'Use 1 or more.', 'seats 21': 'Use 20 or less.', 'seats 2.5': 'Use a whole number.', 'day 2026-02-30': 'Enter a date as YYYY-MM-DD.', 'day 2026-01-09': 'Choose a day from 2026-01-10 to 2026-01-20.', 'nick far too long': 'Use at most 8 characters.', 'version 8': 'Not this version.', 'high 1': 'High must be above low.', 'note bad': '<b>Not</b> that & this.' }), JSON.stringify(kinds));
  const words = await at(() => { const t = Dash.form.text, e = (p) => ({ type: 'text', tagName: 'INPUT', min: '', max: '', step: '', title: '', value: '', ...p }); return [t.valueMissing(e({ type: 'file' })), t.valueMissing(e({ type: 'date' })), t.valueMissing(e({ type: 'time' })), t.badInput(e({ type: 'number' })), t.badInput(e({ type: 'date' })), t.typeMismatch(e({ type: 'url' })), t.tooShort(e({ minLength: 1 })), t.patternMismatch(e({})), t.rangeUnderflow(e({ min: '2026-01-01' })), t.rangeOverflow(e({ max: '2026-01-01' })), t.stepMismatch(e({ step: '5', min: '10', value: '12' })), t.stepMismatch(e({ step: '0.5', value: '0.2' })), t.stepMismatch(e({ step: '60', value: '10:00:30' })), t.dateRange('2026-01-01', null), t.dateRange(null, '2026-01-01')].join('|'); });
  check('1.13 forms: and for the others', words === 'Choose a file.|Choose a date.|Choose a time.|Enter a number.|Enter a whole date.|Enter a whole address, like https://example.com.|Use at least 1 character.|That isn’t in the right form.|Choose 2026-01-01 or later.|Choose 2026-01-01 or earlier.|Use steps of 5 from 10.|Use steps of 0.5.|Choose another one.|Choose 2026-01-01 or later.|Choose 2026-01-01 or earlier.', words);
  await type('a-count', 'e');
  await tab.keyboard.press('Tab');
  await tick();
  check('1.13 forms: text in a number box is no empty number box', (await about('a-count')).text === 'Enter a number.', JSON.stringify(await about('a-count')));
  const custom = await at(async () => { const e = document.getElementById('a-note'); e.setCustomValidity('Says the page.'); await account.check('note'); const a = account.errors.note; e.setCustomValidity(''); await account.check('note'); const was = Dash.form.text.valueMissing; Dash.form.text.valueMissing = 'Fehlt.'; document.getElementById('a-name').value = ''; await account.check('name'); const b = account.errors.name; Dash.form.text.valueMissing = was; return [a, b, account.errors.note]; });
  check('1.13 forms: a page\'s setCustomValidity counts, and the kit\'s words can be changed', JSON.stringify(custom) === '["Says the page.","Fehlt.",null]', JSON.stringify(custom));
  const marks = await at(async () => { const low = document.querySelector('[name="low"]'), high = document.querySelector('[name="high"]'); account.clear(); high.value = '1'; await account.check('high'); const color = (e) => getComputedStyle(e).borderTopColor; document.activeElement.blur(); const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.append(i); const bad = getComputedStyle(i).color; i.remove(); const out = { low: color(low) === bad, high: color(high) === bad, text: document.querySelector('#span .err').textContent, lowMark: low.getAttribute('aria-invalid') }; high.focus(); out.focus = color(high) === bad; const ring = getComputedStyle(high).boxShadow; high.value = '9'; await account.check('high'); out.ring = ring !== 'none' && ring !== getComputedStyle(high).boxShadow; out.field = document.getElementById('span').className; low.value = ''; low.required = true; await account.check(['low', 'high']); out.first = [document.getElementById('span').className, document.querySelector('#span .err').textContent].join(); low.value = '1'; low.required = false; await account.check(['low', 'high']); return out; });
  check('1.13 forms: two boxes in one field: only the wrong one is red, also while it has the focus', JSON.stringify(marks) === '{"low":false,"high":true,"text":"High must be above low.","lowMark":null,"focus":true,"ring":true,"field":"field","first":"field invalid,Fill this in."}', JSON.stringify(marks));
  await at(async () => { document.querySelector('[name="nick"]').value = 'far too long'; await account.check('nick'); });
  const nick = [await tab.getByRole('textbox', { name: 'Nickname', exact: true }).count(), await at(() => { const e = document.querySelector('#wrapped .err'); return [e.textContent, e.getAttribute('aria-hidden'), document.querySelector('[name="nick"]').getAttribute('aria-describedby') === e.id].join(); })];
  check('1.13 forms: a message inside a label isn\'t part of the field\'s name', nick[0] === 1 && nick[1] === 'Use at most 8 characters.,true,true', JSON.stringify(nick));
  await tab.fill('#account [name="limit"]', '');
  await tab.keyboard.press('Tab');
  await tick();
  const forEl = await at(() => { const e = document.querySelector('#account [name="limit"]'); return [document.getElementById('limit-err').textContent, e.getAttribute('aria-describedby'), document.querySelectorAll('#group + .field-err').length, getComputedStyle(e).zIndex].join(); });
  check('1.13 forms: data-error-for says where the words go; a wrong box in a group is above its neighbours', forEl === 'Fill this in.,limit-err,0,1', forEl);
  const files = await at(async () => { const i = document.querySelector('#zone input'), dt = new DataTransfer(); dt.items.add(new File(['far too big'], 'x.txt')); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((ok) => setTimeout(ok, 20)); const a = [account.errors.file, document.querySelector('#zone + .field-err')?.textContent, account.values().file.name, getComputedStyle(document.getElementById('zone')).borderTopColor !== getComputedStyle(document.getElementById('group').querySelector('.affix')).borderTopColor]; i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); a.push(account.errors.file); return JSON.stringify(a); });
  check('1.13 forms: files', files === '["That file is too big.","That file is too big.","x.txt",true,null]', files);

  const asText = await at(async () => { const e = document.getElementById('a-note'); e.value = 'bad'; await account.check('note'); const a = e.closest('.field').querySelector('.err').innerHTML; e.value = ''; await account.check('note'); return a; });
  check('1.13 forms: words are text, never markup', asText === '&lt;b&gt;Not&lt;/b&gt; that &amp; this.', asText);
  const odd = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<div class="field"><input class="input" name="toString" aria-label="X"></div><button class="btn">Go</button>'; document.querySelector('main').append(f); const h = Dash.form(f); const ok = await h.check(); const g = document.createElement('form'); g.innerHTML = '<div class="field"><input class="input" name="x" aria-label="X"></div><button class="btn">Go</button>'; document.querySelector('main').append(g); const seen = []; const k = Dash.form(g, { rules: { x: [async () => { seen.push(1); return ''; }, (v) => { seen.push(2); return v !== 'ok' && 'From the second.'; }] } }); const two = await k.check(); const text = k.errors.x; f.remove(); g.remove(); return [ok, two, text, seen.join('')].join(); });
  check('1.13 forms: a field called toString has no rule; a rule after one that asks', odd === 'true,false,From the second.,12', odd);

  // the kit's own fields
  await good();
  await at(() => { account.clear(); document.getElementById('a-owner').value = ''; });
  await type('a-owner', 'zz');
  await tab.keyboard.press('Enter');
  await tick();
  const listed = [JSON.parse(await errs()).owner, await logged()];
  await tab.keyboard.press('Tab');
  await tick(80);
  const emptied = [JSON.parse(await errs()).owner, await at(() => document.getElementById('a-owner').value)];
  check('1.13 forms: suggestions that must be picked: other text stops a save; leaving the box empties it', listed[0] === 'Choose one from the list.' && !listed[1].includes('save') && emptied[0] === 'Fill this in.' && emptied[1] === '', JSON.stringify([listed, emptied]));
  await at(() => { account.clear(); window.heard = []; new MutationObserver(() => heard.push(document.querySelector('body > [data-dash-voice]')?.textContent)).observe(document.querySelector('body > [data-dash-voice]'), { childList: true }); });
  await type('a-owner', 'ben');
  await tab.keyboard.press('Tab');
  await tick(80);
  check('1.13 forms: text that is one is put right first, without a word', (await errs()) === '{}' && (await at(() => document.getElementById('a-owner').value)) === 'Ben' && !(await at(() => heard.join())).includes('Owner'), await at(() => JSON.stringify([heard, account.errors])));
  await type('a-day', '2026-01-99');
  await tab.keyboard.press('Tab');
  await tick();
  const day = await about('a-day');
  await tab.click('#account .date-btn');
  await tab.click('.calendar [data-date="2026-01-12"]');
  await tick();
  const picked = { ...(await about('a-day')), v: await at(() => document.getElementById('a-day').value) };
  check('1.13 forms: a date: a wrong one says so, picking one in the calendar takes it away', day.text === 'Enter a date as YYYY-MM-DD.' && day.bad === 'true' && picked.bad === null && picked.text === '' && picked.v === '2026-01-12', JSON.stringify([day, picked]));

  await tab.click('#account .date-btn');
  await tab.click('.calendar [data-date="2026-01-18"]');
  await tick();
  check('1.13 forms: a day picked in the calendar is judged at once', (await about('a-day')).text === 'Not on a Sunday.' && (await about('a-day')).bad === 'true', JSON.stringify(await about('a-day')));
  const given = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<div class="field"><input class="input" id="cb-x" name="x" value="Given" aria-label="X"></div><button class="btn">Go</button>'; document.querySelector('main').append(f); const c = Dash.combobox('cb-x', { strict: true, options: () => [] }); const h = Dash.form(f); document.activeElement.blur(); const ok = await h.check(); c.destroy(); f.remove(); return ok; });
  check('1.13 forms: text the page put into a suggestions box isn\'t judged by the list', given === true, '');

  // the button doesn't jump away from under the click
  await at(() => { document.getElementById('account').reset(); account.clear(); log.length = 0; const f = document.createElement('form'); f.id = 'jump'; f.className = 'panel'; f.innerHTML = '<div class="field"><label for="j">J</label><input class="input" id="j" name="j" minlength="4"></div><button class="btn" id="j-go">Go</button>'; document.querySelector('main').prepend(f); window.jump = Dash.form(f, { rules: { j: (v) => (log.push('rule'), '') }, onSubmit: () => { log.push('jump'); } }); scrollTo(0, 0); });
  await type('j', 'ab');
  const spot = await tab.locator('#j-go').boundingBox();
  await tab.mouse.move(spot.x + 8, spot.y + 3);
  await tab.mouse.down();
  await tick(60);
  const held = [await errs('jump'), (await tab.locator('#j-go').boundingBox()).y === spot.y];
  await tab.mouse.up();
  await tick();
  check('1.13 forms: a message doesn\'t push the button away from under a click', held[0] === '{}' && held[1] && JSON.parse(await errs('jump')).j === 'Use at least 4 characters.' && (await active()) === 'j', JSON.stringify([held, await errs('jump'), await active()]));
  await at(() => { jump.clear(); });
  await type('j', 'abc');
  await tab.mouse.move(spot.x + 300, spot.y - 4);
  await tab.mouse.down();
  await tick(60);
  await tab.mouse.up();
  await tick();
  check('1.13 forms: it shows once the press is over', JSON.parse(await errs('jump')).j === 'Use at least 4 characters.', await errs('jump'));
  await at(() => { jump.clear(); document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await type('j', 'abc');
  await tab.focus('#j-go');
  await tick(200);
  const unseen = await errs('jump');
  await tick(1300);
  check('1.13 forms: a press whose end the page doesn\'t see holds it back only for a moment', unseen === '{}' && JSON.parse(await errs('jump')).j === 'Use at least 4 characters.', JSON.stringify([unseen, await errs('jump')]));
  await at(() => document.getElementById('jump').remove());

  // no code
  await at(() => { log.length = 0; });
  await tab.click('#b-go');
  await tick();
  const auto = await at(() => ({ site: document.querySelector('#b-site').closest('.field').querySelector('.err')?.textContent, bare: document.querySelector('#b-bare + .field-err')?.textContent, focus: document.activeElement.id, log: log.join() }));
  await tab.fill('#b-site', 'https://example.com');
  await tab.fill('#b-bare', 'x');
  await tab.click('#b-go');
  await tick();
  check('1.13 forms: data-validate needs no code: words under the fields (data-problem: its own), then it goes on as it would', auto.site === 'Give the site’s address.' && auto.bare === 'Fill this in.' && auto.focus === 'b-site' && auto.log === '' && (await logged()) === 'auto', JSON.stringify(auto));
  const spaces2 = await at(async () => { const f = document.createElement('form'); f.setAttribute('data-validate', ''); f.innerHTML = '<input class="input" name="x" required value="  " aria-label="X"><button class="btn">Go</button>'; let went = 0; f.addEventListener('submit', (e) => { e.preventDefault(); went += 1; }); document.querySelector('main').append(f); f.requestSubmit(); const out = [went, f.querySelector('.field-err')?.textContent]; f.remove(); return out.join(); });
  check('1.13 forms: what only the kit minds is stopped there too', spaces2 === '0,Fill this in.', spaces2);
  const later = await at(async () => { const f = document.createElement('form'); f.setAttribute('data-validate', ''); f.innerHTML = '<input class="input" name="x" required aria-label="X"><input class="input" name="y" required aria-label="Y"><button class="btn">Go</button>'; document.querySelector('main').append(f); let bubbles = 0; f.addEventListener('invalid', (e) => { bubbles += e.defaultPrevented ? 0 : 1; }); document.addEventListener('invalid', (e) => { bubbles += e.defaultPrevented ? 0 : 1; }, { once: true }); f.requestSubmit(); await null; const out = [f.querySelectorAll('.field-err').length, bubbles, document.activeElement.name]; f.remove(); const g = document.createElement('form'); g.setAttribute('data-validate', ''); g.innerHTML = '<input class="input" name="x" required aria-label="X">'; document.querySelector('main').append(g); g.querySelector('input').focus(); out.push(g.noValidate); g.remove(); const k = g.cloneNode(true); k.noValidate = false; document.querySelector('main').append(k); const i = k.querySelector('input'); i.value = 'x'; i.dispatchEvent(new Event('input', { bubbles: true })); out.push(k.noValidate); k.remove(); return JSON.stringify(out); });
  check('1.13 forms: also in a form that comes later, before anyone touched it', later === '[2,0,"x",true,true]', later);

  // fields that don't show
  const hide = async (name) => { await at((n) => { away.clear(); for (const e of document.getElementById('away').elements) if (e.name) e.value = e.name === n ? 'x' : ''; log.length = 0; }, name); await tab.click('#c-go'); await tick(); return { e: JSON.parse(await errs('away')), focus: await active(), line: await at(() => { const p = document.querySelector('#away .form-error'); return p && !p.hidden ? p.textContent : ''; }), red: await at(() => { const i = document.createElement('i'); i.style.color = 'var(--bad)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return getComputedStyle(document.getElementById('c-out')).borderTopColor === c; }), log: await logged() }; };
  const two = await hide('two'), more = await hide('more'), lost = await hide('gone'), out = await hide('out'), none = await hide('off');
  check('1.13 forms: a wrong field in another tab or a closed part is brought into view', two.focus === 'c-two' && two.line === '' && two.log === '' && more.focus === 'c-more' && more.line === '' && (await at(() => document.getElementById('more').open)), JSON.stringify([two, more]));
  check('1.13 forms: one that can\'t be shown is named above the buttons; a save never stops without a word', lost.line === 'Gone: Not x.' && lost.log === '', JSON.stringify(lost));
  check('1.13 forms: a field outside the form\'s element counts too; a disabled one doesn\'t', out.focus === 'c-out' && out.red && (await at(() => document.querySelector('#c-out + .field-err')?.hidden)) === true && (await at(() => !document.getElementById('c-out').hasAttribute('data-dash-form'))) && out.e.out === 'Not x.' && none.log === 'away' && (await at(() => !('off' in away.values()))), JSON.stringify([out, none]));

  const named = await at(async () => { const box = document.createElement('div'); box.hidden = true; box.innerHTML = '<label class="field" id="lost-field"><span>Wrapped</span><input class="input" name="gone2"><div class="hint">A hint</div></label>'; document.getElementById('away').prepend(box); away.clear(); for (const e of document.getElementById('away').elements) if (e.name) e.value = e.name === 'gone2' ? '' : ''; const e = box.querySelector('input'); e.required = true; await away.check(); const p = document.querySelector('#away .form-error'); const a = p.textContent; const one = document.getElementById('c-one'); one.value = 'y'; one.dispatchEvent(new Event('input', { bubbles: true })); const b = p.hidden; await away.check(); const c = p.textContent; box.remove(); away.clear(); one.value = ''; return [a, b, c].join('|'); });
  check('1.13 forms: that line has the field\'s name alone, and goes when anything is changed', named === 'Wrapped: Fill this in.|true|Wrapped: Fill this in.', named);
  const both = await at(async () => { away.clear(); for (const e of document.getElementById('away').elements) if (e.name) e.value = /^(one|two|more)$/.test(e.name) ? 'x' : ''; document.getElementById('more').open = false; document.querySelector('#steps [data-value="two"]').click(); await away.check(); const p = document.querySelector('#away .form-error'); const a = [document.activeElement.id, document.getElementById('c-one').getClientRects().length > 0, document.getElementById('more').open, !p || p.hidden].join(); document.getElementById('c-one').value = ''; await away.check(); const b = document.activeElement.id; return a + '|' + b; });
  check('1.13 forms: several in different tabs: the first is shown, then the next one', both === 'c-one,true,true,true|c-two', both);
  const twice = await at(async () => { const box = document.createElement('div'); box.innerHTML = '<div id="t-other"><button type="button" data-value="one">x</button><button type="button" data-value="two">y</button></div><form id="t-form"><div id="t-tabs"><button type="button" data-value="two">2</button><button type="button" data-value="one">1</button></div><div data-tab="two">2</div><div data-tab="one"><input class="input" id="t-x" name="x" required aria-label="X"></div></form>'; document.querySelector('main').prepend(box); Dash.tabs('t-other', { panels: 't-other' }); Dash.tabs('t-tabs', { panels: 't-form' }); const f = Dash.form('t-form'); await f.check(); const out = [document.activeElement.id, document.querySelector('#t-other [aria-selected="true"]').dataset.value].join(); box.remove(); return out; });
  check('1.13 forms: the tab is the form\'s own, also when another has that name', twice === 't-x,one', twice);

  // where the line and the messages go
  const places = await at(async () => { const out = []; const make = (html, parent = document.querySelector('main')) => { const d = document.createElement('div'); d.innerHTML = html; parent.append(d); return d; };
    const a = make('<form class="row" id="p-a"><input class="input" name="q" required aria-label="Q" style="width:200px"><button class="btn">Find</button></form>'); const fa = Dash.form('p-a'); await fa.check(); fa.error('', 'A line'); const y = (e) => e.getBoundingClientRect(); const i = a.querySelector('input'), b = a.querySelector('button'), m = a.querySelector('.field-err'), l = a.querySelector('.form-error'); out.push(Math.abs(y(i).top - y(b).top) < 8, y(m).top >= y(b).bottom - 1, l.parentElement.id, y(l).top >= y(b).bottom - 1);
    const c = make('<div class="row"><form id="p-b"><input class="input" name="q" aria-label="Q"><button class="btn">Find</button></form></div>'); const fb = Dash.form('p-b'); fb.error('', 'One'); fb.error('', 'Two'); await null; out.push(c.querySelectorAll('.form-error').length, c.querySelector('.form-error').parentElement.id, c.querySelector('.form-error').nextElementSibling.tagName);
    const d = make('<form id="p-c"><input class="input" name="q" aria-label="Q"></form>'); Dash.form('p-c').error('', 'At the end'); out.push(d.querySelector('form').lastElementChild.className);
    const e = make('<form id="p-d"><input class="input" name="q" aria-label="Q"><div style="height:3000px"></div><button class="btn">Go</button></form>'); scrollTo(0, 0); const fe = Dash.form('p-d', { rules: { '': () => 'Not now.' } }); await fe.check(); await new Promise((ok) => setTimeout(ok, 50)); const r = e.querySelector('.form-error').getBoundingClientRect(); out.push(r.top > 0 && r.bottom < innerHeight);
    try { out.push(Dash.form('steps'), Dash.form('no such')); } catch (e) { out.push(e.message); }
    for (const x of [a, c, d, e]) x.remove(); return JSON.stringify(out); });
  check('1.13 forms: a form in one row: words on a line of their own; the line is in the form, once, and brought into view', places === '[true,true,"p-a",true,1,"p-b","BUTTON","form-error",true,null,null]', places);
  const zone = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<label class="dropzone"><input type="file" name="file" required><b>Drop</b><span class="files"></span></label><label class="switch"><input type="checkbox" name="on" required><span class="track"></span>On</label>'; document.querySelector('main').append(f); const h = Dash.form(f); await h.check(); const a = [document.activeElement.name, f.querySelector('.dropzone + .field-err').textContent, f.querySelector('.switch + .field-err').textContent, getComputedStyle(f.querySelector('.track')).outlineStyle]; await h.check('on'); a.push(document.activeElement.name); f.remove(); return a.join(); });
  check('1.13 forms: a dropzone and a switch: marked, named and gone to', zone === 'file,Choose a file.,Tick this to go on.,solid,on', zone);
  const parts = await at(() => { const f = document.createElement('form'); f.innerHTML = '<input class="input" type="date" name="d" min="2026-01-01" aria-label="D"><button class="btn">Go</button>'; document.querySelector('main').append(f); window.parts = Dash.form(f); const i = f.querySelector('input'); i.focus(); i.value = '0002-01-01'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return JSON.stringify(parts.errors); });
  await at(() => document.activeElement.blur());
  await tick();
  const whole2 = await at(() => { const e = JSON.stringify(parts.errors); parts.el.remove(); return e; });
  check('1.13 forms: a date that is typed in parts is judged once it is left', parts === '{}' && whole2 === '{"d":"Choose 2026-01-01 or later."}', JSON.stringify([parts, whole2]));

  // out of the page, and back
  const taken2 = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<input class="input" name="x" required aria-label="X"><div class="field"><label>Y<input class="input" name="y" required></label></div><button class="btn">Go</button>'; document.querySelector('main').append(f); const h = Dash.form(f); await h.check(); f.remove(); f.append(document.createElement('i')); await new Promise((ok) => setTimeout(ok, 20)); const a = f.querySelectorAll('.field-err, .err').length; document.querySelector('main').append(f); await h.check(); const b = f.querySelectorAll('.field-err, .err').length; f.remove(); return [a, b].join(); });
  check('1.13 forms: a form that is taken out of the page, and put back', taken2 === '2,2', taken2);
  const late = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<div class="field"><input class="input" name="x" value="1" aria-label="X"></div><button class="btn">Go</button>'; document.querySelector('main').append(f); let say; const old = Dash.form(f, { rules: { x: () => new Promise((ok) => { say = ok; }) }, onSubmit: () => {} }); const waited = old.check(); const b = Dash.form(f, { rules: { x: () => 'New.' } }); await b.check(); say('Old.'); const ok = await waited; await new Promise((r) => setTimeout(r, 20)); const out = [f.querySelector('.err').textContent, ok]; old.error('x', 'Old.'); document.activeElement.blur(); old.fail(Object.assign(new Error('Old'), { errors: { x: 'Old.' } })); out.push(f.querySelector('.err').textContent, f.querySelectorAll('.form-error').length, document.activeElement.tagName); let say2, sent = 0; const c = Dash.form(f, { rules: { x: () => new Promise((ok) => { say2 = ok; }) }, onSubmit: () => { sent += 1; } }); f.requestSubmit(); Dash.form(f); say2(''); await new Promise((r) => setTimeout(r, 20)); out.push(sent); f.remove(); return JSON.stringify(out); });
  check('1.13 forms: a late answer of a form that was made again changes nothing, and sends nothing', late === '["New.",false,"New.",0,"BODY",0]', late);
  const cut = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<input class="input" name="x" value="1" aria-label="X"><button class="btn">Go</button>'; document.querySelector('main').append(f); let say; const sent = []; const h = Dash.form(f, { rules: { x: () => new Promise((ok) => { say = ok; }) }, onSubmit: () => sent.push(1) }); f.requestSubmit(); h.clear(); say('Taken.'); await new Promise((r) => setTimeout(r, 20)); const a = [h.errors.x, sent.length]; h.error('x', 'Page.'); const c = h.check(); const s2 = say; h.error('x', 'From the page.'); s2(''); a.push(await c, h.errors.x); f.remove(); return JSON.stringify(a); });
  check('1.13 forms: clear() and error() while an answer is on its way don\'t let a wrong field through', cut === '["Taken.",0,false,"From the page."]', cut);
  const warn = []; tab.on('console', (m) => { if (m.type() === 'warning') warn.push(m.text()); });
  const listens = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<input class="input" name="x" aria-label="X"><button class="btn" name="go" value="1">Go</button>'; document.querySelector('main').append(f); const heard = []; let say; Dash.form(f, { rules: { x: (v) => (v === 'ask' ? new Promise((ok) => { say = ok; }) : !v && 'No.'), nosuch: () => '' } }); f.addEventListener('submit', (e) => { e.preventDefault(); heard.push(f.elements.x.value + ' ' + (e.submitter && e.submitter.value)); }); const b = f.querySelector('button'); b.click(); f.elements.x.value = 'y'; b.click(); f.elements.x.value = 'ask'; b.click(); const dis = b.disabled; say(''); await new Promise((r) => setTimeout(r, 20)); b.click(); f.remove(); return [heard.join('|'), dis].join(); });
  check('1.13 forms: without onSubmit the page\'s listener hears it once it is right, with the button', listens === 'y 1|ask 1|ask 1,true', listens);
  check('1.13 forms: a rule for no field says so, once', warn.filter((w) => w.includes('nosuch')).length === 1, warn.join());

  // drawn again and again
  await tab.click('#d-go');
  await tick();
  await at(() => { window.was = document.getElementById('d-x'); drawLive(2); });
  await tick();
  const drawn = { same: await at(() => was === document.getElementById('d-x')), x: await about('d-x'), y: await about('d-y'), focus: await active(), n: await at(() => document.querySelectorAll('#live .err').length) };
  check('1.13 forms: fields that are drawn again keep their marks, messages and the focus', !drawn.same && drawn.x.bad === 'true' && drawn.x.text === 'A hint + Fill this in.' && drawn.x.field && drawn.y.text === 'Fill this in.' && drawn.focus === 'd-x' && drawn.n === 2, JSON.stringify(drawn));
  await tab.keyboard.type('a');
  const then = await about('d-x');
  await at(() => { drawLive(3, 'now set'); });
  await tick();
  check('1.13 forms: and follow the new fields: one drawn with a value is no longer empty', then.bad === null && then.text === 'A hint' && (await about('d-y')).bad === null && (await at(() => document.querySelectorAll('#live .err:not([hidden])').length)) === 0, JSON.stringify([then, await about('d-y')]));

  // a whole form drawn again
  const redrawn = await at(async () => { const box = document.createElement('div'); document.querySelector('main').append(box); window.redraw = (n) => Dash.render(box, `<p>${n}</p><form id="again" class="panel" method="dialog"><div class="field"><label for="g-x">X</label><input class="input" id="g-x" name="x" required></div><div class="field"><label for="g-y">Y</label><input class="input" id="g-y" name="y" minlength="3"></div><button class="btn" id="g-go">Go</button></form>`); redraw(1); window.sentAgain = []; window.again = Dash.form('again', { rules: { y: (v) => v === 'bad' && 'Not that.' }, onSubmit: (v) => { sentAgain.push(JSON.stringify(v)); } }); await again.check(); window.wasForm = again.el; redraw(2); await null; await null; return [again.el !== wasForm, again.el === document.getElementById('again'), document.getElementById('again').noValidate].join(); });
  const marksAgain = { x: await about('g-x'), focus: await active() };
  await tab.keyboard.type('a');
  await tab.keyboard.press('Tab');
  await tab.keyboard.type('bad');
  await at(() => redraw(3));
  await tab.keyboard.press('Enter');
  await tick();
  const ruled = { x: await about('g-x'), y: await about('g-y'), sent: await at(() => sentAgain.length) };
  await tab.fill('#g-x', 'a');
  await tab.fill('#g-y', 'good');
  await tab.click('#g-go');
  await tick();
  check('1.13 forms: a form that is drawn again as a whole is followed by its id', redrawn === 'true,true,true' && marksAgain.x.bad === 'true' && marksAgain.x.text === 'Fill this in.' && marksAgain.focus === 'g-x' && ruled.x.text === 'Fill this in.' && ruled.y.text === 'Not that.' && ruled.sent === 0 && (await at(() => sentAgain.join())) === '{"x":"a","y":"good"}', JSON.stringify([redrawn, marksAgain, ruled, await at(() => sentAgain.join())]));
  const left2 = await at(async () => { const f = again.el; again.destroy(); redraw(4); await null; await null; const a = document.getElementById('again'); const out = [f !== a, a.noValidate, '__dashForm' in a]; a.parentElement.remove(); return out.join(); });
  check('1.13 forms: until it is destroyed', left2 === 'true,false,false', left2);
  const twice2 = await at(async () => { const box = document.createElement('div'); document.querySelector('main').append(box); const draw = (n) => Dash.render(box, `<p>${n}</p><form id="tw"><div class="field"><input class="input" id="tw-x" name="x" aria-label="X"></div><button class="btn">Go</button></form>`); draw(1); Dash.form('tw', { rules: { x: () => 'Old.' } }); draw(2); const b = Dash.form('tw', { rules: { x: () => 'New.' } }); await null; await null; document.getElementById('tw').requestSubmit(); const out = [document.querySelector('#tw .err').textContent, b.errors.x]; b.destroy(); box.remove(); return out.join(); });
  check('1.13 forms: a page that makes it again itself gets the new one', twice2 === 'New.,New.', twice2);
  const rows = await at(async () => { const box = document.createElement('div'); document.querySelector('main').append(box); const t = Dash.table(box, { columns: [{ key: 'n', label: 'N' }], rows: [{ id: 'a', n: 1 }], key: 'id', expand: (r) => `<p>${r.n}</p><form id="row-form"><div class="field"><label for="r-x">X</label><input class="input" id="r-x" name="x" minlength="3"></div><button class="btn">Go</button></form>` }); t.expand('a'); await null; const f = Dash.form('row-form'); const i = document.getElementById('r-x'); i.value = 'ab'; i.dispatchEvent(new Event('input', { bubbles: true })); await f.check('x'); t.update([{ id: 'a', n: 2 }]); await null; await null; const j = document.getElementById('r-x'); const out = [j !== i, j.value, j.getAttribute('aria-invalid'), document.querySelector('#row-form .err')?.textContent]; box.remove(); return JSON.stringify(out); }).catch((e) => String(e.message).split('\n')[0]);
  check('1.13 forms: also in the details of a table row', rows === '[true,"ab","true","Use at least 3 characters."]', rows);

  // drawn again just when it matters: between leaving a field and looking at it, and while a save waits
  await at(() => { drawLive(5); live.clear(); document.getElementById('d-x').setAttribute('minlength', '3'); });
  await type('d-x', 'ab');
  await at(() => { const n = document.getElementById('live-fields'); document.addEventListener('pointerup', () => { n.innerHTML = n.innerHTML.replace(/ value="[^"]*"/, '').replace('id="d-x"', 'id="d-x" value="ab"'); }, { once: true, capture: true }); });
  const spot2 = await tab.locator('#d-y').boundingBox();
  await tab.mouse.move(spot2.x + 20, spot2.y + 10);
  await tab.mouse.down();
  await tick(20);
  await tab.mouse.up();
  await tick();
  check('1.13 forms: a field that is drawn again just when it is left is checked all the same', (await about('d-x')).text === 'A hint + Use at least 3 characters.', JSON.stringify(await about('d-x')));
  const saving = await at(async () => { const box = document.createElement('div'); document.querySelector('main').append(box); let say; const draw = (n) => Dash.render(box, `<p>${n}</p><form id="sv"><div class="field"><label for="sv-x">X</label><input class="input" id="sv-x" name="x" value="1"></div><button class="btn" id="sv-go">Go</button></form>`); draw(1); const f = Dash.form('sv', { rules: { x: () => new Promise((ok) => { say = ok; }) }, onSubmit: () => new Promise((ok) => { say = ok; }) }); const go = () => { document.getElementById('sv-go').focus(); document.getElementById('sv-go').click(); }; go(); draw(2); await null; say('Taken.'); await new Promise((r) => setTimeout(r, 30)); const out = [document.activeElement.id, document.querySelector('#sv .err')?.textContent, document.querySelectorAll('#sv .form-error').length, document.querySelector('#sv > [role="status"]')?.textContent ?? '']; const i = document.getElementById('sv-x'); i.value = '2'; i.dispatchEvent(new Event('input', { bubbles: true })); go(); say(''); await new Promise((r) => setTimeout(r, 30)); draw(3); say(); await new Promise((r) => setTimeout(r, 30)); out.push(document.activeElement.id); f.destroy(); box.remove(); return JSON.stringify(out); });
  check('1.13 forms: also while a save waits: the first problem is gone to, and the focus is back on the button', saving === '["sv-x","Taken.",0,"","sv-go"]', saving);
  const left3 = await at(async () => { const box = document.createElement('div'); document.querySelector('main').append(box); let say; box.innerHTML = '<form id="gn"><div class="field"><input class="input" name="x" value="1" aria-label="X"></div><div class="field"><input class="input" name="y" value="1" aria-label="Y"></div><button class="btn">Go</button></form>'; const f = Dash.form('gn', { rules: { x: () => new Promise((ok) => { say = ok; }) } }); const c = f.check('x'); box.querySelector('.field').remove(); await null; say('Wrong.'); const out = [await c, JSON.stringify(f.errors)]; f.destroy(); box.remove(); return out.join(); });
  check('1.13 forms: a field that is gone stops nothing', left3 === 'true,{}', left3);

  // what the server wrote
  const wrote = { ...(await about('e-x')) };
  await tab.click('#e-go');
  await tick();
  const through = await logged();
  await at(() => { served.error('code', 'That code is used up.'); });
  await tab.focus('#e-x');
  await tab.keyboard.press('End');
  await tab.keyboard.type('d');
  const cleared = { ...(await about('e-x')), own: await at(() => document.getElementById('e-x').getAttribute('aria-describedby')) };
  check('1.13 forms: words the server wrote stay until the field is changed, and don\'t stop a save', wrote.bad === 'true' && wrote.text === 'That code is used up.' && wrote.field && through === 'served' && cleared.bad === null && cleared.text === '' && cleared.own === 'e-x-err' && !cleared.field, JSON.stringify([wrote, through, cleared]));

  const wrote2 = await at(async () => { const f = document.createElement('form'); f.innerHTML = '<div class="field invalid"><input class="input" aria-label="No name"><div class="err">Wrong one.</div></div><div class="field invalid"><input class="input" name="a" aria-label="A"><input class="input" name="b" aria-label="B" aria-invalid="true"><div class="err">Wrong two.</div></div><div class="field invalid"><input class="input" name="c" aria-label="C"><input class="input" name="d" aria-label="D"><div class="err">Wrong three.</div></div><div class="field invalid"><input class="input" name="e" aria-label="E"><div class="err"></div></div>'; document.querySelector('main').append(f); const h = Dash.form(f); const i = [...f.querySelectorAll('input')]; const out = [i.map((e) => Number(e.getAttribute('aria-invalid') === 'true')).join(''), JSON.stringify(h.errors), f.querySelectorAll('.form-error').length]; for (const e of i) { e.value = 'x'; e.dispatchEvent(new Event('input', { bubbles: true })); } out.push(f.querySelectorAll('[aria-invalid]').length, [...f.querySelectorAll('.err')].map((e) => e.textContent).join(), f.querySelectorAll('.field.invalid').length); f.remove(); return out.join(' '); });
  check('1.13 forms: the server\'s words on a box without a name, and in a field of several', wrote2 === '101100 {"b":"Wrong two.","c":"Wrong three."} 0 0 ,,, 1', wrote2);

  // made again, taken away, asked from the page
  const remade = await at(async () => { const f = document.getElementById('served'); f.elements.code.value = ''; const hits = []; Dash.form(f, { rules: { code: (v) => (hits.push('old'), !v && 'Old.') }, onSubmit: () => hits.push('old sent') }); const b = Dash.form(f, { rules: { code: (v) => (hits.push('new'), !v && 'New.') }, onSubmit: () => hits.push('new sent') }); f.requestSubmit(); const out = [b.errors.code, hits.join()]; f.elements.code.value = 'x'; f.requestSubmit(); await null; out.push(hits.join()); f.elements.code.value = ''; await b.check(); b.destroy(); out.push(f.noValidate, f.hasAttribute('data-dash-form'), document.getElementById('e-x').hasAttribute('aria-invalid'), f.querySelector('.err').textContent, f.querySelectorAll('[role="status"]').length); return JSON.stringify(out); });
  check('1.13 forms: a form made again has only the new rules; destroy() leaves it as it was', remade === '["New.","new","new,new,new sent",false,false,false,"",0]', remade);
  const clean = await at(async () => { const f = document.createElement('form'); f.id = 'cl'; const html = '<div class="field"><input class="input" name="x" required aria-label="X"></div><input class="input" name="y" required aria-label="Y"><button class="btn">Go</button>'; f.innerHTML = html; const was = f.innerHTML; document.querySelector('main').append(f); const real = MutationObserver.prototype.disconnect; let off = 0; MutationObserver.prototype.disconnect = function () { off += 1; real.call(this); }; const h = Dash.form(f); await h.check(); const n = f.querySelectorAll('.err, .field-err, [role="status"]').length; h.error('', 'x'); h.destroy(); MutationObserver.prototype.disconnect = real; const out = [n, f.innerHTML === was || f.innerHTML, off]; f.remove(); return out.join(); });
  check('1.13 forms: destroy() takes away all it added', clean === '2,true,1', clean);
  const asked = await at(async () => { account.clear(); document.getElementById('account').reset(); await new Promise((ok) => setTimeout(ok, 20)); const a = await account.check(['name', 'email']); const e1 = Object.keys(account.errors).join(); account.clear(); const b = await account.check(document.getElementById('days')); const e2 = Object.keys(account.errors).join(); account.clear(); const c = await account.check('seats'); account.error('', 'From the page'); const e3 = JSON.stringify(account.errors); const d = account.error('nosuch', 'x'); account.error(''); account.error('name', 'Said by the page.'); const e4 = JSON.stringify(account.errors); account.error('name'); return JSON.stringify([a, e1, b, e2, c, e3, d, e4, account.errors, account.el.id]); });
  check('1.13 forms: check() of some fields, and error() from the page', asked === JSON.stringify([false, 'name,email', false, 'days', true, '{"":"From the page"}', false, '{"name":"Said by the page."}', {}, 'account']), asked);
  const tip = await at(async () => { const e = document.getElementById('a-name'); e.setAttribute('data-tooltip', 'A tip'); await account.check('name'); e.blur(); e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); const a = e.getAttribute('aria-describedby'); document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); const b = e.getAttribute('aria-describedby'); e.removeAttribute('data-tooltip'); account.clear(); return [/^a-name-hint dash-err-\d+ dash-tooltip$/.test(a), /^a-name-hint dash-err-\d+$/.test(b), e.getAttribute('aria-describedby')].join(); });
  check('1.13 forms: a tooltip adds its words and takes only its own away', tip === 'true,true,a-name-hint', tip);

  // in a modal, a dialog and a question
  await at(() => { log.length = 0; window.hit = 0; window.m = Dash.modal({ title: 'Server', rules: { name: (v) => v === 'bad' && 'Not that.' }, body: '<p id="m-n">1</p><div class="field"><label for="m-name">Name</label><input class="input" id="m-name" name="name" required></div><div class="field"><label for="m-size">Size</label><input class="input" id="m-size" name="size" type="number" max="5"></div>', cancel: 'Cancel', actions: [{ label: 'Delete', value: 'delete' }, { label: 'Save', value: 'save', primary: true }], onAction: async (v, h) => { log.push(v + ' ' + JSON.stringify(h.form.values())); if (window.hit++ === 0) throw Object.assign(new Error('x'), { errors: { size: 'Too large here.' } }); if (hit === 2) throw new Error('HTTP 500'); return false; } }); });
  await tab.keyboard.press('Enter');
  await tick();
  const stop = { log: await logged(), ...(await about('m-name')), focus: await active(), open: await at(() => m.el.open) };
  check('1.13 forms: in a modal, Enter on a wrong field keeps it open and runs nothing', stop.log === '' && stop.text === 'Fill this in.' && stop.focus === 'm-name' && stop.open, JSON.stringify(stop));
  const inside = await at(async () => { const v = m.el.querySelector(':scope > [data-dash-voice]'); document.getElementById('m-size').value = '9'; await m.form.check(); const out = v && v.textContent; document.getElementById('m-size').value = ''; await m.form.check(); return out; });
  check('1.13 forms: in a modal a screen reader is told inside it', inside === '2 fields to fix', inside);
  await at(() => { m.update({ body: m.body.innerHTML.replace('>1<', '>2<') }); });
  await tick();
  const updated = [await about('m-name'), await at(() => document.getElementById('m-n').textContent), await at(() => document.querySelectorAll('.modal .err:not([hidden])').length)];
  check('1.13 forms: an update of its body keeps the words', updated[0].bad === 'true' && updated[0].text === 'Fill this in.' && updated[1] === '2' && updated[2] === 1, JSON.stringify(updated));
  await tab.keyboard.type('web-1');
  await tab.keyboard.press('Enter');
  await tick();
  const failed = { log: await logged(), ...(await about('m-size')), focus: await active(), line: await at(() => m.el.querySelector('.modal-error').textContent) };
  await tab.keyboard.press('Enter');
  await tick();
  const http = [await logged(), await at(() => m.el.querySelector('.modal-error').textContent), await about('m-size')];
  check('1.13 forms: what an action throws lands on the fields, or in the foot', failed.log === 'save {"name":"web-1","size":null}' && failed.text === 'Too large here.' && failed.focus === 'm-size' && failed.line === '' && http[0].startsWith('save') && http[1] === 'HTTP 500' && http[2].bad === null, JSON.stringify([failed, http]));
  await tab.fill('#m-name', '');
  await tab.click('.modal .btn:has-text("Delete")');
  await tick();
  check('1.13 forms: a button that isn\'t the primary one isn\'t checked', (await logged()).startsWith('delete') && (await at(() => m.el.querySelector('.modal-error').textContent)) === '', '');
  await at(() => { m.error('From the page'); });
  const own = await at(() => [m.el.querySelector('.modal-error').textContent, m.el.querySelectorAll('.form-error').length].join());
  await at(() => m.close());
  const plain = await at(() => { const x = Dash.modal({ title: 'x', body: '<input class="input" name="a" required>', actions: [{ label: 'OK', primary: true }] }); const out = [x.form && 'a form', x.el.querySelector('form').noValidate]; x.close(); return JSON.stringify(out); });
  check('1.13 forms: its own line; a modal without rules is as it was', own === 'From the page,0' && plain === '[null,false]', JSON.stringify([own, plain]));
  await at(() => { window.asked = []; window.r = null; Dash.ask('New name', { value: 'taken', check: (v) => new Promise((ok) => { asked.push(v); window.reply = ok; }) }).then((x) => { window.r = x; }); });
  await tab.keyboard.press('Enter');
  await tick();
  const q = await at(() => [document.querySelector('dialog .dialog-input')?.getAttribute('aria-label'), document.querySelector('dialog .dialog-actions .btn.primary')?.getAttribute('aria-busy'), document.querySelector('dialog .field-err')?.textContent].join());
  await at(() => window.reply?.('That name is taken.'));
  await tick();
  const no = await at(() => [document.querySelector('dialog')?.open, document.querySelector('dialog .dialog-input + .field-err')?.textContent, document.activeElement.className, r].join());
  if (await at(() => document.querySelector('dialog')?.open)) await tab.fill('dialog .dialog-input', 'free');
  await tab.keyboard.press('Enter');
  await tick();
  await at(() => window.reply?.(''));
  await tick(80);
  check('1.13 forms: Dash.ask with a check that asks: it stays open until the answer is good', q === 'New name,true,Checking…' && no === 'true,That name is taken.,input dialog-input,' && (await at(() => `${r}|${asked.join()}`)) === 'free|taken,free', JSON.stringify([q, no, await at(() => `${r}|${asked.join()}`)]));
  await at(() => { window.r = undefined; Dash.dialog({ title: 'Two', rules: { b: (v, all) => v === all.a && 'The same.' }, body: '<input class="input" name="a" value="x"><input class="input" name="b" value="x">' }).then((x) => { window.r = x; }); });
  await tab.click('dialog .btn.primary');
  await tick();
  const dlg = await at(() => [document.querySelector('dialog')?.open, document.querySelector('dialog .field-err')?.textContent].join());
  if (await at(() => document.querySelector('dialog')?.open)) { await tab.fill('dialog [name="b"]', 'y'); await tab.click('dialog .btn.primary'); }
  await tick(80);
  check('1.13 forms: Dash.dialog with rules', dlg === 'true,The same.' && (await at(() => JSON.stringify(r))) === '{"value":"ok","fields":{"a":"x","b":"y"}}', JSON.stringify([dlg, await at(() => JSON.stringify(r))]));
  await at(() => { window.r = undefined; Dash.dialog({ title: 'Cancel', rules: {}, body: '<input class="input" name="a" required>' }).then((x) => { window.r = x; }); });
  await tab.keyboard.press('Enter');
  await tick();
  if (await at(() => document.querySelector('dialog')?.open)) await tab.click('dialog [data-dismiss]');
  await tick(80);
  check('1.13 forms: Cancel closes it, wrong or not', (await at(() => r && r.value)) === null, await at(() => JSON.stringify(r)));
  await tab.context().close();

  // hidden values: the words never hold what was typed
  const priv = await openForms();
  const secret = await priv.evaluate(async () => { Dash.privacy.set(true); const e = document.getElementById('a-email'); e.dataset.private = ''; e.value = 'sekret'; await account.check('email'); const out = document.querySelector('main').innerText.includes('sekret') || document.querySelector('#account').innerHTML.includes('sekret'); Dash.privacy.set(false); return out; });
  check('1.13 forms: what is typed in a hidden box isn\'t in the words about it', secret === false, '');
  await priv.context().close();
  // high contrast, and a phone
  const hc = await openForms({ forcedColors: 'active' });
  const dashed = await hc.evaluate(async () => { document.querySelector('[name="high"]').value = '1'; await account.check(); document.activeElement.blur(); const s = (q) => getComputedStyle(document.querySelector(q)); return [s('#a-name').borderTopStyle, s('#account .choice').borderTopStyle, s('#terms input').outlineStyle, s('#a-again').borderTopStyle, s('[name="low"]').borderTopStyle, s('[name="high"]').borderTopStyle].join(); });
  check('1.13 forms: in high contrast a wrong field is dashed, not just another colour', dashed === 'dashed,dashed,dashed,solid,solid,dashed', dashed);
  await hc.context().close();
  const phone = await openForms({ width: 390, height: 780, hasTouch: true, isMobile: true });
  const small2 = await phone.evaluate(async () => { scrollTo(0, 3000); await account.check(); account.error('', 'A line that is long enough to wrap on a phone, so that it has to fit the width of the form.'); await new Promise((ok) => setTimeout(ok, 60)); const f = document.getElementById('a-name').closest('.field').getBoundingClientRect(), bar = document.querySelector('.topbar').getBoundingClientRect(); return [document.documentElement.scrollWidth - innerWidth, f.top >= Math.min(bar.bottom, 84) - 1 && f.bottom <= innerHeight]; });
  check('1.13 forms: on a phone it fits, and the first problem is in view', small2[0] <= 0 && small2[1], JSON.stringify(small2));
  await phone.context().close();
  const desk = await openForms({ height: 600 });
  const view = await desk.evaluate(async () => { const out = []; for (const y of [3000, 0]) { scrollTo(0, y); account.clear(); if (!y) document.querySelector('[name="terms"]').checked = false; await account.check(y ? undefined : 'terms'); await new Promise((ok) => setTimeout(ok, 30)); const f = (y ? document.getElementById('a-name').closest('.field') : document.getElementById('terms')).getBoundingClientRect(), bar = document.querySelector('.topbar').getBoundingClientRect(); out.push(f.top >= bar.bottom + 8 && f.bottom <= innerHeight - 8); } return out.join(); });
  check('1.13 forms: the first problem is scrolled to, clear of the top bar and the window\'s edge', view === 'true,true', view);
  await desk.context().close();
  // a strict style policy
  const strict = await openForms({ page: 'csp-forms.html' });
  const csp = await strict.evaluate(async () => { const a = await f.check(); return [a, f.errors.x, getComputedStyle(document.querySelector('.err')).color !== getComputedStyle(document.body).color, document.querySelectorAll('body [style]').length, violations.length].join(); });
  check('1.13 forms: under a strict style policy too', csp === 'false,Fill this in.,true,0,0', csp);
  await strict.context().close();
}

// ---- 1.14 trees, lists and a classified sidebar (test/lists.html)
{
  const openLists = async ({ width = 1280, height = 900, page = 'lists.html', ...more } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', reducedMotion: 'reduce', ...more });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(5000);
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openLists();
  const at = async (f, a) => { let t; try { return await Promise.race([tab.evaluate(f, a), new Promise((_, no) => { t = setTimeout(() => no(new Error('the page hangs')), 10000); })]); } finally { clearTimeout(t); } };
  const tick = (ms = 40) => tab.waitForTimeout(ms);
  const logged = () => at(() => log.splice(0).filter((x) => !x.startsWith('at ')).join(' | '));
  const press = async (...keys) => { for (const k of keys) await tab.keyboard.press(k); };
  // the rows that show, with what they say about themselves
  const rows = (id) => at((k) => [...document.querySelectorAll(`#${k} [role="treeitem"]`)].map((li) => '  '.repeat(li.getAttribute('aria-level') - 1) + li.querySelector('.tree-text').textContent.trim()
    + ({ true: ' -', false: ' +' }[li.getAttribute('aria-expanded')] ?? '')).join('\n'), id);
  const here = () => at(() => document.activeElement?.dataset?.key ?? document.activeElement?.tagName);
  const row = (id, k) => `#${id} li[data-key="${k}"] > .tree-row`;

  // ---- a tree
  await logged(); // what was asked for at the start
  const shape = await rows('files');
  check('1.14 tree: rows inside rows; only open ones hold theirs', shape === 'src -\n  app.js 12 KB\n  parts +\ntest +\nREADME.md 4 KB', shape);
  const aria = await at(() => { const t = document.querySelector('#files [role="tree"]'), q = (k) => t.querySelector(`[data-key="${k}"]`); const name = (li) => li.getAttribute('aria-labelledby').split(' ').map((x) => document.getElementById(x).textContent.trim()).join(' ');
    return [t.getAttribute('aria-label'), q('src').getAttribute('aria-level'), q('src').getAttribute('aria-setsize'), q('test').getAttribute('aria-posinset'), q('src/app.js').getAttribute('aria-level'), q('src/app.js').hasAttribute('aria-expanded'), name(q('src')), name(q('test')), t.querySelectorAll('[tabindex="0"]').length, q('src').tabIndex, q('src').getAttribute('aria-haspopup')].join(); });
  check('1.14 tree: says its level, its place and its name (not the names inside it); one stop for Tab', aria === 'Files,1,3,2,2,false,src,test Failing,1,0,menu', aria);
  await at(() => { document.getElementById('tree-q').focus(); });
  await press('Tab');
  check('1.14 tree: Tab goes to its first row', (await here()) === 'src', await here());
  await press('ArrowDown', 'ArrowDown', 'ArrowRight');
  check('1.14 tree: Right opens', (await here()) === 'src/parts' && (await rows('files')).includes('parts -\n    table.js\n    deep +'), await rows('files'));
  await press('ArrowRight');
  const into = await here();
  await press('ArrowLeft');
  const out1 = await here();
  await press('ArrowLeft');
  const shut = (await rows('files')).includes('parts +');
  await press('ArrowLeft', 'ArrowLeft');
  const top = [await here(), (await rows('files')).split('\n')[0]].join();
  check('1.14 tree: Right goes in, Left out, then closes, then out again', into === 'src/parts/table.js' && out1 === 'src/parts' && shut && top === 'src,src +', JSON.stringify([into, out1, shut, top]));
  check('1.14 tree: says what was opened and closed', (await logged()) === 'open src/parts | close src/parts | close src', '');
  await press('End');
  const last = await here();
  await press('ArrowDown', 'Home');
  check('1.14 tree: End, Home, and no further than the ends', last === 'readme' && (await here()) === 'src', last);
  await press('t');
  const t1 = await here();
  await tick(650);
  await press('r', 'e');
  const t2 = await here();
  check('1.14 tree: the first letters of a row', t1 === 'test' && t2 === 'readme', t1 + t2);
  await at(() => { window.keys = []; Dash.key('s', () => keys.push('s')); Dash.key('q', () => keys.push('q')); });
  await tick(650);
  await press('s', 'q');
  check('1.14 tree: a letter that finds a row is no shortcut of the page; one that finds none is', (await at(() => keys.join())) === 'q' && (await here()) === 'src', await at(() => keys.join()));
  await tick(650);
  await press('*');
  check('1.14 tree: * opens all beside', (await rows('files')) === 'src -\n  app.js 12 KB\n  parts +\ntest -\n  app.test.js\nREADME.md 4 KB' && (await here()) === 'src', await rows('files'));
  await tick(650);
  await press('a', 'p', 'p', '.', 't');
  const t3 = await here();
  await tick(650);
  await press('a');
  const t4 = await here();
  await press('a');
  const t5 = await here();
  await press('Home');
  check('1.14 tree: several letters of a row; the same one again goes to the next', t3 === 'test/app.js' && t4 === 'src/app.js' && t5 === 'test/app.js', [t3, t4, t5].join());
  await press('ArrowDown', 'Enter');
  check('1.14 tree: Enter picks a leaf', (await logged()).endsWith('pick src/app.js'), '');
  await tab.click(row('files', 'readme'));
  await tab.click(row('files', 'test'));
  check('1.14 tree: a click picks a leaf, and opens or closes a branch', (await logged()) === 'pick readme | close test' && (await here()) === 'test', '');
  await tab.click('#own-btn');
  check('1.14 tree: a button in a row is not the row', (await logged()) === '', '');
  await tab.click(row('files', 'src'));
  await tab.reload();
  const shutAll = await rows('files');
  await tab.click(row('files', 'src'));
  await logged();
  await tab.reload();
  const kept = await rows('files');
  check('1.14 tree: what is open is remembered', shutAll === 'src +\ntest +\nREADME.md 4 KB' && kept === 'src -\n  app.js 12 KB\n  parts +\ntest +\nREADME.md 4 KB' && (await at(() => localStorage.getItem('test-files'))) === '["src"]', kept);
  // a right click with a real button: on Linux and Mac the menu opens at the press, and the release must not close it
  await at(() => { window.got = []; document.getElementById('end').addEventListener('contextmenu', async (e) => { e.preventDefault(); got.push(await Dash.menu(e, ['One', 'Two'])); }); document.getElementById('end').scrollIntoView(); });
  const menuUp = () => at(() => `${document.querySelectorAll('.popup').length} ${document.activeElement.textContent.trim().slice(0, 5)}`);
  const held0 = await at(() => { const r = document.getElementById('end').getBoundingClientRect(); return [r.left + 200, 400]; });
  await tab.mouse.move(...held0);
  await tab.mouse.down({ button: 'right' });
  await tick(80);
  const r1 = await menuUp();
  await tab.mouse.up({ button: 'right' });
  await tick(80);
  const r2 = await menuUp();
  await press('ArrowDown', 'Enter');
  await tick();
  await tab.mouse.click(...held0, { button: 'right' });
  await tick(80);
  const r3 = await menuUp();
  await tab.mouse.click(held0[0] + 300, 600);
  await tick(80);
  const r4 = [(await menuUp()).split(' ')[0], await at(() => got.join())].join();
  check('1.14 popup: a right click\'s menu stays when the button is let go, and closes with a press elsewhere', r1 === '1 One' && r2 === '1 One' && r3 === '1 One' && r4 === '0,Two,', [r1, r2, r3, r4].join(' / '));
  await at(() => scrollTo(0, 0));
  // menus
  await tab.focus('#files li[data-key="src/app.js"]');
  await press('Shift+F10');
  await tick();
  const opens = await at(() => document.querySelector('.popup[role="menu"], [role="menu"]')?.textContent);
  await press('ArrowDown', 'Enter');
  await tick();
  check('1.14 tree: Shift+F10 opens the row\'s menu', /Rename.*Delete/.test(opens || '') && (await logged()).endsWith('menu delete src/app.js') && (await here()) === 'src/app.js', String(opens) + await here());
  // (a browser may have no menu key of its own: the kit's is enough)
  const keyed = (id, k, key) => at(async ([id, k, key]) => {
    const li = document.querySelector(`#${id} li[data-key="${k}"]`), e = new KeyboardEvent('keydown', { key, shiftKey: key === 'F10', bubbles: true, cancelable: true });
    li.focus();
    li.dispatchEvent(e);
    await new Promise((ok) => setTimeout(ok, 40));
    const out = [e.defaultPrevented, document.querySelectorAll('[role="menu"]').length].join();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    for (const p of document.querySelectorAll('.popup')) p.hidePopover();
    await new Promise((ok) => setTimeout(ok, 40));
    return out;
  }, [id, k, key]);
  const k1 = [await keyed('files', 'src/app.js', 'F10'), await keyed('files', 'src/app.js', 'ContextMenu')].join(' ');
  check('1.14 tree: by the kit\'s own keys', k1 === 'true,1 true,1' && (await at(() => document.querySelectorAll('.popup').length)) === 0, k1);
  await logged();
  await tab.click(row('files', 'readme'), { button: 'right' });
  await tick();
  await tab.click('[role="menuitem"]');
  await tab.hover(row('files', 'test'));
  await tab.click(`${row('files', 'test')} > .row-dots`);
  await tick();
  await tab.click('[role="menuitem"] >> nth=1');
  await tick();
  check('1.14 tree: so do a right click and its dots, and neither opens the row', (await logged()) === 'menu Rename readme | menu delete test', '');
  // filter
  await tab.fill('#tree-q', 'app');
  await tick(200);
  const found = await at(() => [files.filter('app'), document.querySelectorAll('#files mark').length, document.querySelector('#files mark').textContent].join());
  check('1.14 tree: the filter keeps what has the words, and what that is in, open', (await rows('files')) === 'src -\n  app.js 12 KB\ntest -\n  app.test.js' && found === '2,2,app', await rows('files') + found);
  const parts = await at(() => { files.filter('parts'); const a = [...document.querySelectorAll('#files [role="treeitem"]')].map((x) => x.dataset.key).join(); document.querySelector('#files li[data-key="src/parts"] > .tree-row').click(); const b = [...document.querySelectorAll('#files [role="treeitem"]')].map((x) => x.dataset.key).join(); return a + ' ' + b; });
  check('1.14 tree: a branch that has the words can be opened, and shows all of its own', parts === 'src,src/parts src,src/parts,src/parts/table.js,src/parts/a', parts);
  const none = await at(() => [files.filter('zzz'), document.querySelector('#files .empty').textContent, files.filter('')].join());
  check('1.14 tree: nothing found; then all as it was', none === '0,Nothing by that name,11' && (await rows('files')) === kept && (await at(() => localStorage.getItem('test-files'))) === '["src"]', none + '\n' + await rows('files'));
  const fn = await at(() => [files.filter((r) => r.sub), document.querySelectorAll('#files mark').length].join());
  check('1.14 tree: or any test', fn === '2,0' && (await rows('files')) === 'src -\n  app.js 12 KB\nREADME.md 4 KB', fn);
  await at(() => { files.filter(null); for (const t of [one, many, lazy]) t.filter(''); log.length = 0; });

  // picking one
  const chosen = () => at(() => [...document.querySelectorAll('#one [aria-selected="true"]')].map((x) => x.dataset.key).join());
  check('1.14 tree: one picked from the start, and where Tab goes', (await chosen()) === 'src/app.js' && (await at(() => document.querySelector('#one [tabindex="0"]').dataset.key)) === 'src/app.js', await chosen());
  await tab.click(row('one', 'src/parts/table.js'));
  await tab.click(row('one', 'readme'));
  await tab.click(row('one', 'src'));
  check('1.14 tree: a click picks, not one that can\'t be', (await logged()) === 'one src/parts/table.js | one src' && (await chosen()) === 'src', await chosen());
  const two = [(await rows('one')).split('\n')[0]];
  await tab.click(row('one', 'src'));
  two.push((await rows('one')).split('\n')[0]);
  check('1.14 tree: a branch that is open closes with the second click', two.join() === 'src -,src +' && (await logged()) === '', two.join());
  await press('Enter', 'ArrowDown', ' ');
  check('1.14 tree: Space picks, Enter opens a branch and goes to a leaf', (await logged()) === 'one src/app.js', '');
  await press('Enter');
  await tab.dblclick(row('one', 'src/parts/table.js'));
  check('1.14 tree: Enter or a double click is onPick', (await logged()) === 'go src/app.js | one src/parts/table.js | go src/parts/table.js', '');
  const offs = await at(() => { const li = document.querySelector('#one li[data-key="readme"]'); return [li.getAttribute('aria-disabled'), li.hasAttribute('aria-selected'), document.querySelector('#one [role="tree"]').hasAttribute('aria-multiselectable')].join(); });
  check('1.14 tree: one that can\'t be picked says so', offs === 'true,false,false', offs);
  const coded = await at(() => { one.select('test/app.js'); const a = [one.selected.id, log.splice(0).join()]; one.select('readme'); a.push(String(one.selected), log.splice(0).join()); one.select('src'); one.select('src'); a.push(log.splice(0).join()); return a.join(); });
  check('1.14 tree: select() from code', coded === 'test/app.js,one test/app.js,null,one null,one src', coded);

  // ticking many
  const boxes = () => at(() => [...document.querySelectorAll('#many [role="treeitem"]')].map((x) => `${x.dataset.key}:${{ true: 'x', false: '-', mixed: 'o' }[x.getAttribute('aria-checked')] ?? ' '}`).join(' '));
  check('1.14 tree: boxes; a branch with some of it ticked is neither', (await boxes()) === 'src:o src/app.js:- src/parts:o src/parts/table.js:x src/parts/a:- test:- test/app.js:- readme: ', await boxes());
  await tab.click(row('many', 'src/parts'));
  check('1.14 tree: ticking a branch ticks all of it, also what is closed', (await logged()) === 'many src/parts/table.js+x' && (await boxes()).includes('src:o src/app.js:- src/parts:x src/parts/table.js:x src/parts/a:x'), await boxes());
  await tab.click(row('many', 'src'));
  await tab.click(row('many', 'src'));
  check('1.14 tree: then all, then none', (await logged()) === 'many src/app.js+src/parts/table.js+x | many ' && (await boxes()).startsWith('src:- src/app.js:- src/parts:-'), await boxes());
  await tab.click(`${row('many', 'src')} > .tree-turn`);
  await press(' ', 'ArrowRight');
  check('1.14 tree: the arrow opens and closes, Space ticks', (await logged()) === 'many src/app.js+src/parts/table.js+x' && (await boxes()).startsWith('src:x src/app.js:x'), await boxes());
  await tab.click(row('many', 'readme'));
  const sifted = await at(() => { many.select([]); many.filter('app'); document.querySelector('#many li[data-key="src"] > .tree-row').click(); const a = [many.selected.map((r) => r.id).join('+'), document.querySelector('#many li[data-key="src"]').getAttribute('aria-checked')]; many.filter(''); a.push(document.querySelector('#many li[data-key="src"]').getAttribute('aria-checked')); many.select(['src']); a.push(many.selected.length); return a.join(); });
  check('1.14 tree: while filtered, a branch is what shows of it', sifted === 'src/app.js,true,mixed,3', sifted);
  const pruned = await at(async () => { log.length = 0; many.update([{ id: 'src', title: 'src', items: [{ id: 'src/app.js', title: 'app.js' }, { id: 'new', title: 'new' }] }]); await null; return [log.splice(0).join(), many.selected.length, document.querySelector('#many li[data-key="src"]').getAttribute('aria-checked')].join(); });
  check('1.14 tree: what left the data is ticked no more', pruned === 'many src/app.js,1,mixed', pruned);
  const pick = await at(() => { const q = (s) => document.querySelector(s), b = getComputedStyle(q('#many li[data-key="src/app.js"] .pick-box'), '::after').transform !== 'none', off = getComputedStyle(q('#many li[data-key="new"] .pick-box'), '::after').content; return [b, off].join(); });
  check('1.14 tree: a ticked box has its tick, an empty one nothing', pick === 'true,none', pick);

  // asked for when opened
  await tab.click(`${row('lazy', 'eu')} > .tree-turn`);
  const wait = [await rows('lazy'), await logged()];
  await at(() => { answers.eu.ok([{ id: 'de', title: 'Germany', items: true }, { id: 'fr', title: 'France' }]); });
  await tick();
  check('1.14 tree: what is inside is asked for when it is first opened', wait.join() === 'Europe -\n  Loading…\nAmerica +\nEmpty +\nA leaf,load eu' && (await rows('lazy')) === 'Europe -\n  Germany +\n  France\nAmerica +\nEmpty +\nA leaf', wait.join() + await rows('lazy'));
  await press('ArrowLeft', 'ArrowRight');
  check('1.14 tree: and only then', (await logged()) === '' && (await rows('lazy')).startsWith('Europe -\n  Germany +') && (await here()) === 'eu', await logged());
  await tab.click(`${row('lazy', 'us')} > .tree-turn`);
  await at(() => { answers.us.no(new Error('no <net>')); });
  await tick();
  const sad = await rows('lazy');
  await press('ArrowDown', 'Enter');
  const again = [await rows('lazy'), await logged()].join(), askedAt = await here();
  await at(() => { answers.us.ok([{ id: 'ny', title: 'New York' }]); });
  await tick();
  check('1.14 tree: an answer that fails says so, and can be asked for again', sad.includes('Couldn’t load this: no <net> Try again') && again.includes('America -\n  Loading…') && again.endsWith('load us | load us') && (await rows('lazy')).includes('America -\n  New York') && askedAt === 'us' && (await here()) === 'us', sad + again + await here());
  await tab.click(row('lazy', 'none'));
  await tab.click(`${row('lazy', 'none')} > .tree-turn`);
  const ticked = await at(() => lazy.selected.map((r) => r.id).join());
  await at(() => { answers.none.ok([]); });
  await tick();
  check('1.14 tree: nothing inside: says so', (await rows('lazy')).includes('Empty -\n  Nothing here'), await rows('lazy'));
  await tab.click(row('lazy', 'de'));
  await tab.click(`${row('lazy', 'de')} > .tree-turn`);
  await at(() => { answers.de.ok([{ id: 'ber', title: 'Berlin' }, { id: 'muc', title: 'Munich' }]); });
  await tick();
  check('1.14 tree: a ticked branch whose items come has them ticked', ticked === 'none' && (await at(() => lazy.selected.map((r) => r.id).join())) === 'ber,muc', ticked + await at(() => lazy.selected.map((r) => r.id).join()));
  const reload = await at(async () => { lazy.reload('us'); const a = document.querySelector('#lazy [data-note="us"]')?.textContent; await new Promise((ok) => setTimeout(ok, 5)); answers.us.ok([{ id: 'sf', title: 'San Francisco' }]); await new Promise((ok) => setTimeout(ok, 20)); const b = document.querySelector('#lazy li[data-key="us"] ul').textContent; lazy.reload('eu'); await new Promise((ok) => setTimeout(ok, 5)); const late = answers.eu; lazy.update([{ id: 'other', title: 'Other' }]); late.ok([{ id: 'zz', title: 'zz' }]); await new Promise((ok) => setTimeout(ok, 20)); return [a, b, document.querySelectorAll('#lazy [role="treeitem"]').length].join(); });
  check('1.14 tree: reload() asks again; an answer for what is gone changes nothing', reload === 'Loading…,San Francisco,1', reload);
  const late = await at(async () => { const wait = () => new Promise((ok) => setTimeout(ok, 20)); lazy.update([{ id: 'us', title: 'America', items: true }]); lazy.expand('us'); await wait(); lazy.reload('us'); await wait(); const first = answers.us; lazy.reload('us'); await wait(); answers.us.ok([{ id: 'b', title: 'Second' }]); await wait(); first.ok([{ id: 'a', title: 'First' }]); await wait(); return document.querySelector('#lazy li[data-key="us"] ul').textContent; });
  check('1.14 tree: asked twice, the first answer is too late', late === 'Second', late);

  // from code
  const code = await at(() => { const out = []; files.expand(false); out.push(files.expanded.length); files.expand(['src', 'test']); out.push(files.expanded.map((r) => r.id).join('+')); files.expand('src', false); out.push(files.expanded.map((r) => r.id).join('+')); files.expand(true); out.push(files.expanded.length, document.querySelectorAll('#files [role="treeitem"]').length); files.expand(false); out.push(files.reveal('x'), files.expanded.length, document.querySelector('#files [tabindex="0"]').dataset.key, files.reveal('nope')); files.reveal('src/app.js', { focus: true }); out.push(document.activeElement.dataset.key); return out.join(); });
  check('1.14 tree: expand(), expanded and reveal()', code === '0,src+test,test,6,11,true,5,x,false,src/app.js', code);
  const gone = await at(async () => { const a = []; document.querySelector('#files li[data-key="src/app.js"]').focus(); files.expand('src', false); a.push(document.activeElement.dataset.key); files.expand('src'); files.expand('test'); document.querySelector('#files li[data-key="test/app.js"]').focus(); files.update(FILES.map((f) => (f.id === 'test' ? { ...f, items: [{ id: 'new', title: 'new' }] } : f))); a.push(document.activeElement.dataset.key); files.update(FILES.slice(2)); a.push(document.activeElement.dataset.key); files.update([]); a.push(document.querySelector('#files .empty').textContent); files.update(FILES); return a.join(); });
  check('1.14 tree: the focus goes to what a row was in, if the row goes', gone === 'src,test,readme,Nothing here yet', gone);
  const same = await at(() => { const li = document.querySelector('#files li[data-key="src"]'); files.update(FILES.map((f) => ({ ...f }))); return li === document.querySelector('#files li[data-key="src"]'); });
  check('1.14 tree: an update that changes nothing writes nothing', same, '');
  const destroyed = await at(() => { const d = document.createElement('div'); document.body.append(d); const t = Dash.tree(d, { items: FILES }); t.destroy(); const a = d.innerHTML; d.innerHTML = '<ul><li class="tree-item" data-key="src" tabindex="0"><div class="tree-row">x</div></li></ul>'; let n = 0; d.querySelector('.tree-row').click(); Dash.tree(d, { items: FILES, onPick: () => { n += 1; } }); Dash.tree(d, { items: FILES, onPick: () => { n += 1; } }); d.querySelector('li[data-key="readme"] > .tree-row').click(); d.remove(); return [a, n, Dash.tree('no such', {})].join(); });
  check('1.14 tree: destroy(), and a tree made again: one listener', destroyed === ',1,', destroyed);

  // ---- a list
  const order = (id) => at((k) => [...document.querySelectorAll(`#${k} .entry-title`)].map((x) => x.textContent).join('|'), id);
  await logged();
  check('1.14 list: the rows of Dash.entries', (await order('rules')) === 'Block bots|Cache pictures|Send to the old site|Ask for a login|Let the rest through' && (await at(() => document.querySelector('#plain a.entry').getAttribute('href'))) === '#a', await order('rules'));
  // in order, by the keyboard
  await tab.focus('#rules [data-key="dash-grip a"]');
  await press('ArrowDown');
  const moved = [await order('rules'), await here(), await logged(), await at(() => document.querySelector('body > [data-dash-voice]').textContent)].join(' / ');
  check('1.14 list: an arrow key on the grip moves the row, keeps the focus and says where it is', moved === 'Cache pictures|Block bots|Send to the old site|Ask for a login|Let the rest through / dash-grip a / move a 0>1 bacde / Block bots: 2 of 5', moved);
  await press('ArrowUp', 'ArrowUp');
  check('1.14 list: no further than the ends', (await logged()) === 'move a 1>0 abcde' && (await order('rules')).startsWith('Block bots'), await order('rules'));
  await press('Enter');
  await tick();
  const offered = await at(() => [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent + (x.disabled ? ' (no)' : '')).join());
  await tab.click('[role="menuitem"] >> nth=3');
  await tick();
  check('1.14 list: a click on the grip gives the moves as a menu', offered === 'Move to the top (no),Move up (no),Move down,Move to the end' && (await logged()) === 'move a 0>4 bcdea', offered);
  // dragging
  const grip = (id, k) => tab.locator(`#${id} li[data-key="${k}"] [data-grip]`);
  const spot = async (l) => { const b = await l.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  await at(() => document.getElementById('rules').scrollIntoView({ block: 'center' }));
  const drag = async (from, to, { drop = true, dy = 0 } = {}) => {
    const [x, y] = await spot(from), [x2, y2] = await spot(to);
    await tab.mouse.move(x, y);
    await tab.mouse.down();
    await tab.mouse.move(x, y + (y2 > y ? 8 : -8));
    await tab.mouse.move(x2, y2 + dy, { steps: 4 });
    if (drop) await tab.mouse.up();
  };
  await drag(grip('rules', 'b'), grip('rules', 'd'), { dy: 6, drop: false });
  await tick();
  const mid = await at(() => [document.querySelectorAll('.drag-ghost').length, document.querySelector('.drag-ghost').textContent.includes('Cache pictures'), document.querySelectorAll('#rules .drop-line').length, document.querySelector('#rules li[data-key="b"]').className.includes('drag-from'), document.querySelectorAll('.drag-ghost [data-key], .drag-ghost [id]').length, Math.abs(document.querySelector('#rules .drop-line').getBoundingClientRect().top - document.querySelector('#rules li[data-key="d"]').getBoundingClientRect().bottom) < 3, Math.abs(document.querySelector('.drag-ghost').getBoundingClientRect().top - document.querySelector('#rules li[data-key="d"]').getBoundingClientRect().top - 6) < 2].join());
  await tab.mouse.up();
  await tick();
  check('1.14 list: dragged by its grip: a copy follows, a line shows where', mid === '1,true,1,true,0,true,true', mid);
  check('1.14 list: let go there, with nothing left behind and no click', (await logged()) === 'move b 0>2 cdbea' && (await at(() => document.querySelectorAll('.drag-ghost, .drop-line, .drag-from, .dragging, [role="menu"]').length)) === 0, '');
  await drag(grip('rules', 'a'), grip('rules', 'c'), { dy: -6 });
  check('1.14 list: to the top', (await logged()) === 'move a 4>0 acdbe', '');
  await drag(grip('rules', 'a'), grip('rules', 'e'), { dy: 60 });
  check('1.14 list: past the end is the end', (await logged()) === 'move a 0>4 cdbea', '');
  await drag(grip('rules', 'c'), grip('rules', 'e'), { drop: false });
  await press('Escape');
  await tab.mouse.up();
  await tick();
  check('1.14 list: Escape calls it off', (await logged()) === '' && (await order('rules')).startsWith('Send to') && (await at(() => document.querySelectorAll('.drag-ghost, .drop-line, [role="menu"]').length)) === 0, await order('rules'));
  await drag(grip('rules', 'c'), grip('rules', 'c'), { dy: 3 });
  await tick();
  check('1.14 list: back where it was is no move, and no click on the grip', (await logged()) === '' && (await at(() => document.querySelectorAll('[role="menu"]').length)) === 0, '');
  // saved, or not
  await at(() => { save = () => Promise.reject(new Error('Not saved')); });
  await tab.focus('#rules [data-key="dash-grip c"]');
  await press('ArrowDown');
  await tick(60);
  const back = [await order('rules'), await at(() => document.querySelector('.toast')?.textContent), await at(() => document.querySelector('body > [data-dash-voice]').textContent), await here()].join(' / ');
  check('1.14 list: a move that can\'t be saved is put back, and says why', back === 'Send to the old site|Ask for a login|Cache pictures|Let the rest through|Block bots / Not saved / Send to the old site was put back / dash-grip c', back);
  await logged();
  const held = await at(async () => { let ok; save = () => new Promise((y) => { ok = y; }); rules.move('c', 1); const a = []; rules.update(RULES); a.push(rules.rows.map((r) => r.id).join('')); rules.move('a', 0); a.push(rules.rows.map((r) => r.id).join('')); ok(); await new Promise((y) => setTimeout(y, 20)); a.push(rules.rows.map((r) => r.id).join('')); save = () => false; rules.move('a', 2); await new Promise((y) => setTimeout(y, 20)); a.push(rules.rows.map((r) => r.id).join('')); save = null; return a.join(); });
  check('1.14 list: an update waits until a move is saved; false puts it back', held === 'dcbea,dcbea,abcde,abcde', held);
  await logged();
  await drag(grip('rules', 'a'), grip('rules', 'c'), { dy: 6, drop: false });
  await at(() => { rules.update(RULES.slice(0, 4).map((r) => ({ ...r }))); });
  const during = await order('rules');
  await tab.mouse.up();
  await tick();
  check('1.14 list: an update waits for the drop, too', during.split('|').length === 5 && (await logged()) === 'move a 0>2 bcade' && (await order('rules')).split('|').length === 4, during + (await order('rules')));
  await at(() => { rules.update(RULES); });
  await drag(grip('rules', 'a'), grip('rules', 'c'), { dy: 6, drop: false });
  await at(() => { rules.update(RULES.slice(1)); });
  const waiting = (await order('rules')).split('|').length;
  await press('Escape');
  await tab.mouse.up();
  await tick();
  check('1.14 list: and one that is called off lets it through', waiting === 5 && (await order('rules')).split('|').length === 4 && (await logged()) === '', waiting + await order('rules'));
  await at(() => { rules.update(RULES); });
  // menu
  await tab.click('#rules [data-key="dash-dots b"]');
  await tick();
  await tab.click('[role="menuitem"] >> nth=1');
  await tick();
  check('1.14 list: a row\'s menu', (await logged()) === 'rule Remove b', '');
  const filtered = await at(() => { const n = rules.filter('a'); const a = [n, rules.count.shown, rules.count.total, document.querySelectorAll('#rules mark').length > 0]; rules.filter('login'); a.push(document.querySelectorAll('#rules li').length); rules.filter('zzz'); a.push(document.querySelector('#rules .empty').textContent); rules.filter(''); rules.update([]); a.push(document.querySelector('#rules .empty').textContent); rules.update(RULES); return a.join(); });
  check('1.14 list: filter() and count', filtered.startsWith('4,4,5,true,1,Nothing by that name,Nothing here yet'), filtered);

  // picking one
  const lab = await at(() => { const l = document.querySelector('#people [role="listbox"]'); return [l.getAttribute('aria-label'), l.hasAttribute('aria-multiselectable'), l.querySelectorAll('[role="option"]').length, l.querySelector('[aria-selected="true"]').dataset.key, l.querySelector('[tabindex="0"]').dataset.key, l.querySelector('[aria-disabled]').dataset.key].join(); });
  check('1.14 list: a list to pick from is a listbox', lab === 'People,false,5,2,2,3', lab);
  await tab.click('#people li[data-key="4"]');
  await tab.click('#people li[data-key="3"]', { force: true });
  await press('ArrowDown', 'ArrowDown', 'ArrowDown', 'Space');
  await press('Enter');
  check('1.14 list: a click or Space picks; Enter opens', (await logged()) === 'person 4 | person 5 | open 5', '');
  await press('Home', 'g');
  const typed = await here();
  await tab.dblclick('#people li[data-key="1"]');
  check('1.14 list: the first letter; a double click opens', typed === '2' && (await logged()) === 'person 1 | open 1', typed);

  // picking many
  const ticks = () => at(() => servers.selected.map((r) => r.id).join());
  await tab.click('#servers li[data-key="s1"]');
  await tab.click('#servers li[data-key="s10"]', { modifiers: ['Shift'] });
  check('1.14 list: Shift-click picks all between', (await ticks()) === 's1,s4,s7,s10' && (await logged()) === 'servers s1 | servers s1+s4+s7+s10', await ticks());
  await tab.click('#servers li[data-key="s4"]');
  check('1.14 list: a click puts one back', (await ticks()) === 's1,s7,s10', await ticks());
  await press('Control+a');
  const allOf = (await ticks()).split(',').length;
  await press('Control+a');
  check('1.14 list: mod+A picks all, then none', allOf === 14 && (await ticks()) === '', String(allOf));
  await press('Shift+ArrowDown', 'Shift+ArrowDown');
  check('1.14 list: Shift with an arrow picks on', (await ticks()) === 's4,s7,s10', await ticks());
  await press('ArrowDown', 'Space');
  check('1.14 list: the arrow alone goes on, Space picks', (await ticks()) === 's4,s7,s10,s13', await ticks());
  await tab.click('#own-link');
  check('1.14 list: a link in a row is not the row', (await ticks()) === 's4,s7,s10,s13', await ticks());
  const groups = await at(() => [...document.querySelectorAll('#servers [role="group"]')].map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent + g.querySelectorAll('[role="option"]').length).join());
  check('1.14 list: groups with their names', groups === 'Frankfurt5,Paris5,Dublin4', groups);
  const scrolls = await at(() => { const s = document.querySelector('#servers .entries-scroll'); s.scrollTop = 150; const tall = getComputedStyle(s).maxHeight; const h = s.querySelector('.entries-head').getBoundingClientRect().top - s.getBoundingClientRect().top; servers.update(servers.rows.map((r) => ({ ...r, load: 0.5 }))); return [tall, Math.abs(h) < 2, document.querySelector('#servers .entries-scroll').scrollTop, document.querySelector('#servers .entry-end').textContent].join(); });
  check('1.14 list: with a height it scrolls under its headings, and keeps its place in a refresh', scrolls === '260px,true,150,50%', scrolls);
  await logged();
  await tab.focus('#servers li[data-key="s5"]');
  await press('Alt+ArrowDown');
  const alt = [await logged(), await here(), await at(() => document.querySelector('body > [data-dash-voice]').textContent)].join(' / ');
  await press('Alt+ArrowUp', 'Alt+ArrowUp', 'Alt+ArrowUp', 'Alt+ArrowUp');
  check('1.14 list: Alt with an arrow moves a row in its group', alt === 'server s5 4>7 / s5 / web-5: 3 of 5' && (await at(() => [...document.querySelectorAll('#servers [data-zone="Paris"] li')].map((x) => x.dataset.key).join())) === 's5,s2,s8,s11,s14', alt + await logged());
  await logged();
  await at(() => { document.querySelector('#servers .entries-scroll').scrollTop = 0; });
  await drag(grip('servers', 's1'), grip('servers', 's7'), { dy: 6 });
  await tick();
  check('1.14 list: dragging in a group; a drag picks nothing', (await logged()).startsWith('server s1') && (await at(() => [...document.querySelectorAll('#servers [data-zone="Frankfurt"] li')].map((x) => x.dataset.key).join())) === 's4,s7,s1,s10,s13' && (await ticks()) === 's4,s7,s10,s13', await ticks());
  await tab.focus('#servers li[data-key="s4"]');
  await press('Shift+F10');
  await tick();
  await press('Enter');
  await tick();
  const k2 = [await keyed('servers', 's4', 'F10'), await keyed('servers', 's4', 'ContextMenu')].join(' ');
  check('1.14 list: the menu by the kit\'s own keys', k2 === 'true,1 true,1', k2);
  check('1.14 list: the menu of a row that is picked from', (await logged()) === 'Restart s4' && (await here()) === 's4', await here());
  const lose = await at(async () => { document.querySelector('#servers li[data-key="s4"]').focus(); servers.update(servers.rows.filter((r) => r.id !== 's4')); const a = document.activeElement.dataset.key; await null; return [a, log.splice(0).join()].join(); });
  check('1.14 list: a row that goes is picked no more, and the focus goes on', lose === 's7,servers s7+s10+s13', lose);
  const bycode = await at(() => { servers.select(['s2', 's3', 'nope']); const a = [servers.selected.map((r) => r.id).join('+'), log.splice(0).join()]; people.select(3); a.push(String(people.selected)); people.select([1, 2]); a.push(people.selected.id); return a.join(); });
  check('1.14 list: select() from code', bycode.startsWith('s2+s3,servers s2+s3,null,1') || bycode.startsWith('s3+s2,servers s3+s2,null,1'), bycode);

  // in parts
  const foot = (id) => at((k) => [document.querySelectorAll(`#${k} li`).length, document.querySelector(`#${k} .entries-foot`)?.textContent.trim() ?? 'none'].join(), id);
  const f1 = await foot('events');
  await tab.focus('#events [data-more]');
  await press('Enter');
  const f2 = [await foot('events'), await here()].join();
  await tab.click('#events [data-more]');
  check('1.14 list: shown in parts', f1 === '20,Show 20 more of 57' && f2 === '40,Show the last 17 of 57,dash-row 20' && (await foot('events')) === '57,none', f1 + f2 + await foot('events'));
  await logged();
  await tab.click('#events .entry >> nth=2');
  check('1.14 list: a row that is clicked', (await logged()) === 'event 2', '');
  const p1 = await foot('parts');
  await at(() => { answers.part.ok([{ id: 1, title: 'One' }, { id: 2, title: 'Two' }, { id: 3, title: 'Three' }]); });
  await tick();
  const p2 = await foot('parts');
  await tab.click('#parts [data-more]');
  const p3 = [await foot('parts'), await logged()].join();
  await at(() => { answers.part.no(new Error('offline')); });
  await tick();
  const p4 = await foot('parts');
  await tab.click('#parts [data-more]');
  await at(() => { answers.part.ok([{ id: 3, title: 'Three' }, { id: 4, title: 'Four' }]); });
  await tick();
  check('1.14 list: asked for in parts: waiting, failing, again, and the end', [p1, p2, p3, p4].join(' ') === '0,Loading… 3,Show more 3,Loading more…,part 3 3,Couldn’t load more: offline Try again' && (await foot('parts')) === '4,none' && (await at(() => document.querySelector('body > [data-dash-voice]').textContent)) === '1 part more', [p1, p2, p3, p4, await foot('parts')].join(' '));
  const reloaded = await at(async () => { parts.reload(); const a = document.querySelector('#parts .entries-foot').textContent.trim(); answers.part.ok([]); await new Promise((ok) => setTimeout(ok, 20)); return [a, document.querySelector('#parts').textContent].join(); });
  check('1.14 list: reload(), and nothing there', reloaded === 'Loading…,Nothing here yet', reloaded);
  const once = await at(() => { const d = document.createElement('div'); document.body.append(d); let n = 0; Dash.list(d, { rows: RULES, onPick: () => { n += 1; } }); const l = Dash.list(d, { rows: RULES, onPick: () => { n += 1; } }); d.querySelector('.entry').click(); l.destroy(); const a = d.innerHTML; d.remove(); return [n, a, Dash.list('no such', {})].join(); });
  check('1.14 list: made again: one listener; destroy()', once === '1,,', once);

  // ---- the sidebar
  const side = () => at(() => [...document.querySelectorAll('#side > *')].filter((x) => !x.hidden && x.className !== 'nav-none').map((x) => (x.tagName === 'DETAILS' ? `${x.open ? '[' : '('}${x.querySelector('.nav-name').textContent}: ${[...x.querySelectorAll('.nav-list .nav-item')].filter((i) => i.checkVisibility()).map((i) => i.querySelector('.nav-name').textContent).join(' ')}` : x.textContent.trim())).join(' | '));
  const s0 = await side();
  check('1.14 nav: links, headings and groups; the group the reader is in is open', s0 === 'Overview | Pieces | [Trees: Files One <b> | (Lists:  | Other | Busy91%', s0);
  const items = await at(() => { const q = (t) => [...document.querySelectorAll('#side .nav-item')].find((x) => x.querySelector('.nav-name').textContent === t); return [q('One <b>').getAttribute('aria-current'), q('Busy').getAttribute('href'), q('Busy').className, q('A button').tagName, document.querySelector('#side .nav-group .count-badge').textContent, document.querySelectorAll('#side [aria-current="page"]').length].join(); });
  check('1.14 nav: escaped, no script, the current page marked', items === 'page,#,nav-item attn warn,BUTTON,4,1', items);
  const turned = await at(() => { const s = [...document.querySelectorAll('#side .nav-group > summary')].map((x) => getComputedStyle(x, '::after')); return [s[0].content, s[0].transform !== s[1].transform].join(); });
  check('1.14 nav: the arrow says whether a group is open', turned === '"",true', turned);
  const tinted = await at(async () => { const c = (x) => getComputedStyle(x).color, d = document.querySelector('#side .nav-group'), s = d.querySelector('summary'); const blue = Dash.color('blue'), rgb = `rgb(${[1, 3, 5].map((i) => parseInt(blue.slice(i, i + 2), 16)).join(', ')})`; const a = [c(s) === rgb]; d.open = false; await new Promise((ok) => setTimeout(ok, 60)); a.push(c(s) === rgb); d.open = true; const l = document.querySelector('#side [aria-current="location"]'); a.push(Boolean(l) && c(l) === rgb); return a.join(); });
  check('1.14 nav: the marks: the section being read, and a closed group that has the reader\'s page in it', tinted === 'false,true,true', tinted);
  await logged();
  await tab.click('#side .nav-group >> nth=1 >> summary >> nth=0');
  await tab.click('#side .nav-group .nav-group > summary');
  await tab.click('#side button.nav-item');
  await tick();
  check('1.14 nav: a group opens, a group in it too; onPick', (await logged()) === 'nav A button' && (await side()).includes('[Lists: Rules More The end A button'), await side());
  const store = await at(() => localStorage.getItem('test-nav'));
  await tab.reload();
  check('1.14 nav: the groups the reader opened are remembered', store === '{"lists":true,"More":true}' && (await side()).includes('[Lists: Rules More The end A button'), store + await side());
  await tab.fill('#side-q', 'end');
  await tick(200);
  const n1 = [await side(), await at(() => found)].join();
  await tab.fill('#side-q', 'trees');
  await tick(200);
  const n2 = [await side(), await at(() => found)].join();
  await tab.click('#side .nav-group > summary >> nth=0'); // (closed while filtered: not remembered)
  await tick();
  await tab.fill('#side-q', 'zzz');
  await tick(200);
  const n3 = [await side(), await at(() => document.querySelector('#side .nav-none').textContent), await at(() => found)].join();
  await tab.fill('#side-q', '');
  await tick(200);
  check('1.14 nav: the filter keeps what has the words, with its group and heading', n1 === 'Pieces | [Lists: More The end,1' && n2 === 'Pieces | [Trees: Files One <b>,2' && n3 === ',Nothing by that name,0', n1 + ' / ' + n2 + ' / ' + n3);
  check('1.14 nav: then all as it was', (await side()) === 'Overview | Pieces | [Trees: Files One <b> | [Lists: Rules More The end A button | Other | Busy91%' && (await at(() => localStorage.getItem('test-nav'))) === store && (await at(() => document.querySelector('#side .nav-none').textContent)) === '', await side());
  const cur = await at(() => { for (const d of document.querySelectorAll('#side details')) d.open = false; nav.current('#end'); const a = [[...document.querySelectorAll('#side [aria-current="page"]')].map((x) => x.textContent).join(), [...document.querySelectorAll('#side details')].map((d) => d.open).join()]; nav.current(null); a.push(document.querySelectorAll('#side [aria-current="page"]').length); nav.update([{ label: 'Only', href: '#x', items: [{ label: 'in', href: '#in' }] }]); a.push(document.querySelector('#side').textContent); return a.join(); });
  check('1.14 nav: current() and update()', cur === 'The end,false,true,true,0,Onlyin', cur);
  const adopted = await at(() => { const d = document.createElement('nav'); d.innerHTML = Dash.nav.html([{ label: 'A', items: [{ label: 'x', href: 'x.html' }] }, { label: 'B', items: [{ label: 'y', href: 'y.html', key: 'why' }], open: true }]); document.body.append(d); const h = Dash.nav(d, null, { current: 'x.html' }); const a = [...d.querySelectorAll('details')].map((x) => x.open).join(); const n = h.filter('y'); const b = [...d.querySelectorAll('details')].map((x) => x.hidden).join(); h.filter(''); h.stop(); d.remove(); return [a, n, b].join(); });
  check('1.14 nav: links that are already in the page', adopted === 'true,true,1,true,false', adopted);

  const html = await at(() => Dash.nav.html([{ label: 'A', items: [{ label: 'x', href: 'x.html' }] }, { label: 'B', items: [{ label: 'C', items: [{ label: 'y', href: 'y.html' }] }] }, { label: 'D', open: true, items: [] }], { current: 'y.html', open: { A: false } }).match(/<details[^>]*>|aria-current="page"/g).map((x) => (x.startsWith('<') ? (/ open>/.test(x) ? 'open' : 'shut') : x)).join());
  check('1.14 nav: its HTML on its own has the groups of the current page open', html === 'shut,open,open,aria-current="page",open', html);

  // the rail, and the drawer
  await tab.reload();
  await tab.click('[data-toggle-side]');
  const rail = await at(() => [...document.querySelectorAll('#side .nav-list, #side .nav-main, #side .count-badge')].filter((x) => x.checkVisibility()).length);
  await tab.click('#side .nav-group > summary >> nth=0');
  await tick();
  const wide = await at(() => [document.querySelector('.shell').className, document.querySelector('#side .nav-group').open, document.querySelector('[data-toggle-side]').getAttribute('aria-expanded'), localStorage.getItem(Dash.config.sideKey)].join());
  check('1.14 nav: in the rail a group brings the sidebar back', rail === 0 && wide === 'shell offcanvas,true,true,"open"', rail + wide);
  await tab.context().close();
  const phone = await openLists({ width: 390, height: 780, hasTouch: true, isMobile: true });
  await phone.click('[data-toggle-side]');
  await phone.waitForTimeout(300);
  await phone.click('#side .nav-group >> nth=1 >> summary >> nth=0');
  await phone.waitForTimeout(60);
  const d1 = await phone.evaluate(() => [document.querySelector('.shell').classList.contains('side-open'), document.querySelectorAll('#side .nav-group')[1].open].join());
  const railed = await phone.evaluate(() => { const s = document.querySelector('.shell'); s.classList.add('collapsed'); const a = [...document.querySelectorAll('#side .nav-list')].slice(0, 2).map((x) => x.checkVisibility()).join(); s.classList.remove('collapsed'); return a; });
  check('1.14 nav: in the drawer, the groups show also when the sidebar is a rail on a wide screen', railed === 'true,true', railed);
  await phone.click('#side .nav-group >> nth=1 >> .nav-list > a >> nth=0');
  await phone.waitForTimeout(60);
  check('1.14 nav: in the drawer, opening a group leaves it open; a link closes it', d1 === 'true,true' && !(await phone.evaluate(() => document.querySelector('.shell').classList.contains('side-open'))), d1);
  const fits = await phone.evaluate(() => { files.expand(true); one.expand(true); const r = [...document.querySelectorAll('.tree-row, .entry')].filter((x) => x.checkVisibility()); return [document.documentElement.scrollWidth - innerWidth, Math.min(...r.map((x) => Math.round(x.getBoundingClientRect().height))) >= 38, Math.min(...[...document.querySelectorAll('.tree-text')].map((x) => x.getBoundingClientRect().width)) > 60, getComputedStyle(document.querySelector('#files .row-dots')).visibility, [...document.querySelectorAll('.tree-text')].every((x) => x.getBoundingClientRect().right <= x.closest('.panel').getBoundingClientRect().right), [...document.querySelectorAll('.tree-text')].some((x) => x.scrollWidth > x.clientWidth)].join(); });
  check('1.14 on a phone: six levels fit, rows are large enough to press, and the dots show', fits === '0,true,true,visible,true,true', fits);
  // dragging by touch doesn't scroll the page
  await phone.evaluate(() => { document.getElementById('rules').scrollIntoView({ block: 'center' }); log.length = 0; });
  await phone.waitForTimeout(100);
  const touch = async (type, x, y) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }); };
  const cdp = await phone.context().newCDPSession(phone);
  const from = await phone.locator('#rules li[data-key="a"] [data-grip]').boundingBox(), to = await phone.locator('#rules li[data-key="c"] [data-grip]').boundingBox();
  const y0 = await phone.evaluate(() => scrollY);
  await touch('touchStart', from.x + 10, from.y + 10);
  for (let i = 1; i <= 5; i++) await touch('touchMove', from.x + 10, from.y + 10 + ((to.y + 14 - from.y) * i) / 5);
  await touch('touchEnd');
  await phone.waitForTimeout(60);
  const touched = await phone.evaluate(() => [log.filter((x) => x.startsWith('move')).join(), scrollY].join());
  check('1.14 on a phone: a row is dragged by its grip, and the page stays', touched === `move a 0>2 bcade,${y0}`, touched + ' ' + y0);
  await phone.context().close();

  // the section being read
  const spy = await openLists({ height: 700 });
  const now = () => spy.evaluate(() => [...document.querySelectorAll('#side [aria-current="location"]')].map((x) => x.getAttribute('href')).join());
  const at0 = await now();
  await spy.evaluate(() => { document.getElementById('lists').scrollIntoView(); scrollBy(0, 5); });
  await spy.waitForTimeout(80);
  const at1 = await now();
  await spy.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await spy.waitForTimeout(80);
  const at2 = [await now(), await spy.evaluate(() => `${window.spy.current} ${log.filter((x) => x.startsWith('at ')).join()}`)].join();
  check('1.14 spy: the link to the section being read is marked', at0 === '#trees' && at1 === '#lists' && at2 === '#end,end at trees,at lists,at end', [at0, at1, at2].join(' / '));
  await spy.evaluate(() => { document.getElementById('end').lastElementChild.style.height = '10px'; scrollTo(0, 0); });
  await spy.waitForTimeout(80);
  await spy.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await spy.waitForTimeout(80);
  check('1.14 spy: the end of the page is its last section, too short to reach the top', (await now()) === '#end', await now());
  await spy.evaluate(() => { scrollTo(0, 0); for (const d of document.querySelectorAll('#side details')) d.open = true; const b = document.querySelector('.sidebar'); b.style.maxHeight = '120px'; b.scrollTop = 0; });
  await spy.waitForTimeout(80);
  await spy.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await spy.waitForTimeout(80);
  const inBox = await spy.evaluate(() => { const b = document.querySelector('.sidebar'), x = document.querySelector('#side a[href="#end"]').getBoundingClientRect(), r = b.getBoundingClientRect(), a = [b.scrollHeight > b.clientHeight, x.top >= r.top && x.bottom <= r.bottom].join(); b.style.maxHeight = ''; scrollTo(0, 0); return a; });
  check('1.14 spy: the marked link is kept in view in its own box', inBox === 'true,true', inBox);
  await spy.waitForTimeout(80);
  await spy.click('#side a[href="#lists"]');
  await spy.waitForTimeout(700);
  const held1 = await now();
  await spy.click('#side a[href="#end"]');
  await spy.waitForTimeout(700);
  const held2 = await now();
  await spy.mouse.move(800, 400);
  await spy.mouse.wheel(0, -900);
  await spy.waitForTimeout(250);
  check('1.14 spy: one that is clicked, until the reader scrolls on', held1 === '#lists' && held2 === '#end' && (await now()) !== '#end', [held1, held2, await now()].join());
  await spy.evaluate(() => { location.hash = '#trees'; });
  await spy.waitForTimeout(600);
  const hashed = await now();
  await spy.evaluate(() => { document.querySelector('#lists .grid').style.display = 'none'; location.hash = '#lists'; }); // (now too near the end to reach the top)
  await spy.waitForTimeout(700);
  const near = [await now()];
  await spy.evaluate(() => scrollTo(0, 0));
  await spy.waitForTimeout(300);
  near.push(await now());
  await spy.click('#side a[href="#lists"]'); // (the address stays as it is)
  await spy.waitForTimeout(700);
  near.push(await now());
  check('1.14 spy: a link that is clicked again counts, though the address stays', near.join() === '#lists,#trees,#lists', near.join());
  await spy.evaluate(() => { location.hash = '#trees'; });
  await spy.waitForTimeout(600);
  await spy.evaluate(() => { window.spy.stop(); scrollTo(0, document.documentElement.scrollHeight); });
  await spy.waitForTimeout(80);
  check('1.14 spy: the address too; stop()', hashed === '#trees' && (await now()) === '#trees', hashed + await now());
  await spy.context().close();

  // a strict style policy
  const strict = await openLists({ page: 'csp-lists.html' });
  await strict.locator('#list').scrollIntoViewIfNeeded();
  const g = await strict.locator('#list [data-grip] >> nth=0').boundingBox();
  await strict.mouse.move(g.x + 5, g.y + 8);
  await strict.mouse.down();
  await strict.mouse.move(g.x + 5, g.y + 30, { steps: 3 });
  await strict.mouse.move(g.x + 5, g.y + 95, { steps: 3 });
  await strict.waitForTimeout(60);
  const ghost = await strict.evaluate(() => [Math.round(document.querySelector('.drag-ghost').getBoundingClientRect().top - document.querySelector('.drag-from').getBoundingClientRect().top), getComputedStyle(document.querySelector('.drop-line')).top !== 'auto']);
  await strict.mouse.up();
  await strict.waitForTimeout(60);
  const csp = await strict.evaluate((g) => [g[0], g[1], document.querySelector('#list li').dataset.key, document.querySelector('.entries-scroll').clientHeight, document.querySelectorAll('#tree [role="treeitem"]').length, document.querySelectorAll('[style]').length, document.querySelectorAll('main [style]').length, violations.length].join(), ghost);
  check('1.14 under a strict style policy: the height, the drag and the avatars too', /^\d+,true,1,200,31,\d+,\d+,0$/.test(csp) && Number(csp.split(',')[0]) > 50, csp);
  await strict.context().close();

  // high contrast: what is picked, ticked and focused is more than a background
  const hc = await openLists({ forcedColors: 'active' });
  const shown = await hc.evaluate(async () => { const s = (q) => getComputedStyle(document.querySelector(q)); servers.select(['s1']); await new Promise((ok) => setTimeout(ok, 60)); const a = [s('#one [aria-selected="true"] > .tree-row').outlineStyle, s('#people [aria-selected="true"]').outlineStyle, s('#many [aria-checked="true"] .pick-box').backgroundColor !== s('#many [aria-checked="false"] .pick-box').backgroundColor, s('#side [aria-current="location"] .nav-name').textDecorationLine, s('#servers [aria-selected="true"] .pick-box').backgroundColor !== s('#servers [aria-selected="false"] .pick-box').backgroundColor, (() => { const i = document.createElement('i'); i.style.backgroundColor = 'Highlight'; document.body.append(i); const c = getComputedStyle(i).backgroundColor; i.remove(); return s('#many [aria-checked="true"] .pick-box').backgroundColor === c; })()]; return a.join(); });
  check('1.14 in high contrast: picked rows, ticked boxes and the section being read show', shown === 'solid,solid,true,underline,true,true', shown);
  await hc.focus('#one [tabindex="0"]');
  await hc.keyboard.press('ArrowDown');
  const ringed = await hc.evaluate(() => [getComputedStyle(document.activeElement.querySelector('.tree-row')).outlineStyle, getComputedStyle(document.querySelector('#one [aria-selected="true"] > .tree-row')).outlineStyle].join());
  check('1.14 in high contrast: the focus is told apart from the pick', ringed === 'double,solid', ringed);
  await hc.context().close();
}

// ---- 1.14 the docs' own sidebar, and the page of all components
{
  const open = async (page, width = 1280, height = 800) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', reducedMotion: 'reduce' });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(5000);
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(url.replace('test/behaviour.html', page), { waitUntil: 'load' });
    await tab.waitForTimeout(150);
    return tab;
  };
  const tab = await open('docs/lists.html#tree');
  const side = () => tab.evaluate(() => [[...document.querySelectorAll('#docs-nav details[open] > summary')].map((x) => x.textContent).join(), [...document.querySelectorAll('#docs-nav [aria-current]')].map((x) => `${x.textContent}:${x.getAttribute('aria-current')}`).join()].join(' '));
  const first = await side();
  check('1.14 docs: the sidebar has this page\'s class open and the section being read marked', first === 'Lists and trees Trees:location', first);
  const tall = await open('docs/lists.html#facts', 1280, 2600);
  const late = await tall.evaluate(() => [...document.querySelectorAll('#docs-nav [aria-current="location"]')].map((x) => x.getAttribute('href')).join());
  check('1.14 docs: opened at a section too near the end to reach the top, that one is marked', late === '#facts', late);
  await tall.context().close();
  const inView = await tab.evaluate(() => { const a = document.querySelector('#docs-nav [aria-current]').getBoundingClientRect(), s = document.querySelector('.sidebar').getBoundingClientRect(); return a.top >= s.top && a.bottom <= s.bottom; });
  check('1.14 docs: and in view', inView, '');
  await tab.fill('#docs-filter', 'date');
  await tab.waitForTimeout(250);
  const hits = await tab.evaluate(() => [...document.querySelectorAll('#docs-nav a')].filter((x) => x.checkVisibility()).map((x) => x.textContent).join());
  check('1.14 docs: the box over it filters it', hits === 'Dates', hits);
  await tab.click('#docs-nav a[href="fields.html#datepicker"]');
  await tab.waitForTimeout(250);
  check('1.14 docs: a link goes to its section', tab.url().endsWith('/docs/fields.html#datepicker') && (await side()) === 'Richer fields Dates:location', tab.url() + await side());
  await tab.click('#docs-nav summary:has-text("Tables")');
  await tab.waitForTimeout(60);
  await tab.goto(url.replace('test/behaviour.html', 'docs/buttons.html'), { waitUntil: 'load' });
  await tab.waitForTimeout(150);
  check('1.14 docs: the classes the reader opened stay open on the next page', (await side()).startsWith('Buttons,Tables '), await side());
  for (const [from, to] of [['text.html#pills', 'labels.html#pills'], ['feedback.html#private', 'privacy.html#private'], ['navigation.html#timeline', 'lists.html#timeline'], ['forms.html#datepicker', 'fields.html#datepicker']]) {
    await tab.goto(url.replace('test/behaviour.html', 'docs/' + from), { waitUntil: 'load' });
    await tab.waitForTimeout(250);
    check(`1.14 docs: an old link to ${from} goes where that is now`, tab.url().endsWith('/docs/' + to), tab.url());
  }
  await tab.goto(url.replace('test/behaviour.html', 'docs/components.html'), { waitUntil: 'load' });
  const cards = () => tab.evaluate(() => [[...document.querySelectorAll('.docs-class')].filter((x) => !x.hidden).map((x) => x.id).join(), [...document.querySelectorAll('.docs-class .card')].filter((x) => x.checkVisibility()).length, document.getElementById('docs-found').textContent, [...document.querySelectorAll('#docs-nav [aria-current="page"]')].map((x) => x.textContent).join()].join(' / '));
  const all = await cards();
  check('1.14 docs: all components, by their class', /^layout,buttons,forms,fields,labels,lists,tables,logs,charts,surfaces,navigation,overlays,feedback,privacy \/ (\d+) \/ \1 components \/ All components$/.test(all), all);
  await tab.fill('#docs-find', 'Dash.tree');
  await tab.waitForTimeout(250);
  const trees = await cards();
  await tab.fill('#docs-find', 'zzz');
  await tab.waitForTimeout(250);
  check('1.14 docs: found by a name, a class or a function', trees === 'lists / 1 / 1 component / All components' && (await cards()) === ' / 0 / Nothing by that name / All components', trees + await cards());
  await tab.context().close();
  // the gallery
  const gal = await open('index.html#lists');
  const g = await gal.evaluate(() => { const links = [...document.querySelectorAll('#side a')]; return [document.querySelectorAll('#side .side-head').length, links.every((a) => document.getElementById(a.getAttribute('href').slice(1))), links.length > 20, document.querySelector('#side [aria-current="location"]')?.getAttribute('href'), ['colours', 'numbers', 'labels', 'controls', 'surfaces', 'tables', 'charts', 'more', 'popups', 'forms', 'feedback'].every((id) => document.getElementById(id))].join(); });
  check('1.14 gallery: a sidebar of its sections by class, every link to something; the old anchors still there', g === '2,true,true,#lists,true', g);
  await gal.context().close();
}

// ---- 1.15 more fields (test/fields.html)
{
  const openFields = async ({ width = 1000, height = 900, page = 'fields.html', ...more } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', reducedMotion: 'reduce', ...more });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(5000);
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openFields();
  const at = async (f, a) => { let t; try { return await Promise.race([tab.evaluate(f, a), new Promise((_, no) => { t = setTimeout(() => no(new Error('the page hangs')), 10000); })]); } finally { clearTimeout(t); } };
  const tick = (ms = 40) => tab.waitForTimeout(ms);
  const logged = () => at(() => log.splice(0).join(' | '));
  const press = async (...keys) => { for (const k of keys) await tab.keyboard.press(k); };
  const val = (id) => at((k) => document.getElementById(k).value, id);
  const val2 = (q) => at((k) => document.querySelector(k)?.value, q);

  // ---- a number
  const seats = '[name="seats"]';
  const num = () => at(() => { const f = document.querySelector('[name="seats"]').closest('.num-field'); return [f.querySelector('input').value, ...[...f.querySelectorAll('button')].map((b) => b.disabled)].join(); });
  check('1.15 number: a box with − and +', (await num()) === '4,false,false', await num());
  const more = `.num-field:has(${seats}) [data-step="1"]`, less = `.num-field:has(${seats}) [data-step="-1"]`;
  await tab.click(more);
  const n1 = [await num(), await logged(), await at(() => document.activeElement.name)].join(' ');
  await at(() => { window.typed = 0; document.querySelector('[name="seats"]').addEventListener('input', () => { window.typed++; }); });
  await tab.click(less);
  const n0 = await at(() => { const b = document.querySelector('.num-field:has([name="seats"]) [data-step="-1"]'); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); return window.typed; });
  check('1.15 number: + adds one, and is off at the end; the change is told once', n1 === '5,false,true seats 5 seats' && (await num()) === '4,false,false' && (await logged()) === 'seats 4' && n0 === 1, n1 + await num() + n0);
  await tab.hover(less);
  await tab.mouse.down();
  await tick(1200);
  const n2 = [await num(), await logged()].join(' ');
  await tab.mouse.up();
  await tick();
  check('1.15 number: held, it goes on to the end; then the change is told', n2 === '1,true,false ' && (await logged()) === 'seats 1', n2);
  await tab.hover(more);
  await tab.mouse.down();
  await tick();
  await tab.mouse.up();
  await tick(700);
  check('1.15 number: let go, it stops', (await num()) === '2,false,false' && (await logged()) === 'seats 2', await num());
  await tab.focus(seats);
  await tab.keyboard.press('Control+a');
  await tab.keyboard.type('5');
  const n3 = await num();
  await at(() => document.querySelector('[name="seats"]').blur());
  await at(() => { document.querySelector('.num-field [data-step="-1"]').click(); });
  check('1.15 number: typing sets what is off; a screen reader\'s press counts', n3 === '5,false,true' && (await num()) === '4,false,false', n3 + await num());
  await at(() => { log.length = 0; const b = document.querySelector('.num-field:has([name="limit"]) [data-step="1"]'); b.click(); b.click(); });
  const n4 = await at(() => document.querySelector('[name="limit"]').value);
  const n5 = await at(() => { const d = document.createElement('div'); d.innerHTML = Dash.number({ name: 'q', min: 3 }) + Dash.number({ name: 'any', step: 'any', value: 1.5, max: 2 }) + Dash.number({ name: 'off', value: 2, disabled: true }); document.body.append(d); const go = (n) => { const b = d.querySelector(`.num-field:has([name="${n}"]) [data-step="1"]`); b.click(); return d.querySelector(`[name="${n}"]`).value; }; const out = [go('q'), go('any'), go('off')]; d.innerHTML = Dash.number({ name: 'low', min: 3 }) + '<div class="num-field"><button type="button" data-step="-1">−</button><input type="number" name="ro" value="2" readonly><button type="button" data-step="1">+</button></div>'; d.querySelector('button').click(); out.push(d.querySelector('[name="low"]').value, go('ro')); const ends = (o) => [...Dash.number(o).matchAll(/data-step="(-?1)"[^>]*?( disabled)?>/g)].map((m) => (m[2] ? 'off' : 'on')).join('+'); out.push(ends({ min: 1, max: 5, value: 1 }), ends({ min: 1, max: 5, value: 5 }), ends({ min: 1, max: 5, value: 2 }), ends({ value: 2 })); d.remove(); return out.join(); });
  check('1.15 number: steps, an empty box starts at its least, step="any", off, the ends', n4 === '1' && n5 === '3,2,2,3,2,off+on,on+off,on+on,on+on', n4 + ' ' + n5);

  // ---- a password
  const pw = () => at(() => { const b = document.querySelector('[data-peek]'); return [document.getElementById('pw').type, b.textContent, b.getAttribute('aria-pressed')].join(); });
  await tab.click('[data-peek]');
  const p1 = await pw();
  await tab.click('[data-peek]');
  const p2 = await pw();
  await tab.click('[data-peek]');
  await at(() => { const f = document.getElementById('form'); f.addEventListener('submit', (e) => e.preventDefault(), { once: true, capture: true }); f.requestSubmit(); });
  check('1.15 password: shown, hidden, and hidden again when its form goes out', p1 === 'text,Hide,true' && p2 === 'password,Show,false' && (await pw()) === 'password,Show,false', p1 + p2 + await pw());
  await at(() => form.clear());
  const peeked = await at(() => { const d = document.createElement('div'); d.innerHTML = '<input type="password" id="far" value="x"><p><button type="button" data-peek="far"><svg width="4" height="4"></svg></button></p>'; document.body.append(d); const b = d.querySelector('button'); b.click(); const a = [d.firstElementChild.type, b.innerHTML.startsWith('<svg'), b.getAttribute('aria-pressed')]; d.remove(); return a.join(); });
  check('1.15 password: an icon stays an icon, and a box that is elsewhere is found by its id', peeked === 'text,true,true', peeked);

  // ---- tags
  const tagsNow = () => at(() => [tags.value.join('+'), [...document.querySelectorAll('input[type="hidden"][name="labels"]')].map((i) => i.value).join('+'), document.getElementById('tags').value].join(' '));
  check('1.15 tags: from what is in the box; a field each in the form', (await tagsNow()) === 'web+eu-west web+eu-west ', await tagsNow());
  await tab.focus('#tags');
  await tick();
  const ring = await at(() => { const i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue('--blue'); document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return getComputedStyle(document.querySelector('.tag-box')).borderTopColor === c; });
  check('1.15 tags: the box is lit while its input has the focus', ring, '');
  await tab.keyboard.type('db,');
  check('1.15 tags: said', (await at(() => document.querySelector('body > [data-dash-voice]').textContent)) === 'db added', '');
  await tab.keyboard.type('Web,');
  const t1 = [await tagsNow(), await logged()].join(' / ');
  check('1.15 tags: Enter or a comma adds; one that is there isn\'t added twice', t1 === 'web+eu-west+db web+eu-west+db  / tags web+eu-west+db', t1);
  await tab.keyboard.type('a b');
  await press('Enter');
  await tick();
  const t2 = [await tagsNow(), await at(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join())].join(' / ');
  check('1.15 tags: allow() says why not, and the text stays', t2 === 'web+eu-west+db web+eu-west+db a b / “a b” has a space in it.', t2);
  await tab.fill('#tags', '');
  await at(() => { const d = new DataTransfer(); d.setData('text', 'x1, x2\nx3'); const e = new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }); document.getElementById('tags').dispatchEvent(e); });
  const t3 = await tagsNow();
  check('1.15 tags: a paste of several, up to the most there may be', t3 === 'web+eu-west+db+x1 web+eu-west+db+x1 x2, x3', t3);
  await tab.fill('#tags', '');
  await tab.focus('#tags');
  await press('Backspace');
  const t4 = [await tagsNow(), await at(() => document.querySelector('body > [data-dash-voice]').textContent)].join(' / ');
  await press('ArrowLeft', 'ArrowLeft', 'Delete');
  const t5 = [await tagsNow(), await at(() => document.activeElement.getAttribute('aria-label'))].join(' / ');
  await press('ArrowRight');
  check('1.15 tags: Backspace takes the last; arrows go to the ones before, Delete takes one', t4 === 'web+eu-west+db web+eu-west+db  / x1 removed' && t5 === 'web+db web+db  / Remove db' && (await at(() => document.activeElement.id)) === 'tags', t4 + t5);
  await tab.click('.tag-box .tag-x >> nth=0');
  check('1.15 tags: or its ×', (await tagsNow()).startsWith('db db') && (await at(() => document.activeElement.id)) === 'tags', await tagsNow());
  await tab.keyboard.type('zz');
  await press('Backspace');
  const t6 = [await at(() => tags.value.length), await val('tags')].join();
  await tab.fill('#tags', '');
  check('1.15 tags: Backspace in a box that has text is for the text', t6 === '1,z', t6);
  await tab.keyboard.type('left');
  await at(() => document.activeElement.blur());
  await tick();
  check('1.15 tags: what is typed is added when the box is left', (await tagsNow()) === 'db+left db+left ', await tagsNow());
  await logged();
  await tab.focus('#cities');
  await tab.keyboard.type('ber');
  await tick(80);
  const c1 = await at(() => [...document.querySelectorAll('.combo-option')].map((x) => x.textContent).join());
  await press('ArrowDown', 'Enter');
  await tick(60);
  const c2 = [await at(() => cities.value.join('+')), await val('cities'), await logged()].join(' / ');
  const quiet = await at(() => document.querySelectorAll('.combo-list:popover-open').length);
  await tab.keyboard.type('ber');
  await tick(80);
  const c3 = await at(() => [...document.querySelectorAll('.combo-option')].map((x) => x.textContent).join());
  await press('Escape');
  await tab.keyboard.type('lin');
  await press('Enter');
  await tab.keyboard.press('Control+a');
  await tab.keyboard.type('Porto,');
  await tick(60);
  const c4 = [await at(() => cities.value.join('+')), await at(() => [...document.querySelectorAll('input[name="cities"]')].map((i) => i.value).join('+'))].join(' / ');
  check('1.15 tags: suggestions, without the ones that are there; only those with strict', c1 === 'BerlinGermany,Bern' && c2 === 'ber /  / cities ber' && c3 === 'Bern' && c4 === 'ber+Porto / ber+Porto' && quiet === 0, [c1, c2, c3, c4, quiet].join(' ; '));
  await at(() => { cities.set([]); const i = document.getElementById('cities'); i.value = ''; i.focus(); });
  await tab.keyboard.type('berlin, Nowhere');
  await at(() => { document.querySelectorAll('.toast').forEach((x) => { x.textContent = ''; }); document.activeElement.blur(); });
  await tick();
  const c6 = await at(() => [cities.value.join('+'), document.querySelector('[data-tag="ber"]')?.textContent, document.getElementById('cities').value, [...document.querySelectorAll('.toast')].map((x) => x.textContent).join('')].join(' / '));
  check('1.15 tags: left with strict, what is one of them is added by its name, the rest stays, and nothing pops up', c6 === 'ber / Berlin× / Nowhere / ', c6);
  await at(() => { document.getElementById('cities').value = ''; });
  const api = await at(() => { tags.set(['a', 'b']); const out = [tags.value.join('+'), tags.add('c'), tags.add('d d'), tags.add('A'), tags.value.join('+')]; tags.remove('B'); out.push(tags.value.join('+')); return out.join(); });
  check('1.15 tags: set(), add(), remove()', api === 'a+b,true,false,true,a+b+c,a+c', api);
  const escd = await at(() => { const d = document.createElement('div'); d.innerHTML = '<input class="input" name="z">'; document.body.append(d); const t = Dash.tagbox(d.firstElementChild, { value: ['<b>x</b>'], options: [{ value: 'y', label: '<i>Y</i>' }] }); t.add('y'); const a = [d.querySelectorAll('b, i').length, d.querySelector('.tag').textContent, d.querySelectorAll('.tag')[1].textContent]; d.remove(); return a.join(); });
  check('1.15 tags: escaped', escd === '0,<b>x</b>×,<i>Y</i>×', escd);
  await at(() => { const d = document.createElement('div'); d.id = 'looked'; d.innerHTML = '<input class="input" name="z">'; document.body.append(d); window.looked = Dash.tagbox(d.firstElementChild, { options: async () => [{ value: 'x1', label: 'Ex one' }, 'Two'], strict: true }); d.querySelector('input').focus(); });
  await tab.keyboard.type('e');
  await tick(300);
  await tab.click('.combo-option:visible >> nth=0');
  await tick(60);
  const asked = await at(() => { const d = document.getElementById('looked'), a = [looked.value.join('+')]; a.push(looked.add('two'), looked.add('three'), looked.value.join('+')); d.querySelector('.tag-box-in').disabled = true; const x = d.querySelector('.tag-x'); if (x) x.click(); a.push(looked.value.length, x && getComputedStyle(x).display); looked.destroy(); d.remove(); return a.join(); });
  check('1.15 tags: suggestions that are looked up; off, nothing is taken away', asked === 'x1,true,false,x1+Two,2,none', asked);
  const undone = await at(() => { const d = document.createElement('div'); d.innerHTML = '<input class="input" name="z" value="q" required>'; document.body.append(d); const i = d.firstElementChild; const t = Dash.tagbox(i); const a = [i.name, i.required, d.querySelectorAll('[name="z"]').length]; Dash.tagbox(i); a.push(d.querySelectorAll('.tag-box').length); i.__dashTags.destroy(); a.push(i.name, i.required, i.className, d.children.length); d.remove(); return a.join(); });
  check('1.15 tags: made again, and undone', undone === ',false,1,1,z,true,input,1', undone);

  // ---- a code
  await logged();
  await tab.focus('#code');
  await tab.keyboard.type('12a34');
  const k1 = [await val('code'), await at(() => [...document.querySelectorAll('.code-field:has(#code) > i')].map((i) => (i.classList.contains('at') ? 'A' : i.classList.contains('on') ? 'x' : '.')).join('')), await logged()].join(' ');
  await tab.keyboard.type('56');
  const k2 = [await val('code'), await logged()].join(' ');
  check('1.15 code: digits only, a box for each; told once when full', k1 === '1234 xxxxA. ' && k2 === '123456 code 123456', k1 + ' / ' + k2);
  await press('ArrowLeft', 'ArrowLeft');
  await tick();
  const k4 = await at(() => [...document.querySelectorAll('.code-field:has(#code) > i')].map((i) => (i.classList.contains('at') ? 'A' : i.classList.contains('on') ? 'x' : '.')).join(''));
  await press('End', 'Backspace');
  await tab.keyboard.type('6');
  check('1.15 code: the box the caret is in is lit; told again once it is full again', k4 === 'xxxxAx' && (await logged()) === 'code 123456', k4);
  await at(() => { const i = document.getElementById('code'); i.value = ''; const d = new DataTransfer(); d.setData('text', '98 76-54 3'); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); });
  const k3 = [await val('code'), await logged()].join(' ');
  await tab.focus('#code2');
  await tab.keyboard.type('a-b1c9');
  check('1.15 code: a paste with spaces; letters as capitals', k3 === '987654 code 987654' && (await val('code2')) === 'AB1C' && (await logged()) === 'code AB1C', k3 + await val('code2'));
  const cells = await at(() => { const i = document.getElementById('code'), f = i.parentElement, boxes = [...f.querySelectorAll('i')].map((x) => x.getBoundingClientRect()); const cv = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(i); cv.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; const ch = cv.measureText('8').width, x0 = i.getBoundingClientRect().left + parseFloat(s.paddingLeft), by = ch + parseFloat(s.letterSpacing); return boxes.every((b, k) => Math.abs(x0 + k * by + ch / 2 - (b.left + b.width / 2)) < 1.5); });
  check('1.15 code: each digit is in the middle of its box', cells, '');
  const sent = await at(() => { const f = document.createElement('form'); let n = 0; f.addEventListener('submit', (e) => { e.preventDefault(); n++; }); f.innerHTML = Dash.code({ name: 'c', length: 4, submit: true }); document.body.append(f); const i = f.querySelector('input'); const type = (v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; type('123'); const a = n; type('1234'); type('1234'); const b = n; type('123'); type('1239'); const c = n; f.innerHTML = Dash.code({ name: 'c', length: 4 }); const p = f.querySelector('input'); p.value = '1234'; p.dispatchEvent(new Event('input', { bubbles: true })); f.remove(); return [a, b, c, n, i.pattern].join(); });
  check('1.15 code: sends its form once it is full, if asked to', sent === '0,1,2,2,[0-9]{4}', sent);

  const full = await at(() => { const d = document.createElement('div'); d.innerHTML = Dash.code({ value: '12', length: 4 }) + Dash.rating({ name: 'q', required: true, disabled: true }); return [d.querySelectorAll('i.on').length, d.querySelectorAll('[required]:disabled').length].join(); });
  check('1.15 code: one that has a value from the start; a rating that has to be given, and one that can\'t be', full === '2,5', full);

  // ---- a rating
  const stars = async () => { await tick(); return at(() => { const rgb = (x) => getComputedStyle(x).fill; const l = [...document.querySelectorAll('#stars .rating label')]; const off = rgb(document.querySelector('#stars .rating label:last-child svg')); return [document.querySelector('[name="stars"]:checked')?.value, l.map((x) => (rgb(x.querySelector('svg')) === off ? '-' : '*')).join('')].join(' '); }); };
  await tab.mouse.move(5, 5);
  const s1 = await stars();
  await tab.focus('[name="stars"][value="3"]');
  await press('ArrowRight');
  await tab.mouse.move(5, 5);
  const s2 = await stars();
  await tab.click('#stars .rating label >> nth=1');
  await tab.mouse.move(5, 5);
  check('1.15 rating: radio buttons drawn as stars', s1 === '3 ***--' && s2 === '4 ****-' && (await stars()) === '2 **---', s1 + s2 + await stars());
  const names = await at(() => [document.querySelector('#stars legend')?.textContent, document.querySelector('[name="stars"][value="1"]').getAttribute('aria-label'), document.querySelector('[name="stars"][value="3"]').getAttribute('aria-label')].join());
  const read = await at(() => { const r = document.querySelector('#shown .rating'); return [r.getAttribute('aria-label'), r.getAttribute('role'), Math.round((r.querySelector('.rating-on').getBoundingClientRect().width / r.getBoundingClientRect().width) * 100), r.querySelectorAll('input').length].join(); });
  check('1.15 rating: names for each; one that is only shown has parts of a star', names === 'How was it,1 star,3 stars' && read === 'Rating: 4.3 of 5,img,86,0', names + ' / ' + read);

  await tab.hover('#stars .rating label >> nth=3');
  await tick();
  const s5 = await stars();
  await tab.mouse.move(5, 5);
  await tick();
  check('1.15 rating: under the pointer, what a click would give', s5 === '2 ****-' && (await stars()) === '2 **---', s5 + await stars());
  const cut = await at(() => { const r = document.querySelector('#shown .rating'), on = r.querySelector('.rating-on'), box = on.getBoundingClientRect(); const hit = document.elementFromPoint(box.right + 6, box.top + box.height / 2); return [on.contains(hit), getComputedStyle(on).overflowX].join(); });
  check('1.15 rating: and cut where it ends', cut === 'false,hidden', cut);

  // ---- a range
  const range = async () => { await tick(); return at(() => { const f = document.querySelector('.range-field'), [a, b] = f.querySelectorAll('input'), t = f.querySelector('.range-track'), s = getComputedStyle(t, '::after'); return [a.value, b.value, f.querySelector('output').textContent, Math.round((parseFloat(s.left) / t.clientWidth) * 100), Math.round((1 - parseFloat(s.right) / t.clientWidth) * 100)].join(); }); };
  const g1 = await range();
  await tab.focus('[name="price_from"]');
  await press('ArrowRight', 'ArrowRight');
  const g2 = await range();
  await press('End');
  const g3 = await range();
  await tab.focus('[name="price_to"]');
  await press('Home');
  check('1.15 range: two ends, neither passes the other', g1 === '50,200,50–200 €,10,40' && g2 === '70,200,70–200 €,14,40' && g3 === '200,200,200–200 €,40,40' && (await range()) === g3, [g1, g2, g3, await range()].join(' / '));
  await at(() => document.querySelector('#ends input').dispatchEvent(new Event('input', { bubbles: true })));
  await tick();
  const top = await at(() => { const f = document.querySelector('#ends .range-field'), [a, b] = f.querySelectorAll('input'); return [f.querySelector('.range-track').classList.contains('at-end'), getComputedStyle(a).zIndex, getComputedStyle(b).zIndex, a.getAttribute('aria-label'), b.getAttribute('aria-label')].join(); });
  check('1.15 range: with both at the far end the first can still be taken', top === 'true,2,1,end, from,end, to', top);

  const grab = await at(() => { const f = document.querySelector('.range-field'), [a, b] = f.querySelectorAll('input'); a.value = 100; b.value = 300; a.dispatchEvent(new Event('input', { bubbles: true })); f.scrollIntoView({ block: 'center' }); const t = f.querySelector('.range-track').getBoundingClientRect(), at = (v) => document.elementFromPoint(t.left + 9 + ((t.width - 18) * v) / 500, t.top + 12); return [at(100) === a, at(300) === b].join(); });
  check('1.15 range: both can be taken with the pointer', grab === 'true,true', grab);
  const other = await at(() => { const d = document.createElement('div'); d.innerHTML = Dash.range({ name: 'o', min: 20, max: 60, from: 30, to: 40 }); document.body.append(d); const t = d.querySelector('.range-track'), [a] = d.querySelectorAll('input'); const one = [t.style.getPropertyValue('--from'), t.style.getPropertyValue('--to')]; a.value = 35; a.dispatchEvent(new Event('input', { bubbles: true })); one.push(t.style.getPropertyValue('--from')); const z = d.querySelectorAll('input')[1]; z.value = 50; z.dispatchEvent(new Event('input', { bubbles: true })); one.push(t.style.getPropertyValue('--to')); d.remove(); return one.join(); });
  check('1.15 range: from another least', other === '25%,50%,37.5%,75%', other);

  // ---- text that becomes a box
  const shown = (id) => at((k) => document.getElementById(k).textContent.trim(), id);
  await tab.click('#in-name .inline-edit');
  const i1 = await at(() => [document.activeElement.value, document.activeElement.selectionEnd, document.activeElement.getAttribute('aria-label')].join());
  await tab.keyboard.type('web 2');
  await press('Enter');
  const i2 = await at(() => [document.querySelector('#in-name .err')?.textContent, document.activeElement.getAttribute('aria-invalid'), saves.length].join());
  await tab.fill('#in-name .input', 'web-2');
  await press('Enter');
  await tick();
  const i3 = [await shown('in-name'), await at(() => [saves.join(), document.activeElement.className, inName.value].join())].join(' ');
  check('1.15 inline: a press makes it a box, Enter saves it, and the focus goes back', i1 === 'web-1,5,Name' && i2 === 'Leave out the spaces.,true,0' && i3 === 'web-2 web-2,inline-edit,web-2', [i1, i2, i3].join(' / '));
  await press('Enter');
  await tab.keyboard.type('other');
  await press('Escape');
  const i4 = [await shown('in-name'), await at(() => saves.length)].join();
  await press('Enter', 'Enter');
  check('1.15 inline: Escape puts it back; no change is no save', i4 === 'web-2,1' && (await at(() => saves.length)) === 1 && (await shown('in-name')) === 'web-2', i4);
  await at(() => { answer = () => Promise.reject(new Error('No <net>')); });
  await tab.click('#in-seats .inline-edit');
  await tab.fill('#in-seats .input', '12');
  await press('Enter');
  const j1 = await at(() => [document.querySelector('#in-seats .err')?.textContent, saves.length].join());
  await tab.fill('#in-seats .input', '7');
  await press('Enter');
  await tick();
  const j2 = await at(() => [document.querySelector('#in-seats .err')?.textContent, document.querySelector('#in-seats .input')?.value, inSeats.value, document.querySelector('#in-seats [data-inline-save]')?.disabled].join());
  await at(() => { answer = () => false; });
  await press('Enter');
  await tick();
  const j3 = await at(() => document.querySelector('#in-seats .err')?.textContent);
  let go;
  await at(() => { answer = () => new Promise((ok) => { window.go = ok; }); });
  await press('Enter');
  await tick();
  const j4 = await at(() => [document.querySelector('#in-seats [data-inline-save]')?.getAttribute('aria-busy'), document.querySelector('#in-seats .input')?.readOnly].join());
  await press('Escape');
  await at(() => window.go?.());
  await tick();
  check('1.15 inline: a save that fails keeps the box open and says why; while it goes on, it waits', j1 === 'Use 9 or less.,1' && j2 === 'No <net>,7,4,false' && j3 === 'That wasn’t saved.' && j4 === 'true,true' && (await shown('in-seats')) === '7 seats' && (await at(() => typeof inSeats.value)) === 'number', [j1, j2, j3, j4, await shown('in-seats')].join(' / '));
  await at(() => { answer = null; });
  await tab.click('#in-region .inline-edit');
  await tab.selectOption('#in-region select', 'par');
  await tab.click('#in-region [data-inline-save]');
  await tick();
  await tab.click('#in-region .inline-edit');
  const picked = await val2('#in-region select');
  await press('Escape');
  const note = await at(() => [document.getElementById('in-note').textContent, document.querySelector('#in-note .inline-edit').getAttribute('aria-label')].join());
  check('1.15 inline: a select; words for nothing', picked === 'par' && (await shown('in-region')) === 'Paris' && (await at(() => inRegion.value)) === 'par' && note === 'Add a note,Note: Add a note', await shown('in-region') + note);

  await tab.click('#in-note .inline-edit');
  await tab.fill('#in-note .input', 'never mind');
  await tab.click('#in-note [data-inline-cancel]');
  const c5 = [await shown('in-note'), await at(() => document.activeElement.className)].join();
  check('1.15 inline: Cancel', c5 === 'Add a note,inline-edit', c5);
  const set = await at(() => { inNote.set('<b>hi</b>'); const a = [document.querySelectorAll('#in-note b').length, document.getElementById('in-note').textContent, inNote.value]; const s = document.createElement('p'); document.body.append(s); const h = Dash.inline(s, { value: 'q', label: 'Q' }); h.edit(); a.push(s.querySelector('input').value); h.cancel(); a.push(s.textContent.trim()); h.destroy(); a.push(s.innerHTML, document.querySelectorAll('#in-note .inline-form').length); s.remove(); return a.join('|'); });
  check('1.15 inline: set(), escaped; edit(), cancel(), destroy()', set === '0|<b>hi</b>|<b>hi</b>|q|q||0', set);

  const inForm = await at(async () => { const f = document.createElement('form'); let n = 0; f.addEventListener('submit', (e) => { e.preventDefault(); n++; }); f.innerHTML = '<input name="a"><p></p><button>Go</button>'; document.body.append(f); const got = [], h = Dash.inline(f.querySelector('p'), { value: 'one', type: 'textarea', onSave: (v) => got.push(v) }); h.edit(); const t = f.querySelector('textarea'); t.value = 'two'; const key = (o) => t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...o })); key({}); const a = got.length; key({ ctrlKey: true }); await new Promise((ok) => setTimeout(ok, 30)); f.remove(); return [n, a, got.join(), h.value, document.forms.length].join(); });
  check('1.15 inline: in a form, which it doesn\'t send; a longer text, saved with Ctrl+Enter', inForm === '0,0,two,two,1', inForm);

  // ---- a select that can be searched
  await logged();
  const multi = () => at(() => document.querySelector('.field:has(#regions) .multi-btn').textContent);
  const m0 = [await multi(), await at(() => document.querySelector('.field:has(#regions) .multi-btn').getAttribute('aria-label'))].join(' / ');
  await tab.click('label[for="regions"]');
  const m1 = await at(() => document.activeElement.className);
  await tab.keyboard.press('ArrowDown');
  await tick(80);
  const m2 = await at(() => [[...document.querySelectorAll('.multi-pop [role="option"]')].map((x) => x.textContent).join('+'), [...document.querySelectorAll('.multi-pop .entries-head')].map((x) => x.textContent).join('+'), document.querySelectorAll('.multi-pop input').length, document.activeElement.textContent].join(' / '));
  await press('ArrowDown', 'Space', 'ArrowDown', 'Space');
  const m3 = [await multi(), await logged(), await at(() => [...document.getElementById('regions').selectedOptions].map((o) => o.value).join('+'))].join(' / ');
  check('1.15 multi: a button that says what is picked, and a list to tick; the select stays the field', m0 === 'Frankfurt, Virginia / Regions: Frankfurt, Virginia' && m1 === 'input multi-btn' && m2 === 'Frankfurt+Paris+Dublin+London+Oregon+Virginia+São Paulo / Europe+America / 0 / Frankfurt' && m3 === '4 regions / regions fra+par+vir | regions fra+par+dub+vir / fra+par+dub+vir', [m0, m1, m2, m3].join(' ; '));
  await tab.click('[data-multi="none"]');
  const m4 = await multi();
  await tab.click('[data-multi="all"]');
  const m5 = [await multi(), await at(() => document.getElementById('regions').selectedOptions.length)].join();
  await tab.click('.multi-pop [role="option"]:has-text("London")', { force: true });
  const m9 = await at(() => [document.getElementById('regions').selectedOptions.length, [...document.querySelectorAll('.multi-pop [aria-disabled="true"]')].map((x) => x.textContent).join()].join());
  await press('Escape');
  await tick();
  check('1.15 multi: all, none, and not one that is off; Escape goes back to the button', m4 === 'All regions' && m5 === '6 regions,6' && m9 === '6,London' && (await at(() => document.activeElement.className)) === 'input multi-btn', m4 + m5 + m9);
  await logged();
  await tab.click('.field:has(#plan) .multi-btn');
  await tick(60);
  await tab.click('.multi-pop [role="option"] >> nth=1');
  await tick(60);
  const m6 = [await at(() => document.querySelector('.field:has(#plan) .multi-btn').textContent), await val('plan'), await logged(), await at(() => document.querySelectorAll('.multi-pop').length)].join(' / ');
  check('1.15 multi: of a select for one, a pick closes it', m6 === 'Solo / s / plan s / 0', m6);
  await tab.click('.field:has(#plan) .multi-btn');
  await tick(60);
  await tab.click('.multi-pop [role="option"] >> nth=1');
  await tick(60);
  const m8 = await at(() => { const s = document.createElement('select'); s.innerHTML = '<option value="">Anything</option><option>B</option>'; document.body.append(s); const m = Dash.multi(s), a = m.el.textContent; m.destroy(); s.remove(); return [document.querySelectorAll('.multi-pop').length, a].join(); });
  check('1.15 multi: so does the one that is picked already; nothing picked reads as the select would', m8 === '0,Anything', m8);
  await at(() => { const s = document.getElementById('plan'); for (let i = 0; i < 9; i++) s.add(new Option('Plan ' + i, 'p' + i)); });
  await tab.click('.field:has(#plan) .multi-btn');
  await tick(60);
  await tab.keyboard.type('plan 7');
  await tick(60);
  const m7 = await at(() => [document.activeElement.type, [...document.querySelectorAll('.multi-pop [role="option"]')].map((x) => x.textContent).join('+')].join());
  await press('ArrowDown', 'Space');
  await tick(60);
  const shutBy = await at(() => document.querySelectorAll('.multi-pop').length);
  const hid = await at(() => { const s = document.getElementById('plan'), r = s.closest('.multi-off').getBoundingClientRect(); return [r.width <= 2 && r.height <= 2, s.tabIndex, s.getAttribute('aria-hidden')].join(); });
  check('1.15 multi: the select itself is out of sight and of Tab', hid === 'true,-1,true', hid);
  check('1.15 multi: a search box once there are many', m7 === 'search,Plan 7' && (await val('plan')) === 'p7' && shutBy === 0, m7 + await val('plan') + shutBy);
  await at(() => document.getElementById('form').reset());
  await tick(60);
  check('1.15 multi: a reset takes it back', (await multi()) === 'Frankfurt, Virginia', await multi());
  const told = await at(async () => { const s = document.getElementById('plan'), b = document.querySelector('.field:has(#plan) .multi-btn'); s.value = 'p2'; s.dispatchEvent(new Event('change', { bubbles: true })); const a = [b.textContent]; s.value = 'p3'; plan.update(); a.push(b.textContent); s.disabled = true; await new Promise((ok) => setTimeout(ok)); a.push(b.disabled); plan.open(); a.push(document.querySelectorAll('.multi-pop').length); s.disabled = false; await new Promise((ok) => setTimeout(ok)); a.push(b.disabled); Dash.multi(s, { placeholder: 'Any plan' }); a.push(document.querySelectorAll('.field:has(#plan) .multi-btn').length); window.plan = s.__dashMulti; return a.join(); });
  check('1.15 multi: changed from code, off, and made again', told === 'Plan 2,Plan 3,true,0,false,1', told);
  const many = await at(() => { const s = document.createElement('select'); s.multiple = true; for (let i = 0; i < 12; i++) s.add(new Option(`${i % 2 ? 'odd' : 'even'} ${i}`, String(i))); document.body.append(s); const m = Dash.multi(s); m.open(); const q = document.querySelector('.multi-pop input[type="search"]'); q.value = 'odd'; q.dispatchEvent(new Event('input')); document.querySelector('[data-multi="all"]').click(); const a = [...s.selectedOptions].map((o) => o.value).join('+'); m.destroy(); s.remove(); return a; });
  check('1.15 multi: all of what is found', many === '1+3+5+7+9+11', many);
  const off = await at(() => { plan.destroy(); const s = document.getElementById('plan'); const a = [s.getAttribute('tabindex'), s.getAttribute('aria-hidden'), document.querySelectorAll('.field:has(#plan) .multi-btn').length, s.getBoundingClientRect().width > 20, document.querySelectorAll('.field:has(#plan) .multi-off, .field:has(#plan) .multi').length].join(); window.plan = Dash.multi('plan'); return a; });
  check('1.15 multi: undone', off === ',,0,true,0', off);

  // ---- in a form
  await at(() => { document.getElementById('plan').value = 't'; plan.update(); tags.set(['one', 'two']); document.getElementById('code').value = '123456'; document.getElementById('code2').value = ''; cities.set(['ber']); document.querySelector('[name="price_from"]').value = 10; document.querySelector('[name="stars"][value="5"]').checked = true; form.clear(); });
  await tab.click('#form .btn.primary');
  await tick(80);
  const v = await at(() => JSON.stringify(window.sent));
  check('1.15 in a form: what each of them gives', v === JSON.stringify({ seats: 4, limit: null, pw: 'open sesame', labels: ['one', 'two'], cities: ['ber'], code: '123456', code2: '', stars: '5', price_from: 10, price_to: 200, regions: ['fra', 'vir'], plan: 't' }), v);
  const raw = await at(() => window.data);
  check('1.15 in a form: and what the browser would send', raw.includes('labels=one&labels=two&cities=ber') && raw.includes('regions=fra&regions=vir') && raw.includes('price_from=10&price_to=200'), raw);
  await at(() => { window.sent = null; tags.set([]); document.getElementById('code').value = '12'; for (const o of document.getElementById('regions').options) o.selected = false; regions.update(); });
  await tab.click('#form .btn.primary');
  await tick(120);
  const bad = await at(() => JSON.stringify([form.errors, document.activeElement.id, window.sent]));
  check('1.15 in a form: what is wrong with each of them', bad === JSON.stringify([{ labels: 'Fill this in.', code: 'All 6 digits.', regions: 'Choose one.' }, 'tags', null]), bad);
  const lit = await at(() => { const red = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(); const probe = document.createElement('i'); probe.style.color = red; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove(); return [getComputedStyle(document.querySelector('.tag-box')).borderTopColor === want, getComputedStyle(document.querySelector('.code-field > i')).borderTopColor === want, getComputedStyle(document.querySelector('.field:has(#regions) .multi-btn')).borderTopColor === want].join(); });
  check('1.15 in a form: and their boxes are marked', lit === 'true,true,true', lit);
  await at(() => { const s = document.getElementById('regions'); s.focus(); });
  check('1.15 in a form: going to a select that is a button goes to the button', (await at(() => document.activeElement.className.includes('multi-btn'))), '');
  const back = await at(async () => { const f = document.getElementById('form'); f.reset(); await new Promise((ok) => setTimeout(ok, 30)); const n = f.querySelector('.num-field'), r = f.querySelector('.range-field'); document.querySelector('[name="seats"]').value = 5; const a = [tags.value.join('+'), document.getElementById('tags').value, cities.value.length, r.querySelector('output').textContent, r.querySelector('.range-track').style.getPropertyValue('--from'), document.querySelectorAll('.code-field:has(#code) > i.on').length]; n.querySelector('input').dispatchEvent(new Event('input', { bubbles: true })); a.push(n.lastElementChild.disabled); f.reset(); await new Promise((ok) => setTimeout(ok, 30)); a.push(n.lastElementChild.disabled); return a.join(); });
  check('1.15 in a form: a reset puts all of them back', back === 'web+eu-west,,0,50–200 €,10%,0,true,false', back);
  await at(() => { window.sent = null; const i = document.getElementById('cities'); i.value = 'Nowhere'; document.getElementById('code').value = '123456'; document.activeElement.blur(); });
  await tab.click('#form .btn.primary');
  await tick(80);
  const text = await at(() => JSON.stringify([form.errors, window.sent]));
  check('1.15 in a form: text left over that can be no tag', text === '[{"cities":"Choose one from the list."},null]', text);
  const loose = await at(async () => { const f = document.createElement('form'); f.innerHTML = `<p><select name="m" multiple required><option>A</option></select></p>${Dash.code({ name: 'c' })}<div>${Dash.number({ name: 'n', required: true })}</div><p><input class="input" name="t" required></p>${Dash.range({ name: 'r' })}<button>Go</button>`; document.body.append(f); Dash.multi(f.querySelector('select')); Dash.tagbox(f.querySelector('[name="t"]')); const g = Dash.form(f); await g.check(); const a = [...f.querySelectorAll('.field-err')].filter((x) => x.textContent).map((x) => x.previousElementSibling.className.split(' ').pop()).join(); g.destroy(); f.remove(); return a; });
  check('1.15 in a form: without a .field, what is wrong goes after the whole of it', loose === 'multi,code-field,num-field,tag-box', loose);
  await tab.context().close();

  // ---- on a phone, in high contrast, under a strict style policy
  const phone = await openFields({ width: 390, height: 800, hasTouch: true, isMobile: true });
  const fits = await phone.evaluate(() => [document.documentElement.scrollWidth - innerWidth, [...document.querySelectorAll('.num-field > .btn')].every((b) => b.getBoundingClientRect().width >= 44), document.querySelector('.code-field > i:last-of-type').getBoundingClientRect().right <= 374, innerWidth].join());
  await phone.tap('.num-field:has([name="seats"]) [data-step="1"]');
  await phone.waitForTimeout(60);
  const tapped = await phone.evaluate(() => [document.querySelector('[name="seats"]').value, document.activeElement === document.querySelector('[name="seats"]')].join());
  check('1.15 on a phone: all of it fits; a tap on + opens no keyboard', fits === '0,true,true,390' && tapped === '5,false', fits + tapped);
  await phone.context().close();
  const hc = await openFields({ forcedColors: 'active' });
  const seen = await hc.evaluate(() => { const l = [...document.querySelectorAll('#stars .rating label svg')].map((x) => getComputedStyle(x).fill); return [l[2] !== l[3], getComputedStyle(document.querySelector('#stars .rating label:last-child svg')).stroke === getComputedStyle(document.body).color, ...['::after', '::before'].map((p, n) => { const i = document.createElement('i'); i.style.color = n ? 'GrayText' : 'Highlight'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return getComputedStyle(document.querySelector('.range-track'), p).backgroundColor === c; })].join(); });
  check('1.15 in high contrast: stars and the part between the ends are told apart', seen === 'true,true,true,true', seen);
  await hc.context().close();
  const strict = await openFields({ page: 'csp-fields.html' });
  const csp = await strict.evaluate(() => { const t = document.querySelector('.range-track'), s = getComputedStyle(t, '::after'), r = document.querySelector('.rating'); return [Math.round((parseFloat(s.left) / t.clientWidth) * 100), Math.round((1 - parseFloat(s.right) / t.clientWidth) * 100), Math.round((r.querySelector('.rating-on').getBoundingClientRect().width / r.getBoundingClientRect().width) * 100), violations.length].join(); });
  check('1.15 under a strict style policy: a range and a rating', csp === '20,60,50,0', csp);
  await strict.context().close();
}

// ---- 1.16 dashboard tools (test/tools.html)
{
  const openTools = async ({ width = 1000, height = 900, page = 'tools.html', ...more } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', ...more });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(5000);
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    return tab;
  };
  const tab = await openTools();
  const at = async (f, a) => { let t; try { return await Promise.race([tab.evaluate(f, a), new Promise((_, no) => { t = setTimeout(() => no(new Error('the page hangs')), 10000); })]); } finally { clearTimeout(t); } };
  const tick = (ms = 50) => tab.waitForTimeout(ms);
  const press = async (...keys) => { for (const k of keys) await tab.keyboard.press(k); };
  const did = () => at(() => window.eval('did').splice(0).join(' | '));

  // ---- the command palette
  const pal = () => at(() => { const d = document.querySelector('dialog.palette'); return d ? [...d.querySelectorAll('.palette-group, .palette-item, .palette-empty')].map((x) => (x.classList.contains('palette-group') ? `[${x.textContent}]` : (x.getAttribute('aria-selected') === 'true' ? '>' : '') + (x.querySelector('.palette-name') || x).textContent)).join(' ') : 'closed'; });
  await tab.focus('#find');
  await press('Control+k');
  const k1 = await at(() => { const d = document.querySelector('dialog.palette'), i = document.activeElement; return [d.matches(':modal'), d.getAttribute('aria-label'), i.getAttribute('role'), i.getAttribute('aria-controls') === d.querySelector('[role="listbox"]').id, document.getElementById(i.getAttribute('aria-activedescendant')).querySelector('.palette-name').textContent, d.querySelectorAll('[role="group"][aria-labelledby]').length, window.eval('palette').isOpen].join(); });
  check('1.16 palette: its key opens it, with the box in focus and the first one chosen', k1 === 'true,Commands,combobox,true,Overview,3,true' && (await pal()) === '[Pages] >Overview Servers [Actions] Open settings Server report Restart <all> [People] Invite Search in people', k1 + ' ' + await pal());
  check('1.16 palette: names are escaped, keys are caps', (await at(() => [document.querySelectorAll('.palette all').length, [...document.querySelectorAll('.palette-item .keys')].map((x) => [...x.children].map((c) => c.textContent).join('+')).join()].join(' '))) === '0 G+then+S,Ctrl+,', await at(() => [...document.querySelectorAll('.palette-item .keys')].map((x) => x.innerHTML).join()));
  await tab.keyboard.type('ser');
  const k2 = await pal();
  await tab.fill('.palette input', 'home');
  const k3 = await pal();
  await tab.fill('.palette input', 'settings open');
  const k4 = [await pal(), await at(() => [...document.querySelectorAll('.palette mark')].map((x) => x.textContent).join())].join(' ');
  await tab.fill('.palette input', 'report');
  const k5 = await pal();
  await tab.fill('.palette input', 'all 24');
  const k5b = await pal();
  await tab.fill('.palette input', 'people');
  const k5c = await pal();
  await tab.fill('.palette input', 'zzz');
  const k6 = [await pal(), await at(() => document.querySelector('.palette [data-dash-voice]').textContent), await at(() => document.querySelector('.palette input').hasAttribute('aria-activedescendant'))].join(' ');
  await press('Enter');
  check('1.16 palette: finds by the words of a name, a note, a group and other words; the best first', k2 === '[Pages] >Servers [Actions] Server report' && k3 === '[Pages] >Overview' && k4 === '[Actions] >Open settings Open,settings' && k5 === '[Actions] >Server report' && k5b === '[Pages] >Servers' && k5c === '[People] >Search in people Invite' && k6 === 'Nothing by that name Nothing by that name false' && (await pal()) !== 'closed', [k2, k3, k4, k5, k5b, k5c, k6].join(' ; '));
  await tab.fill('.palette input', 's');
  const k7 = [await pal(), await at(() => document.querySelector('.palette [data-dash-voice]').textContent)].join(' ');
  check('1.16 palette: those whose name starts with it come first, and it says how many there are', k7 === '[Pages] >Servers Overview [Actions] Server report Open settings Restart <all> [People] Search in people 6 results', k7);
  await tab.fill('.palette input', '');
  await press('ArrowUp');
  const k8 = await pal();
  await press('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');
  const k9 = await pal();
  await press('PageUp');
  const k10 = await pal();
  await press('PageDown');
  check('1.16 palette: arrows go round and leave out what is off; pages stop at the ends', [[k8, 'Search in people'], [k9, 'Invite'], [k10, 'Overview'], [await pal(), 'Search in people']].every(([got, n]) => got === '[Pages] Overview Servers [Actions] Open settings Server report Restart <all> [People] Invite Search in people'.replace(n, '>' + n)), [k8, k9, k10, await pal()].join(' ; '));
  await tab.fill('.palette input', 'settings');
  await at(() => document.querySelector('.palette input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })));
  const k11 = await did();
  const printed = await at(() => { const e = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }); document.querySelector('.palette input').dispatchEvent(e); return e.defaultPrevented; });
  await press('Enter');
  await tick();
  check('1.16 palette: Enter does it, closes, and the focus goes back', k11 === '' && printed === false && (await did()) === 'Open settings' && (await pal()) === 'closed' && (await at(() => document.activeElement.id)) === 'find', k11 + printed + await pal());
  await press('Control+k');
  const k12 = await pal();
  await press('Escape');
  await tick();
  const k13 = await pal();
  await press('Control+k', 'Control+k');
  await tick();
  check('1.16 palette: what was picked last comes first; Escape or its key closes it', k12.startsWith('[Recent] >Open settings [Pages] Overview Servers [Actions] Server report') && k13 === 'closed' && (await pal()) === 'closed', k12 + k13 + await pal());
  await tab.click('#find');
  await tab.fill('.palette input', 'servers');
  await press('Enter');
  await tick();
  check('1.16 palette: a link goes there', (await at(() => location.hash)) === '#servers', '');
  await press('Control+k');
  await tab.fill('.palette input', 'invite');
  await press('Enter');
  check('1.16 palette: one with nothing of its own is told to the page', (await did()) === 'picked Invite', '');
  await press('Control+k');
  await tab.keyboard.type('in people');
  await press('Enter');
  await tick();
  const k14 = [await pal(), await at(() => [document.querySelectorAll('dialog').length, document.querySelector('dialog').getAttribute('aria-label'), document.activeElement.placeholder].join())].join(' ');
  await tab.keyboard.type('gra');
  await tick(250);
  const k15 = await pal();
  await press('Enter');
  check('1.16 palette: one that opens another; items that are looked up', k14 === '>Ada Grace Edsger 1,People,Find someone' && k15 === '>Grace' && (await did()) === 'Grace', k14 + k15);
  const late = await at(async () => {
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms)), out = [];
    window.eval('answer = (q) => new Promise((ok, no) => setTimeout(() => (q === "bad" ? no(new Error("no <net>")) : ok([{ label: "for " + (q || "all") }])), q === "a" ? 500 : 260))');
    window.eval('people').open();
    const i = document.querySelector('.palette input'), list = () => document.querySelector('.palette-list').textContent, type = (v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
    await wait(230); out.push(list());
    await wait(120); out.push(list());
    type('a'); await wait(200); type('ab'); await wait(340); out.push(document.querySelector('.palette-list').getAttribute('aria-busy')); await wait(120); out.push(list()); await wait(350); out.push(list());
    type('bad'); await wait(480); out.push(list(), document.querySelectorAll('.palette net').length, document.querySelector('.palette-list').hasAttribute('aria-busy'));
    window.eval('people').close(); out.push(window.eval('people').isOpen, document.querySelectorAll('dialog').length);
    return out.join(' / ');
  });
  check('1.16 palette: a slow search says so, a late answer is dropped, and one that fails says why', late === 'Searching… / for all / true / for ab / for ab / Couldn’t search: no <net> / 0 / false / false / 1', late);
  await tab.click('#find');
  await tab.hover('.palette-item:has-text("Server report")');
  const k16 = (await pal()).includes('>Server report');
  await tab.click('.palette-item:has-text("Restart")', { force: true });
  const k17 = await pal() !== 'closed';
  const box = await tab.locator('.palette-head').boundingBox();
  await tab.mouse.move(box.x + 60, box.y + 20);
  await tab.mouse.down();
  await tab.mouse.move(20, 600);
  await tab.mouse.up();
  const k18 = await pal() !== 'closed';
  await tab.locator('.palette-group').first().click();
  const keeps = await at(() => document.activeElement.tagName);
  await tab.click('.palette-item:has-text("Server report")');
  const k19 = [await did(), await pal()].join();
  await tab.click('#find');
  await tab.mouse.click(20, 700);
  await tick();
  check('1.16 palette: by mouse: pointing chooses, a click does it, one beside it closes; what is off does nothing', k16 && k17 && k18 && keeps === 'INPUT' && k19 === 'report,closed' && (await pal()) === 'closed', [k16, k17, k18, keeps, k19, await pal()].join());
  const more = await at(async () => {
    const p = window.eval('palette'), out = [];
    p.open('rep'); out.push(document.querySelector('.palette input').value, document.querySelectorAll('.palette-item').length);
    Dash.toast('Saved'); const inside = document.querySelector('.palette .toast') != null; p.close(); await new Promise((ok) => setTimeout(ok, 60)); out.push(inside, document.querySelector('body > .toast')?.textContent);
    p.update([{ label: 'New one' }]); p.open(); out.push(document.querySelector('.palette-item .palette-name').textContent); p.update([{ label: 'Newer' }]); out.push(document.querySelector('.palette-item .palette-name').textContent);
    p.update(Array.from({ length: 80 }, (_, i) => ({ label: 'n' + i }))); out.push(document.querySelectorAll('.palette-item').length);
    p.stop(); out.push(p.isOpen); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); out.push(p.isOpen);
    return out.join();
  });
  check('1.16 palette: open(query), update(), at most so many, stop(); a toast comes out of it when it closes', more === 'rep,1,true,Saved,New one,Newer,50,false,false', more);
  const order = await at(async () => {
    const out = [], names = () => [...document.querySelectorAll('.palette-group, .palette-name')].map((x) => (x.closest('[aria-selected="true"]') ? '>' : '') + x.textContent).join('+');
    const gone = () => new Promise((ok) => setTimeout(ok, 40)); // (a closed one leaves the page a moment later)
    const key = (k) => document.querySelector('.palette input').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const p = Dash.palette({ key: null, items: [{ label: 'Other', words: 'set' }, { label: 'Unset' }, { label: 'Big set' }, { label: 'Set up' }] });
    p.open('set'); out.push(names());
    p.open(''); p.update([{ label: 'Off', disabled: true }, { label: 'On' }]); out.push(names()); p.stop(); await gone();
    const two = Dash.palette({ key: null, recent: 'test.two', items: [{ label: 'Same', key: 'a', group: 'A' }, { label: 'Same', key: 'b', group: 'B' }], onPick: (it) => out.push(it.key) });
    two.open(); out.push([...document.querySelectorAll('.palette [role="group"]')].map((g) => document.getElementById(g.getAttribute('aria-labelledby'))?.textContent).join('+')); key('ArrowDown'); key('Enter'); await gone();
    two.open(); out.push(names()); two.stop(); await gone();
    document.getElementById('find').focus();
    const go = Dash.palette({ key: null, items: [{ label: 'Go', run: () => document.querySelector('#out .log-lines').focus() }] });
    go.open(); key('Enter'); await gone(); out.push(document.activeElement.className);
    return out.join(' ; ');
  });
  check('1.16 palette: from the start, a word, inside, elsewhere; the first that can be picked; two of one name; the focus goes where it is put', order === '>Set up+Big set+Unset+Other ; Off+>On ; A+B ; b ; Recent+>Same+A+Same ; log-lines', order);
  const caps = await at(() => { const d = document.createElement('div'); const t = (k) => { d.innerHTML = Dash.keys(k); return [...d.querySelectorAll('kbd, .keys > span')].map((x) => (x.tagName === 'KBD' ? '' : '~') + x.textContent).join('|'); }; return [t('mod+shift+k'), t('g then s'), t('+'), t('enter'), t('<b>'), t('')].join(' '); });
  check('1.16 keys: as caps', caps === 'Ctrl|Shift|K G|~then|S + ↵ <b> ', caps);

  // ---- a log
  const lines = (id = 'out') => at((k) => [...document.querySelectorAll(`#${k} .log-line`)].map((x) => x.textContent).join(' / '), id);
  const l1 = await lines();
  const l2 = await at(() => [[...document.querySelectorAll('#out .log-line')].map((x) => x.className.replace('log-line', '').trim()).join(), document.querySelectorAll('#out b').length, document.querySelector('#out .log-lines').getAttribute('role'), document.querySelector('#out .log-lines').getAttribute('aria-live'), document.querySelector('#out time').getAttribute('datetime')].join(' '));
  check('1.16 log: times, levels, where from and the text, escaped', l1 === '10:00:00infoweb-1started on port 8080 / 10:00:01warndb-1slow query: 1.4 s / 10:00:02errorweb-2connection refused <b>by</b> db-1 / 10:00:03debugweb-1cache miss' && l2 === ',warn,bad,muted 0 log off 2026-11-25T10:00:00.000Z', l1 + ' ' + l2);
  const ansi = await at(() => [...document.querySelectorAll('#plain .log-line')].map((x) => x.querySelector('.log-text').innerHTML).join(' / '));
  check('1.16 log: the colours of a terminal; what it can\'t show is left out', ansi === '<span class="tone ok">ok</span> 12 tests / <span class="tone bad log-b">FAIL</span> one of them / colour of 256 and <span class="muted">dim</span>', ansi);
  const codes = await at(() => { const d = document.createElement('div'); document.body.append(d); const l = Dash.log(d, { time: false, lines: ['\u001b[1mb\u001b[22mn', '\u001b[48;2;31;32;33mx\u001b[35mp\u001b[39mq', '\u001b]0;title\u0007t\u001b[2K', '\u001b[33mw\u001b[my', '\u001b[34mz\u001b[37mv'] }); const a = [...d.querySelectorAll('.log-text')].map((x) => x.innerHTML).join(' / '); const t = l.text; l.destroy(); d.remove(); return a + ' ' + t.replace(/\n/g, '|'); });
  check('1.16 log: bold, other colours, resets and titles', codes === '<span class="log-b">b</span>n / x<span class="tone purple">p</span>q / t / <span class="tone warn">w</span>y / <span class="tone blue">z</span>v bn|xpq|t|wy|zv', codes);
  const added = await at(async () => { const f = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); const o = window.eval('out'), box = document.querySelector('#out .log-lines'), a = []; o.add('one\ntwo\r\nthree\n'); o.add([{ text: 'four', level: 'ok' }, 'five']); a.push(box.querySelectorAll('.log-line').length); await f(); a.push(box.querySelectorAll('.log-line').length, box.querySelector('.log-line:last-child').textContent, box.querySelectorAll('.log-line.ok').length, Math.round(box.scrollHeight - box.scrollTop - box.clientHeight)); return a.join(); });
  check('1.16 log: what is added shows at the next frame, a line each, and it stays at the end', added === '4,9,five,1,0', added);
  await at(() => { const o = window.eval('out'); for (let i = 0; i < 20; i++) o.add('more ' + i); });
  await tick();
  const l3 = await at(() => { const b = document.querySelector('#out .log-lines'); return Math.round(b.scrollHeight - b.scrollTop - b.clientHeight); });
  await at(() => { document.querySelector('#out .log-lines').scrollTop = 40; });
  await tick();
  const l4 = await at(async () => { const o = window.eval('out'), box = document.querySelector('#out .log-lines'), b = document.querySelector('#out .log-new'); const a = [b.hidden, box.scrollTop]; o.add('late'); await new Promise((ok) => setTimeout(ok, 60)); a.push(b.hidden, b.textContent, box.scrollTop); o.add(['later', 'latest']); await new Promise((ok) => setTimeout(ok, 60)); a.push(b.textContent); const r = b.getBoundingClientRect(), q = box.getBoundingClientRect(); a.push(r.top > q.top && r.bottom <= q.bottom && r.left >= q.left && r.right <= q.right); return a.join(); });
  await tab.click('#out .log-new');
  await tick();
  const l5 = await at(() => { const box = document.querySelector('#out .log-lines'); return [document.querySelector('#out .log-new').hidden, Math.round(box.scrollHeight - box.scrollTop - box.clientHeight), document.activeElement === box].join(); });
  check('1.16 log: scrolled up it stays where it is and says how many are new; the button goes to the end', l3 === 0 && l4 === 'true,40,false,1 new line ↓,40,3 new lines ↓,true' && l5 === 'true,0,true', l3 + ' ' + l4 + ' ' + l5);
  const cutOff = await at(async () => { const p = window.eval('plain'), box = document.querySelector('#plain .log-lines'), f = () => new Promise((ok) => setTimeout(ok, 60)); for (let i = 0; i < 60; i++) p.add('n' + i); await f(); const a = [box.querySelectorAll('.log-line').length, box.querySelector('.log-line').textContent, p.lines.length, p.count.total]; box.scrollTop = 300; await f(); const row = [...box.querySelectorAll('.log-line')].find((x) => x.getBoundingClientRect().top >= box.getBoundingClientRect().top), was = row.getBoundingClientRect().top; p.add(['x', 'y', 'z']); await f(); a.push(Math.round(Math.abs(row.getBoundingClientRect().top - was)) <= 1, box.querySelectorAll('.log-line').length, box.querySelector('.log-line').textContent); for (let i = 0; i < 500; i++) p.add('q' + i); a.push(p.lines.length); await f(); a.push(box.querySelectorAll('.log-line').length, box.querySelector('.log-line').textContent); p.end(); return a.join(); });
  check('1.16 log: the oldest go, and what is being read stays where it is', cutOff === '50,n10,50,50,true,50,n13,50,50,q450', cutOff);
  await tab.fill('#out .log-tools input', 'db');
  await tick();
  const l6 = [await lines(), await at(() => [document.querySelector('#out .log-count').textContent, [...document.querySelectorAll('#out mark')].map((x) => x.textContent).join()].join(' '))].join(' ; ');
  const l7 = await at(async () => { const o = window.eval('out'); o.add(['not this', 'db again']); await new Promise((ok) => setTimeout(ok, 60)); const a = [document.querySelectorAll('#out .log-line').length, JSON.stringify(o.count), o.text.split('\n').length]; a.push(o.filter((l) => l.level === 'error'), o.filter('zzz'), document.querySelector('#out .empty').textContent, document.querySelector('#out .log-tools input').value, o.filter('') === o.count.total, document.querySelector('#out .log-count').textContent); return a.join(' / '); });
  check('1.16 log: a filter, by words or a test; new lines that don\'t fit stay out', l6 === '10:00:01warndb-1slow query: 1.4 s / 10:00:02errorweb-2connection refused <b>by</b> db-1 ; 2 / 32 db,db' && l7 === '3 / {"shown":3,"total":34} / 3 / 1 / 0 / Nothing by that name / zzz / true / ', l6 + ' ' + l7);
  await tab.click('#out [data-log="wrap"]');
  const l8 = await at(() => [document.querySelector('#out [data-log="wrap"]').getAttribute('aria-pressed'), getComputedStyle(document.querySelector('#out .log-text')).whiteSpace].join());
  await tab.click('#out [data-log="copy"]');
  await tick();
  const l9 = await at(() => { const b = document.querySelector('#out [data-log="copy"]'); return [b.textContent, b.dataset.copy.split('\n')[0]].join(); });
  await tab.click('#out [data-log="clear"]');
  const l10 = await at(async () => { const o = window.eval('out'), a = [document.querySelector('#out .log-lines').textContent, o.count.total]; o.add('gone'); o.clear(); o.add([]); await new Promise((ok) => setTimeout(ok, 60)); a.push(document.querySelector('#out .log-lines').textContent); o.add('back'); await new Promise((ok) => setTimeout(ok, 60)); a.push(document.querySelector('#out .log-lines').textContent); return a.join(); });
  check('1.16 log: Wrap, Copy, Clear', l8 === 'false,pre' && l9 === 'Copied ✓,2026-11-25T10:00:00.000Z info web-1 started on port 8080' && l10 === 'Nothing yet,0,Nothing yet,back', [l8, l9, l10].join(' ; '));
  const narrow = await at(async () => { const d = document.createElement('div'); d.style.width = '600px'; document.body.append(d); const l = Dash.log(d, { height: 80, lines: Array.from({ length: 12 }, (_, i) => 'a line that is as long as this one is, so that it wraps ' + i) }); await new Promise((ok) => setTimeout(ok, 60)); d.style.width = '200px'; const b = d.querySelector('.log-lines'); for (let i = 0; i < 20 && (b.scrollHeight < 400 || b.scrollHeight - b.scrollTop - b.clientHeight > 1); i++) await new Promise((ok) => setTimeout(ok, 50)); const a = [Math.round(b.scrollHeight - b.scrollTop - b.clientHeight) <= 1, Math.round(b.getBoundingClientRect().height)]; Dash.log(d, { lines: ['again'] }); a.push(d.querySelectorAll('.log-lines').length, d.textContent); Dash.log(d, { tools: true }); Dash.log(d, { tools: true }); d.querySelector('[data-log="wrap"]').click(); a.push(d.querySelector('[data-log="wrap"]').getAttribute('aria-pressed')); d.__dashLog.destroy(); a.push(d.innerHTML, d.className, d.__dashLog); l.add('late'); d.remove(); return a.join(); });
  check('1.16 log: at the end it stays there when it gets narrower; made again, and undone', narrow === 'true,80,1,again,false,,,', narrow);
  const told = await at(() => { const d = document.createElement('div'); document.body.append(d); Dash.log(d, { live: true, wrap: false, filter: 'b', tools: true, lines: ['a', 'b'] }); const b = d.querySelector('.log-lines'); const a = [b.getAttribute('aria-live'), b.hasAttribute('data-nowrap'), d.querySelectorAll('.log-line').length, d.querySelector('input').value, d.querySelector('[data-log="wrap"]').getAttribute('aria-pressed')]; Dash.log(d, { lines: ['x'.repeat(600)] }); const c = d.querySelector('.log-lines'); a.push(c.scrollWidth <= c.clientWidth); d.__dashLog.wrap(false); a.push(c.scrollWidth > c.clientWidth); d.remove(); return a.join(); });
  check('1.16 log: live, wrap and a filter from the start', told === 'polite,true,1,b,false,true,true', told);

  // ---- a value
  const open1 = await at(() => { const d = document.getElementById('data'); return [[...d.querySelectorAll(':scope > details > .json-in > *')].map((x) => (x.querySelector('summary') || x).textContent).join(' / '), [...d.querySelectorAll('.json-str, .json-num, .json-bool, .json-null')].map((x) => x.className.slice(5)).join(), d.querySelectorAll('details').length, d.getAttribute('role')].join(' ; '); });
  const jsonTall = await at(() => Math.min(...[...document.querySelectorAll('#data summary')].map((x) => x.getBoundingClientRect().height)));
  const levels = await at(() => { const rgb = (c) => { const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); x.fillStyle = getComputedStyle(document.querySelector('#out .log-lines')).backgroundColor; x.fillRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }; const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }; return ['warn', 'bad'].map((t) => { const l = document.createElement('div'); l.className = 'log-line ' + t; l.innerHTML = '<span class="log-level">x</span>'; document.querySelector('#out .log-lines').append(l); const a = lum(rgb(getComputedStyle(l).backgroundColor)), b = lum(rgb(getComputedStyle(l.firstChild).color)); l.remove(); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; }).join(); });
  check('1.16 log, json: a level can be read on its line, an arrow is big enough to hit', levels === 'true,true' && jsonTall >= 24, levels + jsonTall);
  check('1.16 json: what it is made of, one level open', open1 === 'name: "web-1" / up: true / load: 0.42 / tags: [2 items] / notes: null / empty: {} / deep: {1 key} / big: [250 items] ; str,bool,num,null ; 4 ; group', open1);
  await tab.click('#data summary:has-text("deep")');
  await tick();
  const j1 = await at(() => { const p = [...document.querySelectorAll('#data details')].find((x) => x.querySelector('summary').textContent.startsWith('deep')); return [p.open, p.querySelector('.json-in').textContent].join(); });
  await tab.click('#data summary:has-text("er:")');
  await tick();
  await tab.click('#data summary:has-text("est:")');
  await tick();
  const j2 = await at(() => [document.querySelectorAll('#data i').length, [...document.querySelectorAll('#data .json-str')].pop().textContent].join());
  const j2b = await at(async () => { const wait = () => new Promise((ok) => setTimeout(ok, 50)), p = [...document.querySelectorAll('#data details')].find((x) => x.querySelector('summary').textContent.startsWith('deep')); p.open = false; await wait(); p.open = true; await wait(); const d = document.createElement('div'); document.body.append(d); Dash.json(d, { a: { b: 1 } }); Dash.json(d, { a: { b: 2 } }); d.querySelectorAll('details')[1].open = true; await wait(); const t = d.querySelectorAll('.json-num').length + d.querySelector('.json-num').textContent; d.remove(); return [p.querySelectorAll('details[open]').length, t].join(); });
  await tab.click('#data summary:has-text("big")');
  await tick();
  const j3 = await at(() => [...[...document.querySelectorAll('#data details')].find((x) => x.querySelector('summary').textContent.startsWith('big')).querySelectorAll(':scope > .json-in > details > summary')].map((x) => x.textContent).join());
  await tab.click('#data summary:has-text("200…249")');
  await tick();
  const j4 = await at(() => { const r = [...document.querySelectorAll('#data .json-row')].map((x) => x.textContent); return [r.filter((x) => /^2\d\d: /.test(x)).length, r.includes('200: 200'), r.includes('100: 100')].join(); });
  check('1.16 json: a branch is drawn when it opens, escaped; a long list in hundreds', j1 === 'true,er: {1 key}' && j2 === '0,"<i>x</i>"' && j2b === '2,12' && j3 === '0…99,100…199,200…249' && j4 === '50,true,false', [j1, j2, j2b, j3, j4].join(' ; '));
  const odd = await at(() => { const a = { n: 1n, f() {}, u: undefined, d: new Date(0), s: new Set([1]), m: new Map([['k', 2]]), t: 'x'.repeat(2010), no: NaN }; a.me = a; const loop = new Map(); loop.set('in', loop); a.loop = loop; const d = document.createElement('div'); document.body.append(d); Dash.json(d, a, { open: true }); const t = [...d.querySelectorAll('.json-row')].map((x) => x.textContent.slice(0, 14)).join(' / '), more = d.textContent.includes('… 10 more'); const one = (v) => { d.__dashJson.set(v); return d.textContent; }; const s = [one('<b>'), one(null), one([]), one(undefined), d.querySelectorAll('b').length, d.__dashJson.value === undefined].join(); d.__dashJson.destroy(); const gone = [d.innerHTML, d.className, d.getAttribute('role')].join(); d.remove(); return [t, more, s, gone].join(' ; '); });
  check('1.16 json: other kinds of values, long text, what holds itself', odd === 'n: 1n / f: function / u: undefined / d: "1970-01-01 / 0: 1 / k: 2 / t: "xxxxxxxxxx / no: NaN / me: (itself) / in: (itself) ; true ; "<b>",null,[],undefined,0,true ; ,,', odd);
  await tab.click('#data .json-copy');
  await tick();
  const j5 = await at(() => { const b = document.querySelector('#data .json-copy'); const v = JSON.parse(b.dataset.copy); const r = b.getBoundingClientRect(), q = document.getElementById('data').getBoundingClientRect(), clear = ['summary', '.json-in > .json-row'].every((s) => { const w = document.createRange(); w.selectNodeContents(document.querySelector('#data ' + s)); const x = w.getBoundingClientRect(); return x.right <= r.left || x.top >= r.bottom; }); return [b.textContent, v.name, v.big.length, b.dataset.copy.includes('\n  "up"'), r.top >= q.top && r.right <= q.right + 1 && clear].join(); });
  const j6 = await at(() => { const j = window.eval('json'); j.open(true); const all = document.querySelectorAll('#data details[open]').length; j.open(0); return [all >= 5, document.querySelectorAll('#data details[open]').length, document.querySelectorAll('#data .json-row').length].join(); });
  const j7 = await at(async () => { const t0 = performance.now(), d = document.createElement('div'); document.body.append(d); Dash.json(d, Array.from({ length: 100000 }, (_, i) => ({ i })), { open: true }); const rows = d.querySelectorAll('.json-row, details').length; const ms = performance.now() - t0; d.querySelector('details:not([open])').open = true; await new Promise((ok) => setTimeout(ok, 50)); const later = d.querySelectorAll('.json-row, details').length; d.innerHTML = Dash.json.html(Array.from({ length: 5000 }, (_, i) => i), { open: 2, max: 300 }); const eager = [d.querySelectorAll('.json-row').length < 305, d.textContent.includes('…'), d.querySelectorAll('[data-part]').length].join(); d.innerHTML = Dash.json.html({ a: { b: 1 } }); const small = d.querySelector('.json').textContent; d.remove(); return [rows < 3500, ms < 4000, later > rows, eager, small].join(' '); });
  const j8 = await at(async () => { const d = document.createElement('div'); document.body.append(d); Dash.json(d, Array.from({ length: 90 }, () => Array.from({ length: 90 }, (_, i) => ({ i }))), { open: true }); const n = d.querySelectorAll('.json-row, details').length, shut = [...d.querySelectorAll('details:not([open])')].filter((x) => x.checkVisibility()); const a = [n > 2800 && n < 3500, d.querySelectorAll(':scope > details > .json-in > details').length, [...d.querySelectorAll('details[open] > .json-in')].filter((x) => !x.childElementCount).length]; const last = shut[shut.length - 1]; if (!last) { d.remove(); return a.join() + ' all open ' + n; } last.open = true; await new Promise((ok) => setTimeout(ok, 50)); a.push(last.querySelector('.json-in').childElementCount); const in1 = last.querySelector('.json-in details'); in1.open = true; await new Promise((ok) => setTimeout(ok, 50)); a.push(in1.querySelector('.json-in').textContent); d.remove(); return a.join(); });
  check('1.16 json: all of it open, up to so many rows; the rest is there to open', j8 === 'true,90,0,90,i: 0', j8);
  check('1.16 json: copy, open(), a great many rows, and as HTML', j5 === 'Copied ✓,web-1,250,true,true' && j6 === 'true,0,0' && j7 === 'true true true true,true,0 {1 key}a: {1 key}b: 1', [j5, j6, j7].join(' ; '));

  // ---- panes
  const pane = async () => { await tick(); return at(() => { const s = document.getElementById('side'), b = s.querySelector('.pane-bar'); return [...[...s.children].filter((x) => x !== b).map((x) => Math.round(x.getBoundingClientRect().width / (s.getBoundingClientRect().width - 13) * 100)), b.getAttribute('aria-valuenow')].join(); }); };
  const p0 = await at(() => { const b = document.querySelector('#side .pane-bar'); return [b.getAttribute('role'), b.getAttribute('aria-orientation'), b.getAttribute('aria-controls') === 'left', b.tabIndex, b.getAttribute('aria-label')].join(); });
  check('1.16 panes: from the markup, with a bar that says where it is', (await pane()) === '30,70,30' && p0 === 'separator,vertical,true,0,Resize', await pane() + ' ' + p0);
  await tab.focus('#side .pane-bar');
  await press('ArrowRight', 'ArrowRight');
  const p1 = await pane();
  await press('Shift+ArrowLeft');
  const p2 = await pane();
  await press('Home');
  await tick();
  const p3 = await at(() => Math.round(document.getElementById('left').getBoundingClientRect().width));
  await press('End');
  await tick();
  const p4 = await at(() => Math.round(document.querySelector('#side > :last-child').getBoundingClientRect().width));
  check('1.16 panes: the arrow keys, Home and End, down to the least', p1 === '34,66,34' && p2 === '24,76,24' && p3 === 100 && p4 === 100, [p1, p2, p3, p4].join(' '));
  await tab.locator('#side').scrollIntoViewIfNeeded();
  await at(() => document.activeElement.blur());
  const bar = await tab.locator('#side .pane-bar').boundingBox(), host = await tab.locator('#side').boundingBox();
  await tab.mouse.move(bar.x + 6, bar.y + 20);
  await tab.mouse.down();
  const sizing = await at(() => document.getElementById('side').classList.contains('sizing') || 'not yet');
  await tab.mouse.move(host.x + host.width / 2, bar.y + 25, { steps: 5 });
  const p5 = await pane();
  await tab.mouse.up();
  await at(() => document.querySelector('#side .pane-bar').dispatchEvent(new PointerEvent('pointermove', { clientX: 90, bubbles: true })));
  const p6b = await pane();
  const p6 = await at(() => [document.getElementById('side').classList.contains('sizing'), Dash.store.get('test.panes').map(Math.round).join('+'), document.activeElement.className].join());
  await tab.reload({ waitUntil: 'load' });
  const p7 = await pane();
  check('1.16 panes: by mouse; the sizes are remembered', sizing === true && p5 === '50,50,50' && p6b === p5 && p6 === 'false,50+50,pane-bar' && p7 === p5, [sizing, p5, p6, p6b, p7].join(' '));
  await tab.dblclick('#side .pane-bar');
  check('1.16 panes: a double click puts the sizes back', (await pane()) === '30,70,30', await pane());
  const tall = async () => { await tick(); return at(() => [...document.querySelectorAll('#three > :not(.pane-bar)')].map((x) => Math.round(x.getBoundingClientRect().height)).join()); };
  const v1 = [await tall(), await at(() => [document.querySelector('#three .pane-bar').getAttribute('aria-orientation'), document.getElementById('three').getBoundingClientRect().height, [...document.querySelectorAll('#three .pane-bar')].map((x) => x.getAttribute('aria-valuenow')).join('+')].join())].join(' ');
  await tab.focus('#three .pane-bar >> nth=1');
  await press('ArrowUp');
  const v2 = await did();
  await press('ArrowLeft');
  const v2b = await did();
  await press('Home', 'Home');
  const v3 = await did();
  check('1.16 panes: one above the other; three of them; told once a move is done', v1 === '69,69,137 horizontal,300,25+50' && v2 === 'panes 25,23,52' && v2b === '' && v3 === 'panes 25,15,60' && (await tall()) === '69,40,166', [v1, v2, v2b, v3, await tall()].join(' ; '));
  const rest = await at(async () => { const t = window.eval('three'); t.set([1, 2]); const a = [t.sizes.map(Math.round).join('+')]; t.set([2, 1, 1]); a.push(t.sizes.join('+')); t.reset(); a.push(t.sizes.join('+')); t.destroy(); a.push(document.querySelectorAll('#three .pane-bar').length, document.querySelector('#three > div').style.getPropertyValue('--pane'), document.getElementById('three').hasAttribute('data-vertical')); const d = document.createElement('div'); d.dir = 'rtl'; d.style.width = '613px'; d.innerHTML = '<div></div><div></div>'; document.body.append(d); const r = Dash.panes(d, { min: 50 }); d.querySelector('.pane-bar').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); a.push(r.sizes.join('+')); a.push(String(Dash.panes(document.createElement('div')))); Dash.panes(d); a.push(d.querySelectorAll('.pane-bar').length); d.remove(); const o = document.createElement('div'); o.style.width = '627px'; o.innerHTML = '<div></div><div></div><div></div>'; document.body.append(o); let told = 0; Dash.panes(o, { min: 50, onChange: () => { told++; } }); for (let i = 0; i < 3; i++) { o.querySelector('.pane-bar').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); await new Promise((ok) => setTimeout(ok, 60)); } a.push(told); o.remove(); return a.join(' '); });
  check('1.16 panes: set(), reset(), destroy(), right to left', rest === '25+15+60 50+25+25 25+25+50 0  false 52+48 null 1 1', rest);

  // ---- how much, in a grid
  const heat = await at(() => { const t = document.querySelector('#heat table'); return [t.caption.textContent, t.querySelectorAll('thead th[scope="col"]').length, [...t.querySelectorAll('thead th')].filter((x) => !x.querySelector('.sr-only')).map((x) => x.textContent).join('+'), t.querySelectorAll('tbody th[scope="row"]').length, t.querySelectorAll('tbody td').length, t.querySelectorAll('td[data-l=""]').length, t.querySelector('td[data-l=""]').textContent, t.querySelector('td[data-l=""]').dataset.tooltip, [...new Set([...t.querySelectorAll('tbody td')].map((x) => x.dataset.l))].sort().join(''), t.querySelector('tbody td').dataset.tooltip, document.querySelector('#heat .heat-legend').textContent].join(' ; '); });
  check('1.16 heatmap: a table, with names and values for all of it', heat === 'Requests by day and hour ; 24 ; 00+03+06+09+12+15+18+21 ; 7 ; 168 ; 1 ; no data ; Wed, 05: no data ; 012345 ; Mon, 00: 0 ; 0139', heat);
  const lv = await at(() => { const l = (o) => { const d = document.createElement('div'); d.innerHTML = Dash.heatmap({ rows: ['a'], cols: ['1', '2', '3', '4', '5', '6', '7'], ...o }); return [...d.querySelectorAll('tbody td')].map((x) => x.dataset.l || '-').join(''); }; return [l({ values: [[0, 1, 20, 21, 80, 81, 100]] }), l({ values: [[0, 5, 10, 20, 'x', null, -3]], max: 10 }), l({ values: [[50, 60, 100, 40]], min: 50 }), l({ values: [[0, 0]] }), l({ values: [] })].join(); });
  check('1.16 heatmap: five steps from the least to the most; nothing is a gap', lv === '0112455,0355--0,0150---,00-----,-------', lv);
  const sh = await at(() => { const t = document.querySelector('#heat2'); return [[...t.querySelectorAll('tbody td')].map((x) => x.textContent).join('+'), t.querySelector('.heat').className, t.querySelectorAll('tbody .sr-only').length].join(); });
  check('1.16 heatmap: with the values in it', sh === '1+2+3+4+no data+10,heat shown accent,1', sh);
  for (const scheme of ['light', 'dark']) {
    const in1 = await openTools({ colorScheme: scheme });
    await in1.waitForTimeout(120);
    const ramp = await in1.evaluate(() => { const rgb = (c) => { const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }; const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }; const con = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); }; const card = rgb(getComputedStyle(document.querySelector('.panel')).backgroundColor); const steps = [1, 2, 3, 4, 5].map((l) => rgb(getComputedStyle(document.querySelector(`#heat .heat-legend [data-l="${l}"]`)).backgroundColor)), k = steps.map((c) => con(c, card)); const text = rgb(getComputedStyle(document.querySelector('#heat2 td:not([data-l=""])')).color), on = [...document.querySelectorAll('#heat2 tbody td[data-l="5"], #heat2 tbody td[data-l="1"]')].map((x) => con(rgb(getComputedStyle(x).backgroundColor), text)); return [lum(card) < 0.2 ? 'dark' : 'light', k[0] >= 2, k.every((x, i) => !i || x > k[i - 1] * 1.15), on.length > 1 && on.every((x) => x >= 4.5), k.map((x) => x.toFixed(1)).join('+')].join(); });
    check(`1.16 heatmap: each step stands out from the one before and from the panel, and numbers are readable (${scheme})`, ramp.startsWith(scheme + ',true,true,true'), ramp);
    await in1.context().close();
  }
  const cal = await at(() => { const d = document.querySelector('#cal .days'); const s = [...d.querySelectorAll('.days-grid > i')]; return [s.length, s[0].dataset.tooltip, s[s.length - 1].dataset.tooltip, d.getAttribute('aria-label'), [...d.querySelectorAll('.days-side span')].map((x) => x.textContent || '.').join(''), [...d.querySelectorAll('.days-months span')].map((x) => x.textContent).filter(Boolean).join('+')].join(' ; '); });
  check('1.16 days: a square a day, a column a week, and what it adds up to', /^178 ; Mon, 1 Jun 2026: \d deploys? ; /.test(cal) && cal.split(' ; ')[2] === 'Wed, 25 Nov 2026: 0 deploys' && /^Deploys: \d+ deploys in 178 days, the most on .+ \(8 deploys\)$/.test(cal.split(' ; ')[3]) && cal.endsWith('Mon.Wed.Fri.Sun ; Jun+Jul+Aug+Sept+Oct+Nov'), cal);
  const dd = await at(() => { const f = (p, o) => { const d = document.createElement('div'); d.innerHTML = Dash.days(p, { to: '2026-11-25', weeks: 1, ...o }); return [...d.querySelectorAll('.days-grid > i')].map((x) => x.dataset.l + x.dataset.tooltip.replace(/.*: /, ':')).join(' ') + '|' + d.querySelector('.days').getAttribute('aria-label') + '|' + d.querySelector('.days-side').textContent + d.querySelectorAll('.heat-legend').length; }; return [f([{ date: '2026-11-23', value: 1 }, { date: '2026-11-23', value: 1.5 }, { date: '2026-11-26', value: 9 }, { t: Date.UTC(2026, 10, 25, 12), value: 1 }, { date: 'x', value: 3 }], { noun: 'run' }), f([], { first: 0 }), f([{ date: '2026-11-25', value: 5 }], { max: 10, legend: false })].join(' ; '); });
  check('1.16 days: several of a day add up, others are left out; weeks from Sunday; max', dd === '5:2.5 runs 0:0 runs 2:1 run|Days: 3.5 runs in 3 days, the most on Mon, 23 Nov 2026 (2.5 runs)|MonWedFriSun1 ; 0:0 0:0 0:0 0:0|Days: 0 in 4 days|SunTueThuSat1 ; 0:0 0:0 3:5|Days: 5 in 3 days, the most on Wed, 25 Nov 2026 (5)|MonWedFriSun0', dd);
  const room = await at(() => { const s = document.querySelector('#cal .heat-scroll').getBoundingClientRect(), d = document.querySelector('#cal .days').getBoundingClientRect(), g = [...document.querySelectorAll('#cal .days-grid > i')].map((x) => x.getBoundingClientRect().left); return [Math.round(d.left - s.left), d.right < s.right, g[0] < g[g.length - 1]].join(); });
  const bare = await at(() => { const d = document.createElement('div'); const h = Dash.heatmap({ rows: ['a'], cols: ['1'], values: [[1]] }) + Dash.days([], { weeks: 2 }); d.innerHTML = h; document.querySelector('main').append(d); const p = document.createElement('div'); p.className = 'panel'; p.innerHTML = h; document.querySelector('main').append(p); const of = (x) => [...x.querySelectorAll('tbody th, .days-side')].map((e) => { const s = getComputedStyle(e); return `${s.position} ${s.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'clear' : s.backgroundColor === getComputedStyle(p).backgroundColor ? 'panel' : 'other'}`; }).join('+'); const out = of(d) + ' ' + of(p); d.remove(); p.remove(); return out; });
  check('1.16.1 heatmap, days: the names stay in view on a panel, and have nothing behind them elsewhere', bare === 'static clear+static clear sticky panel+sticky panel', bare);
  check('1.16 days: with room for all of them they start at the left, the oldest first', room === '0,true,true', room);
  await tab.context().close();

  // ---- on a phone, in high contrast, under a strict style policy
  const phone = await openTools({ width: 390, height: 800, hasTouch: true, isMobile: true });
  const fits = await phone.evaluate(() => [document.documentElement.scrollWidth, innerWidth, getComputedStyle(document.querySelector('#side .pane-bar')).display, Math.round(document.getElementById('left').getBoundingClientRect().width) === Math.round(document.getElementById('side').getBoundingClientRect().width), getComputedStyle(document.querySelector('#three .pane-bar')).display, document.querySelector('#heat .heat-scroll').scrollWidth > document.querySelector('#heat .heat-scroll').clientWidth, (() => { const s = document.querySelector('#cal .heat-scroll'), r = s.getBoundingClientRect(), seen = (x) => { const q = x.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; }, all = [...s.querySelectorAll('.days-grid > i')]; return [s.scrollWidth > s.clientWidth, seen(all[0]), seen(all[all.length - 1]), seen(s.querySelector('.days-side'))].join('-'); })(), (() => { const s = document.querySelector('#heat .heat-scroll'); s.scrollIntoView(); s.scrollLeft = 60; const h = s.querySelector('tbody tr:nth-child(6) th').getBoundingClientRect(), r = s.getBoundingClientRect(), over = document.elementFromPoint(r.left + 8, h.top + 8); s.scrollLeft = 0; return [Math.round(h.left - r.left), over && over.tagName].join('-'); })()].join());
  await phone.tap('#find');
  await phone.waitForTimeout(80);
  const tip = await phone.evaluate(() => { const r = document.querySelector('.palette').getBoundingClientRect(); return [r.left >= 8, r.right <= 382, getComputedStyle(document.querySelector('.palette-foot')).display, document.querySelector('.palette-item').getBoundingClientRect().height >= 44].join(); });
  check('1.16 on a phone: all of it fits; panes stack; the palette is for fingers', fits === '390,390,none,true,block,true,true-false-true-true,0-TH' && tip === 'true,true,none,true', fits + ' ' + tip);
  await phone.context().close();
  const hc = await openTools({ forcedColors: 'active' });
  await hc.keyboard.press('Control+k');
  await hc.waitForTimeout(60);
  const seen = await hc.evaluate(() => { const sys = (n) => { const i = document.createElement('i'); i.style.color = n; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }; const s = getComputedStyle(document.querySelector('.palette-item[aria-selected="true"]')), cell = [...document.querySelectorAll('#heat tbody td')].map((x) => getComputedStyle(x)), bar = getComputedStyle(document.querySelector('.pane-bar'), '::after'); return [s.backgroundColor === sys('Highlight'), s.color === sys('HighlightText'), new Set(cell.map((x) => x.backgroundColor)).size >= 6, cell[0].outlineStyle, bar.backgroundColor === sys('CanvasText'), getComputedStyle(document.querySelector('.json-part > summary'), '::before').borderLeftColor === sys('CanvasText'), getComputedStyle(document.querySelector('[data-log="wrap"]')).backgroundColor === sys('Highlight')].join(); });
  check('1.16 in high contrast: what is chosen, the shades, the bars and the arrows are seen', seen === 'true,true,true,solid,true,true,true', seen);
  await hc.context().close();
  const strict = await openTools({ page: 'csp-tools.html' });
  await strict.waitForTimeout(60);
  const csp = await strict.evaluate(() => [violations.length, Math.round(document.querySelector('#panes > div').getBoundingClientRect().width / (document.getElementById('panes').getBoundingClientRect().width - 13) * 100), Math.round(document.querySelector('.log-lines').getBoundingClientRect().height), Math.round(document.getElementById('panes').getBoundingClientRect().height)].join());
  check('1.16 under a strict style policy: sizes and heights', csp === '0,25,60,90', csp);
  await strict.context().close();
  // the docs and the gallery have one
  const book = await openTools({ width: 1280, page: '../docs/buttons.html' });
  const found = () => book.evaluate(() => { const d = document.querySelector('dialog.palette'); return d ? [...d.querySelectorAll('.palette-group, .palette-name')].slice(0, 3).map((x) => x.textContent).join() : 'closed'; });
  await book.keyboard.press('Control+k');
  await book.keyboard.type('tre');
  const b1 = await found();
  await book.keyboard.press('Enter');
  await book.waitForURL(/lists\.html#tree$/);
  await book.waitForTimeout(100);
  await book.keyboard.press('Control+k');
  const b2 = await found();
  await book.goto(url.replace('behaviour.html', '../docs/navigation.html'), { waitUntil: 'load' });
  await book.click('#find');
  const b4 = await found();
  await book.context().close();
  const show = await openTools({ width: 1280, page: '../index.html' });
  await show.click('#find-btn');
  await show.fill('.palette input', 'heatmap');
  await show.keyboard.press('Enter');
  await show.waitForTimeout(100);
  const b3 = await show.evaluate(() => [location.hash, document.querySelector(location.hash).textContent.includes('Dash.heatmap'), document.querySelector('dialog.palette')].join());
  await show.context().close();
  check('1.16 docs: Ctrl+K goes to a component, from any page, the last one first; the gallery has it too', b1 === 'Lists and trees,Trees,Trees to pick from' && b2.startsWith('Recent,Trees,') && b3 === '#charts-heatmap,true,' && b4 === 'Pages,Overview,Servers', [b1, b2, b3, b4].join(' ; '));
  // every button of every example can be pressed
  const threw = [];
  let presses = 0;
  for (const page of ['../index.html', ...['buttons', 'charts', 'colours', 'components', 'feedback', 'fields', 'forms', 'helpers', 'index', 'labels', 'layout', 'lists', 'logs', 'navigation', 'overlays', 'privacy', 'surfaces', 'tables', 'text'].map((p) => `../docs/${p}.html`)]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => threw.push(`${page}: ${e.message}`));
    await p.goto(url.replace('behaviour.html', page), { waitUntil: 'load' });
    presses += await p.evaluate(async () => {
      const all = [...document.querySelectorAll('main button, main summary')].filter((x) => !x.disabled && !x.closest('.docs-code'));
      for (const x of all) { if (x.isConnected) x.click(); await new Promise((ok) => setTimeout(ok, 4)); for (const d of document.querySelectorAll('dialog[open]')) d.close(); }
      await new Promise((ok) => setTimeout(ok, 60));
      return all.length;
    });
    await ctx.close();
  }
  check('1.16 docs: every button of every example can be pressed', presses > 500 && !threw.length, presses + ' ' + threw.slice(0, 3).join(' ; '));
}

await browser.close();
server.close();
for (const e of errors) results.push({ name: 'page error', ok: false, detail: e });
const failed = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`${results.length - failed.length}/${results.length} behaviour checks passed`);
process.exit(failed.length ? 1 : 0);
