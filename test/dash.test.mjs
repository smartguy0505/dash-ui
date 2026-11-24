// node --test: the helpers that need no page, plus checks on dash.css itself
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
// KIT=<dir> tests the dash.css and dash.js in <dir> instead, as test/behaviour.mjs does: to check a change
const kit = process.env.KIT ? pathToFileURL(resolve(process.env.KIT) + '/') : root;
const Dash = require(fileURLToPath(new URL('dash.js', kit)));
const css = readFileSync(new URL('dash.css', kit), 'utf8');
const utils = readFileSync(new URL('dash-utils.css', kit), 'utf8');
// the generator of the kit under test (an older kit copy may not have one)
const gen = await import(new URL('tools/utils.mjs', existsSync(new URL('tools/utils.mjs', kit)) ? kit : root).href);
const unesc = (n) => n.replace(/\\(.)/g, '$1');
// the utility class names, read from the file
const utilNames = new Set([...utils.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.((?:[\w-]|\\.)+)(?::not\(\.[\w-]+\))?:not\(#\\#\)/g)].map((m) => unesc(m[1])));
const { fmt } = Dash;

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
  assert.equal(Dash.chg(-2, '−2 GB'), '<span class="chg down">−2 GB</span>');
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
  assert.equal(fmt.short('acct_7mbncoyi8xs11zjqzzogk2m9xq'), 'acct_7…k2m9xq');
  assert.equal(fmt.short('short'), 'short');
  assert.equal(fmt.plural(1, 'server'), '1 server');
  assert.equal(fmt.plural(1200, 'server'), '1,200 servers');
});

test('sortBy: numbers, text, nulls last both ways, stable', () => {
  const rows = [{ k: 'b', v: 2 }, { k: 'a', v: null }, { k: 'c', v: 10 }, { k: 'd', v: 2 }, { k: 'e', v: '' }];
  assert.deepEqual(Dash.sortBy(rows, 'v', 'desc').map((r) => r.k), ['c', 'b', 'd', 'a', 'e']);
  assert.deepEqual(Dash.sortBy(rows, 'v', 'asc').map((r) => r.k), ['b', 'd', 'c', 'a', 'e']);
  assert.deepEqual(Dash.sortBy([{ n: 'web-10' }, { n: 'Web-9' }, { n: 'web-2' }], 'n', 'asc').map((r) => r.n), ['web-2', 'Web-9', 'web-10']);
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
  const html = Dash.pager(p, { noun: 'server' });
  assert.match(html, /21–23 of 23 servers/);
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
  assert.equal(Dash.hideIps('web-1 on 203.0.113.10'), 'web-1 on (IP hidden)');
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
  assert.equal(Dash.chg(-2, '−2', { title: 'cash <1> · invested' }), '<span class="chg down" title="cash &lt;1&gt; · invested">−2</span>');
  assert.equal(Dash.th('Latency', 'p95', sort, { num: true, unit: 'ms' }), '<th class="num"><button type="button" data-sort="p95">Latency <span class="unit">ms</span></button></th>');
  assert.equal(Dash.th('Value', 'total', sort, { num: true, unit: '$', mark: false }), '<th class="num"><button type="button" data-sort="total">Value <span class="unit">$</span></button></th>');
  assert.equal(Dash.th('Share', null, sort, { title: 'of <all>' }), '<th title="of &lt;all&gt;">Share</th>');
  assert.equal(Dash.th('<b>', 'k', null, { unit: '<i>' }), '<th><button type="button" data-sort="k">&lt;b&gt; <span class="unit">&lt;i&gt;</span></button></th>');
});

test('1.3: Dash.time reads what servers send', () => {
  assert.equal(Dash.time('2026-11-21 14:05:00'), Date.UTC(2026, 10, 21, 14, 5)); // no zone: UTC
  assert.equal(Dash.time('2026-11-21T14:05:00.5'), Date.UTC(2026, 10, 21, 14, 5, 0, 500));
  assert.equal(Dash.time('2026-11-21T14:05:00+02:00'), Date.UTC(2026, 10, 21, 12, 5));
  assert.equal(Dash.time(1700000000, { seconds: true }), 1700000000000);
  assert.equal(Dash.time('1700000000000'), 1700000000000);
  assert.equal(Dash.time(new Date(5)), 5);
  assert.equal(Dash.time('2026-11-21'), Date.UTC(2026, 10, 21));
  assert.equal(Dash.time('Sat, 21 Nov 2026 14:05:00 GMT'), Date.UTC(2026, 10, 21, 14, 5));
  for (const bad of [null, undefined, '', 'soon', 'yesterday <3', 'Nov 21', true]) assert.ok(Number.isNaN(Dash.time(bad)), String(bad));
});

test('1.3: date, time, until', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  assert.equal(fmt.until(now + (3 * 3600 + 5 * 60) * 1000 + 400, now), 'in 3h 5m');
  assert.equal(fmt.until(now + 300, now), 'now');
  assert.equal(fmt.until(now - 5000, now), 'now');
  assert.equal(fmt.until(null), '—');
  assert.equal(fmt.time(Date.UTC(2026, 0, 1, 14, 5, 9), { utc: true }), '14:05:09 UTC');
  assert.equal(fmt.time(Date.UTC(2026, 0, 1, 14, 5, 9), { utc: true, seconds: false }), '14:05 UTC');
  assert.equal(fmt.date(Date.UTC(2020, 10, 21, 12), { utc: true }), 'Nov 21, 2020');
  assert.equal(fmt.date(Date.UTC(new Date().getUTCFullYear(), 2, 3, 12), { utc: true }), 'Mar 3');
  assert.equal(fmt.date('nope'), '—');
  // the same reading as Dash.time: no zone = UTC, loose text = "—"
  assert.equal(fmt.time('2026-11-21 14:05:09', { utc: true }), '14:05:09 UTC');
  assert.equal(fmt.time('2026-11-21 14:05:09'), fmt.time(Dash.time('2026-11-21 14:05:09')));
  assert.equal(fmt.date('yesterday <3'), '—');
  assert.equal(fmt.time(1700000000, { utc: true }), '22:13:20 UTC'.replace('22:13:20', new Date(1700000000).toISOString().slice(11, 19)));
});

test('1.3: tone thresholds', () => {
  const t = (v) => Dash.tone(v, { 75: 'warn', 90: 'bad' });
  assert.deepEqual([t(0), t(74.9), t(75), t(89), t(90), t(100), t('80')], ['ok', 'ok', 'warn', 'warn', 'bad', 'bad', 'warn']);
  assert.equal(t(null), '');
  const low = (v) => Dash.tone(v, { 7: 'warn', 2: 'bad' }, 'ok', { below: true });
  assert.deepEqual([low(30), low(7), low(3), low(2), low(0)], ['ok', 'warn', 'warn', 'bad', 'bad']);
});

