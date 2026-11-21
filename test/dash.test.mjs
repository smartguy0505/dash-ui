// node --test: the helpers that need no page, plus checks on dash.css itself
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Dash = require('../dash.js');
const { fmt } = Dash;
const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('dash.css', root), 'utf8');

test('esc escapes everything that matters in HTML and attributes', () => {
  assert.equal(Dash.esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(Dash.esc(null), '');
  assert.equal(Dash.esc(0), '0');
});

test('missing numbers print as a dash', () => {
  for (const f of [fmt.num, fmt.int, fmt.compact, fmt.usd, fmt.pct, fmt.share, fmt.amount, fmt.signed, fmt.dur, fmt.span, fmt.ago]) {
    for (const v of [null, undefined, '', NaN, 'abc']) assert.equal(f(v), '—', `${f.name || 'fmt'}(${String(v)})`);
  }
});

test('num, int, compact', () => {
  assert.equal(fmt.num(1234.5, 2), '1,234.50');
  assert.equal(fmt.num(-3.5, 1), '−3.5'); // a real minus sign
  assert.equal(fmt.int(1234567), '1,234,567');
  const cases = [[0, '0'], [0.4, '0.4'], [2.5, '2.5'], [12.6, '13'], [999.4, '999'], [999.6, '1k'], [1234, '1.2k'], [9960, '10k'],
    [15400, '15k'], [999600, '1M'], [3.4e6, '3.4M'], [1.1e9, '1.1B'], [-2500, '−2.5k']];
  for (const [v, want] of cases) assert.equal(fmt.compact(v), want, `compact(${v})`);
});

test('money, percentages, shares, amounts', () => {
  assert.equal(fmt.usd(1234.5), '$1,235');
  assert.equal(fmt.usd(12.345), '$12.35');
  assert.equal(fmt.usd(-5), '−$5.00');
  assert.equal(fmt.usd(1234.5, 2), '$1,234.50');
  assert.equal(fmt.pct(12.345), '12.3%');
  assert.deepEqual([99.96, 12.4, 1.53, 0.04, 0].map(fmt.share), ['100%', '12%', '1.5%', '<0.1%', '0%']);
  assert.equal(fmt.amount(0), '0');
  assert.equal(fmt.amount(0.00001), '<0.0001');
  assert.equal(fmt.amount(-0.00001), '−<0.0001');
  assert.equal(fmt.amount(1.23456), '1.2346');
});

test('signed changes and their direction', () => {
  assert.equal(fmt.signed(1.2345), '+1.2345');
  assert.equal(fmt.signed(-0.01), '−0.0100');
  assert.equal(fmt.signed(0.00004), '0');
  assert.equal(fmt.signedUsd(732.6), '+$733');
  assert.equal(fmt.signedUsd(-0.004), '$0.00');
  assert.deepEqual([1, -1, 0, null].map((v) => fmt.dir(v)), ['up', 'down', 'flat', 'flat']);
  assert.equal(fmt.dir(0.00001, 0.00005), 'flat');
  assert.equal(Dash.chg(-2, '−2 τ'), '<span class="chg down">−2 τ</span>');
});

test('durations and times (milliseconds)', () => {
  assert.equal(fmt.dur(45e3), '45s');
  assert.equal(fmt.dur(12 * 60e3), '12m');
  assert.equal(fmt.dur((3 * 3600 + 5 * 60) * 1e3), '3h 5m');
  assert.equal(fmt.dur((2 * 86400 + 4 * 3600) * 1e3), '2d 4h');
  assert.equal(fmt.span(45e3), '45 s');
  assert.equal(fmt.span(12 * 60e3), '12 min');
  assert.equal(fmt.span(2.7 * 3600e3), '2.7 h');
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  assert.equal(fmt.ago(now - 2e3, now), 'just now');
  assert.equal(fmt.ago(now - 40e3, now), '40 s ago');
  assert.equal(fmt.ago(now - 12 * 60e3, now), '12 min ago');
  assert.equal(fmt.ago(now - 2.5 * 3600e3, now), '2.5 h ago');
  assert.equal(fmt.ago(now - 3 * 86400e3, now), '3 d ago');
  assert.equal(fmt.utc(Date.UTC(2026, 10, 21, 2, 22)), 'Nov 21, 02:22 UTC');
  assert.equal(fmt.utc('2026-11-21T02:22:00Z'), 'Nov 21, 02:22 UTC');
  assert.equal(fmt.utc(null), '—');
  assert.equal(fmt.short('5DemoP4mBncoyi8xS11ZJqzzoGs5CC4MyWwUcS6dRdGiaVwn'), '5DemoP…GiaVwn');
  assert.equal(fmt.short('short'), 'short');
  assert.equal(fmt.plural(1, 'node'), '1 node');
  assert.equal(fmt.plural(1200, 'node'), '1,200 nodes');
});

test('sortBy: numbers, text, nulls last both ways, stable', () => {
  const rows = [{ k: 'b', v: 2 }, { k: 'a', v: null }, { k: 'c', v: 10 }, { k: 'd', v: 2 }, { k: 'e', v: '' }];
  assert.deepEqual(Dash.sortBy(rows, 'v', 'desc').map((r) => r.k), ['c', 'b', 'd', 'a', 'e']);
  assert.deepEqual(Dash.sortBy(rows, 'v', 'asc').map((r) => r.k), ['b', 'd', 'c', 'a', 'e']);
  assert.deepEqual(Dash.sortBy([{ n: 'node-10' }, { n: 'Node-9' }, { n: 'node-2' }], 'n', 'asc').map((r) => r.n), ['node-2', 'Node-9', 'node-10']);
  assert.deepEqual(Dash.sortBy(rows, (r) => r.k.charCodeAt(0), 'asc').map((r) => r.k), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(rows[0].k, 'b', 'the input is not reordered');
});

test('sorter flips the same column, starts a new one with its own direction', () => {
  const s = Dash.sorter({ key: 'value', dir: 'desc', firstDir: { name: 'asc' } });
  s.toggle('value');
  assert.deepEqual([s.key, s.dir], ['value', 'asc']);
  s.toggle('name');
  assert.deepEqual([s.key, s.dir], ['name', 'asc']);
  s.toggle('score');
  assert.deepEqual([s.key, s.dir], ['score', 'desc']);
  assert.equal(Dash.th('Score', 'score', s, { num: true }), '<th class="num" aria-sort="descending"><button type="button" data-sort="score">Score</button></th>');
  assert.equal(Dash.th('Name <x>', 'name', s), '<th><button type="button" data-sort="name">Name &lt;x&gt;</button></th>');
});

test('paging', () => {
  assert.deepEqual(Dash.pageItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(Dash.pageItems(2, 12), [1, 2, 3, 4, 5, null, 12]);
  assert.deepEqual(Dash.pageItems(6, 12), [1, null, 5, 6, 7, null, 12]);
  assert.deepEqual(Dash.pageItems(11, 12), [1, null, 8, 9, 10, 11, 12]);
  const rows = Array.from({ length: 23 }, (_, i) => i);
  const p = Dash.paginate(rows, 3, 10);
  assert.deepEqual([p.page, p.pages, p.from, p.to, p.total, p.rows.length], [3, 3, 21, 23, 23, 3]);
  assert.equal(Dash.paginate(rows, 99, 10).page, 3, 'page clamped to the last');
  assert.equal(Dash.paginate([], 1).from, 0);
  const html = Dash.pager(p, { noun: 'node' });
  assert.match(html, /21–23 of 23 nodes/);
  assert.match(html, /aria-label="Page 3" aria-current="page"/);
  assert.match(html, /aria-label="Next page" disabled/);
  assert.equal(Dash.pager(Dash.paginate([], 1)), '');
});

test('builders escape their text', () => {
  assert.equal(Dash.pill('<b>', 'ok'), '<span class="pill ok"><span class="dot"></span>&lt;b&gt;</span>');
  assert.equal(Dash.tag('x', 'bad" onclick="y'), '<span class="tag bad&quot; onclick=&quot;y">x</span>');
  assert.equal(Dash.rank(2, 14), '<span class="rank silver">#2<span>of 14</span></span>');
  assert.equal(Dash.rank(5), '<span class="rank">#5</span>');
  assert.match(Dash.legend([{ label: '<i>', value: 3, tone: 'ok' }]), /&lt;i&gt;/);
  assert.match(Dash.hbars([{ label: '<x>', value: 1 }]), /&lt;x&gt;/);
  assert.match(Dash.bars([{ label: '<x>', value: 1 }]), /&lt;x&gt;/);
  assert.equal(Dash.maskIps('<b> 203.0.113.10'), '&lt;b&gt; <span class="ip" data-ip="203.0.113.10" role="button" tabindex="0" aria-label="IP address, hidden. Press to show it" title="Click to show the IP">203.0.113.10</span>');
  assert.equal(Dash.hideIps('node on 203.0.113.10'), 'node on (IP hidden)');
});

test('charts: sizes and shares are right', () => {
  assert.match(Dash.bar(0.25), /width:25%/);
  assert.match(Dash.bar(3), /width:100%/, 'clamped');
  assert.match(Dash.bar(-1), /width:0%/);
  const split = Dash.split([{ value: 1, tone: 'blue' }, { value: 3, tone: 'teal' }]);
  assert.match(split, /class="blue" style="width:25%"/);
  assert.match(split, /class="teal" style="width:75%"/);
  assert.deepEqual([0, 0.7, 1, 1.2, 7, 130, 2600].map(Dash.niceMax), [1, 1, 1, 2, 10, 200, 5000]);
  const bars = Dash.bars([{ label: 'a', value: 50 }, { label: 'b', value: 100 }, { label: 'c', value: 0 }], { ticks: 2 });
  assert.match(bars, /height:50%/);
  assert.match(bars, /height:100%/);
  assert.match(bars, /chart-col zero/);
  assert.match(bars, /<span>50<\/span>/);
  assert.match(Dash.gauge(0.95), /class="gauge bad"/);
  assert.match(Dash.gauge(0.75), /class="gauge warn"/);
  assert.match(Dash.gauge(0.2), /class="gauge ok"/);
  assert.match(Dash.gauge(0.42), /stroke-dasharray="42.00 100"/);
  assert.doesNotMatch(Dash.gauge(0), /class="val"/);
  const donut = Dash.donut([{ value: 1, tone: 'blue' }, { value: 3, tone: 'teal' }, { value: 0, tone: 'bad' }], { center: '4' });
  assert.equal((donut.match(/seg-arc/g) || []).length, 2, 'zero segments are left out');
  assert.match(Dash.spark([1, 2, 3]), /<path class="line" d="M4\.0 52\.0 L120\.0 28\.0 L236\.0 4\.0"/);
  assert.match(Dash.spark([]), /<svg class="spark"/);
});

test('1.1 options: signedUsd digits, chg eps and title, th unit / mark / plain', () => {
  // what existing calls print stays the same
  assert.equal(fmt.signedUsd(732.6), '+$733');
  assert.equal(fmt.signedUsd(-12.345), '−$12.35');
  assert.equal(fmt.signedUsd(0.001), '$0.00');
  assert.equal(Dash.chg(1.5), '<span class="chg up">+1.5000</span>');
  assert.equal(Dash.chg(0.00003, '+0'), '<span class="chg up">+0</span>');
  const sort = { key: 'total', dir: 'desc' };
  assert.equal(Dash.th('Total', 'total', sort, { num: true }), '<th class="num" aria-sort="descending"><button type="button" data-sort="total">Total</button></th>');
  // the new options
  assert.equal(fmt.signedUsd(732.6, 2), '+$732.60');
  assert.equal(fmt.signedUsd(0.004, 2), '$0.00');
  assert.equal(fmt.signedUsd(-0.6, 0), '−$1');
  assert.equal(fmt.signedUsd(0.4, 0), '$0');
  assert.equal(Dash.chg(0.00003, '+0', { eps: 0.00005 }), '<span class="chg flat">+0</span>');
  assert.equal(Dash.chg(-2, '−2', { title: 'free <1> · staked' }), '<span class="chg down" title="free &lt;1&gt; · staked">−2</span>');
  assert.equal(Dash.th('Free', 'free', sort, { num: true, unit: 'τ' }), '<th class="num"><button type="button" data-sort="free">Free <span class="unit">τ</span></button></th>');
  assert.equal(Dash.th('Value', 'total', sort, { num: true, unit: '$', mark: false }), '<th class="num"><button type="button" data-sort="total">Value <span class="unit">$</span></button></th>');
  assert.equal(Dash.th('Share', null, sort, { title: 'of <all>' }), '<th title="of &lt;all&gt;">Share</th>');
  assert.equal(Dash.th('<b>', 'k', null, { unit: '<i>' }), '<th><button type="button" data-sort="k">&lt;b&gt; <span class="unit">&lt;i&gt;</span></button></th>');
});

test('the version is the same in dash.css, dash.js, Dash.version and package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  const js = readFileSync(new URL('dash.js', root), 'utf8');
  assert.equal(Dash.version, pkg);
  assert.match(css.split('\n')[0], new RegExp(`^/\\* dash-ui ${pkg.replaceAll('.', '\\.')}:`));
  assert.match(js.split('\n')[0], new RegExp(`^/\\* dash-ui ${pkg.replaceAll('.', '\\.')} `));
  const log = readFileSync(new URL('CHANGELOG.md', root), 'utf8');
  assert.match(log, new RegExp(`^## ${pkg.replaceAll('.', '\\.')}\\b`, 'm'), 'CHANGELOG has a section for this version');
});

// WCAG contrast at today's colours. Light-mode pill text (a tone on its own 12% tint) is just under 4.5 for
// ok, warn, orange, gold and silver; accent and faint are below 4.5 as text. These floors only stop it getting worse.
test('dash.css: colour contrast does not get worse', () => {
  const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const light = block(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = { ...light, ...block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/) };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tint = (c, base) => c.map((v, i) => Math.round(v * 0.12 + base[i] * 0.88));
  const tones = ['ok', 'warn', 'bad', 'blue', 'teal', 'purple', 'orange', 'pink', 'gold', 'silver', 'bronze', 'idle'];
  for (const [name, t] of [['light', light], ['dark', dark]]) {
    const card = rgb(t.card);
    assert.ok(ratio(rgb(t.text), card) >= 7, `${name} text`);
    assert.ok(ratio(rgb(t.muted), card) >= 4.5, `${name} muted`);
    assert.ok(ratio(rgb(t.faint), card) >= 3.5, `${name} faint`);
    assert.ok(ratio(rgb(t.accent), card) >= 3.85, `${name} accent`);
    for (const k of tones) {
      const c = rgb(t[k]);
      assert.ok(ratio(c, card) >= 4.8, `${name} ${k} on a card: ${ratio(c, card).toFixed(2)}`);
      assert.ok(ratio(c, tint(c, card)) >= 4.15, `${name} ${k} on its tint: ${ratio(c, tint(c, card)).toFixed(2)}`);
    }
  }
});

test('both files can be pasted inline into a page', () => {
  const js = readFileSync(new URL('dash.js', root), 'utf8');
  assert.doesNotMatch(js, /<\/script/i, 'dash.js would close an inline <script> early');
  assert.doesNotMatch(js, /<!--/, 'dash.js has an HTML comment opener');
  assert.doesNotMatch(css, /<\/style/i, 'dash.css would close an inline <style> early');
});

test('dash.css: .stack-md cards are the same rules as .stack', () => {
  const rules = (sel) => css.split('\n').map((l) => l.trim()).filter((l) => l.includes(sel) && l.includes('{'));
  const md = rules('.table.stack-md').map((l) => l.replaceAll('.stack-md', '.stack'));
  const sm = rules('.table.stack').filter((l) => !l.includes('.stack-md'));
  assert.ok(md.length >= 12, 'found the .stack-md rules');
  assert.deepEqual(md, sm);
});

test('dash.css: the two dark palettes are the same', () => {
  const block = (re) => {
    const m = css.match(re);
    assert.ok(m, String(re));
    return m[1].replace(/\s+/g, ' ').trim();
  };
  const system = block(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/);
  const chosen = block(/:root\[data-theme="dark"\] \{([^}]*)\}/);
  assert.equal(system, chosen);
});

test('dash.css: every light token has a dark value, and every tone class a token', () => {
  const names = (s) => new Set([...s.matchAll(/--([a-z-]+):/g)].map((m) => m[1]));
  const light = names(css.match(/:root \{([^}]*)\}/)[1]);
  const dark = names(css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1]);
  const fixed = new Set(['font', 'mono', 'radius', 'radius-sm', 'page-max', 'side-w', 'topbar-h']); // the same in both
  for (const n of light) if (!fixed.has(n)) assert.ok(dark.has(n), `--${n} has no dark value`);
  for (const [, tone, token] of css.matchAll(/\.([a-z]+) \{ --c: var\(--([a-z]+)\); \}/g)) assert.ok(light.has(token), `.${tone} uses --${token}`);
});

test('every class the pages and helpers use is in dash.css (or the page’s own <style>)', () => {
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const files = ['index.html', ...readdirSync(new URL('examples/', root)).map((f) => 'examples/' + f)];
  const missing = [];
  const js = readFileSync(new URL('dash.js', root), 'utf8');
  const sources = files.map((f) => [f, readFileSync(new URL(f, root), 'utf8')]).concat([['dash.js', js]]);
  for (const [file, text] of sources) {
    const own = new Set([...(text.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    for (const [, list] of text.matchAll(/class="([^"]*)"/g)) {
      for (const c of list.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        if (!/^[a-zA-Z][\w-]*$/.test(c)) continue; // the rest is built at run time
        if (!defined.has(c) && !own.has(c)) missing.push(`${file}: .${c}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