test('1.3: rows: sum, groupBy, match, csv', () => {
  const rows = [{ name: 'Web-1', region: 'eu', v: 2 }, { name: 'db-1', region: 'us', v: '3' }, { name: 'web-2', region: 'eu', v: null }];
  assert.equal(Dash.sum(rows, 'v'), 5);
  assert.equal(Dash.sum(rows, (r) => (r.region === 'eu' ? 1 : 0)), 2);
  assert.deepEqual(Object.keys(Dash.groupBy(rows, 'region')), ['eu', 'us']);
  assert.equal(Dash.groupBy(rows, 'region').eu.length, 2);
  assert.deepEqual(rows.filter((r) => Dash.match(r, 'WEB eu')).map((r) => r.name), ['Web-1', 'web-2']);
  assert.deepEqual(rows.filter((r) => Dash.match(r, 'eu', ['name'])).map((r) => r.name), []);
  assert.equal(rows.filter((r) => Dash.match(r, '  ')).length, 3);
  assert.equal(Dash.csv([{ a: 1, b: 'x,y', c: '=1+1', d: null }, { a: -2.5, b: 'say "hi"', c: '@x', d: 'line\nbreak' }]),
    'a,b,c,d\r\n1,"x,y",\'=1+1,\r\n-2.5,"say ""hi""",\'@x,"line\nbreak"\r\n');
  assert.equal(Dash.csv([{ n: 'web' }], [{ key: 'n', label: 'Name' }, { key: 'up', label: 'Upper', value: (r) => r.n.toUpperCase() }]), 'Name,Upper\r\nweb,WEB\r\n');
  assert.equal(Dash.csv([]), '\r\n');
  assert.equal(Dash.csv([{ a: '-3', b: '+1.5', c: '-1+2', d: '1e5', e: '-' }]), 'a,b,c,d,e\r\n-3,+1.5,\'-1+2,1e5,\'-\r\n');
});

test('1.3: the address as settings', () => {
  assert.deepEqual(Dash.hash.parse('#overview&agent=a%20b&x='), { overview: '', agent: 'a b', x: '' });
  assert.deepEqual(Dash.hash.parse(''), {});
  assert.deepEqual(Dash.hash.parse('#bad=%E0%A4%A'), { bad: '%E0%A4%A' });
  assert.equal(Dash.hash.format({ overview: '', agent: 'a b', gone: null, n: 3 }), '#overview&agent=a%20b&n=3');
  assert.equal(Dash.hash.format({}), '');
  const o = { 'k&=': 'v&=#' };
  assert.deepEqual(Dash.hash.parse(Dash.hash.format(o)), o);
});

test('1.12: a table’s rules reach only its own rows', () => {
  // a table inside a row's details (.row-box) is another table: every rule that turns rows into cards, pins the header or lights a row goes by >
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const loose = [...bare.matchAll(/[^{}]*\{/g)].flatMap((m) => m[0].slice(0, -1).split(',')).map((x) => x.trim())
    .filter((x) => /\.table\.(stack|stack-md|sticky)\s+[^>\s]/.test(x) || /^\.table tbody tr:(hover|last-child) td/.test(x));
  assert.deepEqual(loose, []);
});

test('1.11: a line chart is escaped, broken at gaps, and says what it shows', () => {
  const T = Date.UTC(2026, 10, 23, 12), H = 3600e3;
  const html = Dash.lines.html([{ label: '<i>A', points: [[T + 2 * H, 30], [T, 10], [T + H, '20'], [T + 3 * H, null], [T + 4 * H, NaN], ['soon', 5], [T + 5 * H, 40], [T + 6 * H, 50]] }, { label: 'B', tone: 'bad', dashed: true, points: [{ t: T, v: 5 }, { time: T + 6 * H, value: 15 }] }], { label: '"L"', format: (v) => `${v}<` });
  assert.doesNotMatch(html, /<i>A|"L"|\d<(?!\/)/);
  assert.match(html, /<path class="series-1" d="M0 833\.333L166\.667 666\.667L333\.333 500M833\.333 333\.333L1000 166\.667"/, 'sorted by time, broken where a value is missing');
  assert.match(html, /<path class="bad dashed"/);
  assert.match(html, /aria-label="&quot;L&quot;" aria-valuemin="1" aria-valuemax="5" aria-valuenow="5"/);
  assert.match(html, /&lt;i&gt;A: 50&lt; at the end, from 10&lt; to 50&lt;; B: 15&lt; at the end, from 5&lt; to 15&lt;\./);
  assert.match(Dash.lines.html([], {}), /^<p class="empty">Nothing to show<\/p>$/);
  assert.match(Dash.lines.html([{ points: [[T, null]] }], { empty: '<none>' }), /^<p class="empty">&lt;none&gt;<\/p>$/);
  assert.doesNotMatch(Dash.lines.html([{ points: [[T, 1], [T + H, 2]] }]), /NaN|Infinity|undefined/);
  for (const o of [{ min: 5, max: 5 }, { max: 0 }, { min: 'auto', max: -5 }, { height: 'x', ticks: 0 }, { from: T + 2 * H, to: T }]) assert.doesNotMatch(Dash.lines.html([{ points: [[T, 1], [T + H, 2]] }], o), /NaN|Infinity/, JSON.stringify(o));
});

test('1.10: a private value is written only while values are shown', () => {
  const { mask, privacy } = Dash; // both can be taken out of it (a reserved word couldn't)
  assert.equal(mask, Dash.mask); assert.equal(privacy, Dash.privacy);
  Dash.privacy.set(false);
  assert.equal(Dash.mask('€1,204.50'), '€1,204.50');
  assert.equal(Dash.mask('<b>1,204</b>'), '&lt;b&gt;1,204&lt;/b&gt;');
  assert.equal(Dash.mask('<b>1,204</b>', { html: true }), '<b>1,204</b>');
  assert.equal(Dash.mask.text('1,204', 'an amount'), '1,204');
  Dash.privacy.set(true);
  assert.equal(Dash.privacy.on, true);
  for (const out of [Dash.mask('€1,204.50'), Dash.mask('<b>1,204</b>', { html: true, as: '0<0', label: '"gone"' }), Dash.mask.text('1,204', 'an amount'), Dash.mask.text(1204)]) assert.doesNotMatch(out, /1,?204/);
  assert.equal(Dash.mask(1), Dash.mask('€1,204,000.50'), 'the stand-in says nothing about the length');
  assert.match(Dash.mask(0), /class="private"/, 'a zero is a value');
  assert.equal(Dash.mask('x', { as: '0<0', label: '"gone"' }), '<span class="private" aria-hidden="true">0&lt;0</span><span class="sr-only">&quot;gone&quot;</span>');
  for (const none of ['', null, undefined]) { assert.equal(Dash.mask(none), ''); assert.equal(Dash.mask.text(none), ''); }
  assert.equal(Dash.mask('—'), '—');
  assert.equal(Dash.mask.text('1,204', 'an amount'), 'an amount');
  assert.equal(Dash.mask.text('1,204'), 'hidden');
  assert.match(Dash.privacy.button('"b"'), /data-privacy="&quot;b&quot;" title="Show &quot;b&quot;" aria-label="Show &quot;b&quot;"/);
  Dash.privacy.toggle();
  assert.equal(Dash.privacy.on, false);
  assert.match(Dash.privacy.button(), /data-privacy="values" title="Hide values" aria-label="Hide values"/);
});

test('1.9.2: a timeline time to come counts down; one within a minute of now, or past, is written as before', () => {
  const kind = (t) => /<time [^>]*data-(ago|near|until)=/.exec(Dash.timeline([{ title: 'x', time: t }]))[1];
  assert.equal(kind(Date.now() + 2 * 3600e3), 'near');
  assert.equal(kind(Date.now() + 61e3 + 500), 'near');
  assert.equal(kind(Date.now() + 30e3), 'ago');
  assert.equal(kind(Date.now() - 3600e3), 'ago');
  assert.match(Dash.timeline([{ title: 'x', time: Date.now() + 3 * 3600e3 + 5 * 60e3 + 900 }]), />in 3h 5m<\/time>/);
});

test('1.3: stacked columns, timeline, live times escape and size right', () => {
  const html = Dash.bars([{ label: 'a', parts: [{ value: 3, tone: 'blue' }, { value: 1, tone: 'x" onclick="y' }, { value: 0, tone: 'teal' }] }, { label: 'b', value: 2 }], { max: 8 });
  assert.match(html, /class="chart-col stacked" title="a: 4"><i style="height:50%"><u class="blue" style="flex-grow:3"><\/u><u class="x&quot; onclick=&quot;y" style="flex-grow:1"><\/u><\/i>/);
  assert.match(html, /class="chart-col"[^>]*><i style="height:25%"><\/i>/);
  assert.match(Dash.bars([{ label: 'z', parts: [] }]), /chart-col zero stacked/);
  const tl = Dash.timeline([{ title: '<b>', time: Date.now() - 120e3, text: '<i>', tone: 'ok' }, { title: 'x', time: 'yesterday <3' }]);
  assert.match(tl, /<li class="ok">.*&lt;b&gt;.*data-ago="\d+".*2 min ago.*&lt;i&gt;/);
  assert.match(tl, /yesterday &lt;3/);
  assert.match(Dash.timeline([], { empty: 'None <yet>' }), /None &lt;yet&gt;/);
  assert.match(Dash.ago(Date.UTC(2026, 0, 1)), /^<time datetime="2026-01-01T00:00:00.000Z" data-ago="1767225600000" title="[^"]+">\d+ d ago<\/time>$/);
  assert.match(Dash.until(Date.now() + 3 * 3600e3 + 30e3), />in 3h 0m</);
  assert.equal(Dash.ago(null), '—');
  assert.equal(Dash.ago('not a time'), '—');
});

test('1.3: stat tiles escape their text', () => {
  assert.equal(Dash.stat('p95 <x>', 41, { unit: 'ms', note: 'target <60>', tone: 'warn', title: 'a "t"' }),
    '<div class="stat" title="a &quot;t&quot;"><div class="label">p95 &lt;x&gt;</div><div class="value tone warn">41 <small>ms</small></div><div class="note">target &lt;60&gt;</div></div>');
  assert.equal(Dash.stat('Items', null), '<div class="stat"><div class="label">Items</div><div class="value">—</div></div>');
  assert.match(Dash.stat('Rank', Dash.rank(2, 14), { html: true }), /<span class="rank silver">/);
  assert.match(Dash.stat('x', '<b>'), /&lt;b&gt;/);
});

test('the version is the same in dash.css, dash.js, Dash.version and package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  const js = readFileSync(new URL('dash.js', kit), 'utf8');
  assert.equal(Dash.version, pkg);
  assert.match(css.split('\n')[0], new RegExp(`^/\\* dash-ui ${pkg.replaceAll('.', '\\.')}:`));
  assert.match(js.split('\n')[0], new RegExp(`^/\\* dash-ui ${pkg.replaceAll('.', '\\.')} `));
  assert.match(utils.split('\n')[0], new RegExp(`^/\\* dash-ui ${pkg.replaceAll('.', '\\.')}: utility classes`));
  const log = readFileSync(new URL('CHANGELOG.md', root), 'utf8');
  assert.match(log, new RegExp(`^## ${pkg.replaceAll('.', '\\.')}\\b`, 'm'), 'CHANGELOG has a section for this version');
});

// WCAG contrast. Every tone is AA (4.5) as text on a card and on its own tint, at every tint strength the kit puts
// tone text on (10-14%: nav highlight, tag/tint, pill, rank). accent and faint are below 4.5 and not for body text.
test('dash.css: colour contrast', () => {
  const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const light = block(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = { ...light, ...block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/) };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tint = (c, base, p) => c.map((v, i) => Math.round(v * p + base[i] * (1 - p)));
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
      for (const p of [0.10, 0.12, 0.13, 0.14]) {
        assert.ok(ratio(c, tint(c, card, p)) >= 4.5, `${name} ${k} on its ${p * 100}% tint: ${ratio(c, tint(c, card, p)).toFixed(2)}`);
      }
    }
  }
});

test('both files can be pasted inline into a page', () => {
  const js = readFileSync(new URL('dash.js', kit), 'utf8');
  assert.doesNotMatch(js, /<\/script/i, 'dash.js would close an inline <script> early');
  assert.doesNotMatch(js, /<!--/, 'dash.js has an HTML comment opener');
  assert.doesNotMatch(css, /<\/style/i, 'dash.css would close an inline <style> early');
  assert.doesNotMatch(utils, /<\/style/i, 'dash-utils.css would close an inline <style> early');
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
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).concat([...utilNames]));
  const files = ['index.html', ...readdirSync(new URL('examples/', root)).map((f) => 'examples/' + f)];
  const missing = [];
  const js = readFileSync(new URL('dash.js', kit), 'utf8');
  const sources = files.map((f) => [f, readFileSync(new URL(f, root), 'utf8')]).concat([['dash.js', js]]);
  for (const [file, text] of sources) {
    const own = new Set([...(text.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    for (const [, list] of text.matchAll(/class="([^"]*)"/g)) {
      for (const c of list.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        if (!/^-?[a-zA-Z][\w:/.-]*$/.test(c)) continue; // the rest is built at run time
        if (!defined.has(c) && !own.has(c)) missing.push(`${file}: .${c}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('1.4: Dash.place puts a box beside its anchor, flips when there is no room, stays inside the window', () => {
  const view = { width: 1000, height: 800 };
  const size = { width: 200, height: 150 };
  const btn = { left: 100, top: 100, right: 180, bottom: 130 };
  assert.deepEqual(Dash.place(btn, size, view), { side: 'bottom', maxHeight: 656, left: 100, top: 136 });
  const low = { left: 100, top: 700, right: 180, bottom: 730 };
  assert.deepEqual(Dash.place(low, size, view), { side: 'top', maxHeight: 686, left: 100, top: 544 });
  const mid = { left: 500, top: 100, right: 580, bottom: 130 };
  assert.equal(Dash.place(mid, size, view, { align: 'end' }).left, 380);
  assert.equal(Dash.place(mid, size, view, { align: 'center' }).left, 440);
  assert.equal(Dash.place({ left: 900, top: 100, right: 980, bottom: 130 }, size, view).left, 792); // kept 8 px from the edge
  assert.deepEqual(Dash.place({ x: 990, y: 790 }, size, view), { side: 'top', maxHeight: 776, left: 792, top: 634 }); // a right-click near the corner
  assert.deepEqual(Dash.place(btn, size, view, { placement: 'right' }), { side: 'right', maxHeight: 784, left: 186, top: 100 });
  assert.equal(Dash.place(btn, size, view, { placement: 'right', align: 'center' }).top, 40);
  assert.equal(Dash.place({ left: 850, top: 100, right: 980, bottom: 130 }, size, view, { placement: 'right' }).left, 644);
  assert.equal(Dash.place(btn, size, view, { placement: 'sideways' }).side, 'bottom');
  // a small window: the side with more room, and a box taller than that scrolls
  const small = Dash.place({ left: 10, top: 140, right: 60, bottom: 160 }, { width: 200, height: 250 }, { width: 390, height: 300 });
  assert.deepEqual(small, { side: 'bottom', maxHeight: 126, left: 10, top: 166 });
  // no room on either side: it covers the anchor instead of shrinking to nothing
  const none = Dash.place({ left: 10, top: 40, right: 60, bottom: 60 }, { width: 200, height: 250 }, { width: 390, height: 100 });
  assert.equal(none.maxHeight, 84);
  assert.ok(none.top >= 8 && none.top + Math.min(250, none.maxHeight) <= 92, JSON.stringify(none));
});

test('1.4: menu items escape, and carry their roles', () => {
  const html = Dash.menu.html(['Open', { label: '<b>Rename</b>', value: 'r', hint: 'F2' }, '-', { heading: 'Danger <zone>' },
    { label: 'Delete', tone: 'bad" onclick="x', disabled: true }, { label: 'Wrap lines', checked: true }, { label: 'Raw', checked: false }, { label: 'Docs', href: '/docs?a=1&b=2' }]);
  // a ticked item in the menu: every item has the tick column, so the labels line up
  assert.match(html, /^<button type="button" role="menuitem" data-item="0" tabindex="-1"><span class="menu-tick" aria-hidden="true"><\/span><span class="menu-text">Open<\/span><\/button>/);
  assert.match(html, /data-item="1"[^>]*><span class="menu-tick" aria-hidden="true"><\/span><span class="menu-text">&lt;b&gt;Rename&lt;\/b&gt;<\/span><kbd class="menu-hint">F2<\/kbd><\/button>/);
  assert.match(html, /<hr><div class="menu-label" role="presentation">Danger &lt;zone&gt;<\/div>/);
  assert.match(html, /data-item="4" tabindex="-1" class="bad&quot; onclick=&quot;x" disabled>/);
  assert.match(html, /role="menuitemcheckbox" data-item="5" tabindex="-1" aria-checked="true"><span class="menu-tick" aria-hidden="true">✓<\/span>/);
  assert.match(html, /data-item="6" tabindex="-1" aria-checked="false"><span class="menu-tick" aria-hidden="true"><\/span>/);
  assert.match(html, /<a role="menuitem" data-item="7" tabindex="-1" href="\/docs\?a=1&amp;b=2">/);
  assert.equal(Dash.menu.html([]), '');
  assert.equal(Dash.menu.html(['One', { label: 'Two', value: 2 }]),
    '<button type="button" role="menuitem" data-item="0" tabindex="-1"><span class="menu-text">One</span></button><button type="button" role="menuitem" data-item="1" tabindex="-1"><span class="menu-text">Two</span></button>');
});

test('1.5: Dash.lanes cuts spans at the edges, leaves out what is outside, and writes no style=""', () => {
  const now = Date.now(), h = 3600e3, from = now - 24 * h;
  const html = Dash.lanes.html([{ label: 'a', spans: [
    { from: now - 30 * h, to: now - 18 * h },   // starts before the range: cut at its left edge
    { from: now - 12 * h, to: now - 18 * h },   // backwards: read the right way round
    { from: now - 50 * h, to: now - 40 * h },   // wholly before: left out
    { from: now - 6 * h },                      // still going: runs to the end
    { from: 'soon', to: now },                  // not a time: left out
  ], marks: [{ at: now - 12 * h }, { at: now - 30 * h }, { at: now + h }, { at: 'x' }] }], { from, to: now });
  assert.doesNotMatch(html, /style=/);
  const spans = [...html.matchAll(/class="span" data-at="([\d.]+)" data-len="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(spans, [[0, 25], [25, 25], [75, 25]]);
  assert.deepEqual([...html.matchAll(/class="mark" data-at="([\d.]+)"/g)].map((m) => Number(m[1])), [50]);
  assert.match(html, /aria-label="a: 3 runs, 1 event: /);
});

test('1.5: Dash.lanes axis, summaries, escaping and empty', () => {
  const now = Date.now(), h = 3600e3, d = 24 * h;
  const ax = (html) => [...html.matchAll(/<span(?: class="([^"]*)")? data-at="([\d.]+)">([^<]*)<\/span>/g)].map((m) => [m[1] || '', Number(m[2]), m[3]]);
  const live = ax(Dash.lanes.html([{ label: 'a' }], { from: now - d, to: now, ticks: 4 }));
  assert.deepEqual(live.map((x) => x[0]), ['start', 'minor', '', 'minor', 'end major']);
  assert.deepEqual(live.map((x) => x[1]), [0, 25, 50, 75, 100]);
  assert.equal(live[4][2], 'now');
  assert.match(live[0][2], /^\d\d:\d\d$/);
  const past = ax(Dash.lanes.html([{ label: 'a' }], { from: now - 10 * d, to: now - 4 * d, ticks: 2 }));
  assert.equal(past.length, 3);
  assert.equal(past[2][2], fmt.date(now - 4 * d)); // over a day, ended before: dates, and no "now"
  assert.deepEqual(ax(Dash.lanes.html([{ label: 'a' }], { from: now - 3 * d, to: now })).map((x) => x[2]), ['−72 h', '−54 h', '−36 h', '−18 h', 'now']);
  assert.deepEqual(ax(Dash.lanes.html([{ label: 'a' }], { from: now - 10 * d, to: now })).map((x) => x[2]), ['−10 d', '−7.5 d', '−5 d', '−2.5 d', 'now']);
  const seen = [];
  const custom = ax(Dash.lanes.html([{ label: 'a' }], { from: 0, to: 3 * h, ticks: 3, axis: (t, i, n) => (seen.push([t, i, n]), `<${i}>`) }));
  assert.deepEqual(seen, [[0, 0, 3], [h, 1, 3], [2 * h, 2, 3], [3 * h, 3, 3]]);
  assert.deepEqual(custom.map((x) => x[2]), ['&lt;0&gt;', '&lt;1&gt;', '&lt;2&gt;', '&lt;3&gt;']);
  assert.doesNotMatch(Dash.lanes.html([{ label: 'a' }], { ticks: 0 }), /lane-axis/);

  const html = Dash.lanes.html([
    { label: '<b>', sub: '"t"', spans: [{ from: now - h, to: now - h / 2, title: 'run <1>', tone: 'ok"' }], marks: [{ at: now - 2 * h, title: "it's <i>", tone: 'warn' }] },
    { label: 'many', marks: Array.from({ length: 10 }, (_, i) => ({ at: now - (i + 1) * h, title: 'e' + i })) },
    { label: 'own words', say: 'said <so>', marks: [{ at: now - h }] },
  ], { labelWidth: '9em"', nouns: { span: 'load test', mark: 'incident' } });
  assert.match(html, /^<div class="lanes" data-label-width="9em&quot;">/);
  assert.match(Dash.lanes.html([{ label: 'a' }], { labelWidth: 120 }), /^<div class="lanes" data-label-width="120px">/); // a number is pixels
  assert.match(html, /<div class="lane-label">&lt;b&gt; <span>· &quot;t&quot;<\/span><\/div>/);
  assert.match(html, /aria-label="&lt;b&gt; \(&quot;t&quot;\): 1 load test, 1 incident: it&#39;s &lt;i&gt;; run &lt;1&gt;"/); // in time order
  assert.match(html, /<span class="span ok&quot;" data-at="[\d.]+" data-len="[\d.]+" data-tooltip="run &lt;1&gt;">/);
  assert.match(html, /<span class="mark warn" data-at="[\d.]+" data-tooltip="it&#39;s &lt;i&gt;">/);
  assert.match(html, /aria-label="many: 0 load tests, 10 incidents: e9; e8; e7; e6; e5; e4; e3; e2; and 2 more"/);
  assert.match(html, /aria-label="said &lt;so&gt;"/);
  assert.match(Dash.lanes.html([{ label: 'a', marks: [{ at: now - h }] }]), /data-tooltip="[A-Z][a-z]{2} \d+, \d\d:\d\d"/); // no title: its time
  assert.equal(Dash.lanes.html([], { empty: 'None <yet>' }), '<p class="empty">None &lt;yet&gt;</p>');
  assert.equal(Dash.lanes.html([{ label: 'a' }], { from: now, to: now - h }), '<p class="empty">Nothing yet</p>');
});

// what the sizing builders wrote in 1.5.0, byte for byte: with Dash.config.csp off they must still write exactly this
const SIZED_150 = {
  bar: "<span class=\"bar thin ok\" title=\"a &lt;b&gt;\"><i style=\"width:42.5%\"></i></span>",
  barOver: "<span class=\"bar\"><i style=\"width:100%\"></i></span>",
  meter: "<span class=\"meter warn\"><i style=\"width:30%\"></i></span>",
  split: "<div class=\"split\"><i class=\"ok\" style=\"width:75%\" title=\"up\"></i><i class=\"bad\" style=\"width:25%\"></i><i class=\"\" style=\"width:0%\"></i></div>",
  bars: "<div class=\"chart\" data-read><div class=\"chart-read\" data-default=\"Total\">Total</div><div class=\"chart-plot\" style=\"--chart-h:120px\"><div class=\"chart-grid\" style=\"top:50%\"><span>2.5</span></div><div class=\"chart-grid\" style=\"top:0%\"><span>5</span></div><div class=\"chart-cols\"><div class=\"chart-col\" title=\"a: 3\"><i style=\"height:60%\"></i></div><div class=\"chart-col zero\" title=\"b: 0\"><i style=\"height:0%\"></i></div><div class=\"chart-col partial stacked\" title=\"c: 3.5\"><i style=\"height:70%\"><u class=\"ok\" style=\"flex-grow:2\"></u><u class=\"warn\" style=\"flex-grow:1.5\"></u></i></div></div></div><div class=\"chart-x\"><span class=\"start\"><b>a</b></span><span class=\"\"><b>b</b></span><span class=\"end\"><b>c</b></span></div></div>",
  spark: "<div style=\"position:relative\"><svg class=\"spark teal\" viewBox=\"0 0 240 56\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><path class=\"area\" d=\"M4.0 52.0 L81.3 28.0 L158.7 40.0 L236.0 4.0 L236.0 56 L4.0 56 Z\"></path><path class=\"line\" d=\"M4.0 52.0 L81.3 28.0 L158.7 40.0 L236.0 4.0\"></path></svg><span class=\"dot teal\" style=\"position:absolute;left:calc(98.33% - 3.5px);top:calc(7.14% - 3.5px);width:7px;height:7px\"></span></div><div class=\"spark-labels\"><span>then</span><span>now</span></div>",
  sparkOne: "<div style=\"position:relative\"><svg class=\"spark\" viewBox=\"0 0 240 56\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><path class=\"area\" d=\"M120.0 52.0 L120.0 56 L120.0 56 Z\"></path><path class=\"line\" d=\"M120.0 52.0\"></path></svg><span class=\"dot blue\" style=\"position:absolute;left:calc(50.00% - 3.5px);top:calc(92.86% - 3.5px);width:7px;height:7px\"></span></div>",
  hbars: "<div class=\"hbars\"><div class=\"hbar\"><span class=\"hbar-label\"><span>x</span></span><span class=\"bar\"><i style=\"width:100%\"></i></span><span class=\"hbar-value\">2</span></div><div class=\"hbar bad\"><span class=\"hbar-label\"><span>y</span></span><span class=\"bar\"><i style=\"width:50%\"></i></span><span class=\"hbar-value\">1</span></div></div>",
};
const sizedNow = () => ({
  bar: Dash.bar(0.425, 'ok', { title: 'a <b>', cls: 'thin' }),
  barOver: Dash.bar(1.7),
  meter: Dash.meter(0.3, 'warn'),
  split: Dash.split([{ value: 3, tone: 'ok', label: 'up' }, { value: 1, tone: 'bad' }, { value: 0 }]),
  bars: Dash.bars([{ label: 'a', value: 3 }, { label: 'b', value: 0 }, { label: 'c', parts: [{ value: 2, tone: 'ok' }, { value: 1.5, tone: 'warn' }], partial: true }], { height: 120, ticks: 2, read: 'Total' }),
  spark: Dash.spark([1, 3, 2, 5], { tone: 'teal', labels: ['then', 'now'] }),
  sparkOne: Dash.spark([4]),
  hbars: Dash.hbars([{ label: 'x', value: 2 }, { label: 'y', value: 1, tone: 'bad' }]),
});

test('1.6: with Dash.config.csp off (the default) the sizing builders write exactly what 1.5.0 did', () => {
  assert.equal(Dash.config.csp, false);
  assert.deepEqual(sizedNow(), SIZED_150);
});

test('1.6: with Dash.config.csp on they write numbers in data-css-* and no style=""', () => {
  Dash.config.csp = true;
  try {
    const now = sizedNow();
    for (const [k, html] of Object.entries(now)) assert.doesNotMatch(html, /style=/, k);
    const attrs = (html) => [...html.matchAll(/(data-css-[a-z-]+)="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`);
    assert.deepEqual(attrs(now.bar), ['data-css-w=42.5']);
    assert.deepEqual(attrs(now.barOver), ['data-css-w=100']);
    assert.deepEqual(attrs(now.meter), ['data-css-w=30']);
    assert.deepEqual(attrs(now.split), ['data-css-w=75', 'data-css-w=25', 'data-css-w=0']);
    assert.deepEqual(attrs(now.bars), ['data-css-chart-h=120', 'data-css-top=50', 'data-css-top=0', 'data-css-h=60', 'data-css-h=0', 'data-css-h=70', 'data-css-grow=2', 'data-css-grow=1.5']);
    assert.deepEqual(attrs(now.spark), ['data-css-x=98.33', 'data-css-y=7.14']);
    assert.match(now.spark, /^<div class="spark-box"><svg /);
    assert.deepEqual(attrs(now.hbars), ['data-css-w=100', 'data-css-w=50']);
    // the rest of the markup is the same: only the sizes moved
    const bare = (html) => html.replace(/ (style|data-css-[a-z-]+)="[^"]*"/g, '').replace(' class="spark-box"', '');
    for (const k of Object.keys(now)) assert.equal(bare(now[k]), bare(SIZED_150[k]), k);
    // the stylesheet holds what the sparkline's style="" did
    assert.match(css, /\.spark-box \{ position: relative; \}/);
    assert.match(css, /\.spark-box > \.dot \{ position: absolute; width: 7px; height: 7px; \}/);
  } finally {
    Dash.config.csp = false;
  }
});

// ---- dash-utils.css (1.7)
test('1.7: dash-utils.css is exactly what tools/utils.mjs writes', () => {
  assert.ok(gen.generate().css === utils, 'dash-utils.css is out of date: run node tools/utils.mjs');
});

// the class names in the kit's real selectors (comments and declarations left out), and the ones dash.js writes
const kitClasses = () => {
  const out = new Set();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let buf = '';
  for (const ch of bare) {
    if (ch === '{') { if (!/^\s*@(media|container|supports|keyframes)/.test(buf)) for (const m of buf.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1]); buf = ''; }
    else if (ch === '}' || ch === ';') buf = '';
    else buf += ch;
  }
  const js = readFileSync(new URL('dash.js', kit), 'utf8');
  for (const [, list] of js.matchAll(/class="([^"]*)"/g)) for (const c of list.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(c)) out.add(c);
  for (const [, c] of js.matchAll(/classList\.(?:add|remove|toggle|contains)\('([^']+)'/g)) out.add(c);
  return out;
};
test('1.7: no utility has the name of a kit class, but block, fixed and sticky, which skip the one piece that uses them', () => {
  const kitNames = kitClasses();
  assert.ok(kitNames.has('btn') && kitNames.has('panel') && kitNames.has('chart-col') && kitNames.has('copied'), 'the kit classes were read');
  const plain = [...utilNames].filter((n) => !n.includes(':'));
  assert.ok(plain.length > 1000, 'the utility names were read');
  assert.deepEqual(plain.filter((n) => kitNames.has(n)).sort(), ['block', 'fixed', 'sticky']);
  // and the kit uses each of those only on that one piece, which the utility skips
  const keep = { block: 'btn', fixed: 'stats', sticky: 'table' };
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [n, piece] of Object.entries(keep)) {
    for (const m of bare.matchAll(new RegExp(`[\\w.:-]*\\.${n}(?![\\w-])[\\w.:-]*`, 'g'))) assert.ok(m[0].includes('.' + piece), `.${n} in the kit's ${m[0]}`);
    assert.match(utils, new RegExp(`^\\.${n}:not\\(\\.${piece}\\):not\\(#\\\\#\\) \\{`, 'm'));
  }
});
test('1.7: dash-utils.css stays small enough to load on every page', () => {
  assert.ok(utils.length <= 240_000, `${utils.length} bytes`);
  assert.ok(gzipSync(utils, { level: 9 }).length <= 30_000, `${gzipSync(utils, { level: 9 }).length} bytes gzipped`);
});
test('1.7: every utility rule beats the kit (:not(#\\#)), one class per rule, no class twice', () => {
  const rules = utils.split('\n').filter((l) => /\{ .*; \}$/.test(l));
  assert.ok(rules.every((l) => l.includes(':not(#\\#)')), rules.find((l) => !l.includes(':not(#\\#)')));
  const seen = new Map();
  for (const l of rules) {
    const sel = l.trim().replace(/ \{.*$/, '');
    assert.ok(!seen.has(sel), `twice: ${sel}`);
    seen.set(sel, true);
  }
});
test('1.7: shorthands before their parts, and the variants in order (states, then max-md, max-sm, sm, md, lg, xl, dark, print)', () => {
  const at = (n) => { const i = utils.indexOf(`.${n.replace(/[^\w-]/g, (c) => '\\' + c)}:not(`); assert.ok(i >= 0, n); return i; };
  const before = [['p-4', 'px-2'], ['px-2', 'pt-1'], ['m-4', '-m-2'], ['-m-2', 'mx-4'], ['mx-4', 'mt-2'], ['inset-0', 'inset-x-0'], ['inset-x-0', 'top-2'],
    ['overflow-hidden', 'overflow-x-auto'], ['overflow-x-auto', 'overflow-y-hidden'], ['gap-px', 'gap-x-0'], ['place-items-center', 'items-start'],
    ['place-items-center', 'justify-items-start'], ['place-content-center', 'justify-start'], ['place-self-center', 'self-start'], ['size-4', 'w-8'], ['size-4', 'h-8'],
    ['border-2', 'border-t'], ['border', 'border-blue'], ['border-t', 'border-blue'], ['rounded-full', 'rounded-t-none'], ['flex-1', 'basis-1/2'],
    ['text-sm', 'leading-tight'], ['truncate', 'whitespace-normal'], ['shadow', 'ring-2'], ['bg-blue', 'bg-blue/10'],
    ['p-4', 'hover:bg-soft'], ['hover:bg-soft', 'max-md:hidden'], ['max-md:hidden', 'max-sm:hidden'], ['max-sm:hidden', 'sm:hidden'], ['sm:p-4', 'md:p-4'],
    ['md:p-4', 'lg:p-4'], ['lg:p-4', 'xl:p-4'], ['md:p-4', 'md:px-2'], ['xl:p-4', 'dark:hidden'], ['dark:hidden', 'print:hidden']];
  for (const [a, b] of before) assert.ok(at(a) < at(b), `${a} comes before ${b}`);
});
test('1.7: the widths are the kit\'s own: sm from 641 px, md from 901 px; max-sm up to 640, max-md up to 900', () => {
  assert.match(utils, /\/\* ---- sm: \(min-width: 641px\) ---- \*\/\n@media \(min-width: 641px\) \{/);
  assert.match(utils, /@media \(min-width: 901px\) \{\n  \.md\\:block/);
  assert.match(utils, /@media \(max-width: 640px\) \{\n  \.max-sm\\:block/);
  assert.match(utils, /@media \(max-width: 900px\) \{\n  \.max-md\\:block/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
});
test('1.7: dark: follows both ways the kit turns dark, and colours come from the kit\'s tokens', () => {
  assert.match(utils, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \.dark\\:block:not\(#\\#\) \{ display: block; \}/);
  assert.match(utils, /^:root\[data-theme="dark"\] \.dark\\:block:not\(#\\#\) \{ display: block; \}$/m);
  const tokens = [...css.match(/^:root \{([\s\S]*?)\n\}/m)[1].matchAll(/--([a-z]+):\s*#/g)].map((m) => m[1]);
  for (const t of tokens) {
    assert.match(utils, new RegExp(`^\\.text-${t}:not\\(#\\\\#\\) \\{ color: var\\(--${t}\\); \\}$`, 'm'), `text-${t}`);
    assert.match(utils, new RegExp(`^\\.bg-${t}:not\\(#\\\\#\\) \\{ background-color: var\\(--${t}\\); \\}$`, 'm'), `bg-${t}`);
  }
  // no colour written in the file but black and white
  assert.deepEqual([...new Set(utils.match(/#[0-9a-f]{3,8}\b/gi))].sort(), ['#000', '#fff']);
});

// ---- 1.8 components
test('1.8: the new builders escape their text and never write a link that runs script', () => {
  const bad = '<b>"x"</b>';
  for (const html of [
    Dash.crumbs([{ label: bad, href: '/a' }, bad]), Dash.stepper([bad, { label: bad, sub: bad }], 1), Dash.avatar(bad), Dash.avatar(bad, { src: '/p.png' }),
    Dash.avatars([bad, bad, bad, bad, bad, bad]), Dash.progress(0.5, { label: bad, value: bad, title: bad }), Dash.progressCircle(0.5, { text: bad, label: bad }),
    Dash.slider({ label: bad, name: bad, unit: bad, value: 3 }), Dash.entries([{ title: bad, s: bad }], { sub: 's', end: () => '<i>end</i>', key: 'title' }),
  ]) {
    assert.doesNotMatch(html, /<b>"x"/, html);
  }
  for (const h of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:x', 'data:text/html,x', 'vbscript:x']) {
    assert.match(Dash.crumbs([{ label: 'a', href: h }, 'b']), /href="#"/, h);
    assert.match(Dash.entries([{ title: 'a' }], { href: () => h }), /href="#"/, h);
    assert.match(Dash.avatar('a', { src: h }), /src="#"/, h);
  }
  assert.match(Dash.crumbs([{ label: 'a', href: '/fleet?x=1&y=2' }, 'b']), /href="\/fleet\?x=1&amp;y=2"/);
  assert.match(Dash.avatar('a', { src: 'data:image/png;base64,iVBOR' }), /src="data:image\/png;base64,iVBOR"/); // a picture in the page
  assert.match(Dash.avatar('a', { src: 'data:image/svg+xml,%3Csvg%3E' }), /src="data:image\/svg\+xml,%3Csvg%3E"/);
  assert.match(Dash.crumbs([{ label: 'a', href: 'data:image/png;base64,iVBOR' }, 'b']), /href="#"/); // but never as a link
  assert.match(Dash.entries([{ title: 'a' }], { href: () => 'https://example.com/a' }), /href="https:\/\/example.com\/a"/);
});

test('1.8: breadcrumbs and stepper say where the reader is', () => {
  const c = Dash.crumbs([{ label: 'Home', href: '/' }, { label: 'Fleet', href: '/fleet' }, 'eu-west']);
  assert.equal(c, '<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/fleet">Fleet</a></li><li><span aria-current="page">eu-west</span></li></ol></nav>');
  const s = Dash.stepper(['Account', { label: 'Plan', sub: 'Pro' }, 'Pay', { label: 'Done', failed: true }], 1, { tone: 'ok' });
  assert.equal((s.match(/class="done"/g) || []).length, 1);
  assert.equal((s.match(/aria-current="step"/g) || []).length, 1);
  assert.match(s, /^<ol class="stepper ok" aria-label="Steps"><li class="done"><span>Account<span class="sr-only">, done<\/span><\/span><\/li><li aria-current="step"><span>Plan<small>Pro<\/small>/);
  assert.match(s, /<li class="failed"><span>Done<span class="sr-only">, failed<\/span>/);
  assert.match(Dash.stepper(['a', 'b'], 0, { vertical: true }), /^<ol class="stepper vertical"/);
  assert.doesNotMatch(Dash.stepper(['a', 'b'], 2), /aria-current/); // past the last: all done
});

test('1.8: avatars: initials, a steady colour per name, pictures, and "+N"', () => {
  const ini = (n) => Dash.avatar(n).match(/>([^<]*)<\/span>$/)[1];
  assert.equal(ini('Ada Lovelace'), 'AL');
  assert.equal(ini('grace brewster hopper'), 'GH');
  assert.equal(ini('linus'), 'LI');
  assert.equal(ini('x'), 'X');
  assert.equal(ini('mary-ann.o'), 'MO');
  assert.equal(ini(''), '?');
  assert.equal(ini('😀 Smile'), '😀S');
  assert.equal(Dash.avatar('Ada Lovelace'), Dash.avatar('Ada Lovelace'));
  const tones = new Set(['Ada', 'Grace', 'Linus', 'Ken', 'Barbara', 'Margaret', 'Edsger', 'Donald'].map((n) => Dash.avatar(n).match(/class="avatar ([a-z]+)"/)[1]));
  assert.ok(tones.size >= 4, [...tones].join());
  assert.match(Dash.avatar('Ada', { tone: 'teal', size: 'lg', square: true }), /^<span class="avatar lg square teal" role="img" aria-label="Ada" title="Ada">AD<\/span>$/);
  assert.match(Dash.avatar('Ada', { src: '/a.png' }), /^<span class="avatar [a-z]+" title="Ada"><img src="\/a.png" alt="Ada"><\/span>$/);
  const g = Dash.avatars(['A', 'B', 'C', 'D', 'E', 'F'], { max: 4 });
  assert.equal((g.match(/class="avatar /g) || []).length, 4); // three, then "+3"
  assert.match(g, /<span class="avatar extra" title="D, E, F">\+3<\/span><\/span>$/);
  assert.match(g, /^<span class="avatars" role="group" aria-label="A, B, C, D, E, F">/);
  assert.doesNotMatch(Dash.avatars(['A', 'B', 'C', 'D'], { max: 4 }), /extra/);
});

test('1.8: progress: a share, or running while unknown; the circle as SVG attributes; strict mode writes no style=""', () => {
  assert.equal(Dash.progress(0.4), '<div class="progress" role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100" aria-label="Progress"><i style="width:40%"></i></div>');
  assert.equal(Dash.progress(1.7).match(/aria-valuenow="(\d+)"/)[1], '100');
  assert.equal(Dash.progress(null, { label: 'Waiting' }), '<div class="progress-head"><span>Waiting</span></div><div class="progress indeterminate" role="progressbar" aria-label="Waiting"><i></i></div>');
  assert.match(Dash.progress(0.25, { label: 'Uploading', value: '1 of 4', tone: 'ok', lg: true }), /^<div class="progress-head"><span>Uploading<\/span><b>1 of 4<\/b><\/div><div class="progress lg ok"/);
  assert.match(Dash.progress(0.25, { label: 'Up' }), /<b>25%<\/b>/);
  const c = Dash.progressCircle(0.4, { size: 48, text: '40%' });
  assert.match(c, /^<span class="progress-circle" role="progressbar" aria-valuenow="40" /);
  assert.match(c, /<svg viewBox="0 0 36 36" width="48" height="48" aria-hidden="true">/);
  assert.match(c, /stroke-dasharray="40 100"/);
  assert.match(Dash.progressCircle(null), /class="progress-circle indeterminate"/);
  assert.match(Dash.progressCircle(0.4, { size: 'x' }), /width="36"/);
  assert.doesNotMatch(c, /style=/);
  Dash.config.csp = true;
  try {
    const p = Dash.progress(0.4);
    assert.doesNotMatch(p, /style=/);
    assert.match(p, /<i data-css-w="40"><\/i>/);
  } finally {
    Dash.config.csp = false;
  }
});

test('1.8: slider and entries', () => {
  assert.equal(Dash.slider({ label: 'Volume', name: 'vol', min: 0, max: 10, step: 0.5, value: 4, unit: ' dB' }),
    '<label class="slider"><span>Volume</span><input type="range" name="vol" min="0" max="10" step="0.5" value="4" data-unit=" dB"><output>4 dB</output></label>');
  assert.match(Dash.slider({ name: 'vol' }), /aria-label="vol"/);
  assert.match(Dash.slider({ disabled: true }), / disabled><output>0<\/output>/);
  const rows = [{ id: 7, name: 'eu-west', region: 'Frankfurt' }, { id: 8, name: 'us-east', region: '' }];
  const e = Dash.entries(rows, { title: 'name', sub: 'region', lead: (r) => Dash.avatar(r.name, { size: 'sm' }), end: (r) => `#${r.id}`, key: 'id' });
  assert.match(e, /^<ul class="entries"><li class="entry" data-key="7"><span class="entry-lead"><span class="avatar sm /);
  assert.match(e, /<span class="entry-title">eu-west<\/span><span class="entry-sub">Frankfurt<\/span><\/span><span class="entry-end">#7<\/span><\/li>/);
  assert.match(e, /<span class="entry-title">us-east<\/span><\/span>/); // no empty second line
  assert.match(Dash.entries(rows, { title: 'name', href: (r) => '#/' + r.id }), /<li><a class="entry" href="#\/7">/);
  assert.match(Dash.entries(rows, { title: (r) => r.name.toUpperCase(), button: true, key: 'id', wrap: true }), /^<ul class="entries wrap"><li><button type="button" class="entry" data-key="7"><span class="entry-text"><span class="entry-title">EU-WEST/);
  assert.equal(Dash.entries([], { empty: 'No servers' }), '<div class="empty">No servers</div>');
});

test('1.9: Dash.combobox and Dash.datepicker are there, and do nothing without a page', () => {
  assert.equal(typeof Dash.combobox, 'function');
  assert.equal(typeof Dash.datepicker, 'function');
  assert.equal(Dash.combobox('nowhere', { options: ['a'] }), null);
  assert.equal(Dash.datepicker('nowhere'), null);
});

// ---- the docs site (docs-src/ → docs/ by tools/docs.mjs)

const docsGen = await import(new URL('tools/docs.mjs', root).href);
const docsDir = new URL('docs/', root);
const docsPages = readdirSync(docsDir).filter((f) => f.endsWith('.html'));

test('docs: docs/ is exactly what tools/docs.mjs writes', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('tools/docs.mjs', root)), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `run node tools/docs.mjs: ${r.stdout}${r.stderr}`);
});

test('docs: every dash.css class and every Dash function is named on some page', () => {
  const named = new Set(docsGen.build().terms.map((t) => t.name));
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '{}');
  const classes = [...new Set([...bare.matchAll(/\.(-?[a-zA-Z][\w-]*)/g)].map((m) => '.' + m[1]))];
  const fns = [
    ...Object.keys(Dash).filter((k) => typeof Dash[k] === 'function').map((k) => 'Dash.' + k),
    ...['fmt', 'hash', 'theme', 'store'].flatMap((o) => Object.keys(Dash[o]).filter((k) => typeof Dash[o][k] === 'function').map((k) => `Dash.${o}.${k}`)),
  ];
  assert.deepEqual([...classes, ...fns].filter((n) => !named.has(n)), []);
});

test('docs: every class the pages use is in dash.css, dash-utils.css or docs.css', () => {
  const docsCss = readFileSync(new URL('docs.css', docsDir), 'utf8');
  const defined = new Set([css, docsCss].flatMap((t) => [...t.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])).concat([...utilNames]));
  const missing = [];
  for (const file of [...docsPages, 'docs.js']) {
    const text = readFileSync(new URL(file, docsDir), 'utf8');
    for (const [, list] of text.matchAll(file.endsWith('.js') ? /className\s*=\s*'([^']*)'/g : /class="([^"]*)"/g)) {
      for (const c of list.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        if (/^-?[a-zA-Z][\w:/.-]*$/.test(c) && !defined.has(c)) missing.push(`docs/${file}: .${c}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('docs: links between pages go to pages and sections that exist', () => {
  const ids = Object.fromEntries(docsPages.map((f) => [f, new Set([...readFileSync(new URL(f, docsDir), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
  const bad = [];
  for (const f of docsPages) {
    for (const [, href] of readFileSync(new URL(f, docsDir), 'utf8').matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      const target = path === '' ? f : path === './' ? 'index.html' : path;
      if (!ids[target]) bad.push(`${f}: ${href} (no page)`);
      else if (hash && !ids[target].has(hash)) bad.push(`${f}: ${href} (no section)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('docs: one <h1>, a title and a description per page; section ids are unique', () => {
  for (const f of docsPages) {
    const s = readFileSync(new URL(f, docsDir), 'utf8');
    const main = s.slice(s.indexOf('<main')).replace(/<figure class="example[\s\S]*?<\/figure>/g, ''); // an example may be a page with its own h1
    assert.equal((main.match(/<h1\b/g) || []).length, 1, `${f}: one h1 in the content`);
    assert.match(s, /<title>[^<]+<\/title>/, f);
    assert.match(s, /<meta name="description" content="[^"]+">/, f);
    const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], `${f}: repeated ids`);
  }
});
