/* dash-ui 1.18.2 helpers: formatting, small HTML builders, charts, toasts, fetch and polling for the dashboards.
   A plain script with no dependencies: a script tag for dash.js in <head> gives window.Dash, and puts the
   saved light/dark choice on the page before it paints. In Node, require('./dash.js') returns the same object
   (the parts that need a page are skipped). MIT licence, (c) 2026 Smart Guy, https://github.com/smartguy0505/dash-ui

   House idiom: builders return HTML strings with every value escaped; pages put them in with innerHTML and
   handle clicks with one listener on a parent (data- attributes say what was clicked). */
(function (root) {
  'use strict';
  const hasDom = typeof document !== 'undefined';
  const Dash = { version: '1.18.2', config: { loginUrl: null, themeKey: 'dash.theme', sideKey: 'dash.side', privacyKey: 'dash.private', csp: false } };

  // ---- basics

  const NONE = '—';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isNum = (n) => n != null && n !== '' && typeof n !== 'boolean' && Number.isFinite(Number(n));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  Dash.esc = esc;
  Dash.isNum = isNum;
  Dash.$ = (id) => (hasDom ? document.getElementById(id) : null);
  const el = (x) => (typeof x === 'string' ? Dash.$(x) : x);

  // One listener on a parent for clicks (or any event) on matching children: Dash.on(list, 'click', '[data-act]', (e, btn) => …)
  Dash.on = (parent, type, selector, fn) => {
    el(parent).addEventListener(type, (e) => {
      const hit = e.target.closest && e.target.closest(selector);
      if (hit && el(parent).contains(hit)) fn(e, hit);
    });
  };

  // localStorage that never throws (private windows, blocked storage); values are JSON
  Dash.store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
    },
  };

  // A time from whatever the server sent, as milliseconds (NaN if it isn't one): milliseconds, a Date, an ISO
  // string, or seconds with { seconds: true }. A string with no time zone ("2026-11-21 14:05:00", the way many
  // servers write UTC) is read as UTC, not as the browser's local time. Other text is NaN.
  Dash.time = (x, { seconds = false } = {}) => {
    if (x == null || x === '' || typeof x === 'boolean') return NaN;
    if (x instanceof Date) return x.getTime();
    if (isNum(x)) return Number(x) * (seconds ? 1000 : 1);
    let str = String(x).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(str)) str = str.replace(' ', 'T') + 'Z';
    // only real timestamps: ISO 8601 or an HTTP date (the browser's own parser takes almost any text as some date)
    const iso = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;
    const http = /^([A-Z][a-z]{2}, )?\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}(:\d{2})? (GMT|UTC|[+-]\d{4})$/;
    return iso.test(str) ? Date.parse(str.replace(' ', 'T')) : http.test(str) ? Date.parse(str) : NaN;
  };

  // ---- numbers and times. null, undefined, '' and NaN print as "—". Times are in milliseconds.

  const fmt = {};
  const minus = (s) => s.replace(/^-/, '−');
  fmt.num = (n, d = 0) => (isNum(n) ? minus(Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })) : NONE);
  fmt.int = (n) => fmt.num(n, 0);
  // 2.5, 950, 1.2k, 15k, 3.4M, 1.1B: one decimal under 10 of each unit, whole numbers above
  fmt.compact = (n) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    const a = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (a < 9.95) return sign + a.toFixed(1).replace(/\.0$/, '');
    if (a < 999.5) return sign + Math.round(a);
    const units = [[1e3, 'k'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T']];
    for (let i = 0; i < units.length; i++) {
      const [div, unit] = units[i];
      const x = a / div;
      const s = x < 9.95 ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x));
      if (Number(s) < 1000 || i === units.length - 1) return sign + s + unit;
    }
    return sign + a; // not reached
  };
  // $1,234 from $100 up, $12.34 below
  fmt.usd = (n, d) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    const digits = d ?? (Math.abs(v) >= 100 ? 0 : 2);
    return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  // a percentage given as 0–100
  fmt.pct = (n, d = 1) => (isNum(n) ? fmt.num(n, d) + '%' : NONE);
  // a share of a total (0–100), short: 100%, 12%, 1.5%, <0.1%, 0%
  fmt.share = (n) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    return v >= 99.95 ? '100%' : v >= 9.95 ? v.toFixed(0) + '%' : v >= 0.05 ? v.toFixed(1) + '%' : v > 0 ? '<0.1%' : '0%';
  };
  // a token amount with fixed decimals: 0, <0.0001, 1.2345
  fmt.amount = (n, d = 4) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    if (v === 0) return '0';
    if (Math.abs(v) < 10 ** -d) return (v < 0 ? '−' : '') + '<' + (10 ** -d).toFixed(d);
    return fmt.num(v, d);
  };
  // a signed change: +1.2345, −0.0100, and 0 below half the last digit
  fmt.signed = (n, d = 4) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    if (Math.abs(v) < 0.5 * 10 ** -d) return '0';
    return (v > 0 ? '+' : '−') + fmt.num(Math.abs(v), d);
  };
  // a signed dollar change: +$733, −$12.35; d fixes the decimals (fmt.signedUsd(732.6, 2) → +$732.60)
  fmt.signedUsd = (n, d) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    if (Math.abs(v) < 0.5 * 10 ** -(d ?? 2)) return fmt.usd(0, d ?? 2);
    return (v > 0 ? '+' : '−') + fmt.usd(Math.abs(v), d);
  };
  // 'up', 'down' or 'flat': the tone class for a change
  fmt.dir = (n, eps = 0) => (!isNum(n) || Math.abs(n) <= eps ? 'flat' : n > 0 ? 'up' : 'down');
  // abcdef…uvwxyz
  fmt.short = (s, head = 6, tail = 6) => {
    s = String(s ?? '');
    return s.length > head + tail + 2 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
  };
  // a duration, compact: 45s, 12m, 3h 5m, 2d 4h
  fmt.dur = (ms) => {
    if (!isNum(ms)) return NONE;
    const sec = Math.max(0, Math.floor(ms / 1000));
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
    return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
  };
  // a duration in words: 45 s, 12 min, 2.7 h, 3.2 d
  fmt.span = (ms) => {
    if (!isNum(ms)) return NONE;
    const s = Math.max(0, ms / 1000);
    if (s < 90) return Math.round(s) + ' s';
    if (s < 5400) return Math.round(s / 60) + ' min';
    if (s < 129600) return (s / 3600).toFixed(1) + ' h';
    return (s / 86400).toFixed(1) + ' d';
  };
  // how long ago a time was: just now, 40 s ago, 12 min ago, 2.5 h ago, 3 d ago
  fmt.ago = (t, now = Date.now()) => {
    if (!isNum(t)) return NONE;
    const s = Math.max(0, (now - t) / 1000);
    if (s < 5) return 'just now';
    if (s < 90) return Math.round(s) + ' s ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 129600) return (s / 3600).toFixed(1) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  };
  const dateOf = (t) => (t instanceof Date ? t : new Date(typeof t === 'string' && !isNum(t) ? t : Number(t)));
  const valid = (d) => !Number.isNaN(d.getTime());
  // local wall-clock time: 14:05
  fmt.clock = (t) => {
    const d = dateOf(t);
    return t == null || !valid(d) ? NONE : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  };
  // a moment in UTC, the way the CLIs print it: Nov 21, 02:22 UTC
  fmt.utc = (t) => {
    const d = dateOf(t);
    if (t == null || !valid(d)) return NONE;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }) + ' UTC';
  };
  // local date and time: Nov 21, 14:05
  fmt.when = (t) => {
    const d = dateOf(t);
    if (t == null || !valid(d)) return NONE;
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  };
  // fmt.date and fmt.time read t as Dash.time does (text without a zone is UTC; other text is "—"). The older
  // clock, when and utc read text the browser's way, as they always have.
  // a date: Nov 21 (this year), Nov 21, 2025 (another year); { utc: true } for the date in UTC
  fmt.date = (t, { utc = false } = {}) => {
    const ms = Dash.time(t);
    if (!Number.isFinite(ms)) return NONE;
    const d = new Date(ms);
    const year = utc ? d.getUTCFullYear() : d.getFullYear();
    return d.toLocaleDateString(utc ? 'en-US' : [], { month: 'short', day: 'numeric', ...(year !== new Date().getFullYear() ? { year: 'numeric' } : {}), ...(utc ? { timeZone: 'UTC' } : {}) });
  };
  // a time of day with seconds: 14:05:09; { seconds: false } for 14:05, { utc: true } for 14:05:09 UTC
  fmt.time = (t, { seconds = true, utc = false } = {}) => {
    const ms = Dash.time(t);
    if (!Number.isFinite(ms)) return NONE;
    const d = new Date(ms);
    return d.toLocaleTimeString(utc ? 'en-US' : [], { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23', ...(utc ? { timeZone: 'UTC' } : {}) }) + (utc ? ' UTC' : '');
  };
  // how long until a time: in 45s, in 12m, in 3h 5m, in 2d 4h; "now" once it's here
  fmt.until = (t, now = Date.now()) => (!isNum(t) ? NONE : t - now < 1000 ? 'now' : 'in ' + fmt.dur(t - now));
  fmt.plural = (n, word, many = word + 's') => `${fmt.int(n)} ${Number(n) === 1 ? word : many}`;
  Dash.fmt = fmt;

  // ---- small HTML builders (all escape their text)

  const toneClass = (tone) => (tone ? ' ' + esc(tone) : '');
  Dash.pill = (text, tone, { dot = true, title } = {}) =>
    `<span class="pill${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}>${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
  Dash.tag = (text, tone, { title } = {}) => `<span class="tag${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  // a signed change in its colour: Dash.chg(1.5, '+1.5 GB')
  // eps: changes this small count as flat; title: a tooltip (e.g. what the change is made of)
  Dash.chg = (v, text = fmt.signed(v), { eps = 0, title } = {}) =>
    `<span class="chg ${fmt.dir(v, eps)}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  // a medal for the top three, a plain rank below: Dash.rank(2, 14) → "#2 of 14"
  Dash.rank = (pos, of, { title } = {}) => {
    if (!pos) return `<span class="rank"${title ? ` title="${esc(title)}"` : ''}>unranked</span>`;
    const medal = ['', ' gold', ' silver', ' bronze'][pos] || '';
    return `<span class="rank${medal}"${title ? ` title="${esc(title)}"` : ''}>#${esc(pos)}${of ? `<span>of ${esc(of)}</span>` : ''}</span>`;
  };
  // a button that copies text (dash.js handles the click). It says "Copied ✓" for a moment, also when the page
  // re-renders it in that moment. quiet: no "Copied" toast, the button alone says it.
  const COPY_MS = 1400;
  let lastCopy = { text: null, until: 0 };
  // A stat tile: Dash.stat('p95 latency', 41, { unit: 'ms', note: 'target 60 ms', tone: Dash.tone(41, { 60: 'bad' }, '') })
  // value is shown as given (format it first); tone colours the value; html: true when value is markup.
  Dash.stat = (label, value, { note, unit, tone, title, html = false } = {}) =>
    `<div class="stat"${title ? ` title="${esc(title)}"` : ''}><div class="label">${esc(label)}</div>`
    + `<div class="value${tone ? ' tone ' + esc(tone) : ''}">${html ? value : esc(value == null || value === '' ? NONE : value)}${unit ? ` <small>${esc(unit)}</small>` : ''}</div>`
    + `${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
  Dash.copyButton = (text, label = 'Copy', { quiet = false } = {}) => {
    const done = lastCopy.text === String(text) && Date.now() < lastCopy.until;
    return `<button type="button" class="btn sm${done ? ' copied' : ''}" data-copy="${esc(text)}" data-label="${esc(label)}"${quiet ? ' data-quiet' : ''}>${done ? 'Copied ✓' : esc(label)}</button>`;
  };

  // ---- rows of data

  const getter = (key) => (typeof key === 'function' ? key : (r) => r[key]);
  // the total of a column: Dash.sum(rows, 'value'), Dash.sum(rows, (r) => r.a * r.b); missing values count as 0
  Dash.sum = (rows, key) => rows.reduce((t, r) => { const v = getter(key)(r); return t + (isNum(v) ? Number(v) : 0); }, 0);
  // rows grouped by a key, in first-seen order: { eu: [r, r], us: [r] }
  Dash.groupBy = (rows, key) => {
    const out = {};
    for (const r of rows) (out[getter(key)(r)] ||= []).push(r);
    return out;
  };
  // rows as CSV text (Excel and Sheets read it): columns as for Dash.table ({ key, label, value }), or keys.
  // Numbers stay plain numbers; text a spreadsheet would run as a formula (starting =, +, -, @, and not just a number)
  // gets a leading '.
  Dash.csv = (rows, columns) => {
    const cols = (columns || Object.keys(rows[0] || {})).map((c) => (typeof c === 'string' ? { key: c, label: c } : c));
    const cell = (v) => {
      if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
      if (typeof v === 'number') return String(v);
      let t = v instanceof Date ? v.toISOString() : String(v);
      if (/^[=+\-@\t\r]/.test(t) && !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) t = "'" + t; // (but -3 stays a number)
      return /[",\n\r]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return [cols.map((c) => cell(c.label ?? c.key)), ...rows.map((r) => cols.map((c) => cell(c.value ? c.value(r) : r[c.key])))].map((l) => l.join(',')).join('\r\n') + '\r\n';
  };
  // hand the reader a file: Dash.download('accounts.csv', Dash.csv(rows, columns)); the type follows the name
  Dash.download = (name, content, type) => {
    const ext = String(name).split('.').pop().toLowerCase();
    const mime = type || { csv: 'text/csv', json: 'application/json', txt: 'text/plain', html: 'text/html' }[ext] || 'application/octet-stream';
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([ext === 'csv' && typeof content === 'string' ? '\ufeff' + content : content], { type: mime + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // A tone from thresholds, highest one reached: Dash.tone(pct, { 75: 'warn', 90: 'bad' }) is 'ok' below 75,
  // 'warn' from 75 and 'bad' from 90. below: true when lower is worse: Dash.tone(daysLeft, { 7: 'warn', 2: 'bad' },
  // 'ok', { below: true }) is 'bad' at 2 or less. A missing value gives '' (no colour).
  Dash.tone = (v, steps, base = 'ok', { below = false } = {}) => {
    if (!isNum(v)) return '';
    const n = Number(v);
    let tone = base;
    for (const mark of Object.keys(steps).map(Number).sort((a, b) => (below ? b - a : a - b))) if (below ? n <= mark : n >= mark) tone = steps[mark];
    return tone;
  };

  // A relative time that keeps itself current: Dash.ago(t) → "12 min ago", Dash.until(t) → "in 3h 5m". dash.js
  // updates every one on the page each 15 s, so a page that refreshes rarely still reads right. The full time is
  // the tooltip. t is anything Dash.time reads.
  let ticker = null;
  const tick = () => {
    for (const e of document.querySelectorAll('time[data-ago]')) e.textContent = fmt.ago(Number(e.dataset.ago));
    for (const e of document.querySelectorAll('time[data-until]')) e.textContent = fmt.until(Number(e.dataset.until));
    for (const e of document.querySelectorAll('time[data-near]')) e.textContent = near(Number(e.dataset.near));
  };
  // a time still to come, until it has passed: "in 3h 5m", then "12 min ago". A minute ahead counts as now: clocks differ.
  const SKEW = 60e3;
  const near = (ms) => (ms - Date.now() > SKEW ? fmt.until(ms) : fmt.ago(ms));
  const liveTime = (kind, t) => {
    const ms = Dash.time(t);
    if (!Number.isFinite(ms)) return NONE;
    if (hasDom && !ticker) ticker = setInterval(tick, 15000);
    return `<time datetime="${new Date(ms).toISOString()}" data-${kind}="${ms}" title="${esc(fmt.when(ms))}">${esc(kind === 'ago' ? fmt.ago(ms) : kind === 'near' ? near(ms) : fmt.until(ms))}</time>`;
  };
  Dash.ago = (t) => liveTime('ago', t);
  Dash.until = (t) => liveTime('until', t);

  // ---- tables: sorting and paging

  // Sort a copy of rows by a key (or a function), nulls last either way; numbers as numbers, text by locale
  Dash.sortBy = (rows, key, dir = 'desc') => {
    const get = typeof key === 'function' ? key : (r) => r[key];
    const sign = dir === 'asc' ? 1 : -1;
    const blank = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
    return rows.slice().sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (blank(av) || blank(bv)) return blank(av) - blank(bv);
      if (isNum(av) && isNum(bv)) return (Number(av) - Number(bv)) * sign;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * sign;
    });
  };
  // A sortable header cell; sort is { key, dir }. Clicks come back as [data-sort] (see Dash.sorter).
  // options: num (right-aligned), title, cls, unit (shown after the label, not uppercased: 'ms'),
  // mark: false for a second column that sorts by the same key (only one header shows the arrow).
  // With key null the header is plain text (not sortable).
  Dash.th = (label, key, sort, { num = false, title, cls = '', unit, mark = true } = {}) => {
    const on = mark && key != null && sort && sort.key === key;
    const classes = [num ? 'num' : '', cls].filter(Boolean).join(' ');
    const text = esc(label) + (unit ? ` <span class="unit">${esc(unit)}</span>` : '');
    if (key == null) return `<th${classes ? ` class="${esc(classes)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${text}</th>`;
    return `<th${classes ? ` class="${esc(classes)}"` : ''}${on ? ` aria-sort="${sort.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>`
      + `<button type="button" data-sort="${esc(key)}"${title ? ` title="${esc(title)}"` : ''}>${text}</button></th>`;
  };
  // Sort state that remembers itself. A click on the sorted column flips it; a new column starts with its own direction.
  // const sort = Dash.sorter({ key: 'value', dir: 'desc', store: 'accounts.sort', firstDir: { name: 'asc' } })
  Dash.sorter = ({ key, dir = 'desc', store, firstDir = {} } = {}) => {
    const saved = store ? Dash.store.get(store) : null;
    const state = saved && saved.key && (saved.dir === 'asc' || saved.dir === 'desc') ? saved : { key, dir };
    return {
      get key() { return state.key; },
      get dir() { return state.dir; },
      toggle(k) {
        if (state.key === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.key = k; state.dir = firstDir[k] || 'desc'; }
        if (store) Dash.store.set(store, { key: state.key, dir: state.dir });
        return this;
      },
      apply(rows, getters = {}) { return Dash.sortBy(rows, getters[state.key] || state.key, state.dir); },
    };
  };
  // Page numbers to show: 1 … 4 5 6 … 12, seven slots at most so the buttons don't jump while paging (null = a gap)
  Dash.pageItems = (page, pages) => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, null, pages];
    if (page >= pages - 3) return [1, null, pages - 4, pages - 3, pages - 2, pages - 1, pages];
    return [1, null, page - 1, page, page + 1, null, pages];
  };
  // One page of rows: { rows, page, pages, from, to, total, perPage }, page clamped into range
  Dash.paginate = (rows, page, perPage = 10) => {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    page = clamp(Math.floor(page) || 1, 1, pages);
    const start = (page - 1) * perPage;
    return { rows: rows.slice(start, start + perPage), page, pages, perPage, total, from: total ? start + 1 : 0, to: Math.min(total, start + perPage) };
  };
  // The pager under a table. Clicks come back as [data-page], the rows menu as change on [data-per-page].
  Dash.pager = (p, { noun = 'row', sizes = [10, 20, 50, 100] } = {}) => {
    if (!p.total) return '';
    const btn = (n, label, aria, disabled) =>
      `<button type="button" class="pg" data-page="${n}" aria-label="${aria}"${disabled ? ' disabled' : ''}>${label}</button>`;
    const menu = sizes && sizes.length
      ? `<label>Rows <select data-per-page>${sizes.map((s) => `<option${s === p.perPage ? ' selected' : ''}>${s}</option>`).join('')}</select></label>` : '';
    return `<div class="pager"><div class="pager-info"><span>${p.from}–${p.to} of ${esc(fmt.plural(p.total, noun))}</span>${menu}</div>`
      + `<div class="pages">${btn(p.page - 1, '‹', 'Previous page', p.page <= 1)}`
      + Dash.pageItems(p.page, p.pages).map((n) => (n == null ? '<span class="gap" aria-hidden="true">…</span>'
        : `<button type="button" class="pg" data-page="${n}" aria-label="Page ${n}"${n === p.page ? ' aria-current="page"' : ''}>${n}</button>`)).join('')
      + `${btn(p.page + 1, '›', 'Next page', p.page >= p.pages)}</div></div>`;
  };

  // A whole table from column definitions, with sorting, paging, cards on phones and an empty state.
  //   const accounts = Dash.table('accounts', {
  //     columns: [
  //       { key: 'name', label: 'Name', main: true },                    // main: the card's title on a phone
  //       { key: 'value', label: 'Value', num: true, format: (v) => fmt.usd(v) },
  //       { key: 'status', label: 'Status', html: (r) => Dash.pill(r.status, r.tone), sort: false },
  //     ],
  //     sort: { key: 'value', dir: 'desc', store: 'accounts.sort' }, perPage: 20, key: 'id', onRow: (r) => open(r),
  //   });
  //   accounts.update(rows);                                             // whenever the data changes
  //   accounts.filter((r) => Dash.match(r, query));                      // a search; accounts.download('accounts.csv')
  // A column: key, label, num (right-aligned), unit, title, cls, value (row → what it shows and sorts by),
  // format ((value, row) → text), html (row → HTML from a builder, not escaped), sort: false, firstDir: 'asc', main,
  // private (true, or the stand-in's text): hidden while the reader hides values (Dash.privacy). The order of the rows
  // stays, and csv() and download() still hold the values.
  // Options: cls (table classes, 'stack' by default: cards on phones), wrap (the table as its own card), perPage
  // (0: no pager), sizes, noun, key (row → data-key, so Dash.render keeps its focus), rowClass (row → class),
  // empty (text when there are no rows), onRow (row, event): a click or Enter on a row, not on a control in it,
  // filter (row → keep it?), and, with a key:
  // select: true, or { can (row → may it be picked?), actions: [{ label, tone, primary, run: (rows, table) => … }],
  // onChange (rows) }: a box on every row (Shift-click for a range), one in the header for this page, and a bar with the
  // count and the actions while any are picked. A run that returns a promise keeps its button busy; an error it throws
  // shows as a toast. Picked rows stay picked through a refresh, sorting, paging and a filter, until they leave the data.
  // expand: (row, box) → the row's details, as markup or an element, as a promise of one, or drawn into box; or { draw, can (row →
  // has it any?), one: true (one open at a time) }. A button opens them, and without onRow a click on the row does too.
  // The box stays the same element while it is open, so a chart or a table in it keeps its place; draw runs again
  // with the new row on each update (one that gave a promise: only when the row is opened again, or on redraw()).
  // rowLabel (row → text): the row's name for a screen reader; the main column's text by default.
  // It draws with Dash.render, so a refresh keeps the reader's place.
  Dash.table = (target, { columns, rows = [], sort = {}, perPage = 0, sizes, noun = 'row', key, rowClass, empty = 'Nothing to show',
    cls = 'stack', wrap = false, onRow, filter, select, expand, rowLabel } = {}) => {
    const node = el(target);
    if ((select || expand) && key == null) throw new Error('Dash.table: select and expand need key, to know a row again after a refresh');
    const picking = select ? { can: () => true, actions: [], ...(select === true ? {} : select) } : null;
    const opening = expand ? { can: () => true, ...(typeof expand === 'function' ? { draw: expand } : expand) } : null;
    const picked = new Set(); // ids of the picked rows, of the open ones
    const open = new Set();
    const details = new Map(); // id → { tr, box, async, run }, for the open rows on this page
    let host = node; // what Dash.render draws in; with select the bar comes after it
    let bar = null;
    let moving = false; // the open rows' details are out of the page for a moment
    let listed = []; // every row that passes the filter, sorted, as of the last draw
    const firstDir = Object.fromEntries(columns.filter((c) => c.firstDir).map((c) => [c.key, c.firstDir]));
    const sorter = Dash.sorter({ key: sort.key ?? null, dir: sort.dir || 'desc', store: sort.store, firstDir });
    const getters = Object.fromEntries(columns.filter((c) => c.value).map((c) => [c.key, c.value]));
    const valueOf = (c, r) => (c.value ? c.value(r) : r[c.key]);
    let data = rows;
    let shown = [];
    let next = []; // the rows of the HTML just built; they become shown once it is on the page
    let page = 1;
    let size = perPage;
    const cell = (c, r) => {
      const v = valueOf(c, r);
      let inner = c.html ? c.html(r) : esc(c.format ? c.format(v, r) : v == null || v === '' ? NONE : v);
      if (c.private) inner = Dash.mask(inner, { html: true, ...(c.private === true ? {} : { as: c.private }) });
      const classes = [c.num ? 'num' : '', c.main ? 'main' : '', c.cls || ''].filter(Boolean).join(' ');
      return `<td${classes ? ` class="${esc(classes)}"` : ''}${c.main ? '' : ` data-label="${esc(c.label)}"`}>${inner}</td>`;
    };
    let test = filter || null;
    const visible = () => {
      const kept = test ? data.filter(test) : data;
      return sorter.key != null ? sorter.apply(kept, getters) : kept;
    };
    const keyOfRow = (r) => (typeof key === 'function' ? key(r) : r[key]);
    const idOf = (r) => { const k = keyOfRow(r); return k == null ? r : String(k); };
    // the row's name in its box's and button's labels: never a value the reader has hidden
    const nameOf = (r, i) => {
      const c = columns.find((x) => x.main) || columns[0];
      let t = rowLabel ? rowLabel(r) : valueOf(c, r);
      if (!rowLabel) t = c.private && Dash.privacy.on ? '' : c.format ? c.format(t, r) : t;
      return typeof t === 'string' && t.trim() ? t : typeof t === 'number' ? String(t) : `row ${i + 1}`;
    };
    const leads = (picking ? 1 : 0) + (opening ? 1 : 0); // cells before the columns'
    const allLabel = perPage ? 'Select all on this page' : 'Select all';
    const leadHead = (picking ? `<th class="row-pick"><input type="checkbox" data-pick="page" data-key="dash-pick-page" autocomplete="off" aria-label="${allLabel}"></th>` : '')
      + (opening ? '<th class="row-turn"><span class="sr-only">Details</span></th>' : '');
    const leadCells = (r, i) => {
      const id = leads ? idOf(r) : '', k = typeof id === 'string' ? esc(id) : 'row ' + i, name = leads ? esc(nameOf(r, i)) : '';
      return (picking ? `<td class="row-pick"><input type="checkbox" data-pick="row" data-key="dash-pick ${k}" autocomplete="off" aria-label="Select ${name}"${picking.can(r) ? '' : ' disabled'}></td>` : '')
        + (opening ? `<td class="row-turn">${opening.can(r) ? `<button type="button" class="icon-btn" data-key="dash-expand ${k}" aria-expanded="false" aria-label="Details of ${name}"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 2.5 7.5 6 4 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ''}</td>` : '');
    };
    const html = () => {
      const sorted = visible();
      const p = size ? Dash.paginate(sorted, page, size) : { rows: sorted };
      if (size) page = p.page;
      next = p.rows;
      listed = sorted;
      const head = leadHead + columns.map((c) => Dash.th(c.label, c.sort === false ? null : c.key, sorter, { num: c.num, title: c.title, cls: c.cls, unit: c.unit })).join('');
      const body = next.length ? next.map((r, i) => {
        const k = key == null ? null : keyOfRow(r);
        const classes = [onRow || (opening && opening.can(r)) ? 'click' : '', rowClass ? rowClass(r) : ''].filter(Boolean).join(' ');
        return `<tr data-i="${i}"${k != null ? ` data-key="${esc(k)}"` : ''}${classes ? ` class="${esc(classes)}"` : ''}${onRow ? ' tabindex="0"' : ''}>${leads ? leadCells(r, i) : ''}${columns.map((c) => cell(c, r)).join('')}</tr>`;
      }).join('') : `<tr class="empty-row"><td colspan="${leads + columns.length}">${esc(empty)}</td></tr>`;
      const table = `<table class="table${cls ? ' ' + esc(cls) : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      // (the cards on a phone have no header: a box above them)
      const pickAll = picking && next.length && /(^|\s)stack(-md)?(\s|$)/.test(cls) ? `<label class="table-pick-all ${/(^|\s)stack-md(\s|$)/.test(cls) ? 'stack-md' : 'stack'}"><input type="checkbox" data-pick="page" data-key="dash-pick-page-top" autocomplete="off"> ${allLabel}</label>` : '';
      return pickAll + (wrap ? `<div class="table-wrap" data-key="dash-table-wrap">${table}</div>` : table) + (size ? Dash.pager(p, { noun, sizes }) : '');
    };

    // ---- picked rows and open rows. They aren't in the markup: settleRows() puts them on the rows that are on the page, so
    // picking or opening one leaves the rest of the table alone, and a refresh that changes nothing writes nothing.
    const tableEl = () => host.querySelector('table');
    const trs = () => { const t = tableEl(); return t ? [...t.tBodies[0].rows].filter((tr) => tr.dataset.i != null) : []; };
    const has = (r) => picked.has(idOf(r));
    const differs = (was) => picked.size !== was.size || [...picked].some((id) => !was.has(id));
    const selected = () => data.filter(has);
    const pickable = (list) => list.filter((r) => picking.can(r));
    let said = 0;
    const fallback = () => { // the bar went away with the focus in it
      const t = [...host.querySelectorAll('[data-pick]:not(:disabled)')].find((x) => x.getClientRects().length);
      if (t) t.focus({ preventScroll: true });
    };
    const settleBar = () => {
      const n = picked.size, here = shown.filter(has).length, all = pickable(listed);
      const away = n - here, rest = all.length > pickable(shown).length && !all.every(has);
      const held = bar.el.contains(document.activeElement) ? document.activeElement : null;
      const words = n ? `${fmt.int(n)} selected` : '';
      if (bar.count.textContent !== words) bar.count.textContent = words;
      bar.away.textContent = away ? `${fmt.int(away)} not on this page` : '';
      bar.all.hidden = !rest;
      bar.all.textContent = `Select all ${fmt.plural(all.length, noun)}`;
      bar.el.hidden = !n;
      if (n !== said) { said = n; bar.say.textContent = n ? words : 'None selected'; }
      if (held && !held.getClientRects().length) { if (n) bar.none.focus({ preventScroll: true }); else fallback(); }
    };
    const error = (e) => (e && e.message) || String(e);
    // what the reader changed in details that are markup, to put back once they are drawn anew: fields with an id, a
    // data-key or a name of their own, while the page still gives them the same starting value
    const fields = (box) => {
      const found = new Map();
      for (const e of box.querySelectorAll('input:not([type="file"]), textarea, select')) {
        const on = /^(checkbox|radio)$/.test(e.type);
        const k = keyOf(e) || (e.name ? `n:${e.name}${on ? '=' + e.value : ''}` : null);
        if (k) found.set(k, found.has(k) ? null : { e, on }); // (two of one name: whose is it?)
      }
      return found;
    };
    const stateOf = ({ e, on }) => { // [as the page made it, as it is now]
      if (on) return [e.defaultChecked, e.checked];
      if (e.tagName !== 'SELECT') return [e.defaultValue, e.value];
      const all = [...e.options], set = all.filter((o) => o.defaultSelected), first = all.filter((o) => !o.disabled).slice(0, 1);
      return [set.length || e.multiple ? set : first, [...e.selectedOptions]].map((l) => JSON.stringify(l.map((o) => o.value)));
    };
    const edits = (box) => {
      const kept = new Map();
      for (const [k, f] of fields(box)) { const s = f && stateOf(f); if (s && s[0] !== s[1]) kept.set(k, s); }
      return (to) => {
        if (kept.size) for (const [k, f] of fields(to)) {
          const s = f && kept.get(k);
          if (!s || stateOf(f)[0] !== s[0]) continue;
          if (f.on) f.e.checked = s[1];
          else if (f.e.tagName !== 'SELECT') f.e.value = s[1];
          else { const l = JSON.parse(s[1]); if (l.every((v) => [...f.e.options].some((o) => o.value === v))) for (const o of f.e.options) o.selected = l.includes(o.value); }
        }
      };
    };
    const put = (box, out, kept, force) => {
      if (out instanceof Node) { if (box.firstChild !== out || box.lastChild !== out) box.replaceChildren(out); } else if (out != null && Dash.render(box, out, { force })) kept(box);
    };
    // a row's details: markup goes in with Dash.render, so it keeps the reader's place there too
    const fill = (d, r, again) => {
      if (again && d.async) return;
      const run = ++d.run;
      const kept = d.failed || d.box.hasAttribute('aria-busy') ? d.kept : edits(d.box); // (not from an error, or Loading…)
      d.kept = kept;
      d.failed = false;
      if (d.async) { // what an older run still draws goes nowhere
        const box = d.box.cloneNode(false), held = d.box.contains(document.activeElement);
        d.box.replaceWith(box);
        d.box = box;
        if (held) turnOf(r)?.focus({ preventScroll: true });
      }
      const box = d.box;
      const failed = (e) => {
        d.failed = true;
        Dash.render(box, `<p class="row-note">Couldn’t load this: ${esc(error(e))} <button type="button" class="btn sm" data-retry>Try again</button></p>`, { force: true });
        box.querySelector('[data-retry]').addEventListener('click', () => { const now = details.get(idOf(r)); if (now === d) { fill(d, data.find((x) => idOf(x) === idOf(r)) || r); const b = turnOf(r); if (b) b.focus({ preventScroll: true }); } });
      };
      let out;
      try { out = opening.draw(r, box); } catch (e) { failed(e); setTimeout(() => { throw e; }); return; }
      d.async = Boolean(out && typeof out.then === 'function');
      if (!d.async) { put(box, out, kept); return; }
      box.setAttribute('aria-busy', 'true');
      Dash.render(box, '<p class="row-note" data-loading>Loading…</p>', { force: true });
      const mine = () => { if (d.run !== run) return false; box.removeAttribute('aria-busy'); return true; };
      out.then((x) => {
        if (!mine()) return;
        if (x == null && box.querySelector(':scope > [data-loading]')) x = '';
        put(box, x, kept, true);
      }, (e) => { if (mine()) failed(e); });
    };
    const turnOf = (r) => { const i = shown.findIndex((x) => idOf(x) === idOf(r)); const tr = i < 0 ? null : trs()[i]; return tr && tr.querySelector(':scope > .row-turn > button'); };
    // again: each open row's details are drawn anew with the row as it is now ('anew': those a promise gave, too).
    // between runs once the kept details are back in the page and before any are drawn.
    const settleRows = (again, between) => {
      const gone = new Set(details.keys()), due = [];
      const here = document.activeElement;
      for (const tr of trs()) {
        const r = shown[Number(tr.dataset.i)], id = idOf(r);
        if (picking) {
          tr.classList.toggle('row-picked', picked.has(id));
          tr.querySelector(':scope > .row-pick > input').checked = picked.has(id);
        }
        if (!opening) continue;
        const b = tr.querySelector(':scope > .row-turn > button');
        if (!b) continue;
        const on = open.has(id);
        tr.classList.toggle('row-open', on);
        b.setAttribute('aria-expanded', String(on));
        if (!on) {
          b.removeAttribute('aria-controls');
          if (details.get(id)?.tr.contains(here)) b.focus({ preventScroll: true });
          continue;
        }
        gone.delete(id);
        let d = details.get(id);
        const fresh = !d;
        if (fresh) {
          d = { tr: document.createElement('tr'), box: document.createElement('div'), async: false, run: 0 };
          d.tr.className = 'row-detail';
          // moving them is no leaving and coming back: a chart there keeps the reader's point
          for (const type of ['focusin', 'focusout', 'focus', 'blur']) d.tr.addEventListener(type, (e) => { if (moving) e.stopImmediatePropagation(); }, true);
          d.box.className = 'row-box';
          const td = d.tr.insertCell();
          td.append(d.box);
          d.tr.id = 'dash-detail-' + ++ids;
          details.set(id, d);
        }
        d.tr.cells[0].colSpan = leads + columns.length;
        if (tr.nextElementSibling !== d.tr) tr.after(d.tr);
        b.setAttribute('aria-controls', d.tr.id);
        if (fresh || again) due.push([d, r, !fresh && again !== 'anew']);
      }
      for (const id of gone) { const d = details.get(id); d.run++; d.tr.remove(); details.delete(id); }
      if (between) between();
      for (const x of due) fill(...x);
      if (picking) {
        const can = pickable(shown), n = can.filter(has).length;
        for (const b of host.querySelectorAll('[data-pick="page"]')) {
          if (inside(b)) continue;
          b.checked = n > 0 && n === can.length;
          b.indeterminate = n > 0 && n < can.length;
          b.disabled = !can.length;
        }
      }
    };
    // the open rows' details come out before the markup is replaced, and go back in after, with the focus and scrolling they had
    const takeOut = () => {
      const a = document.activeElement;
      const own = [...details.values()].some((d) => d.tr.contains(a)) ? a : null;
      let caret = null;
      try { if (own && typeof own.selectionStart === 'number') caret = [own.selectionStart, own.selectionEnd]; } catch { /* not a text box */ }
      const scrolled = [...details.values()].flatMap((d) => [...d.tr.querySelectorAll('*')]).filter((e) => e.scrollTop || e.scrollLeft).map((e) => [e, e.scrollTop, e.scrollLeft]);
      moving = true;
      for (const d of details.values()) d.tr.remove();
      return () => {
        for (const [e, top, left] of scrolled) { e.scrollTop = top; e.scrollLeft = left; }
        if (!own || !own.isConnected) return;
        own.focus({ preventScroll: true });
        if (caret) try { own.setSelectionRange(...caret); } catch { /* not a text box */ } // (Chromium keeps it by itself)
      };
    };
    // rows that left the data (or may not be picked any more) are no longer picked or open
    const prune = () => {
      if (!leads) return;
      const now = new Map(data.map((r) => [idOf(r), r]));
      let lost = false;
      for (const id of [...picked]) if (!now.has(id) || !picking.can(now.get(id))) { picked.delete(id); lost = true; }
      for (const id of [...open]) if (!now.has(id)) open.delete(id);
      if (lost && picking.onChange) queueMicrotask(() => picking.onChange(selected()));
    };
    // (a refresh that waits for a selection leaves the old rows on screen, so clicks must still map to those)
    const draw = (force = false, again = true) => {
      const markup = html();
      let putBack = null;
      const wrote = Dash.render(host, markup, { force, before: details.size ? () => { putBack = takeOut(); } : undefined });
      try {
        if (wrote || host.__dashHtml === markup) {
          shown = next;
          if (leads) settleRows(again, putBack && (() => { putBack(); moving = false; }));
        }
      } finally { moving = false; }
      if (bar) settleBar();
      return wrote;
    };
    const pick = (list, on) => {
      const was = new Set(picked);
      const now = new Set(data.map(idOf));
      for (const r of list) { const id = idOf(r); if (on && now.has(id) && picking.can(r)) picked.add(id); else picked.delete(id); }
      settleRows();
      settleBar();
      if (picking.onChange && differs(was)) picking.onChange(selected());
    };
    const turn = (id, on) => {
      if (on && opening.one) open.clear();
      if (on) open.add(id); else open.delete(id);
      settleRows();
    };
    let anchor = null; // the last box clicked: Shift-click picks from there
    const clickBox = (input, shift) => {
      const i = Number(input.closest('tr').dataset.i);
      const from = shift && anchor != null ? shown.findIndex((r) => idOf(r) === anchor) : -1;
      pick(from < 0 ? [shown[i]] : shown.slice(Math.min(i, from), Math.max(i, from) + 1), input.checked);
      anchor = idOf(shown[i]);
    };
    // in a row's details: another table's headers, pager and rows there are its own
    const inside = (t) => { const b = t.closest('.row-box'); return Boolean(b) && b !== node && node.contains(b); };
    const rowOf = (e) => {
      const tr = e.target.closest('tbody tr[data-i]');
      return tr && node.contains(tr) && !e.target.closest('a, button, input, select, textarea, label, summary') ? shown[Number(tr.dataset.i)] : null;
    };
    node.__dashTable?.abort(); // a table made again here: the old one stops listening
    const { signal } = (node.__dashTable = new AbortController());
    const on = (type, fn) => node.addEventListener(type, (e) => { if (!inside(e.target)) fn(e); }, { signal });
    let shift = false; // was Shift down at the click that changes a box?
    let passed = false;
    on('mousedown', (e) => { if (picking && e.shiftKey && e.target.closest('td.row-pick')) e.preventDefault(); }); // a range selects no text (Chromium needs only the cell's user-select)
    on('click', (e) => {
      const spot = picking && e.target.closest('.row-pick');
      if (spot && node.contains(spot)) { // the whole cell is the box
        const input = spot.querySelector('input');
        if (!passed) shift = e.shiftKey;
        if (e.target !== input && !input.disabled) { passed = true; input.focus({ preventScroll: true }); input.click(); passed = false; } else if (e.shiftKey) input.focus({ preventScroll: true });
        return;
      }
      const t = opening && e.target.closest('td.row-turn > button');
      if (t && node.contains(t)) {
        const id = idOf(shown[Number(t.closest('tr').dataset.i)]);
        turn(id, !open.has(id));
        return;
      }
      const b = e.target.closest('[data-sort], [data-page]');
      if (b && node.contains(b)) {
        if (b.dataset.sort != null) { sorter.toggle(b.dataset.sort); page = 1; } else page = Number(b.dataset.page);
        draw(true);
        return;
      }
      const sel = window.getSelection ? getSelection() : null;
      if (sel && !sel.isCollapsed && node.contains(sel.anchorNode)) return; // the reader selected text, not a row
      const r = (onRow || opening) && rowOf(e);
      if (r && onRow) onRow(r, e);
      else if (r && opening.can(r)) turn(idOf(r), !open.has(idOf(r)));
    });
    on('keydown', (e) => {
      if (e.key !== 'Enter' || !onRow || e.target.tagName !== 'TR') return;
      const r = rowOf(e);
      if (r) onRow(r, e);
    });
    on('change', (e) => {
      if (picking && e.target.matches('.row-pick > [data-pick="row"]')) { const s = shift; shift = false; clickBox(e.target, s); return; }
      if (picking && e.target.matches('[data-pick="page"]')) { pick(shown, e.target.checked); return; }
      if (!e.target.matches('[data-per-page]')) return;
      size = Number(e.target.value) || size;
      page = 1;
      draw(true);
    });
    if (picking) {
      node.textContent = '';
      node.__dashHtml = undefined; // (not what Dash.render wrote here before)
      host = document.createElement('div');
      host.className = 'table-host';
      const box = document.createElement('div');
      box.className = 'table-bar';
      box.hidden = true;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Selected rows');
      box.innerHTML = '<b></b><span class="tone warn"></span><button type="button" class="link" data-all></button><button type="button" class="link quiet" data-none>Clear</button>'
        + (picking.actions.length ? '<span class="row push">' + picking.actions.map((a, i) => `<button type="button" class="btn sm${a.primary ? ' primary' : a.tone ? ' tone' : ''}${a.tone ? ' ' + esc(a.tone) : ''}" data-action="${i}">${esc(a.label)}</button>`).join('') + '</span>' : '');
      const say = document.createElement('span');
      say.className = 'sr-only';
      say.setAttribute('role', 'status');
      node.append(host, box, say);
      bar = { el: box, say, count: box.querySelector('b'), away: box.querySelector('.tone'), all: box.querySelector('[data-all]'), none: box.querySelector('[data-none]') };
      bar.all.addEventListener('click', () => pick(listed, true));
      bar.none.addEventListener('click', () => pick(selected(), false));
      box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        try { await Dash.busy(b, () => picking.actions[Number(b.dataset.action)].run(selected(), handle)); } catch (x) { Dash.toast(error(x), { tone: 'bad' }); }
        if (document.activeElement && document.activeElement !== document.body) return; // (a busy button lets go of the focus)
        if (box.hidden) fallback(); else b.focus({ preventScroll: true });
      });
    }
    const handle = {
      update(next) { data = next || []; prune(); draw(); },
      get rows() { return data; },
      get shown() { return shown; },
      get page() { return page; },
      goto(n) { page = n; draw(true); },
      sort: sorter,
      redraw() { draw(true, 'anew'); },
      // the picked rows; select(['a', 'b']) picks those keys and no others, select((r) => …) those rows, select([]) none
      get selected() { return picking ? selected() : []; },
      select(which) {
        if (!picking) return;
        const want = typeof which === 'function' ? which : ((keys) => (r) => keys.has(idOf(r)))(new Set([].concat(which ?? []).map(String)));
        const was = new Set(picked);
        picked.clear();
        for (const r of data) if (want(r) && picking.can(r)) picked.add(idOf(r));
        settleRows();
        settleBar();
        if (picking.onChange && differs(was)) picking.onChange(selected());
      },
      // the open rows; expand(key) opens one's details, expand(key, false) closes them
      get expanded() { return opening ? data.filter((r) => open.has(idOf(r)) && opening.can(r)) : []; },
      expand(k, on = true) {
        const r = opening && data.find((x) => idOf(x) === String(k));
        if (r && opening.can(r)) turn(idOf(r), on);
      },
      // keep only rows that pass fn (null: all): table.filter((r) => Dash.match(r, query, ['name', 'region']))
      filter(fn) { test = fn || null; page = 1; draw(); },
      // how many rows pass the filter, of how many
      get count() { return { shown: visible().length, total: data.length }; },
      // every row that passes the filter, sorted, as CSV (or the rows given: table.csv(table.selected)); download saves it as a file
      csv(list = visible()) { return Dash.csv(list, columns.map((c) => ({ key: c.key, label: c.label, value: c.value }))); },
      download(name = 'table.csv', list = undefined) { Dash.download(name, handle.csv(list)); },
    };
    draw();
    node.__dashPrivate?.();
    node.__dashPrivate = opening || rowLabel || columns.some((c) => c.private) ? Dash.privacy.onChange(() => draw(true, 'anew')) : null;
    return handle;
  };

  // ---- bars and charts. Colours come from tone class names ('ok', 'blue', 'teal', …); sizes from dash.css.

  const pctOf = (v, max) => (max > 0 ? clamp((Number(v) || 0) / max * 100, 0, 100) : 0);
  const w = (p) => `width:${+p.toFixed(2)}%`;

  // ---- pages with a strict style policy (Content-Security-Policy: style-src 'self', no 'unsafe-inline')
  // Such a page drops every style="" in markup. With Dash.config.csp = true, the builders that size things (bar,
  // meter, split, bars, lines, spark, progress; Dash.lanes always does) write their numbers as data-css-* attributes instead, and
  // the kit sets them through the CSSOM, which the policy allows: at once wherever the kit puts markup in
  // (Dash.render, popups, modals, dialogs), and before the next paint for markup the page puts in itself (a
  // MutationObserver). Only numbers, only these properties, only on the kit's own pieces: other markup can't
  // style anything this way. Dash.applyStyles(el) applies them at once, for a page that measures right after
  // putting markup in. Off (the default), the builders write style="" exactly as before.
  const STYLED = [
    ['.bar > i, .meter > i, .split > i, .progress > i, .rating-on', 'data-css-w', 'width', (v) => v + '%'],
    ['.range-track', 'data-css-from', '--from', (v) => v + '%'],
    ['.range-track', 'data-css-to', '--to', (v) => v + '%'],
    ['.chart-col > i', 'data-css-h', 'height', (v) => v + '%'],
    ['.chart-grid', 'data-css-top', 'top', (v) => v + '%'],
    ['.chart-col u', 'data-css-grow', 'flex-grow', (v) => String(v)],
    ['.chart-plot, .line-chart', 'data-css-chart-h', '--chart-h', (v) => v + 'px'],
    ['.line-chart', 'data-css-gut', '--gut', (v) => v + 'px'],
    ['.line-ref, .line-dot, .line-ends > span', 'data-css-top', 'top', (v) => v + '%'],
    ['.line-dot, .line-x > span', 'data-css-left', 'left', (v) => v + '%'],
    ['.spark-box > .dot', 'data-css-x', 'left', (v) => `calc(${v}% - 3.5px)`],
    ['.spark-box > .dot', 'data-css-y', 'top', (v) => `calc(${v}% - 3.5px)`],
  ].map(([where, attr, prop, value]) => [where.split(',').map((s) => `${s.trim()}[${attr}]`).join(', '), attr, prop, value]);
  Dash.applyStyles = (target) => {
    const root = target == null ? (hasDom ? document : null) : el(target);
    if (!root || !root.querySelectorAll) return root;
    for (const [sel, attr, prop, value] of STYLED) {
      const hits = [...root.querySelectorAll(sel)];
      if (root.matches && root.matches(sel)) hits.push(root);
      for (const e of hits) {
        const v = Number(e.getAttribute(attr));
        if (e.getAttribute(attr) !== '' && Number.isFinite(v)) e.style.setProperty(prop, value(v));
      }
    }
    return root;
  };
  let styleWatch = null;
  // is the strict mode on? Then (once) watch the page for markup it puts in itself
  const strict = () => {
    if (!Dash.config.csp) return false;
    if (hasDom && !styleWatch && typeof MutationObserver === 'function') {
      styleWatch = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'attributes') Dash.applyStyles(m.target);
          else for (const n of m.addedNodes) if (n.nodeType === 1) Dash.applyStyles(n);
        }
      });
      styleWatch.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [...new Set(STYLED.map((s) => s[1]))] });
    }
    return true;
  };
  // a size: style="decl" as always, or attr="n" in the strict mode
  const sized = (attr, n, decl) => (strict() ? ` ${attr}="${n}"` : ` style="${decl}"`);
  const fillW = (p) => sized('data-css-w', +p.toFixed(2), w(p));
  // a bar filled to frac (0–1)
  Dash.bar = (frac, tone, { title, cls = '' } = {}) =>
    `<span class="bar${cls ? ' ' + esc(cls) : ''}${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}><i${fillW(pctOf(frac, 1))}></i></span>`;
  Dash.meter = (frac, tone) => `<span class="meter${toneClass(tone)}"><i${fillW(pctOf(frac, 1))}></i></span>`;
  // parts of a whole side by side: [{ value, tone, label }]
  Dash.split = (parts) => {
    const total = parts.reduce((s, p) => s + Math.max(0, Number(p.value) || 0), 0);
    return `<div class="split">${parts.map((p) => `<i class="${esc(p.tone || '')}"${fillW(pctOf(p.value, total))}${p.label ? ` title="${esc(p.label)}"` : ''}></i>`).join('')}</div>`;
  };
  // swatches with names and values: [{ label, value, tone, key }]; list: one per line with the value on the right
  Dash.legend = (items, { list = false, button = false } = {}) => `<div class="legend${list ? ' list' : ''}">${items.map((it) => {
    const tag = button ? 'button' : 'span';
    const zero = list && isNum(it.value) && Number(it.value) === 0 ? ' zero' : '';
    return `<${tag}${button ? ' type="button"' : ''} class="legend-item${toneClass(it.tone)}${zero}"${it.key != null ? ` data-key="${esc(it.key)}"` : ''}${it.title ? ` title="${esc(it.title)}"` : ''}>`
      + `<i></i><span class="ellipsis">${esc(it.label)}</span>${it.value != null ? ` <b>${esc(it.value)}</b>` : ''}</${tag}>`;
  }).join('')}</div>`;
  // A timeline, in the order given: [{ title, time, text, tone }]. time is anything Dash.time reads (shown as
  // "12 min ago", or "in 3h 5m" for one still to come; the full time as its tooltip) or other text shown as it is; html
  // instead of text for markup.
  Dash.timeline = (items, { empty = 'Nothing yet' } = {}) => (!items.length ? `<p class="empty">${esc(empty)}</p>`
    : `<ol class="timeline">${items.map((it) => {
      const t = it.time == null || it.time === '' ? '' : Number.isFinite(Dash.time(it.time)) ? liveTime(Dash.time(it.time) - Date.now() > SKEW ? 'near' : 'ago', it.time) : esc(it.time);
      return `<li${it.tone ? ` class="${esc(it.tone)}"` : ''}><div class="timeline-head"><span class="timeline-title">${esc(it.title ?? '')}</span>${t ? `<span class="timeline-time">${t}</span>` : ''}</div>`
        + `${it.html ? `<div class="timeline-text">${it.html}</div>` : it.text ? `<div class="timeline-text">${esc(it.text)}</div>` : ''}</li>`;
    }).join('')}</ol>`);

  // Lanes: one row per thing, its runs (spans) and events (marks) on a time axis, in the .lanes look.
  //   Dash.lanes(el, rows, { from, to, ticks, axis, nouns, labelWidth, empty })
  //   rows: [{ label, sub, spans: [{ from, to, tone, title }], marks: [{ at, tone, title }], say }]
  // Times are anything Dash.time reads; to is now and from 24 h before it unless given. A span with no `to` is
  // still going and runs to the end. Spans are cut at the edges; what lies wholly outside is left out. title is
  // the tooltip (the times when there is none). Each lane is role="img" labelled with say, or with a summary of
  // what is in it: nouns ({ span: 'run', mark: 'event' }) name the things it counts. ticks: the axis in that many
  // parts (4; 0 for none), labelled with axis(t, i, n), else the clock up to a day, and past that hours or days
  // ago ("−54 h") when it ends now, dates when it ended before; "now" at the end when it is now. In-between labels
  // hide on phones. labelWidth: the label column (200px). Call it again to refresh.
  // el may be the page's own .lanes box or any box to put one in.
  // It places things through the CSSOM, never style="" in the markup, so it works under a strict style-src CSP.
  // Dash.lanes.html(rows, options) is the markup alone, and Dash.lanes.place(el) places it once it is in the page.
  const laneWidth = (w) => (isNum(w) ? w + 'px' : String(w)); // labelWidth: 120 is 120px
  const lanesHtml = (rows = [], { from, to, ticks = 4, axis, nouns, labelWidth, empty = 'Nothing yet' } = {}, bare = false) => {
    const end = Number.isFinite(Dash.time(to)) ? Dash.time(to) : Date.now();
    const start = Number.isFinite(Dash.time(from)) ? Dash.time(from) : end - 864e5;
    const range = end - start;
    if (!rows.length || !(range > 0)) return `<p class="empty">${esc(empty)}</p>`;
    const word = { span: 'run', mark: 'event', ...nouns };
    const pos = (t) => clamp((t - start) / range, 0, 1) * 100;
    const at = (x) => x.toFixed(3);
    const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    const lanes = rows.map((r) => {
      const spans = (r.spans || []).map((s) => {
        const going = s.to == null || s.to === '';
        let a = Dash.time(s.from), b = going ? end : Dash.time(s.to);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        if (b < a) [a, b] = [b, a];
        if (b < start || a > end) return null;
        const text = s.title ?? `${fmt.when(a)} – ${going ? 'now' : sameDay(a, b) ? fmt.clock(b) : fmt.when(b)}`;
        return { t: a, text, html: `<span class="span${toneClass(s.tone)}" data-at="${at(pos(a))}" data-len="${at(pos(b) - pos(a))}" data-tooltip="${esc(text)}"></span>` };
      }).filter(Boolean);
      const marks = (r.marks || []).map((m) => {
        const t = Dash.time(m.at);
        if (!Number.isFinite(t) || t < start || t > end) return null;
        const text = m.title ?? fmt.when(t);
        return { t, text, html: `<span class="mark${toneClass(m.tone)}" data-at="${at(pos(t))}" data-tooltip="${esc(text)}"></span>` };
      }).filter(Boolean);
      const sub = r.sub != null && r.sub !== '' ? String(r.sub) : '';
      const items = [...spans, ...marks].sort((x, y) => x.t - y.t).map((x) => x.text);
      const said = r.say ?? `${r.label ?? ''}${sub ? ` (${sub})` : ''}: ${fmt.plural(spans.length, word.span)}, ${fmt.plural(marks.length, word.mark)}`
        + (items.length ? ': ' + items.slice(0, 8).join('; ') + (items.length > 8 ? `; and ${items.length - 8} more` : '') : '');
      return `<div class="lane-label">${esc(r.label ?? '')}${sub ? ` <span>· ${esc(sub)}</span>` : ''}</div>`
        + `<div class="lane" role="img" aria-label="${esc(said)}">${spans.map((x) => x.html).join('')}${marks.map((x) => x.html).join('')}</div>`;
    }).join('');
    const n = Math.round(Number(ticks));
    const live = Math.abs(end - Date.now()) < 60e3;
    const ago = (t) => (range <= 4 * 864e5 ? `−${Number(((end - t) / 36e5).toFixed(1))} h` : `−${Number(((end - t) / 864e5).toFixed(1))} d`);
    const label = axis || ((t, i) => (i === n && live ? 'now' : range <= 864e5 ? fmt.time(t, { seconds: false }) : live ? ago(t) : fmt.date(t)));
    const axisHtml = !(n >= 1) ? '' : '<div></div><div class="lane-axis" aria-hidden="true">' + Array.from({ length: n + 1 }, (_, i) => {
      const cls = i === 0 ? 'start' : i === n ? 'end major' : i % 2 ? 'minor' : '';
      return `<span${cls ? ` class="${cls}"` : ''} data-at="${at((i / n) * 100)}">${esc(label(start + (range * i) / n, i, n))}</span>`;
    }).join('') + '</div>';
    return bare ? lanes + axisHtml : `<div class="lanes"${labelWidth ? ` data-label-width="${esc(laneWidth(labelWidth))}"` : ''}>${lanes}${axisHtml}</div>`;
  };
  const placeLanes = (target) => {
    const root = el(target);
    if (!root || !root.querySelectorAll) return root;
    for (const box of root.matches && root.matches('.lanes') ? [root] : root.querySelectorAll('.lanes')) {
      if (box.dataset.labelWidth) box.style.setProperty('--lane-label', box.dataset.labelWidth);
      for (const e of box.querySelectorAll('[data-at]')) {
        e.style.left = e.dataset.at + '%';
        if (e.dataset.len != null) e.style.width = e.dataset.len + '%';
      }
    }
    return root;
  };
  Dash.lanes = (target, rows, options) => {
    const node = el(target);
    if (!node) return node;
    const own = node.matches('.lanes'); // the page's own .lanes box: fill it, rather than put a second one inside
    if (own && options && options.labelWidth) node.dataset.labelWidth = laneWidth(options.labelWidth);
    Dash.render(node, lanesHtml(rows, options, own));
    return placeLanes(node);
  };
  Dash.lanes.html = (rows, options) => lanesHtml(rows, options);
  Dash.lanes.place = placeLanes;
  // horizontal bars, one row per item: [{ label, value, tone, text, key, title }]
  Dash.hbars = (rows, { max, format = fmt.compact, button = false } = {}) => {
    const top = max ?? Math.max(0, ...rows.map((r) => Number(r.value) || 0));
    return `<div class="hbars">${rows.map((r) => {
      const tag = button ? 'button' : 'div';
      return `<${tag}${button ? ' type="button"' : ''} class="hbar${toneClass(r.tone)}"${r.key != null ? ` data-key="${esc(r.key)}"` : ''}${r.title ? ` title="${esc(r.title)}"` : ''}>`
        + `<span class="hbar-label">${r.html || `<span>${esc(r.label)}</span>`}</span>${Dash.bar(pctOf(r.value, top) / 100)}`
        + `<span class="hbar-value">${esc(r.text ?? format(r.value))}</span></${tag}>`;
    }).join('')}</div>`;
  };
  // a round axis maximum: 1, 2, 2.5, 5 × 10^k
  Dash.niceMax = (v) => {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
    return 10 * p;
  };
  // column chart: [{ label, value, tone, title, partial }]; every Nth x label is shown (labelEvery), the rest only on hover
  // read: a line above the chart that shows the hovered column's numbers, and this text otherwise (e.g. the total)
  Dash.bars = (points, { height = 150, format = fmt.compact, max, ticks = 2, labelEvery = 1, minorEvery = 0, read } = {}) => {
    const total = (p) => (p.parts ? p.parts.reduce((t, x) => t + (Number(x.value) || 0), 0) : Number(p.value) || 0);
    const top = max ?? Dash.niceMax(Math.max(0, ...points.map(total)));
    const grid = Array.from({ length: ticks }, (_, i) => {
      const v = (top * (i + 1)) / ticks;
      const at = +(100 - (v / top) * 100).toFixed(2);
      return `<div class="chart-grid"${sized('data-css-top', at, `top:${at}%`)}><span>${esc(format(v))}</span></div>`;
    }).join('');
    const cols = points.map((p) => {
      const v = total(p);
      const cls = ['chart-col', p.tone || '', v === 0 ? 'zero' : '', p.partial ? 'partial' : '', p.parts ? 'stacked' : ''].filter(Boolean).join(' ');
      const tip = p.title ?? `${p.label}: ${format(v)}`;
      const parts = p.parts && v ? p.parts.filter((x) => Number(x.value) > 0).map((x) => { const g = +Number(x.value).toPrecision(6); return `<u${x.tone ? ` class="${esc(x.tone)}"` : ''}${sized('data-css-grow', g, `flex-grow:${g}`)}></u>`; }).join('') : '';
      const h = +pctOf(v, top).toFixed(2);
      return `<div class="${esc(cls)}" title="${esc(tip)}"><i${sized('data-css-h', h, `height:${h}%`)}>${parts}</i></div>`;
    }).join('');
    const n = points.length;
    const xs = points.map((p, i) => {
      const show = i % labelEvery === 0 || i === n - 1;
      const pos = i === 0 ? 'start' : i === n - 1 ? 'end' : '';
      const minor = minorEvery && i % minorEvery !== 0 ? 'minor' : '';
      return `<span class="${[pos, minor].filter(Boolean).join(' ')}">${show ? `<b>${esc(p.label)}</b>` : ''}</span>`;
    }).join('');
    const head = read == null ? '' : `<div class="chart-read" data-default="${esc(read)}">${esc(read)}</div>`;
    return `<div class="chart"${read == null ? '' : ' data-read'}>${head}<div class="chart-plot"${sized('data-css-chart-h', Number(height), `--chart-h:${height}px`)}>${grid}<div class="chart-cols">${cols}</div></div><div class="chart-x">${xs}</div></div>`;
  };
  // ---- lines: values over time, with a crosshair that reads them

  //   const chart = Dash.lines('latency', [
  //     { label: 'Web', points: [[time, 120], [time, null], …] },      // or { t, v }; null leaves a gap
  //     { label: 'API', points },
  //   ], { label: 'Response time', format: (v) => v + ' ms' });
  //   chart.update(series);                                            // or Dash.lines on the same box again
  // A series: label, points, and if wanted tone (a class, for a colour that means something: 'bad'), dashed (a forecast,
  // last week), area (filled to the axis; a chart of one series fills it with area: true) and its own gap. Points are in any order and
  // needn't be evenly spaced: x is time (anything Dash.time reads). Up to four series get the series colours, which can be
  // told apart by most colour-blind readers; more are grey, so use two charts. All share one axis.
  // Options: label (the chart's name for a screen reader), from, to (else the data's ends), min (else 0, or 'auto' to fit the
  // data) and max, height (220), ticks (about how many on the y axis: 4), format (a value → text), yFormat (the same for the
  // axis), when (a time → the readout's text), gap (ms: a longer silence breaks the line), refs ([{ value, label, tone }]:
  // limits drawn across), private (its numbers hide with Dash.privacy; the shape stays), empty (text when there is nothing).
  // The crosshair follows the mouse or a finger; the arrow keys, Page Up/Down, Home and End move it once the chart has the
  // focus, and a screen reader hears each point (it is a slider). The handle: update(series, options), redraw(), csv() and
  // download(name). Dash.lines.html(series, options) is the markup alone.
  const SERIES = ['series-1', 'series-2', 'series-3', 'series-4'];
  const MINUTE = 60e3, HOUR = 36e5, DAY = 864e5;
  const TIME_STEPS = [1e3, 2e3, 5e3, 10e3, 15e3, 30e3, ...[1, 2, 5, 10, 15, 30].map((m) => m * MINUTE), ...[1, 2, 3, 6, 12].map((h) => h * HOUR), DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY];
  // round local times across a range, at most about n: [{ t, text }]
  const timeTicks = (from, to, n) => {
    const want = (to - from) / n, at = [];
    const d = new Date(from), y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    const run = (k, next, get) => { for (let i = k, t = get(i), guard = 0; t <= to && guard < 4000; i += next, t = get(i), guard++) if (t >= from && !(t <= at[at.length - 1])) at.push(t); };
    const step = TIME_STEPS.find((s) => s >= want);
    let text;
    if (!step) { // months, or years
      const months = [1, 2, 3, 6, 12, 24, 60, 120].find((k) => k * 30.4 * DAY >= want) || 240;
      run(Math.floor((y * 12 + m) / months) * months, months, (k) => new Date(Math.floor(k / 12), k % 12, 1).getTime());
      text = (t) => (months >= 12 ? String(new Date(t).getFullYear()) : new Date(t).toLocaleDateString([], { month: 'short', year: 'numeric' }));
    } else if (step >= DAY) { // whole days, weeks from Mondays: by the calendar, so a day with a clock change counts as one
      const days = step / DAY;
      run(-((Math.round(Date.UTC(y, m, day) / DAY) + 3) % days), days, (k) => new Date(y, m, day + k).getTime());
      text = (t) => fmt.date(t);
    } else if (step >= MINUTE) { // from local midnight, by the clock
      run(0, step / MINUTE, (k) => new Date(y, m, day, 0, k).getTime());
      text = (t) => { const x = new Date(t); return x.getHours() || x.getMinutes() ? fmt.time(t, { seconds: false }) : fmt.date(t); };
    } else {
      run(Math.ceil(from / step), 1, (k) => k * step);
      text = (t) => fmt.time(t);
    }
    return at.map((t) => ({ t, text: text(t) }));
  };
  // round values from lo to hi, about n steps
  const valueTicks = (lo, hi, n) => {
    const raw = (hi - lo) / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => raw <= s * (1 + 1e-9));
    return { step, list: (a, b) => { const out = []; for (let k = Math.ceil(a / step - 1e-9); k * step <= b + step * 1e-6; k++) out.push(+(k * step).toPrecision(12) || 0); return out; } };
  };
  const linePoint = (p) => {
    const [t, v] = Array.isArray(p) ? p : [p.t ?? p.time, p.v ?? p.value];
    return { t: Dash.time(t), v: isNum(v) ? Number(v) : null };
  };
  // the parts of a line that can be drawn inside from…to: broken at gaps, cut where it crosses the edges
  const lineParts = (points, from, to, gap) => {
    const out = [];
    let part = [], prev = null;
    const cut = () => { if (part.length) out.push(part); part = []; };
    const between = (a, b, t) => ({ t, v: a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) });
    for (const p of points) {
      if (p.v == null || (prev && gap > 0 && p.t - prev.t > gap)) { cut(); prev = null; if (p.v == null) continue; }
      if (p.t >= from) {
        if (prev && prev.t < from) part.push(between(prev, p, from));
        if (p.t > to) { if (prev) part.push(between(prev, p, to)); break; }
        part.push(p);
      }
      prev = p;
    }
    cut();
    return out;
  };
  // the index in a sorted list of times that is closest to t
  const nearestTime = (list, t) => {
    let a = 0, b = list.length - 1;
    while (b - a > 1) { const mid = (a + b) >> 1; if (list[mid] <= t) a = mid; else b = mid; }
    return b > a && list[b] - t < t - list[a] ? b : Math.max(0, a);
  };
  // everything the chart shows: its HTML, and what the crosshair needs
  const buildLines = (series, o) => {
    const height = Number(o.height) > 0 ? Number(o.height) : 220;
    const data = (series || []).map((s, i) => ({ ...s, label: s.label ?? '', tone: s.tone || SERIES[i] || 'idle', points: (s.points || []).map(linePoint).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t) }));
    let first = Infinity, last = -Infinity;
    for (const s of data) for (const p of s.points) if (p.v != null) { first = Math.min(first, p.t); last = Math.max(last, p.t); }
    let from = Number.isFinite(Dash.time(o.from)) ? Dash.time(o.from) : first, to = Number.isFinite(Dash.time(o.to)) ? Dash.time(o.to) : last;
    if (from === to) { from -= 30 * MINUTE; to += 30 * MINUTE; } // a single moment, in the middle of an hour
    let lo = o.min === 'auto' ? Infinity : 0, hi = o.min === 'auto' ? -Infinity : 0;
    const times = new Set();
    for (const s of data) {
      s.parts = lineParts(s.points, from, to, Number(s.gap ?? o.gap) || 0);
      s.seen = s.points.filter((p) => p.v != null && p.t >= from && p.t <= to);
      s.times = s.seen.map((p) => p.t);
      for (const p of s.seen) times.add(p.t);
      for (const part of s.parts) for (const p of part) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
      const steps = s.times.slice(1).map((t, i) => t - s.times[i]).sort((a, b) => a - b);
      s.step = steps.length ? steps[steps.length >> 1] : 0;
    }
    const all = [...times].sort((a, b) => a - b);
    if (!(to > from) || !data.some((s) => s.parts.length)) return { html: `<p class="empty">${esc(o.empty ?? 'Nothing to show')}</p>`, view: null };
    const refs = (o.refs || []).filter((r) => isNum(r.value));
    for (const r of refs) { lo = Math.min(lo, Number(r.value)); hi = Math.max(hi, Number(r.value)); }
    const fixedLo = isNum(o.min), fixedHi = isNum(o.max);
    if (fixedLo) lo = Number(o.min);
    if (fixedHi) hi = Number(o.max);
    if (!(hi > lo)) { if (fixedHi && !fixedLo) lo = hi - 1; else hi = lo + (Math.abs(lo) || 1); } // a flat line, or limits the wrong way round
    const ticks = valueTicks(lo, hi, Number(o.ticks) || 4);
    if (!fixedLo) lo = Math.floor(lo / ticks.step + 1e-9) * ticks.step;
    if (!fixedHi) hi = Math.ceil(hi / ticks.step - 1e-9) * ticks.step;
    const X = (t) => ((t - from) / (to - from)) * 100, Y = (v) => ((hi - v) / (hi - lo)) * 100;
    const pc = (n) => +n.toFixed(3);
    const at = (p) => `${pc(X(p.t) * 10)} ${pc(Y(p.v) * 10)}`;
    const format = o.format || fmt.compact;
    const text = (v, f = format) => (v == null ? NONE : String(f(v)));
    const show = (s) => (o.private ? Dash.mask(s) : esc(s));
    const say = (s) => (o.private ? Dash.mask.text(s) : s);
    const cls = (s) => `${esc(s.tone)}${s.dashed ? ' dashed' : ''}`;
    const end = (s) => s.seen[s.seen.length - 1];
    const drawn = data.filter((s) => s.seen.length || s.parts.length);
    const many = data.length > 1;
    // a value at a time: the series' own point there, or the one closest if it isn't more than half its usual step away
    // (the readout then names that point's time)
    const valueAt = (s, t) => { const p = s.seen.length ? s.seen[nearestTime(s.times, t)] : null; return p && Math.abs(p.t - t) <= s.step / 2 ? p : null; };
    const fine = data.some((s) => s.step > 0 && s.step < MINUTE);
    const daily = all.every((t) => { const d = new Date(t); return !(d.getHours() || d.getMinutes() || d.getSeconds() || d.getMilliseconds()); });
    const when = o.when || ((t) => (daily ? fmt.date(t) : fine ? fmt.time(t) : to - from <= DAY * 1.02 ? fmt.time(t, { seconds: false }) : fmt.when(t))); // (a day that is a little over still reads as one)
    const own = (p, t) => (p && when(p.t) !== when(t) ? when(p.t) : '');
    const read = (t) => `${when(t)}: ` + data.map((s) => {
      const p = valueAt(s, t), other = own(p, t);
      return `${s.label ? s.label + ' ' : ''}${say(text(p ? p.v : null))}${other ? ` (at ${other})` : ''}`;
    }).join(', ');

    const top = (n) => sized('data-css-top', n, `top:${n}%`);
    const left = (n) => sized('data-css-left', n, `left:${n}%`);
    const spot = (n, m) => (strict() ? left(n) + top(m) : ` style="left:${n}%;top:${m}%"`);
    const labels = ticks.list(lo, hi).map((v) => ({ v, text: text(v, o.yFormat || format) }));
    const grid = labels.map((l) => `<div class="chart-grid${l.v === 0 && lo < 0 ? ' zero' : ''}"${top(pc(Y(l.v)))}><span>${show(l.text)}</span></div>`).join('');
    const gut = Math.round(Math.max(40, ...labels.map((l) => 12 + 8.4 * l.text.length))); // room for the longest
    const limits = refs.filter((r) => r.value >= lo && r.value <= hi).map((r) => `<div class="line-ref${toneClass(r.tone)}"${top(pc(Y(r.value)))}>${r.label ? `<span>${esc(r.label)}</span>` : ''}</div>`).join('');
    const areas = drawn.filter((s) => s.area ?? (o.area && !many)).map((s) => s.parts.filter((p) => p.length > 1).map((p) => {
      const base = pc(Y(clamp(0, lo, hi)) * 10);
      return `<path class="area ${esc(s.tone)}" d="M${p.map(at).join('L')}L${pc(X(p[p.length - 1].t) * 10)} ${base}L${pc(X(p[0].t) * 10)} ${base}Z"></path>`;
    }).join('')).join('');
    const lines = drawn.map((s) => {
      const d = s.parts.filter((p) => p.length > 1).map((p) => 'M' + p.map(at).join('L')).join('');
      const lone = s.parts.filter((p) => p.length === 1).map((p) => `M${at(p[0])}h0`).join(''); // a point with gaps beside it
      return (d ? `<path class="${cls(s)}" d="${d}"></path>` : '') + (lone ? `<path class="lone ${esc(s.tone)}" d="${lone}"></path>` : '');
    }).join('');
    const ends = drawn.filter((s) => s.seen.length);
    const dots = ends.map((s) => `<i class="line-dot ${esc(s.tone)}"${spot(pc(X(end(s).t)), pc(Y(end(s).v)))}></i>`).join('');
    const legend = !many ? '' : `<div class="legend">${data.map((s) => `<span class="legend-item ${cls(s)}"><i></i><span class="ellipsis">${esc(s.label)}</span> <b>${show(text(end(s)?.v ?? null))}</b></span>`).join('')}</div>`;
    // the names at the ends of the lines, when every line ends at the right and none would touch another
    const tops = ends.map((s) => (Y(end(s).v) / 100) * height).sort((a, b) => a - b);
    const named = many && data.length <= SERIES.length && ends.length === data.length && ends.every((s) => X(end(s).t) > 97) && tops.every((y, i) => !i || y - tops[i - 1] >= 16);
    const names = named ? `<div class="line-ends" aria-hidden="true">${ends.map((s) => `<span${top(pc(Y(end(s).v)))}>${esc(s.label)}</span>`).join('')}</div>` : '';
    const xs = timeTicks(from, to, 6);
    const axis = xs.map(({ t, text: label }, i) => {
      const x = pc(X(t));
      const c = [x < 4 ? 'start' : x > 96 ? 'end' : '', i % 2 ? 'minor' : ''].filter(Boolean).join(' ');
      return `<span${c ? ` class="${c}"` : ''}${left(x)}>${esc(label)}</span>`;
    }).join('');
    const name = o.label || data.map((s) => s.label).filter(Boolean).join(', ') || 'Line chart';
    const summary = data.map((s) => {
      const vs = s.seen.map((p) => p.v);
      const low = vs.reduce((a, b) => Math.min(a, b), Infinity), high = vs.reduce((a, b) => Math.max(a, b), -Infinity);
      return `${s.label ? s.label + ': ' : ''}${vs.length ? `${say(text(end(s).v))} at the end, from ${say(text(low))} to ${say(text(high))}` : 'nothing'}`;
    }).join('; ');
    const span = daily ? fmt.date : fmt.when;
    const box = strict() ? sized('data-css-chart-h', height) + sized('data-css-gut', gut) : ` style="--chart-h:${height}px;--gut:${gut}px"`;
    // a slider over the points; a range that a line only passes through has none to read
    const role = !all.length ? ` role="img" aria-label="${esc(name)}"` : ` role="slider" tabindex="0" aria-orientation="horizontal" aria-label="${esc(name)}" aria-valuemin="1" aria-valuemax="${all.length}" aria-valuenow="${all.length}" aria-valuetext="${esc(read(all[all.length - 1]))}"`;
    const html = `<div class="chart line-chart"${box}>${legend}<p class="sr-only">${esc(`${name}, ${span(from)} to ${span(to)}. ${summary}.`)}</p>`
      + `<div class="line-row"><div class="chart-plot line-plot" data-key="dash-lines"${role}>`
      + `${grid}${limits}<svg class="line-svg${fixedLo || fixedHi ? ' clip' : ''}" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${areas}${lines}</svg>${dots}`
      + `<div class="line-cross" hidden></div>${data.map((s) => `<i class="line-dot on ${esc(s.tone)}" hidden></i>`).join('')}<div class="line-tip" hidden></div></div>`
      + `${names}<div class="line-x" aria-hidden="true">${axis}</div></div></div>`;
    return { html, view: { data, all, from, to, X, Y, valueAt, when, own, read, show, text } };
  };
  Dash.lines = (target, series, options = {}) => {
    const node = el(target);
    if (!node) return null;
    const st = node.__dashLines || { view: null, at: null };
    st.series = series;
    st.options = options;
    const $1 = (sel) => node.querySelector(sel);
    const hide = () => {
      st.at = null;
      if (!st.view || !st.view.all.length) return;
      for (const e of node.querySelectorAll('.line-cross, .line-tip, .line-dot.on')) e.hidden = true;
      const plot = $1('.line-plot');
      if (plot) { plot.setAttribute('aria-valuenow', st.view.all.length); plot.setAttribute('aria-valuetext', st.view.read(st.view.all[st.view.all.length - 1])); }
    };
    const show = (i) => {
      const v = st.view, plot = $1('.line-plot');
      if (!v || !plot || !v.all.length) return;
      i = clamp(i, 0, v.all.length - 1);
      const t = v.all[i], x = v.X(t);
      st.at = t;
      const cross = $1('.line-cross'), tip = $1('.line-tip');
      cross.hidden = false;
      cross.style.left = x + '%';
      const head = document.createElement('div');
      head.className = 'line-when';
      head.textContent = v.when(t);
      const on = node.querySelectorAll('.line-dot.on');
      const rows = v.data.map((s, k) => {
        const p = v.valueAt(s, t);
        on[k].hidden = !p;
        if (p) { on[k].style.left = v.X(p.t) + '%'; on[k].style.top = v.Y(p.v) + '%'; }
        const row = document.createElement('div'), key = document.createElement('i'), value = document.createElement('b'), name = document.createElement('span');
        row.className = 'line-val ' + s.tone + (s.dashed ? ' dashed' : '');
        value.innerHTML = v.show(v.text(p ? p.v : null)); // escaped there, or a stand-in
        const other = v.own(p, t);
        name.textContent = s.label + (other ? ` · ${other}` : '');
        row.append(...(v.data.length > 1 ? [key, value, name] : [value]));
        return row;
      });
      tip.replaceChildren(head, ...rows);
      tip.hidden = false;
      const right = x > 50; // on the side with more room
      tip.style.left = right ? 'auto' : `calc(${x}% + 12px)`;
      tip.style.right = right ? `calc(${100 - x}% + 12px)` : 'auto';
      plot.setAttribute('aria-valuenow', i + 1);
      plot.setAttribute('aria-valuetext', v.read(t));
    };
    const draw = (force = false) => {
      const built = buildLines(st.series, st.options), { at, view } = st;
      st.view = null; // the focus comes back to the new chart while it is put in: nothing to read yet
      const wrote = Dash.render(node, built.html, { force });
      // (a refresh that waits for a selection leaves the old chart, and the crosshair must read that one)
      st.view = wrote || node.__dashHtml === built.html ? built.view : view;
      st.at = at;
      if (wrote && at != null && st.view) show(nearestTime(st.view.all, at));
      return wrote;
    };
    st.draw = draw;
    if (!node.__dashLines) {
      node.__dashLines = st;
      const inPlot = (e) => { const p = e.target.closest?.('.line-plot'); return p && node.contains(p) ? p : null; };
      const follow = (e) => {
        const plot = inPlot(e);
        if (!plot || !st.view) return;
        const r = plot.getBoundingClientRect();
        show(nearestTime(st.view.all, st.view.from + clamp((e.clientX - r.left) / r.width, 0, 1) * (st.view.to - st.view.from)));
      };
      node.addEventListener('pointermove', (e) => { if (inPlot(e)) follow(e); else if (st.at != null && e.pointerType !== 'touch') hide(); });
      node.addEventListener('pointerdown', follow);
      node.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hide(); }); // a finger's reading stays until it presses elsewhere
      node.addEventListener('focusin', (e) => { const p = inPlot(e); if (p && st.at == null && p.matches(':focus-visible') && st.view) show(st.view.all.length - 1); });
      node.addEventListener('focusout', (e) => { if (inPlot(e)) hide(); });
      node.addEventListener('keydown', (e) => {
        if (!inPlot(e) || !st.view || e.ctrlKey || e.metaKey || e.altKey) return;
        const n = st.view.all.length, i = st.at == null ? n - 1 : nearestTime(st.view.all, st.at), page = Math.max(1, Math.round(n / 10));
        const to = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, PageUp: i + page, PageDown: i - page, Home: 0, End: n - 1 }[e.key];
        if (to != null) { e.preventDefault(); show(to); } else if (e.key === 'Escape' && st.at != null) { e.preventDefault(); e.stopPropagation(); hide(); }
      });
    }
    node.__dashPrivate?.();
    node.__dashPrivate = options.private ? Dash.privacy.onChange(() => st.draw(true)) : null;
    draw();
    const csvColumns = () => [{ key: 't', label: 'Time', value: (r) => new Date(r.t).toISOString() }, ...st.view.data.map((s, k) => ({ key: 's' + k, label: s.label || 'Value', value: (r) => r.at[k].get(r.t) ?? '' }))];
    return {
      // new data; the options stay unless given again
      update(next, more) { return Dash.lines(node, next, { ...st.options, ...more }); },
      redraw() { draw(true); },
      // every time shown, with each series' value at it
      csv() {
        if (!st.view) return '';
        const at = st.view.data.map((s) => new Map(s.seen.map((p) => [p.t, p.v])));
        return Dash.csv(st.view.all.map((t) => ({ t, at })), csvColumns());
      },
      download(name = 'chart.csv') { Dash.download(name, this.csv()); },
    };
  };
  Dash.lines.html = (series, options = {}) => buildLines(series, options).html; // the markup alone: no crosshair
  // donut: [{ value, tone, label }] with a number in the middle
  Dash.donut = (segments, { center = '', sub = '', title = '' } = {}) => {
    const r = 42;
    const c = 2 * Math.PI * r;
    const total = segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
    const parts = segments.filter((x) => Number(x.value) > 0);
    const gap = parts.length > 1 ? 1.5 : 0;
    let at = 0;
    const arcs = total > 0 ? parts.map((x) => {
      const len = (Number(x.value) / total) * c;
      const shown = Math.max(0, len - gap);
      const out = `<circle class="seg-arc${toneClass(x.tone)}" r="${r}" cx="60" cy="60" stroke-dasharray="${shown.toFixed(2)} ${(c - shown).toFixed(2)}"`
        + ` stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 60 60)"><title>${esc(x.label ?? '')}: ${esc(x.value)}</title></circle>`;
      at += len;
      return out;
    }).join('') : '';
    return `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${esc(title || `${center} ${sub}`.trim())}">`
      + `<circle class="ring-track" r="${r}" cx="60" cy="60"></circle>${arcs}`
      + `<text class="big-text" x="60" y="${sub ? 64 : 70}" text-anchor="middle">${esc(center)}</text>`
      + (sub ? `<text class="small-text" x="60" y="80" text-anchor="middle">${esc(sub)}</text>` : '') + '</svg>';
  };
  // half-circle gauge filled to frac (0–1); tone defaults to ok / warn from 0.7 / bad from 0.9 (or pass one)
  Dash.gauge = (frac, { name = '', sub = '', text, tone } = {}) => {
    const f = clamp(Number(frac) || 0, 0, 1);
    const t = tone || (f >= 0.9 ? 'bad' : f >= 0.7 ? 'warn' : 'ok');
    const arc = 'M 14 66 A 46 46 0 0 1 106 66';
    return `<div class="gauge ${esc(t)}"><svg viewBox="0 0 120 74" role="img" aria-label="${esc(name)} ${Math.round(f * 100)}%">`
      + `<path class="track" d="${arc}" pathLength="100"></path>`
      + (f > 0 ? `<path class="val" d="${arc}" pathLength="100" stroke-dasharray="${(f * 100).toFixed(2)} 100"></path>` : '')
      + `<text class="pct" x="60" y="62" text-anchor="middle">${esc(text ?? Math.round(f * 100) + '%')}</text></svg>`
      + `<div>${name ? `<div class="gauge-name">${esc(name)}</div>` : ''}${sub ? `<div class="gauge-sub">${esc(sub)}</div>` : ''}</div></div>`;
  };
  // sparkline: numbers in time order; labels: [first, last] under it
  Dash.spark = (values, { tone, width = 240, height = 56, area = true, labels, min, max } = {}) => {
    const vals = values.map(Number).filter(Number.isFinite);
    if (!vals.length) return `<svg class="spark" viewBox="0 0 ${width} ${height}"></svg>`;
    const lo = min ?? Math.min(...vals);
    const hi = max ?? Math.max(...vals);
    const range = hi - lo || 1;
    const pad = 4;
    const pts = vals.map((v, i) => [
      vals.length === 1 ? width / 2 : pad + (i / (vals.length - 1)) * (width - pad * 2),
      pad + (1 - (v - lo) / range) * (height - pad * 2),
    ]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const [ex, ey] = pts[pts.length - 1];
    const fill = area ? `<path class="area" d="${line} L${ex.toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z"></path>` : '';
    const svg = `<svg class="spark${toneClass(tone)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${fill}`
      + `<path class="line" d="${line}"></path></svg>`;
    // the end dot is HTML, so it stays round when the svg stretches
    const x = (ex / width * 100).toFixed(2), y = (ey / height * 100).toFixed(2), csp = strict();
    const dot = csp ? `<span class="dot${toneClass(tone || 'blue')}" data-css-x="${x}" data-css-y="${y}"></span>`
      : `<span class="dot${toneClass(tone || 'blue')}" style="position:absolute;left:calc(${x}% - 3.5px);top:calc(${y}% - 3.5px);width:7px;height:7px"></span>`;
    const under = labels ? `<div class="spark-labels"><span>${esc(labels[0] ?? '')}</span><span>${esc(labels[1] ?? '')}</span></div>` : '';
    return `<div${csp ? ' class="spark-box"' : ' style="position:relative"'}>${svg}${dot}</div>${under}`;
  };

  // ---- more builders (1.8): breadcrumbs, stepper, avatars, progress, slider, entries (all escape their text)

  // a link's address as given, but never one that runs script (javascript:, vbscript:, data:): those become "#"
  const safeHref = (h) => (/^\s*(javascript|vbscript|data):/i.test(String(h).replace(/[\u0000-\u001f\s]+/g, '')) ? '#' : String(h));
  // a picture's address: also data:image/… (a picture in the page itself), which an <img> only ever shows
  const safeSrc = (h) => (/^data:image\/[a-z0-9.+-]+[;,]/i.test(String(h).trim()) ? String(h).trim() : safeHref(h));

  // breadcrumbs: Dash.crumbs([{ label: 'Home', href: '/' }, { label: 'Fleet', href: '/fleet' }, 'eu-west']); the last is where the reader is
  Dash.crumbs = (items, { label = 'Breadcrumb' } = {}) => `<nav class="crumbs" aria-label="${esc(label)}"><ol>${(items || []).map((it, i, all) => {
    const x = it && typeof it === 'object' ? it : { label: it };
    const inner = i === all.length - 1 ? `<span aria-current="page">${esc(x.label)}</span>`
      : x.href != null ? `<a href="${esc(safeHref(x.href))}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`;
    return `<li>${inner}</li>`;
  }).join('')}</ol></nav>`;

  // the steps of a task: Dash.stepper(['Account', 'Plan', 'Pay'], 1): the first done, the second current.
  // A step can be { label, sub, failed }; current past the last means all done; { vertical: true } stacks them.
  Dash.stepper = (steps, current = 0, { vertical = false, tone, label = 'Steps' } = {}) =>
    `<ol class="stepper${vertical ? ' vertical' : ''}${toneClass(tone)}" aria-label="${esc(label)}">${(steps || []).map((s, i) => {
      const x = s && typeof s === 'object' ? s : { label: s };
      const state = x.failed ? 'failed' : i < current ? 'done' : '';
      const said = x.failed ? ', failed' : i < current ? ', done' : '';
      return `<li${state ? ` class="${state}"` : ''}${i === current ? ' aria-current="step"' : ''}><span>${esc(x.label)}${said ? `<span class="sr-only">${said}</span>` : ''}`
        + `${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></li>`;
    }).join('')}</ol>`;

  // an avatar: Dash.avatar('Ada Lovelace') is "AL" in a colour picked from the name (the same name, the same colour);
  // { src } shows a picture instead, { tone } picks the colour, { size: 'sm' | 'lg' }, { square: true }
  const AVATAR_TONES = ['blue', 'teal', 'purple', 'orange', 'pink', 'gold', 'ok', 'accent', 'bronze'];
  const initials = (name) => {
    const words = String(name ?? '').trim().split(/[\s._@-]+/).filter(Boolean).map((w) => Array.from(w));
    if (!words.length) return '?';
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2).join('')).toUpperCase();
  };
  const nameTone = (name) => {
    let h = 0;
    for (const ch of String(name ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_TONES[h % AVATAR_TONES.length];
  };
  Dash.avatar = (name, { src, tone, size, square = false, title = name } = {}) => {
    const cls = `avatar${size ? ' ' + esc(size) : ''}${square ? ' square' : ''} ${esc(tone || nameTone(name))}`;
    const tip = title != null && title !== '' ? ` title="${esc(title)}"` : '';
    return src ? `<span class="${cls}"${tip}><img src="${esc(safeSrc(src))}" alt="${esc(name ?? '')}"></span>`
      : `<span class="${cls}" role="img" aria-label="${esc(name ?? '')}"${tip}>${esc(initials(name))}</span>`;
  };
  // a few avatars overlapping, the rest as "+3": Dash.avatars(['Ada', 'Grace', …], { max: 4 }) (names, or { name, src, tone })
  Dash.avatars = (people, { max = 4, size, label } = {}) => {
    const all = (people || []).map((p) => (p && typeof p === 'object' ? p : { name: p }));
    const shown = all.length > max ? all.slice(0, Math.max(1, max - 1)) : all;
    const rest = all.slice(shown.length);
    const names = (list) => list.map((p) => p.name).join(', ');
    return `<span class="avatars" role="group" aria-label="${esc(label || names(all))}">${shown.map((p) => Dash.avatar(p.name, { src: p.src, tone: p.tone, size, square: p.square })).join('')}`
      + `${rest.length ? `<span class="avatar extra${size ? ' ' + esc(size) : ''}" title="${esc(names(rest))}">+${rest.length}</span>` : ''}</span>`;
  };

  // progress: Dash.progress(0.4) is a bar, Dash.progress(null) one that runs while the amount isn't known.
  // { label } puts a line above it with the share on the right ({ value: '4 of 10' } says something else there); { lg: true } is thicker
  Dash.progress = (frac, { tone, label, value, lg = false, title } = {}) => {
    const known = isNum(frac);
    const p = known ? pctOf(frac, 1) : 0;
    const shown = value != null ? String(value) : known ? fmt.pct(p, 0) : '';
    const head = label ? `<div class="progress-head"><span>${esc(label)}</span>${shown ? `<b>${esc(shown)}</b>` : ''}</div>` : '';
    return `${head}<div class="progress${known ? '' : ' indeterminate'}${lg ? ' lg' : ''}${toneClass(tone)}" role="progressbar"`
      + `${known ? ` aria-valuenow="${+p.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"` : ''} aria-label="${esc(label || title || 'Progress')}"`
      + `${title ? ` title="${esc(title)}"` : ''}><i${known ? fillW(p) : ''}></i></div>`;
  };
  // the same, round: Dash.progressCircle(0.4, { size: 36, text: '40%' }) (an SVG; its size and share are attributes, so a strict style policy is fine)
  Dash.progressCircle = (frac, { tone, size = 36, text, label, title } = {}) => {
    const known = isNum(frac);
    const p = known ? +pctOf(frac, 1).toFixed(1) : 25;
    const px = Number(size) > 0 ? Number(size) : 36;
    return `<span class="progress-circle${known ? '' : ' indeterminate'}${toneClass(tone)}" role="progressbar"`
      + `${known ? ` aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"` : ''} aria-label="${esc(label || title || 'Progress')}"${title ? ` title="${esc(title)}"` : ''}>`
      + `<svg viewBox="0 0 36 36" width="${px}" height="${px}" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15.5" pathLength="100"></circle>`
      + `<circle class="fill" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${p} 100"></circle></svg>${text != null && text !== '' ? `<b>${esc(text)}</b>` : ''}</span>`;
  };

  // a slider with its value beside it: Dash.slider({ label: 'Volume', name: 'vol', min: 0, max: 100, value: 40, unit: '%' })
  // (dash.js keeps the number beside it on the value as it moves)
  Dash.slider = ({ label, name, id, min = 0, max = 100, step = 1, value = min, unit = '', tone, disabled = false } = {}) =>
    `<label class="slider${toneClass(tone)}">${label ? `<span>${esc(label)}</span>` : ''}<input type="range"${name ? ` name="${esc(name)}"` : ''}${id ? ` id="${esc(id)}"` : ''}`
    + ` min="${esc(min)}" max="${esc(max)}" step="${esc(step)}" value="${esc(value)}"${unit ? ` data-unit="${esc(unit)}"` : ''}${!label && name ? ` aria-label="${esc(name)}"` : ''}`
    + `${disabled ? ' disabled' : ''}><output>${esc(String(value) + unit)}</output></label>`;

  // a list of things, a line or two each:
  //   Dash.entries(rows, { title: 'name', sub: (r) => r.region, lead: (r) => Dash.avatar(r.name), end: (r) => Dash.pill(r.state, r.tone), href: (r) => '#/' + r.id })
  // title and sub are keys or functions (escaped); lead and end return HTML; href makes each a link, { button: true } a button
  // (with { key } as data-key, for a click handler and for Dash.render to keep the focus); { wrap: true } lets long text wrap
  Dash.entries = (rows, { title = 'title', sub, lead, end, href, button = false, key, wrap = false, empty = 'Nothing here yet', label } = {}) => {
    const get = (f, r) => (typeof f === 'function' ? f(r) : f != null && r ? r[f] : null);
    if (!rows || !rows.length) return `<div class="empty">${esc(empty)}</div>`;
    return `<ul class="entries${wrap ? ' wrap' : ''}"${label ? ` aria-label="${esc(label)}"` : ''}>${rows.map((r) => {
      const t = get(title, r), s = get(sub, r), l = lead ? lead(r) : '', e = end ? end(r) : '', h = href ? href(r) : null, k = key != null ? get(key, r) : null;
      const inner = `${l ? `<span class="entry-lead">${l}</span>` : ''}<span class="entry-text"><span class="entry-title">${esc(t ?? '')}</span>`
        + `${s != null && s !== '' ? `<span class="entry-sub">${esc(s)}</span>` : ''}</span>${e ? `<span class="entry-end">${e}</span>` : ''}`;
      const dk = k != null ? ` data-key="${esc(k)}"` : '';
      if (h != null) return `<li><a class="entry" href="${esc(safeHref(h))}"${dk}>${inner}</a></li>`;
      if (button) return `<li><button type="button" class="entry"${dk}>${inner}</button></li>`;
      return `<li class="entry"${dk}>${inner}</li>`;
    }).join('')}</ul>`;
  };

  // ---- IP addresses: blurred until clicked, so they stay out of screen shares (the data itself still needs a login)

  const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const shownIps = new Set();
  // text in, escaped HTML out, with each IPv4 address wrapped in a blurred .ip span
  Dash.maskIps = (text) => esc(text).replace(IPV4, (ip) => (shownIps.has(ip)
    ? `<span class="ip shown" data-ip="${ip}" role="button" tabindex="0" title="Click to blur it again">${ip}</span>`
    : `<span class="ip" data-ip="${ip}" role="button" tabindex="0" aria-label="IP address, hidden. Press to show it" title="Click to show the IP">${ip}</span>`));
  // for tooltips, which can't blur: the addresses not shown yet become "(IP hidden)"
  Dash.hideIps = (text) => String(text ?? '').replace(IPV4, (ip) => (shownIps.has(ip) ? ip : '(IP hidden)'));
  const toggleIp = (span) => {
    const ip = span.dataset.ip;
    const show = !shownIps.has(ip);
    show ? shownIps.add(ip) : shownIps.delete(ip);
    for (const s of document.querySelectorAll('.ip[data-ip]')) {
      if (s.dataset.ip !== ip) continue;
      s.classList.toggle('shown', show);
      s.title = show ? 'Click to blur it again' : 'Click to show the IP';
      if (show) s.removeAttribute('aria-label'); else s.setAttribute('aria-label', 'IP address, hidden. Press to show it');
    }
  };

  // ---- values the reader can hide (an eye in the top bar), so they stay out of meetings and screenshots

  // While they are hidden a private value isn't in the page at all: a fixed stand-in is blurred in its place, so there is
  // nothing to read, select, copy or find in the markup. (.ip is another thing: it blurs the real address, and a click
  // shows it.)
  //   <button type="button" class="icon-btn" data-privacy="balances"></button>    the eye; Dash.privacy.button('balances') writes it
  //   Dash.mask(fmt.usd(total))                 HTML: the text, escaped, or the stand-in
  //   Dash.mask.text(name, 'an account')        plain text, for a title, a label or a toast: the text, or the other words
  //   Dash.privacy.onChange(() => draw())          draw again when the reader hides or shows them
  // Dash.table does it by itself for columns with private: true. A text box with data-private shows dots until it is
  // clicked or typed in (its value is still in the box). The choice is kept in this browser (Dash.config.privacyKey); its
  // other open tabs follow.
  const privacyFns = new Set();
  let privacyOn = null; // not read yet: Dash.config.privacyKey may still change
  const eye = (off) => '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + `<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>${off ? '<path d="m2.5 2.5 11 11"/>' : ''}</svg>`;
  const privacyLabel = (noun, on) => `${on ? 'Show' : 'Hide'} ${noun || 'values'}`;
  // every eye, and the mark on <html> that text boxes look at
  const markPrivacy = (on = Dash.privacy.on) => {
    if (!hasDom) return;
    if (on) document.documentElement.dataset.values = 'hidden'; else delete document.documentElement.dataset.values;
    for (const b of document.querySelectorAll('[data-privacy]')) {
      if (!b.textContent.trim()) { // an eye: the picture and the words say what pressing it does
        b.innerHTML = eye(!on);
        b.title = privacyLabel(b.dataset.privacy, on);
        b.setAttribute('aria-label', b.title);
      } else b.setAttribute('aria-pressed', String(on)); // a button with its own words keeps them
    }
  };
  const setPrivacy = (on) => {
    const was = Dash.privacy.on;
    privacyOn = on;
    if (on && hasDom) { // what would keep one showing: selected text (Dash.render waits for it), an open tip, a box being read
      getSelection()?.removeAllRanges();
      hideTip();
      if (tipEl) tipEl.textContent = '';
      for (const box of document.querySelectorAll('.reveal[data-private]')) box.classList.remove('reveal');
    }
    markPrivacy();
    if (was === on) return;
    // one part's mistake must not leave another part's values showing
    for (const fn of [...privacyFns]) try { fn(on); } catch (e) { setTimeout(() => { throw e; }); }
  };
  Dash.privacy = {
    // are values hidden now?
    get on() {
      if (privacyOn == null) privacyOn = Dash.store.get(Dash.config.privacyKey) === true;
      return privacyOn;
    },
    set(on) { Dash.store.set(Dash.config.privacyKey, Boolean(on)); setPrivacy(Boolean(on)); },
    toggle() { Dash.privacy.set(!Dash.privacy.on); },
    // fn(hidden) whenever it changes, here or in another tab; returns a function that stops it
    onChange(fn) { privacyFns.add(fn); return () => { privacyFns.delete(fn); }; },
    // the eye as HTML: Dash.privacy.button('balances') is "Hide balances", then "Show balances"
    button(noun = 'values', { cls = '' } = {}) {
      const on = Dash.privacy.on, words = privacyLabel(noun, on);
      return `<button type="button" class="icon-btn${cls ? ' ' + esc(cls) : ''}" data-privacy="${esc(noun)}" title="${esc(words)}" aria-label="${esc(words)}">${eye(!on)}</button>`;
    },
  };
  // a value as HTML, or its stand-in while values are hidden. html: true takes markup from a builder; as is the
  // stand-in's text (never the value's own length). Nothing to hide ('' or —) shows as it is.
  Dash.mask = (text, { html = false, as = '000.00', label = 'hidden' } = {}) => {
    const shown = text == null ? '' : html ? String(text) : esc(text);
    if (shown === '' || shown === NONE || !Dash.privacy.on) return shown;
    return `<span class="private" aria-hidden="true">${esc(as)}</span><span class="sr-only">${esc(label)}</span>`;
  };
  Dash.mask.text = (text, as = 'hidden') => (text == null || text === '' ? '' : Dash.privacy.on ? String(as) : String(text));

  // ---- layers: what shows above what
  // An open modal dialog sits above the page and makes the rest of it unclickable, so toasts, notices, tooltips and
  // popups go inside the topmost one, or inside the popup they belong to; with neither open, into <body>.
  const modals = []; // modal dialogs in the order they opened (the ones dash.js saw open)
  let ids = 0; // numbers element ids
  const popups = []; // open popups, oldest first (Dash.popup, below)
  const isModal = (d) => { try { return d.matches(':modal'); } catch { return d.open; } };
  const topModal = () => {
    const open = [...document.querySelectorAll('dialog[open]')].filter(isModal);
    const seen = modals.filter((d) => open.includes(d));
    const all = open.filter((d) => !seen.includes(d)).concat(seen); // ones opened behind dash.js's back first: their order is unknown
    return all[all.length - 1] || null;
  };
  const layerFor = (near) => {
    if (near && near.closest) {
      for (let i = popups.length - 1; i >= 0; i--) if (popups[i].el.contains(near)) return popups[i].el;
      const own = near.closest('dialog[open]');
      if (own) return own;
    }
    return topModal() || document.body;
  };
  const lift = (node, near) => {
    const to = layerFor(near);
    if (node && node.parentNode !== to) to.appendChild(node);
    return node;
  };
  // a modal dialog opening: popups left open beneath it close, and toasts and notices move up into it
  const opened = (d) => {
    if (!modals.includes(d)) modals.push(d);
    for (const p of popups.slice()) if (!d.contains(p.el)) p.close();
    for (const n of [toastEl, noticeBox]) if (n) lift(n);
  };
  const openModal = (d) => { d.showModal(); opened(d); };

  // ---- copy, toast, notices

  // navigator.clipboard needs a secure page (https or localhost); fall back to the old copy command elsewhere
  Dash.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    area.remove();
    return ok;
  };

  // a short message at the bottom of the page: Dash.toast('Saved'), Dash.toast('Could not save', { tone: 'bad' })
  let toastEl = null;
  let toastTimer = null;
  // With an action it has a button and stays 6 s: Dash.toast('Deleted 3 rows', { action: 'Undo', onAction: restore })
  Dash.toast = (msg, { tone = '', ms, action = '', onAction } = {}) => {
    if (!toastEl) {
      toastEl = Object.assign(document.createElement('div'), { className: 'toast' });
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
    }
    lift(toastEl); // inside an open modal dialog, so it shows above it
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast' + toneClass(tone) + (action ? ' act' : '');
    if (action) {
      toastEl.innerHTML = `<span class="toast-text">${esc(msg)}</span><button type="button" class="toast-act">${esc(action)}</button>`;
      toastEl.lastChild.addEventListener('click', () => {
        clearTimeout(toastTimer);
        toastEl.classList.remove('show');
        if (onAction) onAction();
      });
    }
    void toastEl.offsetWidth; // restart the transition when one toast replaces another
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms ?? (action ? 6000 : 2400));
  };

  // an alert in the corner that stays until dismissed (or ms runs out): something that started needing you.
  // Dash.notify({ key: id, title: 'agent-7', status: 'needs you', text: 'Approve the edit?', tone: 'orange', onClick })
  // A second notify with the same key replaces the first. Dash.notify.dismiss(key) takes it away.
  let noticeBox = null;
  Dash.notify = ({ key, title = '', status = '', text = '', tone = 'orange', onClick, ms = 0, max = 4 } = {}) => {
    if (!noticeBox) {
      noticeBox = Object.assign(document.createElement('div'), { className: 'notices' });
      noticeBox.setAttribute('aria-live', 'polite');
    }
    lift(noticeBox); // inside an open modal dialog, where it can still be clicked
    if (key != null) Dash.notify.dismiss(key);
    const n = document.createElement('div');
    n.className = 'notice' + toneClass(tone);
    if (key != null) n.dataset.notice = key;
    n.innerHTML = `<span class="dot"></span><button type="button" class="notice-body"><span class="notice-title">${esc(title)}`
      + `${status ? ` <span>${esc(status)}</span>` : ''}</span>${text ? `<span class="notice-text">${esc(text)}</span>` : ''}</button>`
      + '<button type="button" class="notice-x" title="Dismiss" aria-label="Dismiss">×</button>';
    n.querySelector('.notice-x').addEventListener('click', () => n.remove());
    n.querySelector('.notice-body').addEventListener('click', () => { if (onClick) onClick(); n.remove(); });
    noticeBox.appendChild(n);
    while (noticeBox.children.length > max) noticeBox.firstElementChild.remove();
    if (ms) setTimeout(() => n.remove(), ms);
    return n;
  };
  Dash.notify.dismiss = (key) => {
    if (!noticeBox) return;
    for (const n of noticeBox.querySelectorAll('.notice')) if (n.dataset.notice === String(key)) n.remove();
  };

  // ---- re-rendering without losing the reader's place

  // Dash.render('list', html): put new HTML into a part of the page that refreshes. It
  // - skips the write when the HTML is the same as last time (returns false);
  // - skips it while the reader is selecting text in there (false; the next refresh tries again);
  // - keeps the focused control (and what is typed in it, and the caret), which <details> are open, and how far
  //   inner boxes are scrolled. Elements are matched by id, else data-key; a focused element with neither
  //   is matched by its tag and data- attributes (a button with data-select="7" finds its new self).
  // force: true writes anyway (after the reader clicked something, say). Returns true when it wrote.
  const keyOf = (e) => (e.id ? '#' + e.id : e.dataset && e.dataset.key != null ? 'k:' + e.dataset.key : null);
  const sigOf = (e) => e.tagName + [...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}=${a.value}]`).sort().join('');
  // before (for the kit): runs just before the old markup goes, to take out elements that are put back afterwards.
  Dash.render = (target, html, { force = false, before } = {}) => {
    const node = el(target);
    if (!node) return false;
    html = String(html);
    if (!force && node.__dashHtml === html) return false;
    const sel = getSelection();
    if (!force && sel && !sel.isCollapsed && sel.rangeCount && (node.contains(sel.getRangeAt(0).commonAncestorContainer) || sel.containsNode(node, true))) return false;
    if (before) before();
    const find = (k) => (k[0] === '#' ? node.querySelector('#' + CSS.escape(k.slice(1))) : node.querySelector(`[data-key="${CSS.escape(k.slice(2))}"]`));
    const active = document.activeElement;
    let focus = null;
    if (active && active !== node && node.contains(active)) {
      focus = { key: keyOf(active), sig: sigOf(active), tag: active.tagName };
      if (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number)$/.test(active.type))) focus.value = active.value;
      try { if (typeof active.selectionStart === 'number') focus.caret = [active.selectionStart, active.selectionEnd]; } catch { /* not a text box */ }
    }
    const open = [...node.querySelectorAll('details')].map((d) => [keyOf(d), d.open]).filter(([k]) => k);
    const scrolled = [...node.querySelectorAll('[id], [data-key]')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => [keyOf(e), e.scrollTop, e.scrollLeft]);
    node.innerHTML = html;
    node.__dashHtml = html;
    if (Dash.config.csp) Dash.applyStyles(node);
    for (const [k, isOpen] of open) { const d = find(k); if (d && d.tagName === 'DETAILS') d.open = isOpen; }
    for (const [k, top, left] of scrolled) { const e = find(k); if (e) { e.scrollTop = top; e.scrollLeft = left; } }
    if (focus) {
      const again = (focus.key && find(focus.key)) || [...node.querySelectorAll(focus.tag)].find((e) => sigOf(e) === focus.sig);
      if (again) {
        if (focus.value != null && 'value' in again) {
          if (!focus.caret) again.value = ''; // (an email or a number box: its caret can't be read, and goes to the end this way)
          again.value = focus.value; // what the reader is typing
        }
        again.focus({ preventScroll: true });
        if (focus.caret) try { again.setSelectionRange(...focus.caret); } catch { /* not a text box */ }
      }
    }
    return true;
  };

  // ---- talking to the server

  // fetch JSON. A 401 goes to Dash.config.loginUrl when one is set; other errors throw with .status and the
  // server's own { error } message. Options: json (a body to send as JSON), etag (reuse the last body on a 304).
  const etags = new Map();
  Dash.api = async (url, { json, etag = false, headers = {}, ...opts } = {}) => {
    const h = { Accept: 'application/json', ...headers };
    if (json !== undefined) h['Content-Type'] = 'application/json';
    const cached = etag ? etags.get(url) : null;
    if (cached) h['If-None-Match'] = cached.tag;
    const res = await fetch(url, { cache: 'no-store', ...opts, headers: h, body: json !== undefined ? JSON.stringify(json) : opts.body });
    if (res.status === 304 && cached) return cached.body;
    if (res.status === 401 && Dash.config.loginUrl) {
      location.href = Dash.config.loginUrl;
      throw Object.assign(new Error('Signed out'), { status: 401 });
    }
    const raw = await res.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!res.ok) throw Object.assign(new Error((body && body.error) || `HTTP ${res.status}`), { status: res.status, body });
    const tag = etag && res.headers.get('ETag');
    if (tag) etags.set(url, { tag, body });
    return body;
  };

  // run fn now and then every ms, one run at a time; again right away when the tab comes back into view.
  // const poller = Dash.poll(refresh, 15000); poller.now(); poller.stop()
  // live: the id of the top bar's live status. Dash.poll then keeps it right by itself: "Connecting…" until the
  // first run, "Live" after each run that worked, the error after one that threw (it keeps retrying), and
  // stale once no run has worked for staleAfter (default 3 × ms) while the page is in view.
  Dash.poll = (fn, ms, { hiddenMs = ms * 4, live, staleAfter = ms * 3 } = {}) => {
    let timer = null;
    let running = false;
    let stopped = false;
    let lastOk = 0;
    let started = 0;
    if (live && el(live) && !el(live).dataset.state) Dash.live(live, 'connecting', 'Connecting…');
    const run = async () => {
      clearTimeout(timer);
      if (running || stopped) return;
      running = true;
      started = Date.now();
      try {
        await fn();
        lastOk = Date.now();
        if (live) Dash.live(live, 'on', 'Live', 'Updated ' + fmt.clock(lastOk));
      } catch (err) {
        console.warn('Dash.poll:', err);
        if (live) Dash.live(live, 'off', `Can’t reach the server (${(err && err.message) || err}), retrying…`);
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(run, document.hidden ? hiddenMs : ms);
      }
    };
    const staleTimer = live ? setInterval(() => {
      const node = el(live);
      // (a run that began just now, as when the tab comes back, gets its normal time first)
      if (!node || document.hidden || !lastOk || node.dataset.state !== 'on' || Date.now() - lastOk <= staleAfter || (running && Date.now() - started < ms)) return;
      Dash.live(live, 'stale', 'No update since ' + fmt.clock(lastOk), 'The last update that worked');
    }, Math.min(ms, 5000)) : null;
    const onShow = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onShow);
    run();
    return { now: run, stop() { stopped = true; clearTimeout(timer); clearInterval(staleTimer); document.removeEventListener('visibilitychange', onShow); } };
  };

  // the live status in the top bar: Dash.live('live', 'on', 'Live') / 'stale' / 'off'
  Dash.live = (target, state, text, title = '') => {
    const node = el(target);
    if (!node) return;
    node.classList.add('live');
    node.dataset.state = state;
    node.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>`;
    node.title = title;
  };

  // a WebSocket that reconnects. Closing with code 1008 (policy) means signed out: go to Dash.config.loginUrl.
  // Dash.socket('./', { onMessage: (data) => …, onState: (s) => … 'open' | 'closed' })
  Dash.socket = (path, { onMessage, onState, retryMs = 3000, json = true } = {}) => {
    const url = new URL(path, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws = null;
    let timer = null;
    let stopped = false;
    const open = () => {
      ws = new WebSocket(url);
      ws.onopen = () => onState && onState('open');
      ws.onclose = (e) => {
        if (onState) onState('closed');
        if (e.code === 1008 && Dash.config.loginUrl) { location.href = Dash.config.loginUrl; return; }
        if (!stopped) timer = setTimeout(open, retryMs);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        if (!onMessage) return;
        if (!json) { onMessage(e.data); return; }
        let data;
        try { data = JSON.parse(e.data); } catch { return; }
        onMessage(data);
      };
    };
    open();
    return {
      send: (data) => ws && ws.readyState === 1 && ws.send(json ? JSON.stringify(data) : data),
      close() { stopped = true; clearTimeout(timer); if (ws) ws.close(); },
    };
  };

  // ---- controls

  // a segmented control (or a row of chips) as a single choice. Buttons carry data-value.
  // const view = Dash.seg('filter', { store: 'accounts.filter', onChange: (v) => render() }); view.value
  Dash.seg = (target, { value, store, onChange } = {}) => {
    const node = el(target);
    const buttons = () => [...node.querySelectorAll('[data-value]')];
    const values = buttons().map((b) => b.dataset.value);
    // the saved choice: JSON (as Dash.store writes it), a number, or a plain string saved by an older page
    let raw = null;
    try { raw = store ? localStorage.getItem(store) : null; } catch { /* storage blocked */ }
    const saved = raw == null ? undefined : [Dash.store.get(store), raw].map((v) => (v == null ? '' : String(v))).find((v) => values.includes(v));
    let current = saved !== undefined ? saved
      : value != null && values.includes(String(value)) ? String(value) : (buttons().find((b) => b.getAttribute('aria-pressed') === 'true') || buttons()[0] || {}).dataset?.value;
    const sync = () => buttons().forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
    sync();
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b || !node.contains(b) || b.dataset.value === current) return;
      current = b.dataset.value;
      sync();
      if (store) Dash.store.set(store, current);
      if (onChange) onChange(current);
    });
    return { get value() { return current; }, set(v) { current = v; sync(); } };
  };

  // Tabs: a .tabs row of buttons with data-value, and panels with a matching data-tab; the other panels hide.
  //   <div class="tabs" id="view"><button type="button" data-value="list">List</button>…</div>
  //   <section data-tab="list">…</section>
  // Dash.tabs('view', { store: 'view', hash: 'view', onChange }). panels: where the panels are (an element or id;
  // the whole page by default, so give it when a page has two tab sets). hash: also keep the tab in the address
  // (#view=list), so a link or a reload opens it. Arrow keys move between tabs. .value, .set(v).
  Dash.tabs = (target, { value, store, hash, panels, onChange } = {}) => {
    const node = el(target);
    const area = panels ? el(panels) : document;
    const buttons = () => [...node.querySelectorAll('[data-value]')];
    const values = buttons().map((b) => b.dataset.value);
    node.setAttribute('role', 'tablist');
    const fromHash = hash ? Dash.hash.get(hash) : undefined;
    const linked = values.includes(fromHash);
    const seg = Dash.seg(node, { value: linked ? fromHash : value, store: linked ? undefined : store });
    let current = seg.value;
    const show = (v) => {
      for (const b of buttons()) {
        const on = b.dataset.value === v;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      for (const p of area.querySelectorAll('[data-tab]')) if (values.includes(p.dataset.tab)) p.hidden = p.dataset.tab !== v;
    };
    const pick = (v, { fromAddress = false } = {}) => {
      if (!values.includes(v)) return;
      const changed = v !== current;
      current = v;
      seg.set(v);
      show(v);
      if (store) Dash.store.set(store, v);
      if (hash && !fromAddress && Dash.hash.get(hash) !== v) Dash.hash.set({ [hash]: v });
      if (changed && onChange) onChange(v);
    };
    show(current);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b && node.contains(b)) pick(b.dataset.value);
    });
    node.addEventListener('keydown', (e) => {
      const i = values.indexOf(current);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: values.length - 1 }[e.key];
      if (j == null) return;
      e.preventDefault();
      pick(values[(j + values.length) % values.length]);
      buttons().find((b) => b.dataset.value === current)?.focus();
    });
    if (hash) Dash.hash.on((h) => { if (values.includes(h[hash])) pick(h[hash], { fromAddress: true }); });
    return { get value() { return current; }, set: (v) => pick(String(v)) };
  };

  // A dialog built on the spot; resolves to { value, fields } when it closes: value is the pressed button's value
  // (null for Cancel, Escape or a click outside), fields the named inputs in body.
  //   const r = await Dash.dialog({ title: 'Rename', body: '<input class="input" name="name">', actions: [{ label: 'Save', value: 'save', primary: true }] })
  // An action: { label, value, primary, tone ('bad': a red primary button) }. A Cancel button comes first (cancel: its label,
  // or false for none). text: a line under the title. drawer: true slides in from the right instead.
  // focus: a selector for what has the focus (the first input by default). rules: the fields are checked by Dash.form
  // before it closes ({} for just the fields' own checks).
  Dash.dialog = ({ title = '', text = '', body = '', actions = [{ label: 'OK', value: 'ok', primary: true }], cancel = 'Cancel', drawer = false, focus, rules } = {}) => new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = drawer ? 'drawer' : 'dialog';
    const all = (cancel ? [{ label: cancel, cancel: true }] : []).concat(actions);
    const btn = (a) => (a.cancel ? `<button type="button" class="btn ghost" data-dismiss>${esc(a.label)}</button>`
      : `<button class="btn${a.primary || a.tone ? ' primary' : ''}${a.tone ? ' ' + esc(a.tone) : ''}" value="${esc(a.value ?? a.label)}">${esc(a.label)}</button>`);
    d.innerHTML = `<form class="${drawer ? 'drawer-body' : 'dialog-body'}" method="dialog">${title ? `<h2>${esc(title)}</h2>` : ''}`
      + `${text ? `<p class="hint">${esc(text)}</p>` : ''}${body}<div class="dialog-actions">${all.map(btn).join('')}</div></form>`;
    document.body.appendChild(d);
    if (Dash.config.csp) Dash.applyStyles(d);
    if (rules) Dash.form(d.querySelector('form'), { rules });
    d.addEventListener('close', () => {
      const fields = Object.fromEntries(new FormData(d.querySelector('form')));
      resolve({ value: d.returnValue || null, fields });
      d.remove();
    });
    openModal(d);
    const first = focus ? d.querySelector(focus) : d.querySelector('input, select, textarea');
    if (first) first.focus();
  });
  // Yes or no: if (await Dash.confirm('Delete 3 rules?', { ok: 'Delete', tone: 'bad' })) …  (Cancel has the focus)
  // anchor: an element: the question shows in a small popup beside it instead of a dialog in the middle.
  Dash.confirm = async (text, { title = '', ok = 'OK', cancel = 'Cancel', tone, anchor } = {}) => (anchor ? popConfirm(anchor, { title, text, ok, cancel, tone })
    : (await Dash.dialog({
      title: title || text, text: title ? text : '', cancel, actions: [{ label: ok, value: 'ok', primary: true, tone }], focus: '[data-dismiss]',
    })).value === 'ok');
  // One line of text, or null: const name = await Dash.ask('New name', { value: old, placeholder: 'web-1' })
  // check: (text) => what is wrong with it (or a promise of that); it shows under the box and the dialog stays open.
  Dash.ask = async (title, { text = '', value = '', placeholder = '', ok = 'OK', cancel = 'Cancel', required = true, type = 'text', check } = {}) => {
    const r = await Dash.dialog({
      title, text, cancel, rules: check ? { answer: check } : undefined, actions: [{ label: ok, value: 'ok', primary: true }],
      body: `<input class="input dialog-input" name="answer" aria-label="${esc(title)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}>`,
    });
    return r.value === 'ok' ? r.fields.answer : null;
  };

  // A message with one button; resolves once it is read: await Dash.alert('Saved 3 rules.', { title: 'Done' })
  Dash.alert = async (text, { title = '', ok = 'OK', tone } = {}) => {
    await Dash.dialog({ title: title || text, text: title ? text : '', cancel: false, actions: [{ label: ok, value: 'ok', primary: true, tone }], focus: '.dialog-actions .btn' });
  };

  // A button that works while something runs: disabled, with a spinner (aria-busy), until the work is done; returns
  // what the work returns (and passes on its error).  await Dash.busy(saveButton, () => Dash.api('/save', { method: 'POST' }))
  Dash.busy = async (target, work) => {
    const b = el(target);
    const was = b ? b.disabled : false;
    if (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); }
    try {
      return await (typeof work === 'function' ? work() : work);
    } finally {
      if (b) { b.disabled = was; b.removeAttribute('aria-busy'); }
    }
  };

  // ---- modals, popups and menus

  // A modal: a dialog with a head (title and ×), a body that scrolls when it is long, and buttons at its foot.
  // Unlike Dash.dialog it is a handle: it stays open while you change it, and an action can check or save first.
  //   const m = Dash.modal({ title: 'web-1', body: html, size: 'lg', cancel: 'Close',
  //     actions: [{ label: 'Save', value: 'save', primary: true }],
  //     onAction: async (value, m) => { await save(m.fields()); } });   // returning false, or an error, keeps it open
  //   m.update({ body: html }); m.close(); const { value, fields } = await m.closed;
  // size: sm | md (default) | lg | xl | full. drawer: true slides it in from the right, full height.
  // cancel: a ghost button first in the foot (its label; none by default). An action: { label, value, primary, tone };
  // Enter in a field presses the primary one, after the fields' own checks (required, type="email", …). With rules,
  // Dash.form does the checking: what is wrong shows under each field, and an error with errors: { name: 'text' } lands
  // there too (m.form is its handle; rules: {} for just the fields' own checks). Buttons
  // of your own in the body need type="button". An error thrown by onAction shows in the foot (so does m.error(text)).
  // dismissable: false drops the × and ignores Escape and clicks outside: only its buttons or m.close() end it.
  // unsaved: true (1.18): once a field is changed, "Unsaved changes" shows in the foot, and ×, Cancel, Escape or a click
  // outside ask before the changes are lost (m.unsaved is its Dash.unsaved handle). Its actions don't ask.
  // text: a line under the title. focus: a selector (the first field by default). onClose({ value, fields }).
  // update({ body }) redraws like Dash.render: what the reader is typing, the focus and the scroll stay.
  // Handle: el, body (the part that scrolls), fields(), update({ title, text, body, actions }), error(text),
  // close(value), closed (a promise of { value, fields }; value is null after ×, Cancel, Escape or a click outside).
  Dash.modal = ({ title = '', text = '', body = '', actions = [], cancel = '', size = 'md', drawer = false, dismissable = true,
    focus, onAction, onClose, cls = '', rules, unsaved = false } = {}) => {
    const d = document.createElement('dialog');
    d.className = 'modal' + (cls ? ' ' + cls : '');
    d.dataset.size = size;
    if (drawer) d.dataset.drawer = '';
    if (!dismissable) d.setAttribute('closedby', 'none');
    const id = 'dash-modal-' + ++ids;
    d.setAttribute('aria-labelledby', id);
    d.innerHTML = `<form class="modal-form" method="dialog"><header class="modal-head"><div><h2 class="modal-title" id="${id}"></h2><p class="modal-text"></p></div>`
      + `${dismissable ? '<button type="button" class="icon-btn modal-x" data-dismiss aria-label="Close" title="Close">×</button>' : ''}</header>`
      + '<div class="modal-body"></div><footer class="modal-foot"></footer></form>';
    const q = (s) => d.querySelector(s);
    const form = q('form');
    const bodyEl = q('.modal-body');
    const foot = q('.modal-foot');
    let acts = actions;
    let result = null;
    let running = false;
    let closing = false;
    let done = false;
    let resolveClosed;
    const closed = new Promise((ok) => { resolveClosed = ok; });
    const fields = () => Object.fromEntries(new FormData(form));
    const checks = rules ? Dash.form(form, { rules }) : null;
    const error = (msg) => { if (checks) checks.error('', msg); else { const e = q('.modal-error'); if (e) e.textContent = msg || ''; } };
    const drawFoot = () => {
      foot.innerHTML = '<span class="modal-error" role="alert"></span>' + (unsaved ? `<span class="unsaved-note">${esc(Dash.unsaved.text.note)}</span>` : '')
        + (cancel ? `<button type="button" class="btn ghost" data-dismiss>${esc(cancel)}</button>` : '')
        + acts.map((a) => `<button type="${a.primary ? 'submit' : 'button'}" class="btn${a.primary || a.tone ? ' primary' : ''}${a.tone ? ' ' + esc(a.tone) : ''}">${esc(a.label)}</button>`).join('');
      [...foot.querySelectorAll('.btn:not([data-dismiss])')].forEach((b, i) => { b.__dashAct = acts[i]; });
      foot.hidden = !cancel && !acts.length && !unsaved;
    };
    const update = ({ title: t, text: x, body: b, actions: a } = {}) => {
      if (t != null) { title = String(t); q('.modal-title').textContent = title; }
      if (x != null) { text = String(x); q('.modal-text').textContent = text; }
      q('.modal-text').hidden = !text;
      q('.modal-head').hidden = !title && !text && !dismissable;
      if (a) { acts = a; drawFoot(); }
      if (b != null) {
        if (b.nodeType) { bodyEl.replaceChildren(b); bodyEl.__dashHtml = null; if (Dash.config.csp) Dash.applyStyles(bodyEl); } else Dash.render(bodyEl, String(b), { force: bodyEl.__dashHtml == null });
      }
    };
    const finish = () => {
      if (done) return;
      done = true;
      const out = { value: result, fields: fields() };
      if (handle.unsaved) handle.unsaved.destroy();
      d.remove();
      if (onClose) onClose(out);
      resolveClosed(out);
    };
    const close = (value = null) => {
      if (closing || done) return;
      closing = true;
      result = value;
      if (d.open) d.close(); else finish();
    };
    const run = async (a, btn) => {
      if (running || closing) return;
      running = true;
      error('');
      let keep = false;
      try {
        if (onAction) keep = (await Dash.busy(btn, () => onAction(a.value ?? a.label, handle))) === false;
      } catch (err) {
        keep = true;
        if (checks) checks.fail(err); else error(err && err.message ? err.message : String(err));
      }
      running = false;
      if (!keep) close(a.value ?? a.label);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = e.submitter || foot.querySelector('button[type="submit"]'); // a submitter that isn't ours does nothing
      if (b && b.__dashAct) run(b.__dashAct, b);
    });
    foot.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && b.__dashAct && b.type === 'button') run(b.__dashAct, b);
    });
    d.addEventListener('cancel', (e) => { if (!dismissable) e.preventDefault(); });
    d.addEventListener('close', finish);
    const handle = { el: d, body: bodyEl, form: checks, fields, update, error, close, closed, unsaved: null };
    drawFoot();
    update({ title, text, body });
    if (unsaved) handle.unsaved = Dash.unsaved(form); // (1.18) where the fields start: as the body has them now
    document.body.appendChild(d);
    openModal(d);
    const first = focus ? d.querySelector(focus) : bodyEl.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) first.focus();
    return handle;
  };

  // Where a floating box goes beside a rectangle: on the placement side (bottom, top, right or left), on the other
  // side when that has more room, and always inside the window; align: start | center | end along that side.
  // a: { left, top, right, bottom } or a point { x, y }; size and view: { width, height }.
  // Returns { left, top, side, maxHeight }: maxHeight is the room there (a taller box scrolls). Dash.popup uses it.
  Dash.place = (a, size, view, { placement = 'bottom', align = 'start', offset = 6, margin = 8 } = {}) => {
    if (a.left == null) a = { left: a.x, right: a.x, top: a.y, bottom: a.y };
    const room = {
      bottom: view.height - a.bottom - offset - margin, top: a.top - offset - margin,
      right: view.width - a.right - offset - margin, left: a.left - offset - margin,
    };
    if (!(placement in room)) placement = 'bottom';
    const across = placement === 'left' || placement === 'right';
    const other = { bottom: 'top', top: 'bottom', right: 'left', left: 'right' }[placement];
    let side = placement;
    if (room[side] < (across ? size.width : size.height) && room[other] > room[side]) side = other;
    const fit = (start, len, total) => clamp(start, margin, Math.max(margin, total - margin - len));
    const along = (lo, hi, len) => (align === 'end' ? hi - len : align === 'center' ? (lo + hi - len) / 2 : lo);
    if (!across) {
      let maxHeight = Math.max(0, room[side]);
      if (maxHeight < Math.min(size.height, 120)) maxHeight = view.height - 2 * margin; // no room either side: cover the anchor rather than shrink to nothing
      const h = Math.min(size.height, maxHeight);
      return { side, maxHeight, left: fit(along(a.left, a.right, size.width), size.width, view.width), top: fit(side === 'bottom' ? a.bottom + offset : a.top - offset - h, h, view.height) };
    }
    const maxHeight = Math.max(0, view.height - 2 * margin);
    const h = Math.min(size.height, maxHeight);
    return { side, maxHeight, left: fit(side === 'right' ? a.right + offset : a.left - offset - size.width, size.width, view.width), top: fit(along(a.top, a.bottom, h), h, view.height) };
  };

  // A popup: a box of content beside an element (or at a point: a right-click). It floats above everything, a table
  // that scrolls sideways or an open dialog included, and closes on a click outside, on Escape (the focus goes back
  // to the anchor) or with .close(). It follows its anchor when the page scrolls, and when a refresh redraws the
  // anchor it moves to the new copy (same id, data-key, or tag and data- attributes); with none, it closes.
  //   Dash.popup(button, '<p class="popup-text">Checked 2 min ago</p>', { align: 'end' })
  // content: HTML, an element, or a function (popup) => either. placement: bottom (default) | top | right | left (it
  // flips when there is no room); align: start | center | end. width: a CSS width. cls: classes for the box.
  // label: its accessible name. focus: true puts the focus on its first control (or give a selector). onClose(value).
  // Called again for the same anchor while it is open, it closes it instead (a toggle) and returns null.
  // Returns { el, anchor, close(value), update(content), place(), closed } (closed: a promise of the close value).
  // No code: <button type="button" data-popup="more"> opens the content of <template id="more"> (or of any element).
  const nativePop = hasDom && typeof HTMLElement === 'function' && typeof HTMLElement.prototype.showPopover === 'function';
  let lastPress = { target: null, x: 0, y: 0, seq: 0 }; // the last pointer press (wired below)
  let pressed = false; // a button or a finger is down
  let clickOf = -1; // the press whose click is being handled now (-1: none, or a key's click)
  const followAnchor = (old) => { // the copy of an element that a redraw put in its place, or null
    const k = keyOf(old);
    if (k) return k[0] === '#' ? document.getElementById(k.slice(1)) : document.querySelector(`[data-key="${CSS.escape(k.slice(2))}"]`);
    const sig = sigOf(old);
    if (sig === old.tagName) return null; // nothing to know it by
    const same = [...document.querySelectorAll(old.tagName)].filter((e) => sigOf(e) === sig);
    return same.length === 1 ? same[0] : null;
  };
  let following = false;
  const follow = () => { // keeps open popups beside their anchors, a frame at a time, while any is open
    if (following) return;
    following = true;
    const tick = () => {
      for (const p of popups.slice()) p.place();
      if (popups.length) requestAnimationFrame(tick); else following = false;
    };
    requestAnimationFrame(tick);
  };
  Dash.popup = (anchor, content, { placement = 'bottom', align = 'start', offset = 6, width, cls = '', label, role = 'dialog', focus = false, onClose } = {}) => {
    const event0 = anchor;
    let at = null;
    let near = null;
    if (anchor && typeof anchor === 'object' && !anchor.nodeType) { // a point, or the event of a right-click
      const t = anchor.target && anchor.target.nodeType === 1 ? anchor.target : null;
      if (anchor.type === 'contextmenu' && !anchor.clientX && !anchor.clientY && t) anchor = t; // the menu key: beside the focused element
      else { at = { x: anchor.clientX ?? anchor.x, y: anchor.clientY ?? anchor.y }; near = t; anchor = null; }
    }
    if (!at) {
      anchor = el(anchor);
      if (!anchor) return null;
      near = anchor;
      const open = popups.find((p) => p.anchor === anchor);
      if (open) { open.close(); return null; }
      if (anchor.__dashShut === clickOf) return null; // this click's own press just closed its popup: that was the toggle
    }
    const box = document.createElement('div');
    box.className = 'popup' + (cls ? ' ' + cls : '');
    box.id = 'dash-popup-' + ++ids;
    box.tabIndex = -1;
    if (role) box.setAttribute('role', role);
    if (label) box.setAttribute('aria-label', label);
    if (width) box.style.width = width;
    // a right click whose button is still down (Linux and Mac show menus at the press): its release would close the
    // popup again, so until then it is one that nothing closes by itself
    const early = nativePop && Boolean(at) && pressed && event0.type === 'contextmenu';
    if (nativePop) box.setAttribute('popover', early ? 'manual' : 'auto'); else box.hidden = true;
    let done = false;
    let turning = false; // from the one kind to the other
    let own = false; // closed by .close(), not by a click outside or Escape
    let shown = 0;
    let last = '';
    let resolveClosed;
    const p = { el: box, anchor, closed: new Promise((ok) => { resolveClosed = ok; }) };
    const setAnchor = (a) => {
      anchor = p.anchor = a;
      a.setAttribute('aria-haspopup', role === 'menu' ? 'menu' : 'dialog');
      a.setAttribute('aria-expanded', 'true');
      a.setAttribute('aria-controls', box.id);
    };
    const fill = (c) => {
      if (typeof c === 'function') c = c(p);
      if (c === undefined) return; // the function filled p.el itself
      if (c && c.nodeType) box.replaceChildren(c); else box.innerHTML = c == null ? '' : String(c);
      if (Dash.config.csp) Dash.applyStyles(box);
    };
    const finish = (value) => {
      if (done) return;
      done = true;
      const had = box.contains(document.activeElement);
      for (const q of popups.slice()) if (q !== p && box.contains(q.el)) q.close(); // the ones opened from inside it
      popups.splice(popups.indexOf(p), 1);
      if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-controls'); }
      box.remove();
      if (had && anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
      if (onClose) onClose(value);
      resolveClosed(value);
    };
    const close = (value = null) => {
      if (done) return;
      own = true;
      if (nativePop) try { box.hidePopover(); } catch { /* already hidden */ }
      finish(value);
    };
    // a press on the anchor closed it: the click that follows must not open it again
    const shutByPress = () => {
      if (anchor && lastPress.seq > shown && anchor.contains(lastPress.target)) anchor.__dashShut = lastPress.seq;
    };
    const place = () => {
      if (done) return;
      if (anchor && !anchor.isConnected) {
        const again = followAnchor(anchor);
        if (!again) { close(); return; }
        setAnchor(again);
      }
      if (anchor && !anchor.getClientRects().length) { close(); return; } // hidden
      const r = anchor ? anchor.getBoundingClientRect() : at;
      const size = { width: box.offsetWidth, height: box.scrollHeight + box.offsetHeight - box.clientHeight };
      const view = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      const pos = Dash.place(r, size, view, { placement, align, offset: at ? 2 : offset });
      const key = [pos.left, pos.top, pos.maxHeight].map(Math.round).join();
      if (key === last) return;
      last = key;
      box.style.left = Math.round(pos.left) + 'px';
      box.style.top = Math.round(pos.top) + 'px';
      box.style.maxHeight = Math.round(pos.maxHeight) + 'px';
    };
    Object.assign(p, {
      close, place,
      update: (c) => {
        if (done) return;
        for (const q of popups.slice()) if (q !== p && box.contains(q.el)) q.close(); // opened from the old content
        fill(c);
        last = '';
        place();
      },
      dismiss: () => { shutByPress(); close(); }, // a press outside it (when the browser has no popovers of its own)
    });
    fill(content);
    lift(box, near);
    if (anchor) setAnchor(anchor);
    shown = lastPress.seq; // presses after this one can close it
    if (nativePop) {
      box.addEventListener('beforetoggle', (e) => { if (e.newState === 'closed' && !own && !turning) shutByPress(); });
      box.addEventListener('toggle', (e) => { if (e.newState === 'closed' && !turning) finish(null); });
      try { box.showPopover(); } catch { /* not in the page */ }
      if (early) {
        const free = () => setTimeout(() => {
          for (const t of ['pointerup', 'pointercancel']) removeEventListener(t, free, true);
          if (done || turning || box.getAttribute('popover') === 'auto') return;
          const had = box.contains(document.activeElement) && document.activeElement;
          turning = true;
          box.setAttribute('popover', 'auto'); // this hides it
          try { box.showPopover(); } catch { /* not in the page any more */ }
          if (had) had.focus({ preventScroll: true });
          setTimeout(() => { turning = false; if (!done && !box.matches(':popover-open')) finish(null); }, 0);
        }, 0);
        for (const t of ['pointerup', 'pointercancel']) addEventListener(t, free, true);
      }
    } else box.hidden = false;
    popups.push(p);
    place();
    follow();
    if (focus) {
      const f = typeof focus === 'string' ? box.querySelector(focus)
        : box.querySelector('button:not(:disabled), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
      (f || box).focus({ preventScroll: true });
    }
    return p;
  };

  // A menu of choices beside a button, or at the pointer for a right-click; resolves to the chosen item's value, or
  // null when it closes without one. Arrow keys, Home, End and first letters move; Enter picks; Tab or Escape leave.
  //   const v = await Dash.menu(button, [{ label: 'Rename', value: 'rename', hint: 'F2' }, '-', { label: 'Delete', value: 'delete', tone: 'bad' }])
  //   row.addEventListener('contextmenu', async (e) => { e.preventDefault(); const v = await Dash.menu(e, items); })
  // An item: a string, or { label, value (the label by default), hint (a key, on the right), tone ('bad'), disabled,
  // checked (true or false: a tick column), href (a link) }; '-' is a line, { heading: 'Text' } a small label.
  // Options as for Dash.popup (placement, align, label, cls). Unlike a .menu, it is never cut off by a box that scrolls.
  Dash.menu = (anchor, items, opts = {}) => new Promise((resolve) => {
    const list = items.map((it) => (typeof it === 'string' && it !== '-' ? { label: it } : it));
    let chosen = null;
    const pop = Dash.popup(anchor, Dash.menu.html(list), {
      ...opts, cls: ('menu-list ' + (opts.cls || '')).trim(), role: 'menu', focus: '[role^="menuitem"]:not(:disabled)', onClose: () => resolve(chosen),
    });
    if (!pop) { resolve(null); return; }
    const box = pop.el;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[role^="menuitem"]');
      if (!b || b.disabled) return;
      const it = list[b.dataset.item];
      chosen = it.value ?? it.label;
      pop.close(chosen);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { pop.close(); return; }
      const all = [...box.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
      const i = all.indexOf(document.activeElement);
      let j = { ArrowDown: i + 1, ArrowUp: i < 0 ? -1 : i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (j == null && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { // a first letter
        const k = e.key.toLowerCase();
        const next = all.slice(i + 1).concat(all.slice(0, i + 1)).find((b) => b.textContent.trim().toLowerCase().startsWith(k));
        if (next) j = all.indexOf(next);
      }
      if (j == null || !all.length) return;
      e.preventDefault();
      all[(j + all.length) % all.length].focus();
    });
  });
  // the items' HTML (Dash.menu uses it; escaped like every builder). With a ticked item, every item gets the
  // tick column, so the labels line up.
  Dash.menu.html = (items) => {
    const ticks = items.some((it) => it && typeof it === 'object' && it.checked != null);
    return items.map((it, i) => menuItem(it, i, ticks)).join('');
  };
  const menuItem = (it, i, ticks) => {
    if (it === '-' || it == null) return '<hr>';
    if (typeof it === 'string') it = { label: it };
    if (it.heading != null) return `<div class="menu-label" role="presentation">${esc(it.heading)}</div>`;
    const tick = it.checked != null;
    const attrs = `role="${tick ? 'menuitemcheckbox' : 'menuitem'}" data-item="${i}" tabindex="-1"${tick ? ` aria-checked="${Boolean(it.checked)}"` : ''}${it.tone ? ` class="${esc(it.tone)}"` : ''}`;
    const inner = `${ticks ? `<span class="menu-tick" aria-hidden="true">${it.checked ? '✓' : ''}</span>` : ''}<span class="menu-text">${esc(it.label)}</span>`
      + `${it.hint ? `<kbd class="menu-hint">${esc(it.hint)}</kbd>` : ''}`;
    return it.href ? `<a ${attrs} href="${esc(it.href)}">${inner}</a>` : `<button type="button" ${attrs}${it.disabled ? ' disabled' : ''}>${inner}</button>`;
  };

  // Dash.confirm(text, { anchor }): the question in a small popup beside the button instead of a dialog in the middle
  const popConfirm = (anchor, { title, text, ok, cancel, tone }) => new Promise((resolve) => {
    let yes = false;
    const p = Dash.popup(anchor, `${title ? `<p class="popup-title">${esc(title)}</p>` : ''}<p class="popup-text">${esc(text)}</p>`
      + `<div class="popup-actions"><button type="button" class="btn ghost sm" data-dismiss>${esc(cancel)}</button>`
      + `<button type="button" class="btn primary sm${tone ? ' ' + esc(tone) : ''}">${esc(ok)}</button></div>`,
    { role: 'alertdialog', label: title || text, focus: '[data-dismiss]', onClose: () => resolve(yes) });
    if (!p) { resolve(false); return; }
    p.el.querySelector('.btn.primary').addEventListener('click', () => { yes = true; p.close(true); });
  });

  // ---- the address, shortcuts and search

  // The part of the address after #, as settings: #view=list&id=7 ⇄ { view: 'list', id: '7' }; a bare word
  // (#overview) is { overview: '' }. Dash.hash.set merges (null removes) without a new history entry, unless
  // push: true. Dash.hash.on(fn) runs fn(settings) when it changes (links, Back); it returns a remover.
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
  Dash.hash = {
    parse(h) {
      const out = {};
      for (const part of String(h ?? '').replace(/^#/, '').split('&')) {
        if (!part) continue;
        const i = part.indexOf('=');
        out[dec(i < 0 ? part : part.slice(0, i))] = i < 0 ? '' : dec(part.slice(i + 1));
      }
      return out;
    },
    format(o) {
      const parts = Object.entries(o || {}).filter(([, v]) => v != null).map(([k, v]) => encodeURIComponent(k) + (v === '' ? '' : '=' + encodeURIComponent(v)));
      return parts.length ? '#' + parts.join('&') : '';
    },
    get(key) {
      const o = Dash.hash.parse(hasDom ? location.hash : '');
      return key == null ? o : o[key];
    },
    set(changes, { push = false, replace = false } = {}) {
      const next = replace ? {} : Dash.hash.get();
      for (const [k, v] of Object.entries(changes)) { if (v == null) delete next[k]; else next[k] = String(v); }
      history[push ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + Dash.hash.format(next));
    },
    on(fn) {
      const h = () => fn(Dash.hash.get());
      window.addEventListener('hashchange', h);
      window.addEventListener('popstate', h);
      return () => { window.removeEventListener('hashchange', h); window.removeEventListener('popstate', h); };
    },
  };

  // A keyboard shortcut that stays quiet while the reader types: Dash.key('/', focusSearch), Dash.key('mod+k', open)
  // ('mod' is Ctrl, or Cmd on a Mac), Dash.key('shift+?', help). Escape also works in text boxes; inInputs: true
  // lets any key through there. fn gets the event; return false to let the browser have the key too. Returns a remover.
  Dash.key = (combo, fn, { inInputs = false } = {}) => {
    const parts = String(combo).toLowerCase().split('+');
    const want = parts.pop();
    const mods = new Set(parts);
    const h = (e) => {
      if (!e.key || e.key.toLowerCase() !== want) return;
      if (mods.has('mod') ? !(e.ctrlKey || e.metaKey) : e.ctrlKey !== mods.has('ctrl') || e.metaKey !== (mods.has('meta') || mods.has('cmd'))) return;
      if (e.altKey !== mods.has('alt') || (mods.has('shift') && !e.shiftKey)) return;
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (typing && !inInputs && want !== 'escape') return;
      if (fn(e) !== false) e.preventDefault();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  };

  // Does a row match a search? Every word of the query has to appear in one of its fields, in any case.
  // fields: keys or row → value functions (all of the row's values by default).
  Dash.match = (row, query, fields) => {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const vals = (fields || Object.keys(row)).map((f) => (typeof f === 'function' ? f(row) : row[f])).filter((v) => v != null).map((v) => String(v).toLowerCase());
    return words.every((w) => vals.some((v) => v.includes(w)));
  };

  // A search box (an .input, usually in a .search): Dash.search('q', { onChange: (q) => …, store: 'list.q' }).
  // onChange(query) runs once typing pauses (debounce ms), and at once on Escape, which clears the box (a second
  // Escape leaves it). key: a shortcut that jumps to it ('/' by default, null for none). store remembers the query.
  // .value, .set(q), and .count(shown, total) to fill the box's .count ("12 / 340", or "340" when nothing is hidden).
  Dash.search = (target, { onChange, debounce = 120, key = '/', store } = {}) => {
    const input = el(target);
    let timer = null;
    let restored = false;
    if (store) { const saved = Dash.store.get(store); if (typeof saved === 'string' && saved) { input.value = saved; restored = true; } }
    // a remembered query filters at once (on the next tick, once the page has the returned object)
    if (restored && onChange) queueMicrotask(() => onChange(input.value.trim()));
    const fire = () => {
      clearTimeout(timer);
      if (store) Dash.store.set(store, input.value);
      if (onChange) onChange(input.value.trim());
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fire, debounce); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (input.value) { input.value = ''; fire(); } else input.blur();
    });
    // (not while the box is hidden, e.g. in another tab: then the key does what it usually does)
    const off = key ? Dash.key(key, () => { if (!input.getClientRects().length) return false; input.focus(); input.select(); }) : () => {};
    const box = input.closest('.search');
    return {
      get value() { return input.value.trim(); },
      set(q) { input.value = q ?? ''; fire(); },
      count(shown, total) {
        const c = box && box.querySelector('.count');
        if (c) c.textContent = shown === total ? fmt.int(total) : `${fmt.int(shown)} / ${fmt.int(total)}`;
      },
      stop() { clearTimeout(timer); off(); },
    };
  };

  // light, dark, or follow the system ('system'). Buttons with data-theme-set="light|dark|system" switch it.
  Dash.theme = {
    get: () => {
      const t = Dash.store.get(Dash.config.themeKey, 'system');
      return t === 'light' || t === 'dark' ? t : 'system';
    },
    set(mode) {
      Dash.store.set(Dash.config.themeKey, mode);
      Dash.theme.apply();
    },
    apply() {
      if (!hasDom) return;
      const mode = Dash.theme.get();
      if (mode === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = mode;
      for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === mode));
    },
    // what the page shows right now, after the system setting
    current: () => {
      const mode = Dash.theme.get();
      if (mode !== 'system') return mode;
      return hasDom && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
  };

  // a token's value as the page shows it now, e.g. Dash.color('blue') → '#2158d4' (for canvas or third-party charts)
  Dash.color = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();

  // briefly highlight something that just changed
  Dash.flash = (target) => {
    const node = el(target);
    if (!node) return;
    node.classList.remove('flash');
    void node.offsetWidth;
    node.classList.add('flash');
  };

  // a line for screen readers: on the page before it speaks, outside what is drawn again, and in its dialog if it is in one
  // (from outside a modal nothing is heard)
  const voiceOf = (node) => {
    const root = node.closest('dialog') || document.body;
    let v = [...root.children].find((x) => 'dashVoice' in x.dataset);
    if (!v) {
      v = document.createElement('div');
      v.className = 'sr-only';
      v.dataset.dashVoice = '';
      v.setAttribute('role', 'status');
      root.append(v);
    }
    return v;
  };

  // the typed words in bold where they are in a text, as HTML
  const markWords = (text, q) => {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return esc(text);
    const low = text.toLowerCase(), hit = new Array(text.length).fill(false);
    for (const w of words) { const i = low.indexOf(w); if (i >= 0) hit.fill(true, i, i + w.length); }
    let out = '', on = false;
    for (let i = 0; i < text.length; i++) {
      if (hit[i] !== on) { out += on ? '</mark>' : '<mark>'; on = hit[i]; }
      out += esc(text[i]);
    }
    return out + (on ? '</mark>' : '');
  };

  // ---- a text box with suggestions (1.9)
  // Dash.combobox(input, { options, onPick }): options is a list (strings, or { value, label, sub }), or a function
  // (query) => a list or a promise of one, asked as the reader types (for a server search). The suggestions open as the
  // reader types, or on ArrowDown or a click; arrows move, Enter or a click picks, Escape or Tab closes. What's typed
  // stays unless strict: true, which puts the last pick back (or empties the box) when it matches no suggestion; an
  // emptied box stays empty. Returns { value (the picked option while the box shows it, else null), set(value), close(), destroy() }.
  Dash.combobox = (target, { options = [], onPick, max = 50, empty = 'No matches', strict = false, minChars = 0, debounce = 150, label } = {}) => {
    const input = el(target);
    if (!input || !hasDom) return null;
    const norm = (o) => (o && typeof o === 'object' ? { ...o, value: o.value ?? o.label, label: String(o.label ?? o.value ?? '') } : { value: o, label: String(o ?? '') });
    const all = () => (Array.isArray(options) ? options.map(norm) : []);
    const box = document.createElement('div');
    box.className = 'popup combo-list';
    box.id = 'dash-combo-' + ++ids;
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', label || input.getAttribute('aria-label') || 'Suggestions');
    if (nativePop) box.setAttribute('popover', 'manual'); else box.hidden = true;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', box.id);
    input.setAttribute('autocomplete', 'off');
    let shown = [], active = -1, open = false, picked = null, seq = 0, timer = 0;
    const optEl = (i) => box.querySelector(`[data-i="${i}"]`);
    const place = () => {
      if (!open) return;
      const r = input.getBoundingClientRect();
      if (!r.width && !r.height) { close(); return; }
      box.style.minWidth = Math.round(r.width) + 'px';
      const view = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      const pos = Dash.place(r, { width: box.offsetWidth, height: box.scrollHeight + 2 }, view, { placement: 'bottom', align: 'start', offset: 4 });
      box.style.left = Math.round(pos.left) + 'px';
      box.style.top = Math.round(pos.top) + 'px';
      box.style.maxHeight = Math.round(Math.min(pos.maxHeight, 320)) + 'px';
    };
    const show = () => {
      if (!open) {
        lift(box, input);
        if (nativePop) try { box.showPopover(); } catch { /* not in the page */ } else box.hidden = false;
        open = true;
        input.setAttribute('aria-expanded', 'true');
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
      }
      place();
    };
    const close = () => {
      clearTimeout(timer);
      seq++; // an answer still on its way is no longer wanted
      if (!open) return;
      open = false;
      active = -1;
      if (nativePop) try { box.hidePopover(); } catch { /* hidden */ } else box.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
    const move = (i) => {
      if (!shown.length) return;
      const was = optEl(active);
      if (was) was.setAttribute('aria-selected', 'false');
      active = ((i % shown.length) + shown.length) % shown.length;
      const o = optEl(active);
      o.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', o.id);
      o.scrollIntoView({ block: 'nearest' });
    };
    const draw = (items, q, note, then) => {
      shown = items.slice(0, max);
      active = -1;
      input.removeAttribute('aria-activedescendant');
      box.innerHTML = shown.length
        ? shown.map((o, i) => `<div class="combo-option" role="option" id="${box.id}-${i}" data-i="${i}" aria-selected="false"><span>${markWords(o.label, q)}</span>`
          + `${o.sub ? `<span class="combo-sub">${esc(o.sub)}</span>` : ''}</div>`).join('')
        : `<div class="combo-empty" role="option" aria-disabled="true" aria-selected="false">${esc(note || empty)}</div>`;
      show();
      if (then != null && shown.length) move(then);
    };
    // ask for the suggestions for what's typed; then: the option to make active once they are there
    const ask = (then) => {
      const q = input.value;
      if (q.trim().length < minChars) { close(); return; }
      const my = ++seq;
      if (typeof options !== 'function') { draw(all().filter((o) => Dash.match(o, q, ['label', 'sub'])), q, null, then); return; }
      clearTimeout(timer);
      timer = setTimeout(async () => {
        let got;
        try { got = await options(q); } catch { got = null; }
        if (my !== seq || document.activeElement !== input) return; // typed on, or left, meanwhile
        draw(Array.isArray(got) ? got.map(norm) : [], q, Array.isArray(got) ? null : 'Couldn’t load suggestions', then);
      }, debounce);
    };
    const pick = (i) => {
      const o = shown[i];
      if (!o) return;
      picked = o;
      input.value = o.label;
      close();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (onPick) onPick(o);
    };
    const onInput = () => ask(null);
    const onClick = () => { if (!open) ask(null); };
    const onKey = (e) => {
      if (e.altKey && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const down = e.key === 'ArrowDown';
        if (!open) ask(e.altKey ? null : down ? 0 : -1);
        else if (!e.altKey) move(active < 0 ? (down ? 0 : -1) : active + (down ? 1 : -1));
      } else if (e.key === 'Enter' && open && active >= 0) {
        e.preventDefault(); // not the form's submit
        pick(active);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation(); // only the suggestions: a dialog or drawer around it stays
        close();
      } else if (e.key === 'Tab') close();
    };
    const onBlur = () => setTimeout(() => {
      if (document.activeElement === input) return;
      close();
      if (strict && (!picked || input.value !== picked.label)) {
        const exact = all().find((o) => o.label.toLowerCase() === input.value.trim().toLowerCase());
        if (!input.value.trim()) { picked = null; input.value = ''; } // emptied on purpose: no choice
        else if (exact) { picked = exact; input.value = exact.label; if (onPick) onPick(exact); } else input.value = picked ? picked.label : '';
      }
    });
    // for Dash.form: text that is no suggestion, while the box has the focus (leaving it puts it right)
    if (strict) input.__dashCheck = () => {
      const t = input.value.trim().toLowerCase();
      return !t || document.activeElement !== input || (picked && input.value === picked.label) || all().some((o) => o.label.toLowerCase() === t) ? '' : Dash.form.text.list;
    };
    input.addEventListener('input', onInput);
    input.addEventListener('click', onClick);
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
    box.addEventListener('pointerdown', (e) => e.preventDefault()); // the box keeps the focus
    box.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) pick(Number(o.dataset.i)); });
    box.addEventListener('mousemove', (e) => { const o = e.target.closest('[data-i]'); if (o && Number(o.dataset.i) !== active) move(Number(o.dataset.i)); });
    return {
      get value() { return picked && input.value === picked.label ? picked : null; }, // typed over: no longer the pick
      set: (v) => { const o = v == null ? null : all().find((x) => x.value === v) || norm(v); picked = o; input.value = o ? o.label : ''; },
      close,
      destroy: () => {
        close();
        box.remove();
        input.removeEventListener('input', onInput);
        input.removeEventListener('click', onClick);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('blur', onBlur);
        for (const a of ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant']) input.removeAttribute(a);
      },
    };
  };

  // ---- a date picker (1.9)
  // Dash.datepicker(input, { min, max, onPick, firstDay }): puts a calendar button in a date box (YYYY-MM-DD, what
  // <input type="date"> sends). The calendar opens beside it with the box's date (or today) focused: arrows move a day
  // or a week, Home and End to the week's ends, PageUp and PageDown a month (with Shift a year), Enter picks, Escape
  // closes. Days before min or after max can't be picked. Typing a date works too; one that isn't a date is marked
  // aria-invalid. firstDay: 1 (Monday, the default) or 0 (Sunday). Returns { value, set(iso), open(), close(), destroy() }.
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  // 'YYYY-MM-DD' (or with / or .) as a local date, or null when it isn't a real day
  const dayOf = (s) => {
    const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(String(s ?? ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  };
  Dash.datepicker = (target, { min, max, onPick, firstDay = 1, label = 'Choose a date' } = {}) => {
    const input = el(target);
    if (!input || !hasDom) return null;
    const lo = dayOf(min), hi = dayOf(max);
    const inRange = (d) => (!lo || d >= lo) && (!hi || d <= hi);
    const wrap = document.createElement('span');
    wrap.className = 'date-field';
    input.before(wrap);
    wrap.append(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn date-btn';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>';
    wrap.append(btn);
    if (!input.placeholder) input.placeholder = 'YYYY-MM-DD';
    let pop = null, focusDay = null;
    const value = () => dayOf(input.value);
    const title = (d) => d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const grid = () => {
      const f = focusDay, y = f.getFullYear(), m = f.getMonth();
      const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
      const lead = (first.getDay() - firstDay + 7) % 7;
      const chosen = value(), today = isoDay(new Date());
      const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + ((i + firstDay + 6) % 7))); // 2024-01-01 was a Monday
      let cells = '';
      for (let i = 0; i < lead + days; i++) {
        if (i % 7 === 0) cells += '<tr>';
        if (i < lead) cells += '<td></td>';
        else {
          const d = new Date(y, m, i - lead + 1), iso = isoDay(d), ok = inRange(d);
          cells += `<td role="gridcell"${chosen && iso === isoDay(chosen) ? ' aria-selected="true"' : ''}><button type="button" data-date="${iso}"`
            + ` tabindex="${iso === isoDay(f) ? 0 : -1}"${iso === today ? ' aria-current="date"' : ''}${ok ? '' : ' aria-disabled="true"'}`
            + ` aria-label="${esc(d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}">${d.getDate()}</button></td>`;
        }
        if (i % 7 === 6) cells += '</tr>';
      }
      if ((lead + days) % 7) cells += '<td></td>'.repeat(7 - ((lead + days) % 7)) + '</tr>';
      const prevOk = !lo || new Date(y, m, 0) >= lo, nextOk = !hi || new Date(y, m + 1, 1) <= hi;
      return `<div class="cal-head"><button type="button" class="icon-btn" data-cal="-1" aria-label="Previous month"${prevOk ? '' : ' disabled'}>‹</button>`
        + `<b class="cal-title" aria-live="polite">${esc(title(f))}</b><button type="button" class="icon-btn" data-cal="1" aria-label="Next month"${nextOk ? '' : ' disabled'}>›</button></div>`
        + `<table class="cal-grid" role="grid" aria-label="${esc(title(f))}"><thead><tr>${names.map((n) => `<th scope="col" abbr="${esc(n.toLocaleDateString([], { weekday: 'long' }))}">`
        + `${esc(n.toLocaleDateString([], { weekday: 'narrow' }))}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
    };
    const redraw = () => {
      if (!pop) return;
      pop.update(grid());
      const b = pop.el.querySelector('[tabindex="0"]');
      if (b) b.focus({ preventScroll: true });
    };
    const go = (d) => { focusDay = d; redraw(); };
    const addMonths = (d, n) => { const t = new Date(d.getFullYear(), d.getMonth() + n, 1); t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return t; };
    const pick = (iso) => {
      const d = dayOf(iso);
      if (!d || !inRange(d)) return;
      input.value = iso;
      input.removeAttribute('aria-invalid');
      close();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (onPick) onPick(iso);
    };
    const open = () => {
      if (pop) return;
      const v = value();
      focusDay = v || (lo && new Date() < lo ? lo : hi && new Date() > hi ? hi : new Date());
      focusDay = new Date(focusDay.getFullYear(), focusDay.getMonth(), focusDay.getDate());
      pop = Dash.popup(btn, grid(), { role: 'dialog', label, cls: 'calendar', focus: '[tabindex="0"]', align: 'end', onClose: () => { pop = null; } });
      if (!pop) return;
      pop.el.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-cal]');
        if (nav && !nav.disabled) { go(addMonths(focusDay, Number(nav.dataset.cal))); const n = pop && pop.el.querySelector(`[data-cal="${nav.dataset.cal}"]`); if (n && !n.disabled) n.focus(); return; }
        const day = e.target.closest('[data-date]');
        if (day && day.getAttribute('aria-disabled') !== 'true') pick(day.dataset.date);
      });
      pop.el.addEventListener('keydown', (e) => {
        const day = e.target.closest && e.target.closest('[data-date]');
        if (!day) return;
        const d = dayOf(day.dataset.date), wd = (d.getDay() - firstDay + 7) % 7;
        const to = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -wd, End: 6 - wd }[e.key];
        if (to != null) { e.preventDefault(); go(new Date(d.getFullYear(), d.getMonth(), d.getDate() + to)); }
        else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); go(addMonths(d, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1))); }
      });
    };
    const close = () => { if (pop) pop.close(); };
    const onBtn = () => (pop ? close() : open());
    const onChange = () => {
      const t = input.value.trim();
      if (!t) { input.removeAttribute('aria-invalid'); return; }
      const d = dayOf(t);
      if (d && inRange(d)) { input.removeAttribute('aria-invalid'); if (isoDay(d) !== t) input.value = isoDay(d); } else input.setAttribute('aria-invalid', 'true');
    };
    const onKey = (e) => { if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); open(); } };
    input.__dashCheck = () => { // for Dash.form
      const t = input.value.trim(), d = dayOf(t), say = Dash.form.text;
      return !t ? '' : !d ? say.date : inRange(d) ? '' : say.dateRange(lo && isoDay(lo), hi && isoDay(hi));
    };
    btn.addEventListener('click', onBtn);
    input.addEventListener('change', onChange);
    input.addEventListener('keydown', onKey);
    return {
      get value() { const d = value(); return d && inRange(d) ? isoDay(d) : null; },
      set: (iso) => { const d = dayOf(iso); input.value = d ? isoDay(d) : ''; onChange(); },
      open, close,
      destroy: () => { close(); btn.remove(); wrap.replaceWith(input); delete input.__dashCheck; input.removeEventListener('change', onChange); input.removeEventListener('keydown', onKey); },
    };
  };

  // ---- a sidebar's links in groups, and the section being read (1.14)

  // Dash.nav('side', [
  //   { label: 'Overview', href: './', icon: svg },
  //   { heading: 'Manage' },
  //   { label: 'Servers', badge: 2, items: [{ label: 'web-1', sub: 'Frankfurt', href: '#web-1' }, { label: 'web-2', href: '#web-2', tone: 'warn' }] },
  // ], { current: '#web-1', store: 'nav' })
  // An item is a link (href) or a button; with items it is a group that opens and closes (groups can hold groups). key
  // names it (its href or label otherwise); icon and meta are HTML, the rest is text. current: the key of the page the
  // reader is on; its groups are open. store remembers the groups the reader opened and closed. onPick(item, event) runs
  // for a click on an item. Without items, it takes the links that are already in the element.
  // .update(items), .current(key), .filter(text) keeps the items that have the words, and says how many; '' shows all again.
  const navKey = (it) => String(it.key ?? it.href ?? it.label ?? '');
  const navIs = (it, cur) => cur != null && (typeof cur === 'function' ? Boolean(cur(it)) : navKey(it) === String(cur));
  const navHolds = (it, cur) => (it.items ? it.items.some((x) => navHolds(x, cur)) : navIs(it, cur));
  const navParts = (it) => `${it.icon ? `<span class="nav-icon">${it.icon}</span>` : ''}<span class="nav-main"><span class="nav-name">${esc(it.label ?? '')}</span>`
    + `${it.sub != null && it.sub !== '' ? `<span class="nav-sub">${esc(it.sub)}</span>` : ''}</span>${it.meta ? `<span class="nav-meta">${it.meta}</span>` : ''}`
    + `${it.badge != null && it.badge !== '' ? `<span class="count-badge">${esc(it.badge)}</span>` : ''}`;
  // the items' HTML on its own (escaped like every builder); open: { key: true | false } for the groups
  const navHtml = (items, { current, open = {} } = {}) => (items || []).map((it) => {
    if (it.heading != null) return `<div class="side-head">${esc(it.heading)}${it.badge != null && it.badge !== '' ? ` <span class="count-badge">${esc(it.badge)}</span>` : ''}</div>`;
    const cls = `nav-item${it.tone ? ` attn ${esc(it.tone)}` : ''}`, title = it.title ? ` title="${esc(it.title)}"` : '', k = navKey(it);
    if (it.items) {
      const on = navHolds(it, current) || (Object.hasOwn(open, k) ? open[k] : Boolean(it.open));
      return `<details class="nav-group" data-key="nav ${esc(k)}"${on ? ' open' : ''}><summary class="${cls}"${title}>${navParts(it)}</summary><div class="nav-list">${navHtml(it.items, { current, open })}</div></details>`;
    }
    const at = `class="${cls}" data-key="${esc(k)}"${title}${navIs(it, current) ? ' aria-current="page"' : ''}`;
    return it.href != null ? `<a ${at} href="${esc(safeHref(it.href))}">${navParts(it)}</a>` : `<button type="button" ${at}${it.disabled ? ' disabled' : ''}>${navParts(it)}</button>`;
  }).join('');

  // brings a link into view inside the box it scrolls in, without moving the page
  const showIn = (x) => {
    let box = x.parentElement;
    while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box || box === document.body || box === document.documentElement) return;
    const a = x.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (a.top < b.top + 8) box.scrollTop -= b.top + 8 - a.top; else if (a.bottom > b.bottom - 8) box.scrollTop += a.bottom - b.bottom + 8;
  };

  Dash.nav = (target, items, { current, store, onPick } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashNav?.abort();
    const { signal } = (node.__dashNav = new AbortController());
    const read = store ? Dash.store.get(store) : null;
    const saved = read && typeof read === 'object' && !Array.isArray(read) ? { ...read } : {};
    let cur = current, query = '', before = null, none = null;
    const groups = () => [...node.querySelectorAll('details.nav-group')];
    const keyOfGroup = (d) => (d.dataset.key || '').replace(/^nav /, '') || (d.querySelector(':scope > summary .nav-name')?.textContent ?? '');
    const links = () => [...node.querySelectorAll('.nav-item')].filter((x) => x.tagName !== 'SUMMARY');
    const openTo = (x) => { for (let d = x.parentElement.closest('details.nav-group'); d && node.contains(d); d = d.parentElement.closest('details.nav-group')) d.open = true; };
    const hit = (x) => Dash.match({ t: `${x.textContent} ${x.dataset.find || ''}` }, query, ['t']);
    const sift = (box, whole) => { // how many of its links stay
      let n = 0, head = null, under = 0;
      const endHead = () => { if (head) head.hidden = Boolean(query) && !under; };
      for (const x of box.children) {
        if (x.classList.contains('side-head')) { endHead(); head = x; under = 0; continue; }
        let k = 0;
        if (x.matches('details.nav-group')) {
          k = sift(x.querySelector(':scope > .nav-list'), whole || hit(x.querySelector(':scope > summary')));
          x.hidden = Boolean(query) && !k;
          x.open = query ? k > 0 : before ? before.get(keyOfGroup(x)) ?? x.open : x.open;
        } else if (x.matches('.nav-item')) {
          k = whole || hit(x) ? 1 : 0;
          x.hidden = Boolean(query) && !k;
        }
        n += k;
        under += k;
      }
      endHead();
      return n;
    };
    const filter = (text) => {
      query = String(text ?? '').trim();
      if (query && !before) before = new Map(groups().map((d) => [keyOfGroup(d), d.open]));
      const n = sift(node, false);
      if (!query) before = null;
      if (!none && query) {
        none = document.createElement('p');
        none.className = 'nav-none';
        none.setAttribute('role', 'status');
      }
      if (none) {
        if (none.parentNode !== node) node.append(none);
        none.textContent = query && !n ? 'Nothing by that name' : '';
      }
      return n;
    };
    const mark = () => {
      const at = [];
      for (const x of links()) {
        const on = cur != null && typeof cur !== 'function' && [x.dataset.key, x.getAttribute('href')].includes(String(cur));
        if (on) { x.setAttribute('aria-current', 'page'); at.push(x); } else if (cur !== undefined && typeof cur !== 'function' && x.getAttribute('aria-current') === 'page') x.removeAttribute('aria-current');
        else if (x.getAttribute('aria-current') === 'page') at.push(x);
      }
      for (const x of at) openTo(x);
      if (at[0]) showIn(at[0]);
    };
    const draw = () => {
      if (!items) return;
      if (none) none.remove();
      Dash.render(node, navHtml(items, { current: cur, open: saved }));
      if (query) filter(query);
    };
    if (!items) for (const d of groups()) { const k = keyOfGroup(d); if (Object.hasOwn(saved, k)) d.open = Boolean(saved[k]); }
    draw();
    mark();
    node.addEventListener('click', (e) => {
      const x = e.target.closest('.nav-item');
      if (!x || !node.contains(x)) return;
      if (x.tagName === 'SUMMARY') {
        const d = x.parentElement;
        setTimeout(() => { // once it has opened or closed
          if (query || !store) return;
          saved[keyOfGroup(d)] = d.open;
          Dash.store.set(store, saved);
        });
        return;
      }
      if (!onPick || !items) return;
      const find = (list) => { for (const it of list) { const f = it.items ? find(it.items) : it.heading == null && navKey(it) === x.dataset.key ? it : null; if (f) return f; } return null; };
      const it = find(items);
      if (it) onPick(it, e);
    }, { signal });
    return {
      el: node,
      update(next) { items = next || []; draw(); mark(); },
      current(k) { cur = k ?? null; mark(); },
      filter,
      stop() { filter(''); node.__dashNav?.abort(); },
    };
  };
  Dash.nav.html = navHtml;

  // Marks the link to the section being read, as the page scrolls: Dash.spy('toc'), where the element holds links to ids on
  // this page. The link gets aria-current="location" (a .nav-item, a .chip and a .link show it) and is kept in view in its
  // own box. offset: how far under the top bar a section has to be to count. onChange(id) runs when it changes.
  Dash.spy = (target, { offset = 24, onChange } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashSpy?.abort();
    const { signal } = (node.__dashSpy = new AbortController());
    const page = (u) => u.split('#')[0];
    let now = null, held = null, from = 0, due = 0;
    const pairs = () => [...node.querySelectorAll('a[href*="#"]')].flatMap((a) => {
      const i = a.href.indexOf('#');
      if (page(a.href) !== page(location.href)) return [];
      const s = document.getElementById(dec(a.href.slice(i + 1)));
      return s && s.getClientRects().length ? [{ a, s, id: s.id }] : [];
    });
    const look = () => {
      due = 0;
      const list = pairs();
      const bar = document.querySelector('.topbar');
      const line = (bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0) + offset;
      const tops = list.map((p) => ({ ...p, top: p.s.getBoundingClientRect().top }));
      let at = held ? tops.find((p) => p.id === held) : null; // one the reader clicked, until they scroll on
      if (!at) {
        const end = document.documentElement.scrollHeight - innerHeight - scrollY < 2 && scrollY > 2; // the last ones can't reach the line
        const past = tops.filter((p) => p.top <= (end ? innerHeight - 40 : line));
        at = past.length ? past.reduce((a, b) => (b.top >= a.top ? b : a)) : tops.reduce((a, b) => (a && a.top <= b.top ? a : b), null);
      }
      const id = at ? at.id : null;
      for (const p of list) {
        if (p.id === id) { if (p.a.getAttribute('aria-current') !== 'page') p.a.setAttribute('aria-current', 'location'); } else if (p.a.getAttribute('aria-current') === 'location') p.a.removeAttribute('aria-current');
      }
      if (id === now) return;
      now = id;
      if (at && !node.contains(document.activeElement)) showIn(at.a);
      if (onChange) onChange(id);
    };
    const soon = () => { if (!due) due = requestAnimationFrame(look); };
    let quiet = 0;
    const hold = (id) => { held = id; from = NaN; clearTimeout(quiet); quiet = setTimeout(() => { from = scrollY; }, 400); soon(); };
    window.addEventListener('scroll', () => {
      if (held != null) {
        if (Number.isNaN(from)) { clearTimeout(quiet); quiet = setTimeout(() => { from = scrollY; }, 160); } else if (Math.abs(scrollY - from) > 4) held = null; // (still on its way there)
      }
      soon();
    }, { passive: true, signal });
    window.addEventListener('resize', soon, { signal });
    window.addEventListener('hashchange', () => hold(dec(location.hash.slice(1))), { signal });
    node.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      const p = a && pairs().find((x) => x.a === a);
      if (p) hold(p.id);
    }, { signal });
    if (location.hash) hold(dec(location.hash.slice(1))); else look();
    return { get current() { return now; }, update: look, stop() { node.__dashSpy?.abort(); clearTimeout(quiet); cancelAnimationFrame(due); } };
  };

  // a press on a link, a button or a box that a page put into a row is that one's, not the row's
  const inRow = (t, row) => { const own = t.closest('a, button, input, select, textarea, label, summary'); return Boolean(own) && own !== row && row.contains(own); };

  // ---- trees (1.14)

  // Things inside things: Dash.tree('files', { items: [{ id: 'src', title: 'src', items: [{ id: 'src/app.js', title: 'app.js' }] }] })
  // key, title, sub and children are fields or functions (id, title, sub, items); lead and end are HTML (an icon, a pill).
  // open: keys, a number of levels, or true; store remembers what is open. A row whose children are true has some that
  // load(row) gives (or promises) when it is first opened. select: 'one' picks a row, 'many' ticks boxes (a branch is ticked
  // when all of it is); can(row) says which may be. onSelect(row or rows), onOpen(row, open), onPick(row, event) for a leaf
  // that is clicked (with select: double-clicked, or Enter). menu(row) gives a row's menu (right click, Shift+F10, its ⋯ button),
  // onMenu(value, row) what was chosen. Keys: arrows, Home, End, Enter, Space, * (opens all beside), the first letters.
  Dash.tree = (target, { items = [], key = 'id', title = 'title', children = 'items', sub = 'sub', lead, end, load, open = [], select, selected = [], can = () => true,
    onSelect, onOpen, onPick, menu, onMenu, store, label, empty = 'Nothing here yet' } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashTree?.destroy();
    const control = new AbortController();
    const uid = 'dash-tree-' + ++ids;
    const get = (f, r) => (typeof f === 'function' ? f(r) : f != null && r ? r[f] : null);
    const many = select === 'many', one = select === 'one';
    let data = items || [];
    let top = []; // the top rows; every row: { id, row, up, level, kids (a list, or null for a leaf), ask (load() has them) }
    let all = new Map();
    const got = new Map(); // id → the rows load() gave; asked: id → { failed } while they are on their way, or why they aren't there
    const asked = new Map();
    const nums = new Map(); // id → a number for its element's id
    const opened = new Set();
    const picked = new Set(); // one: the row; many: leaves, and branches whose items aren't there yet
    const saved = store ? Dash.store.get(store) : null;
    if (Array.isArray(saved)) for (const k of saved) opened.add(String(k)); else if (Array.isArray(open)) for (const k of open) opened.add(String(k));
    const deep = Array.isArray(saved) ? 0 : open === true ? Infinity : typeof open === 'number' ? open : 0;
    let cur = null, curUp = []; // the row Tab goes to, and the ones it is in
    let query = null; // a test for rows, while filtered
    let words = '';
    const turned = new Map(); // what the reader opened and closed while it is filtered

    const branch = (n) => n.kids !== null || n.ask;
    const build = () => {
      const was = all;
      all = new Map();
      const walk = (rows, up, level) => (rows || []).map((row) => {
        const id = String(get(key, row));
        const n = { id, row, up, level, kids: null, ask: false, hit: false, under: false };
        all.set(id, n);
        const own = get(children, row), given = own === true && load ? got.get(id) : undefined;
        if (Array.isArray(own) && own.length) n.kids = walk(own, n, level + 1);
        else if (given) n.kids = walk(given, n, level + 1); // (none of them: still a branch, that says so)
        else n.ask = own === true && Boolean(load);
        if (level <= deep && branch(n) && !n.ask && !was.has(id)) opened.add(id);
        return n;
      });
      top = walk(data, null, 1);
      for (const m of [got, asked, nums]) for (const id of [...m.keys()]) if (!all.has(id)) m.delete(id);
      for (const id of [...opened]) if (!all.has(id) && was.has(id)) opened.delete(id);
      for (const id of [...picked]) {
        const n = all.get(id);
        if (!n) { if (was.has(id)) picked.delete(id); continue; }
        if (many && n.kids) { picked.delete(id); for (const x of allLeaves(n)) picked.add(x.id); } // its items came: they are ticked
      }
      if (query) sift();
    };
    // the rows that may be ticked under a row (or the row itself); while filtered, the ones that show
    const leaves = (n) => (n.kids ? kidsOf(n).flatMap(leaves) : can(n.row) ? [n] : []);
    const allLeaves = (n) => (n.kids ? n.kids.flatMap(allLeaves) : can(n.row) ? [n] : []);
    const choose = (keys) => {
      for (const k of [].concat(keys ?? []).map(String)) {
        const n = all.get(k);
        if (n && many) for (const x of allLeaves(n)) picked.add(x.id); else if (n && one && can(n.row)) { picked.clear(); picked.add(k); }
      }
    };
    const kidsOf = (n) => (query && n.under ? n.kids.filter((k) => k.hit || k.under) : n.kids);
    const isOpen = (n) => branch(n) && (query ? turned.get(n.id) ?? n.under : opened.has(n.id));
    const topSeen = () => (query ? top.filter((n) => n.hit || n.under) : top);
    const sift = () => {
      let n = 0;
      const walk = (x) => {
        x.hit = Boolean(query(x.row));
        if (x.hit) n++;
        x.under = false;
        for (const k of x.kids || []) if (walk(k)) x.under = true;
        return x.hit || x.under;
      };
      top.forEach(walk);
      return n;
    };
    const stateOf = (n) => { // of a box: true, false or 'mixed'
      if (!n.kids) return picked.has(n.id);
      const l = leaves(n), k = l.filter((x) => picked.has(x.id)).length;
      return k > 0 && k === l.length ? true : k ? 'mixed' : false;
    };
    const mayPick = (n) => (many && n.kids ? leaves(n).length > 0 : can(n.row));
    const titleOf = (n) => String(get(title, n.row) ?? '');

    const note = (n, level, what) => `<li class="tree-item tree-note" role="treeitem" tabindex="-1" data-key="dash-note ${esc(n.id)}" data-note="${esc(n.id)}" aria-level="${level}" aria-setsize="1" aria-posinset="1">`
      + `<div class="tree-row"><span class="tree-turn"></span>${what}</div></li>`;
    const rowHtml = (n, i, list) => {
      const on = isOpen(n), b = branch(n), s = get(sub, n.row), l = lead ? lead(n.row, { open: on, branch: b }) : '', e = end ? end(n.row) : '';
      if (!nums.has(n.id)) nums.set(n.id, ++ids);
      const name = `${uid}-${nums.get(n.id)}`;
      return `<li class="tree-item" role="treeitem" tabindex="-1" data-key="${esc(n.id)}" aria-level="${n.level}" aria-setsize="${list.length}" aria-posinset="${i + 1}"${b ? ` aria-expanded="${on}"` : ''}`
        + ` aria-labelledby="${name}${e ? ` ${name}e` : ''}"${menu ? ' aria-haspopup="menu"' : ''}><div class="tree-row"><span class="tree-turn"></span>${many ? '<span class="pick-box"></span>' : ''}`
        + `${l ? `<span class="tree-lead">${l}</span>` : ''}<span class="tree-text" id="${name}"><span class="tree-title">${markWords(titleOf(n), words)}</span>`
        + `${s != null && s !== '' ? ` <span class="tree-sub">${esc(s)}</span>` : ''}</span>${e ? `<span class="tree-end" id="${name}e">${e}</span>` : ''}${menu ? '<span class="row-dots" data-dots aria-hidden="true">⋯</span>' : ''}</div>`
        + `${on ? `<ul role="group">${inside(n)}</ul>` : ''}</li>`;
    };
    const inside = (n) => {
      const a = asked.get(n.id);
      if (a && a.failed) return note(n, n.level + 1, `<span class="tree-text">Couldn’t load this: ${esc(a.failed)} <u>Try again</u></span>`);
      if (n.ask) return note(n, n.level + 1, '<span class="spinner" aria-hidden="true"></span><span class="tree-text">Loading…</span>');
      return n.kids.length ? kidsOf(n).map(rowHtml).join('') : note(n, n.level + 1, '<span class="tree-text">Nothing here</span>');
    };
    const html = () => {
      const list = topSeen();
      if (!list.length) return `<div class="empty">${esc(query && top.length ? 'Nothing by that name' : empty)}</div>`;
      return `<ul class="tree" role="tree"${label ? ` aria-label="${esc(label)}"` : ''}${many ? ' aria-multiselectable="true"' : ''}>${list.map(rowHtml).join('')}</ul>`;
    };
    const lis = () => [...node.querySelectorAll('.tree-item')];
    const liOf = (id) => (id == null ? null : node.querySelector(`.tree-item[data-key="${CSS.escape(id)}"]`));
    const nodeOf = (li) => (li ? all.get(li.dataset.key) : null);
    const note0 = (li) => { // the row Tab goes to from now on
      cur = li.dataset.key;
      curUp = [];
      for (let p = li.parentElement.closest('.tree-item'); p && node.contains(p); p = p.parentElement.closest('.tree-item')) curUp.push(p.dataset.key);
    };
    // what isn't in the markup: the boxes and the picked row, and where Tab goes
    const settle = () => {
      const list = lis();
      let at = liOf(cur) || curUp.map(liOf).find(Boolean) || (one ? list.find((li) => picked.has(li.dataset.key)) : null) || list[0];
      for (const li of list) {
        li.tabIndex = li === at ? 0 : -1;
        const n = nodeOf(li);
        if (!n || !(many || one)) continue;
        const may = mayPick(n);
        if (many && may) li.setAttribute('aria-checked', String(stateOf(n)));
        if (one && may) li.setAttribute('aria-selected', String(picked.has(n.id)));
        if (!may && !branch(n)) li.setAttribute('aria-disabled', 'true'); else li.removeAttribute('aria-disabled');
        if (!may) { li.removeAttribute('aria-checked'); li.removeAttribute('aria-selected'); }
        li.classList.toggle('no-pick', !may);
      }
      if (at) note0(at);
    };
    const go = (li) => {
      if (!li) return;
      for (const x of node.querySelectorAll('.tree-item[tabindex="0"]')) x.tabIndex = -1;
      li.tabIndex = 0;
      note0(li);
      li.focus({ preventScroll: true });
      li.querySelector('.tree-row').scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const draw = (force = false) => {
      const held = node.contains(document.activeElement) && document.activeElement !== node;
      const markup = html();
      Dash.render(node, markup, { force: force && node.__dashHtml !== markup });
      if (node.__dashHtml === markup) settle();
      if (held && !node.contains(document.activeElement)) go(liOf(cur));
    };
    const keep = () => { if (store) Dash.store.set(store, [...opened]); };
    const ask = (n) => {
      if (!n.ask || (asked.has(n.id) && !asked.get(n.id).failed)) return;
      const mine = {};
      asked.set(n.id, mine);
      const here = () => asked.get(n.id) === mine && !control.signal.aborted;
      Promise.resolve().then(() => load(n.row)).then((rows) => {
        if (!here()) return;
        asked.delete(n.id);
        got.set(n.id, Array.isArray(rows) ? rows : []);
        build();
        askOpen();
        draw();
      }, (e) => {
        if (!here()) return;
        mine.failed = (e && e.message) || String(e);
        draw();
      });
    };
    const askOpen = () => { for (const n of all.values()) if (n.ask && opened.has(n.id) && !asked.has(n.id)) ask(n); }; // (remembered as open, or opened by code)
    const turn = (n, on) => {
      if (!n || !branch(n) || isOpen(n) === on) return;
      if (query) turned.set(n.id, on); else if (on) opened.add(n.id); else opened.delete(n.id);
      if (on) ask(n);
      draw(true);
      if (!query) keep();
      if (onOpen) onOpen(n.row, on);
    };
    const chosen = () => [...all.values()].filter((n) => picked.has(n.id)).map((n) => n.row);
    const tell = () => { if (onSelect) onSelect(one ? chosen()[0] ?? null : chosen()); };
    const tick = (n) => {
      if (!mayPick(n)) return;
      if (one) {
        if (picked.has(n.id)) return;
        picked.clear();
        picked.add(n.id);
      } else {
        const l = leaves(n), on = stateOf(n) !== true;
        for (const x of l) if (on) picked.add(x.id); else picked.delete(x.id);
      }
      settle();
      tell();
    };
    const retry = (li) => {
      const n = li && all.get(li.dataset.note);
      if (n && asked.get(n.id)?.failed) { go(liOf(n.id)); ask(n); draw(); }
    };
    const act = (n, e) => { // a click on a row, or Enter
      const enter = e.type === 'keydown';
      if (one) {
        const was = picked.has(n.id);
        tick(n);
        if (branch(n) && (enter || !mayPick(n) || was || !isOpen(n))) turn(n, !isOpen(n));
        if (enter && !branch(n) && onPick) onPick(n.row, e);
      } else if (many && !enter && mayPick(n)) tick(n);
      else if (branch(n)) turn(n, !isOpen(n));
      else if (onPick) onPick(n.row, e);
      else if (many) tick(n);
    };
    const openMenu = async (n, at) => {
      const list = menu(n.row);
      if (!list || !list.length) return;
      const v = await Dash.menu(at, list);
      if (v != null && onMenu && all.has(n.id)) onMenu(v, all.get(n.id).row);
    };
    const on = (type, fn) => node.addEventListener(type, fn, { signal: control.signal });
    on('click', (e) => {
      const row = e.target.closest('.tree-row');
      const li = row && row.parentElement;
      if (!li || !node.contains(li)) return;
      const n = nodeOf(li);
      if (!n) { retry(li); return; }
      if (inRow(e.target, row)) return;
      go(li);
      if (e.target.closest('[data-dots]')) openMenu(n, e.target.closest('[data-dots]'));
      else if (e.target.closest('.tree-turn') && branch(n)) turn(n, !isOpen(n));
      else act(n, e);
    });
    on('dblclick', (e) => {
      const n = nodeOf(e.target.closest('.tree-row')?.parentElement);
      if (n && one && onPick && !branch(n) && !e.target.closest('.tree-turn, [data-dots]')) onPick(n.row, e);
    });
    on('mousedown', (e) => { if (e.detail > 1 && e.target.closest('.tree-row')) e.preventDefault(); }); // a double click selects no text
    on('focusin', (e) => {
      const li = e.target;
      if (!li.classList.contains('tree-item') || li.tabIndex === 0) return;
      for (const x of node.querySelectorAll('.tree-item[tabindex="0"]')) x.tabIndex = -1;
      li.tabIndex = 0;
      note0(li);
    });
    if (menu) on('contextmenu', (e) => {
      const n = nodeOf(e.target.closest('.tree-item'));
      if (!n) return;
      e.preventDefault();
      const li = liOf(n.id);
      go(li);
      openMenu(n, e.clientX || e.clientY ? e : li.firstElementChild);
    });
    let typed = '', typing = 0;
    on('keydown', (e) => {
      const li = e.target;
      if (!li.classList || !li.classList.contains('tree-item') || e.altKey || e.ctrlKey || e.metaKey) return;
      const list = lis(), i = list.indexOf(li), n = nodeOf(li);
      let to;
      if (e.key === 'ArrowDown') to = list[i + 1] || null;
      else if (e.key === 'ArrowUp') to = list[i - 1] || null;
      else if (e.key === 'Home') to = list[0];
      else if (e.key === 'End') to = list[list.length - 1];
      else if (e.key === 'ArrowRight') { if (n && branch(n)) { if (!isOpen(n)) turn(n, true); else to = list[i + 1]; } to = to || null; } else if (e.key === 'ArrowLeft') {
        if (n && branch(n) && isOpen(n)) { turn(n, false); to = null; } else to = li.parentElement.closest('.tree-item') || null;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!n) retry(li); else if (e.key === 'Enter') act(n, e); else if (many || one) tick(n); else act(n, e);
        return;
      } else if (e.key === '*') {
        e.preventDefault();
        for (const x of n ? (n.up ? kidsOf(n.up) : topSeen()) : []) if (branch(x)) turn(x, true);
        return;
      } else if (menu && n && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
        e.preventDefault();
        openMenu(n, li.firstElementChild);
        return;
      } else if (e.key.length === 1) { // the first letters of a row that shows
        clearTimeout(typing);
        typing = setTimeout(() => { typed = ''; }, 600);
        const k = e.key.toLowerCase();
        typed = typed && [...typed].every((c) => c === k) ? k : typed + k;
        const names = (x) => { const m = nodeOf(x); return m ? titleOf(m).toLowerCase() : ''; };
        const later = list.slice(i + (typed.length === 1 ? 1 : 0)).concat(list.slice(0, i + 1)).find((x) => names(x).startsWith(typed));
        if (!later) return;
        e.preventDefault();
        e.stopPropagation(); // (not a shortcut of the page as well)
        go(later);
        return;
      } else return;
      e.preventDefault();
      if (to) go(to);
    });
    const handle = {
      el: node,
      update(next) { data = next || []; const n = picked.size; build(); askOpen(); draw(); if (picked.size < n) queueMicrotask(tell); },
      get items() { return data; },
      // one: the row (or null); many: the ticked rows, leaves only. select(keys) picks those and no others
      get selected() { return one ? chosen()[0] ?? null : chosen(); },
      select(keys) {
        const was = new Set(picked);
        picked.clear();
        choose(keys);
        settle();
        if (picked.size !== was.size || [...picked].some((k) => !was.has(k))) tell();
      },
      // the open rows; expand(key or keys) opens, expand(keys, false) closes; expand(true) opens all that is here, expand(false) closes all
      get expanded() { return [...all.values()].filter((n) => branch(n) && opened.has(n.id)).map((n) => n.row); },
      expand(which, to = true) {
        if (which === false) opened.clear();
        else if (which === true) { for (const n of all.values()) if (n.kids) opened.add(n.id); } else {
          for (const k of [].concat(which ?? []).map(String)) {
            const n = all.get(k);
            if (!n || !branch(n)) continue;
            if (to) { opened.add(k); ask(n); } else opened.delete(k);
          }
        }
        draw();
        keep();
      },
      // keeps the rows that have the words (or pass a test), with what they are in; '' or null shows all again. → how many have them
      filter(q) {
        const f = typeof q === 'function' ? q : String(q ?? '').trim() ? (r) => Dash.match({ t: get(title, r), s: get(sub, r) }, q, ['t', 's']) : null;
        if (!f || !query || words !== (typeof q === 'string' ? q.trim() : '')) turned.clear();
        query = f;
        words = f && typeof q === 'string' ? q.trim() : '';
        const n = query ? sift() : all.size;
        draw();
        return n;
      },
      // opens what the row is in, and brings it into view
      reveal(k, { focus = false } = {}) {
        const n = all.get(String(k));
        if (!n) return false;
        for (let p = n.up; p; p = p.up) { opened.add(p.id); if (query) turned.set(p.id, true); }
        cur = n.id;
        curUp = [];
        draw();
        keep();
        const li = liOf(n.id);
        if (!li) return false;
        if (focus) go(li); else li.firstElementChild.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
      },
      // asks load(row) again
      reload(k) {
        const n = all.get(String(k));
        if (!n || !load) return;
        got.delete(n.id);
        asked.delete(n.id);
        build();
        if (opened.has(n.id)) ask(all.get(n.id));
        draw();
      },
      redraw() { draw(); },
      destroy() {
        if (control.signal.aborted) return;
        control.abort();
        clearTimeout(typing);
        node.textContent = '';
        node.__dashHtml = undefined;
        node.__dashTree = undefined;
      },
    };
    node.__dashTree = handle;
    build();
    choose(selected);
    askOpen();
    draw();
    return handle;
  };

  // ---- lists that can be picked from, put in order and shown in parts (1.14)

  // Dragging a row by its grip: a copy follows the pointer, a line shows where it would go. zones() are the boxes it may be
  // dropped in, rowsIn(zone) their rows; onDrop(zone, index) once it is let go, index among the zone's other rows. Escape calls
  // it off. can(zone) says whether a zone takes it (none: let go over it, it stays where it was); sideways: what scrolls sideways
  // does so near its edges too. → a promise of whether it was dragged (a press that didn't move is a click).
  const dragRow = (e, row, { zones, rowsIn, onStart, onDrop, onEnd, can, sideways = false }) => {
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId, box = row.getBoundingClientRect();
    let ghost = null, spot = null, near = null, x = x0, y = y0, frame = 0;
    const line = document.createElement('i');
    line.className = 'drop-line';
    const scroller = (z) => {
      for (let p = z; p && p !== document.body; p = p.parentElement) if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
      return document.scrollingElement;
    };
    const wideOne = (z) => {
      for (let p = z; p && p !== document.body; p = p.parentElement) if (p.scrollWidth > p.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(p).overflowX)) return p;
      return null;
    };
    const find = () => {
      const all = zones().map((z) => ({ z, r: z.getBoundingClientRect() }));
      const far = (v, a, b) => Math.max(a - v, 0, v - b);
      const { z } = all.reduce((a, b) => (far(x, b.r.left, b.r.right) * 2 + far(y, b.r.top, b.r.bottom) < far(x, a.r.left, a.r.right) * 2 + far(y, a.r.top, a.r.bottom) ? b : a));
      near = z;
      const takes = !can || can(z);
      document.documentElement.classList.toggle('no-drop', !takes);
      if (!takes) { spot = null; line.remove(); return; }
      const list = rowsIn(z).filter((r) => r !== row), rects = list.map((r) => r.getBoundingClientRect());
      let i = rects.findIndex((r) => y < r.top + r.height / 2);
      if (i < 0) i = list.length;
      const zr = z.getBoundingClientRect();
      const at = !list.length ? zr.top + 6 : i < list.length ? rects[i].top : rects[i - 1].bottom;
      spot = { z, i };
      if (line.parentNode !== z) z.append(line);
      line.style.top = Math.round(at - zr.top - z.clientTop + z.scrollTop) + 'px';
    };
    const step = () => { // near an edge of what scrolls: it scrolls on
      const s = scroller(near), view = s === document.scrollingElement ? { top: 0, bottom: innerHeight } : s.getBoundingClientRect();
      const d = y < view.top + 48 ? y - view.top - 48 : y > view.bottom - 48 ? y - view.bottom + 48 : 0;
      if (d) s.scrollTop += clamp(d / 4, -14, 14);
      const w = sideways ? wideOne(near) : null, r = w && w.getBoundingClientRect();
      const dx = !w ? 0 : x < r.left + 48 ? x - r.left - 48 : x > r.right - 48 ? x - r.right + 48 : 0;
      if (dx) w.scrollLeft += clamp(dx / 4, -14, 14);
      if (d || dx) find();
      frame = requestAnimationFrame(step);
    };
    const begin = () => {
      const shell = row.parentElement.cloneNode(false);
      for (const a of ['id', 'role', 'data-zone', 'data-drop']) shell.removeAttribute(a); // a copy is no box to drop in
      shell.classList.add('drag-ghost');
      shell.setAttribute('aria-hidden', 'true');
      const copy = row.cloneNode(true);
      for (const n of [copy, ...copy.querySelectorAll('[id], [data-key]')]) { n.removeAttribute('id'); n.removeAttribute('data-key'); }
      shell.append(copy);
      Object.assign(shell.style, { width: box.width + 'px', left: box.left + 'px', top: box.top + 'px' });
      ghost = shell;
      (row.closest('dialog, [popover]') || document.body).append(ghost);
      row.classList.add('drag-from');
      document.documentElement.classList.add('dragging');
      if (onStart) onStart();
      find();
      frame = requestAnimationFrame(step);
    };
    return new Promise((resolve) => {
      const control = new AbortController(), { signal } = control;
      const finish = (drop) => {
        control.abort();
        cancelAnimationFrame(frame);
        const was = Boolean(ghost);
        if (ghost) {
          ghost.remove();
          line.remove();
          row.classList.remove('drag-from');
          document.documentElement.classList.remove('dragging', 'no-drop');
          // the click that ends a drag isn't one
          const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
          window.addEventListener('click', stop, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', stop, { capture: true }));
          if (drop && spot && row.isConnected) onDrop(spot.z, spot.i);
          if (onEnd) onEnd();
        }
        resolve(was);
      };
      window.addEventListener('pointermove', (m) => {
        if (m.pointerId !== id) return;
        if (m.pointerType === 'mouse' && !m.buttons) { finish(false); return; } // (it was let go where the page didn't hear of it)
        x = m.clientX;
        y = m.clientY;
        if (!ghost) { if (Math.hypot(x - x0, y - y0) < 5) return; begin(); }
        m.preventDefault();
        ghost.style.transform = `translate(${x - x0}px, ${y - y0}px)`;
        find();
      }, { signal, passive: false });
      window.addEventListener('pointerup', (u) => { if (u.pointerId === id) finish(true); }, { signal });
      window.addEventListener('pointercancel', (u) => { if (u.pointerId === id) finish(false); }, { signal });
      window.addEventListener('blur', () => finish(false), { signal });
      window.addEventListener('keydown', (k) => { if (k.key === 'Escape' && ghost) { k.preventDefault(); k.stopPropagation(); finish(false); } }, { signal, capture: true });
    });
  };
  const GRIP = '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>';

  // Dash.list('rules', { rows, title: 'name', sub: 'when' }): the rows of Dash.entries (title, sub, lead, end, href), and:
  // select: 'one' | 'many' picks rows (arrows, Space, Shift for a range, mod+A); can(row) says which; onSelect(row or rows).
  // onPick(row, event): a row is clicked, or Enter (with select: double-clicked, or Enter). group: a field or a function; its
  // values are headings. reorder: true gives rows a grip to drag (arrow keys on it, or Alt+arrows on a picked list's row);
  // onMove(rows, { row, from, to }) has the new order; false or an error puts it back. menu(row) is a row's menu, onMenu(value,
  // row) what was chosen. more: 20 shows 20 rows and a button for 20 more; with load(offset) it asks for them. height: a
  // number of pixels it scrolls in. .update(rows) .rows .shown .selected .select(keys) .filter(text or test) .count .move(key, to)
  Dash.list = (target, { rows, key = 'id', title = 'title', sub = 'sub', lead, end, href, group, select, selected = [], can = () => true, onSelect, onPick, reorder = false, onMove,
    menu, onMenu, more = 0, load, filter, height, wrap = false, noun = 'row', label, empty = 'Nothing here yet' } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashList?.destroy();
    const control = new AbortController();
    const uid = 'dash-list-' + ++ids;
    const get = (f, r) => (typeof f === 'function' ? f(r) : f != null && r ? r[f] : null);
    const idOf = (r) => String(get(key, r));
    const many = select === 'many', one = select === 'one', picking = many || one;
    const size = more || (load ? 20 : 0);
    let data = rows || [];
    let shown = [];
    let limit = size;
    let test = null, words = '';
    let cur = null, anchor = null; // the row Tab goes to; where a range starts
    let part = null; // a part that is asked for: { busy, failed }
    let whole = !load; // there is no more to ask for
    let dragging = false, held = null, moving = 0; // an update that came while a row is dragged, or its move is being saved
    const picked = new Set(selected == null ? [] : [].concat(selected).map(String));
    const titleOf = (r) => String(get(title, r) ?? '');
    let known = null, knownOf = null; // the rows by their key
    const rowOf = (id) => {
      if (knownOf !== data) { known = new Map(data.map((r) => [idOf(r), r])); knownOf = data; }
      return known.get(id) || null;
    };

    const setTest = (q) => {
      test = typeof q === 'function' ? q : String(q ?? '').trim() ? (r) => Dash.match({ t: get(title, r), s: get(sub, r) }, q, ['t', 's']) : null;
      words = test && typeof q === 'string' ? q.trim() : '';
    };
    if (filter != null) setTest(filter);
    const visible = () => (test ? data.filter(test) : data);
    const groupsOf = (list) => {
      if (group == null) return [{ name: null, rows: list }];
      const m = new Map();
      for (const r of list) { const g = String(get(group, r) ?? ''); if (!m.has(g)) m.set(g, []); m.get(g).push(r); }
      return [...m].map(([name, l]) => ({ name, rows: l }));
    };
    const ordered = () => groupsOf(visible()).flatMap((g) => g.rows);
    const inner = (r) => {
      const s = get(sub, r), l = lead ? lead(r) : '', e = end ? end(r) : '';
      return `${l ? `<span class="entry-lead">${l}</span>` : ''}<span class="entry-text"><span class="entry-title">${markWords(titleOf(r), words)}</span>`
        + `${s != null && s !== '' ? `<span class="entry-sub">${esc(s)}</span>` : ''}</span>${e ? `<span class="entry-end">${e}</span>` : ''}`;
    };
    const rowHtml = (r) => {
      const k = esc(idOf(r)), name = esc(titleOf(r));
      if (picking) {
        return `<li class="entry" role="option" tabindex="-1" data-key="${k}"${reorder ? ' aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"' : ''}>${reorder ? `<span class="entry-grip" data-grip aria-hidden="true">${GRIP}</span>` : ''}`
          + `${many ? '<span class="pick-box"></span>' : ''}${inner(r)}${menu ? '<span class="row-dots" data-dots aria-hidden="true">⋯</span>' : ''}</li>`;
      }
      const grip = reorder ? `<button type="button" class="icon-btn entry-grip" data-grip data-key="dash-grip ${k}" aria-label="Move ${name}" aria-keyshortcuts="ArrowUp ArrowDown">${GRIP}</button>` : '';
      const dots = menu ? `<button type="button" class="icon-btn row-dots" data-dots data-key="dash-dots ${k}" aria-haspopup="menu" aria-label="More for ${name}">⋯</button>` : '';
      const h = href ? get(href, r) : null;
      const body = h != null ? `<a class="entry" href="${esc(safeHref(h))}" data-key="dash-row ${k}">${inner(r)}</a>` : onPick ? `<button type="button" class="entry" data-key="dash-row ${k}">${inner(r)}</button>` : grip || dots ? `<div class="entry">${inner(r)}</div>` : '';
      return body ? `<li class="${grip || dots ? 'entry-line' : 'entry-own'}" data-key="${k}">${grip}${body}${dots}</li>` : `<li class="entry" data-key="${k}">${inner(r)}</li>`;
    };
    const html = () => {
      const list = ordered();
      shown = size && limit < list.length ? list.slice(0, limit) : list;
      const name = label ? ` aria-label="${esc(label)}"` : '';
      const rest = list.length - shown.length;
      const cls = `entries${wrap ? ' wrap' : ''}${picking ? ' picks' : ''}`;
      const box = `${picking ? ` role="listbox"${name}${many ? ' aria-multiselectable="true"' : ''}` : ''}`;
      let out;
      if (!shown.length) out = load && !whole && !part?.failed && !test ? '' : `<div class="empty">${esc(test && data.length ? 'Nothing by that name' : empty)}</div>`;
      else if (group == null) out = `<ul class="${cls}" data-zone=""${box || name}>${shown.map(rowHtml).join('')}</ul>`;
      else {
        const gs = groupsOf(shown).map((g, i) => {
          const h = `${uid}-g${i}`;
          return `<div class="entries-group"${picking ? ` role="group" aria-labelledby="${h}"` : ''}><div class="entries-head" id="${h}">${esc(g.name)}</div>`
            + `<ul class="${cls}" data-zone="${esc(g.name)}"${picking ? ' role="none"' : ` aria-labelledby="${h}"`}>${g.rows.map(rowHtml).join('')}</ul></div>`;
        }).join('');
        out = picking ? `<div class="picks"${box}>${gs}</div>` : gs;
      }
      const n = Math.min(size, rest);
      const foot = part && part.busy ? `<span class="spinner" aria-hidden="true"></span> ${data.length ? 'Loading more…' : 'Loading…'}`
        : part && part.failed ? `Couldn’t load ${data.length ? 'more' : 'this'}: ${esc(part.failed)} <button type="button" class="btn sm" data-more>Try again</button>`
          : rest > 0 ? `<button type="button" class="btn sm ghost" data-more data-key="dash-more">Show ${n === rest ? `the last ${fmt.int(n)}` : `${fmt.int(n)} more`} of ${fmt.int(list.length)}</button>`
            : !whole && !test ? '<button type="button" class="btn sm ghost" data-more data-key="dash-more">Show more</button>' : '';
      return `${height ? `<div class="entries-scroll" data-key="dash-list-scroll" tabindex="${picking ? -1 : 0}">${out}</div>` : out}${foot ? `<div class="entries-foot">${foot}</div>` : ''}`;
    };
    const options = () => [...node.querySelectorAll('[role="option"]')];
    const liOf = (id) => (id == null ? null : node.querySelector(`li[data-key="${CSS.escape(id)}"]`));
    const settle = () => {
      if (!picking) return;
      const list = options();
      const at = liOf(cur) || list.find((o) => picked.has(o.dataset.key)) || list[0];
      for (const o of list) {
        const may = can(rowOf(o.dataset.key) ?? {});
        o.tabIndex = o === at ? 0 : -1;
        o.setAttribute('aria-selected', String(picked.has(o.dataset.key)));
        if (may) o.removeAttribute('aria-disabled'); else { o.setAttribute('aria-disabled', 'true'); }
      }
      if (at) cur = at.dataset.key;
    };
    const go = (li) => {
      if (!li) return;
      for (const x of node.querySelectorAll('[role="option"][tabindex="0"]')) x.tabIndex = -1;
      li.tabIndex = 0;
      cur = li.dataset.key;
      li.focus({ preventScroll: true });
      li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const draw = (force = false) => {
      const had = document.activeElement, inside = had && had !== node && node.contains(had);
      const order = inside && picking ? options().map((o) => o.dataset.key) : null, at = cur;
      const markup = html();
      Dash.render(node, markup, { force: force && node.__dashHtml !== markup });
      if (node.__dashHtml === markup) settle();
      if (inside && !node.contains(document.activeElement)) { // the row with the focus is gone: the next one
        if (picking) {
          const i = order.indexOf(at), next = [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0)).reverse()].find((k) => liOf(k));
          go(liOf(next) || options()[0]);
        } else node.querySelector('button')?.focus({ preventScroll: true });
      }
    };
    const chosen = () => data.filter((r) => picked.has(idOf(r)));
    const tell = () => { if (onSelect) onSelect(one ? chosen()[0] ?? null : chosen()); };
    const changed = (was) => picked.size !== was.size || [...picked].some((k) => !was.has(k));
    const pick = (list, on) => {
      const was = new Set(picked);
      if (one) { const r = list.find(can); if (!r) return; picked.clear(); picked.add(idOf(r)); } else for (const r of list) if (can(r)) { if (on) picked.add(idOf(r)); else picked.delete(idOf(r)); }
      settle();
      if (changed(was)) tell();
    };
    const range = (id) => {
      const list = shown.map(idOf), a = list.indexOf(anchor ?? id), b = list.indexOf(id);
      return a < 0 || b < 0 ? [] : shown.slice(Math.min(a, b), Math.max(a, b) + 1);
    };
    const take = (id, e) => { // a click on a row that can be picked, or Space
      const r = rowOf(id);
      if (!r) return;
      if (one) pick([r], true); else if (e.shiftKey && anchor != null) pick(range(id), true); else { pick([r], !picked.has(id)); anchor = id; }
    };
    // an update that waited while a row was moved: if its rows are in the order they had then, it is from before the move,
    // and the move is made in it too; in another order it counts as it is
    const redo = (list, was, id, before) => {
      const now = list.map(idOf), then = was.map(idOf), has = new Set(now), had = new Set(then), i = now.indexOf(id);
      if (i < 0 || then.filter((x) => has.has(x)).join('\n') !== now.filter((x) => had.has(x)).join('\n')) return list;
      const rest = list.filter((_, n) => n !== i), to = before == null ? rest.length : rest.findIndex((x) => idOf(x) === before);
      return to < 0 ? list : [...rest.slice(0, to), list[i], ...rest.slice(to)];
    };
    // a row to another place: before another one (null: the last)
    const place = async (r, before) => {
      if (moving) return;
      const was = data.slice(), from = was.indexOf(r);
      const next = was.filter((x) => x !== r);
      const to = before == null ? next.length : next.indexOf(before);
      if (from < 0 || to < 0 || to === from) return;
      next.splice(to, 0, r);
      data = next;
      draw(true);
      const li = liOf(idOf(r));
      if (li) li.scrollIntoView({ block: 'nearest' });
      const peers = groupsOf(visible()).find((g) => g.rows.includes(r))?.rows ?? [];
      voiceOf(node).textContent = `${titleOf(r)}: ${peers.indexOf(r) + 1} of ${peers.length}`;
      if (!onMove) return;
      moving++;
      let no = false, why = null;
      try { no = (await onMove(next.slice(), { row: r, from, to })) === false; } catch (e) { no = true; why = e; }
      moving--;
      if (control.signal.aborted) return;
      if (held) {
        data = no ? held : redo(held, was, idOf(r), before == null ? null : idOf(before));
        held = null;
        afterUpdate();
      } else if (no) { data = was; draw(true); }
      if (no) {
        voiceOf(node).textContent = `${titleOf(r)} was put back`;
        if (why) Dash.toast((why && why.message) || String(why), { tone: 'bad' });
      }
    };
    const peersOf = (r) => groupsOf(visible()).find((g) => g.rows.includes(r))?.rows ?? [];
    // to place i among these others: down goes right after the one before, up right before the one after, so that the rows of
    // other groups in between stay where they are
    const among = (r, rest, i) => {
      const now = rest.filter((x) => data.indexOf(x) < data.indexOf(r)).length;
      if (i === now || i < 0 || i > rest.length) return;
      const at = data.filter((x) => x !== r);
      place(r, i > now ? at[at.indexOf(rest[i - 1]) + 1] ?? null : rest[i]);
    };
    const shift = (r, i) => among(r, peersOf(r).filter((x) => x !== r), i);
    const step = (r, by) => shift(r, peersOf(r).indexOf(r) + by);
    const moveMenu = async (r, at) => {
      const i = peersOf(r).indexOf(r), n = peersOf(r).length;
      const v = await Dash.menu(at, [{ label: 'Move to the top', value: 0, disabled: i === 0 }, { label: 'Move up', value: i - 1, disabled: i === 0 },
        { label: 'Move down', value: i + 1, disabled: i === n - 1 }, { label: 'Move to the end', value: n - 1, disabled: i === n - 1 }]);
      if (v != null && data.includes(r)) shift(r, Number(v));
    };
    const openMenu = async (r, at) => {
      const list = menu(r);
      if (!list || !list.length) return;
      const v = await Dash.menu(at, list);
      if (v != null && onMenu) onMenu(v, rowOf(idOf(r)) || r);
    };
    const ask = async () => {
      if (!load || whole || (part && part.busy)) return;
      const mine = (part = { busy: true });
      draw();
      let got = null;
      try { got = await load(data.length); } catch (e) { mine.failed = (e && e.message) || String(e); }
      if (part !== mine || control.signal.aborted) return;
      mine.busy = false;
      if (!mine.failed) {
        part = null;
        got = Array.isArray(got) ? got : [];
        if (got.length < size) whole = true;
        const have = new Set(data.map(idOf));
        const fresh = got.filter((r) => !have.has(idOf(r)));
        const first = data.length ? fresh[0] : null;
        data = data.concat(fresh);
        limit = Math.max(limit, data.length);
        draw(true);
        if (first) voiceOf(node).textContent = `${fmt.plural(fresh.length, noun)} more`;
      } else draw(true);
    };
    const afterUpdate = () => {
      const now = new Set(data.map(idOf)), lost = [...picked].filter((k) => !now.has(k) || !can(rowOf(k)));
      for (const k of lost) picked.delete(k);
      draw();
      if (lost.length && picking) queueMicrotask(tell);
    };
    const on = (type, fn, opts = {}) => node.addEventListener(type, fn, { signal: control.signal, ...opts });
    on('click', (e) => {
      const b = e.target.closest('[data-more]');
      if (b && node.contains(b)) {
        if (b.textContent === 'Try again' || limit >= ordered().length) ask(); else {
          const next = ordered()[limit];
          limit += size;
          draw(true);
          if (next) { // on with the first new row
            const li = liOf(idOf(next));
            if (picking) go(li); else (li?.querySelector('button') || node.querySelector('[data-more]'))?.focus({ preventScroll: true });
          }
        }
        return;
      }
      const li = e.target.closest('li[data-key]');
      const r = li && node.contains(li) ? rowOf(li.dataset.key) : null;
      if (!r || (picking && inRow(e.target, li))) return;
      const dots = e.target.closest('[data-dots]'), grip = e.target.closest('[data-grip]');
      if (picking) go(li);
      if (dots) openMenu(r, dots);
      else if (grip) moveMenu(r, grip);
      else if (picking) take(idOf(r), e);
      else if (onPick && e.target.closest('.entry')) onPick(r, e);
    });
    on('dblclick', (e) => {
      const li = e.target.closest('[role="option"]');
      const r = li && rowOf(li.dataset.key);
      if (r && onPick && !e.target.closest('[data-dots], [data-grip]')) onPick(r, e);
    });
    on('mousedown', (e) => { if (picking && (e.shiftKey || e.detail > 1) && e.target.closest('[role="option"]')) e.preventDefault(); }); // a range selects no text
    on('focusin', (e) => {
      if (e.target.getAttribute('role') !== 'option' || e.target.tabIndex === 0) return;
      for (const x of node.querySelectorAll('[role="option"][tabindex="0"]')) x.tabIndex = -1;
      e.target.tabIndex = 0;
      cur = e.target.dataset.key;
    });
    if (menu) on('contextmenu', (e) => {
      const li = e.target.closest('li[data-key]');
      const r = li && rowOf(li.dataset.key);
      if (!r) return;
      e.preventDefault();
      if (picking) go(li);
      openMenu(r, e.clientX || e.clientY ? e : li);
    });
    if (reorder) on('pointerdown', (e) => {
      const grip = e.target.closest('[data-grip]');
      const li = grip && grip.closest('li[data-key]');
      const r = li && rowOf(li.dataset.key);
      if (!r || e.button || dragging || moving) return;
      if (e.pointerType !== 'touch') e.preventDefault(); // (no text selected on the way; the grip still gets its click)
      const zone = li.parentElement;
      const over = () => {
        dragging = false;
        if (held && !moving) { data = held; held = null; afterUpdate(); }
      };
      dragging = true; // (from the press on: an update would take the row away from under it)
      dragRow(e, li, {
        zones: () => [zone],
        rowsIn: (z) => [...z.children].filter((x) => x.matches('li[data-key]')),
        onDrop: (z, i) => among(r, [...z.children].filter((x) => x.matches('li[data-key]') && x !== li).map((x) => rowOf(x.dataset.key)), i),
        onEnd: over,
      }).then((was) => { if (!was) setTimeout(over); }); // (a click: after it)
    });
    let typed = '', typing = 0;
    on('keydown', (e) => {
      const grip = !picking && e.target.closest('[data-grip]');
      if (grip) {
        const r = rowOf(grip.closest('li[data-key]').dataset.key);
        if (!r || !['ArrowUp', 'ArrowDown'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        step(r, e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      const li = e.target;
      if (!picking || li.getAttribute('role') !== 'option') return;
      const id = li.dataset.key, r = rowOf(id), list = options(), i = list.indexOf(li);
      if (!r) return;
      if (reorder && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(r, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (menu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) { e.preventDefault(); openMenu(r, li); return; }
      if (many && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const l = shown.filter(can);
        pick(l, !l.every((x) => picked.has(idOf(x))));
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const to = { ArrowDown: list[i + 1], ArrowUp: list[i - 1], Home: list[0], End: list[list.length - 1] };
      if (e.key in to) {
        e.preventDefault();
        const next = to[e.key];
        if (!next) return;
        if (many && e.shiftKey && anchor == null) anchor = id;
        go(next);
        if (many && e.shiftKey) pick(range(next.dataset.key), true); else anchor = null;
      } else if (e.key === ' ') {
        e.preventDefault();
        take(id, e);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (onPick) onPick(r, e); else take(id, e);
      } else if (e.key.length === 1) {
        clearTimeout(typing);
        typing = setTimeout(() => { typed = ''; }, 600);
        const k = e.key.toLowerCase();
        typed = typed && [...typed].every((c) => c === k) ? k : typed + k;
        const later = list.slice(i + (typed.length === 1 ? 1 : 0)).concat(list.slice(0, i + 1)).find((x) => titleOf(rowOf(x.dataset.key)).toLowerCase().startsWith(typed));
        if (!later) return;
        e.preventDefault();
        e.stopPropagation(); // (not a shortcut of the page as well)
        go(later);
      }
    });
    const handle = {
      el: node,
      update(next) { if (dragging || moving) { held = next || []; return; } data = next || []; if (load && !data.length) { whole = false; } afterUpdate(); },
      get rows() { return data; },
      get shown() { return shown; },
      get selected() { return one ? chosen()[0] ?? null : chosen(); },
      select(keys) {
        if (!picking) return;
        const was = new Set(picked), want = new Set([].concat(keys ?? []).map(String));
        picked.clear();
        for (const r of data) if (want.has(idOf(r)) && can(r) && !(one && picked.size)) picked.add(idOf(r));
        settle();
        if (changed(was)) tell();
      },
      filter(q) { setTest(q); limit = size; draw(true); return visible().length; },
      get count() { return { shown: visible().length, total: data.length }; },
      move(k, to) { const r = rowOf(String(k)); if (r) shift(r, to); },
      // asks load() for everything again
      reload() { if (!load) return; data = []; whole = false; part = null; limit = size; ask(); },
      redraw() { draw(true); },
      destroy() {
        if (control.signal.aborted) return;
        control.abort();
        clearTimeout(typing);
        node.textContent = '';
        node.style.removeProperty('--entries-h');
        node.__dashHtml = undefined;
        node.__dashList = undefined;
      },
    };
    node.__dashList = handle;
    if (reorder || load) voiceOf(node);
    if (height) node.style.setProperty('--entries-h', Number(height) + 'px'); // (on the box itself: a refresh keeps its place)
    if (load && !data.length) ask(); else draw();
    return handle;
  };

  // ---- more fields (1.15)

  // A number with − and + beside it: Dash.number({ label: 'Seats', name: 'seats', min: 1, max: 50, value: 4 }). By hand:
  // <div class="num-field"><button type="button" class="btn" data-step="-1" aria-label="Less" tabindex="-1">−</button>
  // <input class="input" type="number"> and a + with data-step="1"</div>. Holding a button goes on; min, max and step count.
  Dash.number = ({ label, name, id, min, max, step, value = '', unit, hint, required = false, disabled = false } = {}) => {
    const at = id || (label ? 'dash-num-' + ++ids : '');
    const n = value === '' || value == null ? null : Number(value);
    const btn = (by, text, word, off) => `<button type="button" class="btn" data-step="${by}" tabindex="-1" aria-label="${word}"${disabled || off ? ' disabled' : ''}>${text}</button>`;
    const box = `<div class="num-field">${btn(-1, '−', 'Less', n != null && min != null && n <= Number(min))}<input class="input" type="number"${at ? ` id="${esc(at)}"` : ''}${name ? ` name="${esc(name)}"` : ''}`
      + `${min != null ? ` min="${esc(min)}"` : ''}${max != null ? ` max="${esc(max)}"` : ''}${step != null ? ` step="${esc(step)}"` : ''} value="${esc(value ?? '')}"${!label && name ? ` aria-label="${esc(name)}"` : ''}${required ? ' required' : ''}${disabled ? ' disabled' : ''}>`
      + `${btn(1, '+', 'More', n != null && max != null && n >= Number(max))}</div>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}`;
    const row = unit ? `<div class="num-row">${box}</div>` : box;
    return label ? `<div class="field"><label for="${esc(at)}"${required ? ' class="req"' : ''}>${esc(label)}</label>${row}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>` : row;
  };
  const numEnds = (field) => { // − and + are off at the ends
    const i = field.querySelector('input');
    if (!i) return;
    const v = i.value === '' ? NaN : Number(i.value);
    for (const b of field.querySelectorAll('[data-step]')) {
      const down = Number(b.dataset.step) < 0;
      b.disabled = i.disabled || i.readOnly || (down ? i.min !== '' && v <= Number(i.min) : i.max !== '' && v >= Number(i.max));
    }
  };
  const numStep = (field, by) => {
    const i = field.querySelector('input');
    if (!i || i.disabled || i.readOnly) return false;
    const was = i.value;
    try {
      if (i.value === '' && i.min !== '' && Number(i.min) > 0) i.value = i.min; // an empty box starts at its least
      else if (by < 0) i.stepDown(-by); else i.stepUp(by);
    } catch { // step="any"
      const v = Number(i.value || 0) + by;
      i.value = String(clamp(v, i.min === '' ? -Infinity : Number(i.min), i.max === '' ? Infinity : Number(i.max)));
    }
    numEnds(field);
    if (i.value === was) return false;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };

  // A rating: Dash.rating({ name: 'stars', value: 4 }) is a group of radio buttons drawn as stars; with readonly: true it
  // shows one, parts of a star too ("4.3 of 5").
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>';
  Dash.rating = ({ name = 'rating', value = 0, max = 5, label = 'Rating', readonly = false, required = false, disabled = false, size, tone, text } = {}) => {
    const v = clamp(Number(value) || 0, 0, max), cls = `rating${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}${toneClass(tone)}`;
    if (readonly) {
      const p = +((v / max) * 100).toFixed(2);
      return `<span class="${cls}" role="img" aria-label="${esc(label)}: ${fmt.num(v, Number.isInteger(v) ? 0 : 1)} of ${max}"><span class="rating-stars">${STAR.repeat(max)}</span>`
        + `<span class="rating-stars rating-on"${sized('data-css-w', p, `width:${p}%`)}>${STAR.repeat(max)}</span></span>${text != null ? ` <span class="muted">${esc(text)}</span>` : ''}`;
    }
    return `<fieldset class="${cls}"><legend class="sr-only">${esc(label)}</legend>${Array.from({ length: max }, (_, i) =>
      `<label><input type="radio" name="${esc(name)}" value="${i + 1}" aria-label="${fmt.plural(i + 1, 'star')}"${Math.round(v) === i + 1 ? ' checked' : ''}${required ? ' required' : ''}${disabled ? ' disabled' : ''}>${STAR}</label>`).join('')}</fieldset>`;
  };

  // A slider with two ends: Dash.range({ label: 'Price', name: 'price', min: 0, max: 500, from: 50, to: 200, unit: ' €' }). The
  // ends are two fields, price_from and price_to; neither passes the other.
  Dash.range = ({ label, name = 'range', id, min = 0, max = 100, step = 1, from = min, to = max, unit = '', tone, disabled = false } = {}) => {
    const one = (end, v, word) => `<input type="range" name="${esc(name)}_${end}"${id ? ` id="${esc(id)}_${end}"` : ''} min="${esc(min)}" max="${esc(max)}" step="${esc(step)}" value="${esc(v)}" aria-label="${esc(label || name)}, ${word}"${disabled ? ' disabled' : ''}>`;
    const pos = (v) => +pctOf(Number(v) - Number(min), Number(max) - Number(min)).toFixed(2), a = pos(from), b = pos(to);
    return `<div class="range-field${toneClass(tone)}" role="group" aria-label="${esc(label || name)}"${unit ? ` data-unit="${esc(unit)}"` : ''}>${label ? `<span class="range-label" aria-hidden="true">${esc(label)}</span>` : ''}`
      + `<span class="range-track"${strict() ? sized('data-css-from', a) + sized('data-css-to', b) : ` style="--from:${a}%;--to:${b}%"`}>${one('from', from, 'from')}${one('to', to, 'to')}</span>`
      + `<output>${esc(`${from}–${to}${unit}`)}</output></div>`;
  };
  const rangeMove = (input) => {
    const field = input.closest('.range-field'), [a, b] = field.querySelectorAll('input[type="range"]');
    if (!b) return;
    if (Number(a.value) > Number(b.value)) { if (input === a) a.value = b.value; else b.value = a.value; } // neither passes the other
    const lo = Number(a.min || 0), span = Number(a.max || 100) - lo, track = field.querySelector('.range-track');
    track.style.setProperty('--from', pctOf(Number(a.value) - lo, span) + '%');
    track.style.setProperty('--to', pctOf(Number(b.value) - lo, span) + '%');
    track.classList.toggle('at-end', Number(a.value) >= Number(a.max || 100)); // both at the far end: the first one is on top
    const out = field.querySelector('output');
    if (out) out.textContent = `${a.value}–${b.value}${field.dataset.unit || ''}`;
  };

  // Tags the reader types: Dash.tagbox(input, { options, max, strict, allow, onChange }). Enter or a comma adds what is typed, a
  // paste of several adds them all, Backspace in the empty box (or the tag's ×) takes one away. options are suggestions, a list
  // or a function as for Dash.combobox; strict: true takes only those. allow(text) returns true, or why not as text. The form
  // sends one field of the input's name per tag. .value (a list), .set(list), .add(text), .remove(text), .destroy()
  Dash.tagbox = (target, { value, options, max = Infinity, strict: only = false, allow, onChange, noun = 'tag', label } = {}) => {
    const input = el(target);
    if (!input || !hasDom) return null;
    input.__dashTags?.destroy();
    const name = input.name, must = input.required, typed0 = input.value;
    const control = new AbortController(), { signal } = control;
    const box = document.createElement('div');
    box.className = `${input.className} tag-box`;
    const list = document.createElement('span');
    list.className = 'tag-list';
    list.setAttribute('role', 'list');
    const was = input.className;
    input.className = 'tag-box-in';
    input.before(box);
    box.append(list, input);
    input.name = '';
    input.required = false;
    if (must) input.setAttribute('aria-required', 'true');
    let tags = [];
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const known = () => (Array.isArray(options) ? options.map((o) => (o && typeof o === 'object' ? { ...o, value: String(o.value ?? o.label), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) })) : []);
    const labels = new Map(known().map((o) => [o.value, o.label]));
    const labelOf = (v) => labels.get(v) || v;
    const draw = () => {
      list.innerHTML = tags.map((v) => `<span class="tag" role="listitem" data-tag="${esc(v)}">${esc(labelOf(v))}<button type="button" class="tag-x" tabindex="-1" aria-label="Remove ${esc(labelOf(v))}">×</button>`
        + `${name ? `<input type="hidden" name="${esc(name)}" value="${esc(v)}"${input.disabled ? ' disabled' : ''}>` : ''}</span>`).join('');
      for (const h of list.querySelectorAll('input')) h.__dashPart = true; // (for Dash.form the box is one field)
      box.toggleAttribute('data-full', tags.length >= max);
    };
    const changed = () => {
      draw();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (combo) combo.close(); // (not what was typed: no suggestions for it)
      if (onChange) onChange(tags.slice());
    };
    const say = (t) => { voiceOf(input).textContent = t; };
    const no = (text, why) => { if (why) Dash.toast(why, { tone: 'bad' }); return false; };
    // true: added; false: it can't be
    const add = (text, quiet = false) => {
      let v = String(text ?? '').trim();
      if (!v) return false;
      const o = [...labels].find(([k, l]) => same(l, v) || same(k, v)); // one that is, or was, offered
      if (o) v = o[0];
      else if (only) return no(v, quiet ? '' : Dash.form.text.list);
      const there = tags.find((t) => same(t, v));
      if (there != null) { Dash.flash(list.querySelector(`[data-tag="${CSS.escape(there)}"]`)); return true; }
      if (tags.length >= max) return no(v, quiet ? '' : `At most ${fmt.plural(max, noun)}.`);
      const ok = allow ? allow(v) : true;
      if (ok !== true && ok !== undefined) return no(v, quiet ? '' : typeof ok === 'string' ? ok : `${v} can’t be added.`);
      tags = [...tags, v];
      changed();
      say(`${labelOf(v)} added`);
      return true;
    };
    const take = (v, focus) => {
      const i = tags.indexOf(v);
      if (i < 0) return;
      tags = tags.filter((t) => t !== v);
      changed();
      say(`${labelOf(v)} removed`);
      const xs = list.querySelectorAll('.tag-x');
      if (focus && xs.length) xs[Math.min(i, xs.length - 1)].focus(); else input.focus({ preventScroll: true });
    };
    const combo = options ? Dash.combobox(input, {
      options: async (q) => {
        const all = typeof options === 'function' ? await options(q) : known().filter((o) => Dash.match(o, q, ['label', 'sub']));
        return (all || []).filter((o) => {
          const v = String(o && typeof o === 'object' ? o.value ?? o.label : o);
          labels.set(v, String(o && typeof o === 'object' ? o.label ?? v : o));
          return !tags.some((t) => same(t, v));
        });
      },
      debounce: typeof options === 'function' ? 150 : 0, label: label || 'Suggestions',
      onPick: (o) => { input.value = ''; add(String(o.value)); input.focus({ preventScroll: true }); },
    }) : null;
    const flush = (quiet = false) => { // what is typed becomes tags; what can't be stays in the box
      const parts = input.value.split(/[,;\n\t]+/).map((x) => x.trim()).filter(Boolean);
      const left = parts.filter((x) => !add(x, quiet));
      input.value = left.join(', ');
      return !left.length;
    };
    input.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && input.value.trim()) { e.preventDefault(); flush(); if (combo) combo.close(); } else if (e.key === ',' && !input.value.trim()) e.preventDefault();
      else if (e.key === 'Backspace' && !input.value && tags.length) { e.preventDefault(); take(tags[tags.length - 1]); } else if (e.key === 'ArrowLeft' && !input.value && tags.length) { e.preventDefault(); list.lastElementChild.querySelector('.tag-x').focus(); }
    }, { signal });
    input.addEventListener('paste', (e) => {
      const text = e.clipboardData && e.clipboardData.getData('text');
      if (!text || !/[,;\n\t]/.test(text)) return;
      e.preventDefault();
      input.value = [input.value, text.replace(/[;\n\t]+/g, ',')].filter(Boolean).join(',');
      flush();
    }, { signal });
    input.addEventListener('blur', () => setTimeout(() => { if (!signal.aborted && document.activeElement !== input && input.value.trim()) flush(only); }), { signal });
    box.addEventListener('click', (e) => {
      if (input.disabled || input.readOnly) return;
      const x = e.target.closest('.tag-x');
      if (x) { take(x.parentElement.dataset.tag, e.detail === 0); return; }
      if (e.target === box || e.target === list) input.focus();
    }, { signal });
    box.addEventListener('keydown', (e) => {
      const x = e.target.closest('.tag-x');
      if (!x || e.altKey || e.ctrlKey || e.metaKey || input.disabled || input.readOnly) return;
      const xs = [...list.querySelectorAll('.tag-x')], i = xs.indexOf(x);
      if (e.key === 'ArrowLeft') xs[Math.max(0, i - 1)].focus();
      else if (e.key === 'ArrowRight') (xs[i + 1] || input).focus();
      else if (e.key === 'Delete' || e.key === 'Backspace') take(x.parentElement.dataset.tag, true);
      else return;
      e.preventDefault();
    }, { signal });
    // for Dash.form: at least one, if it must be filled in; and no text left over that can't be a tag
    const says = (k) => { const t = input.dataset.problem || Dash.form.text[k]; return String(typeof t === 'function' ? t(input) : t); };
    input.__dashCheck = () => (input.value.trim() && document.activeElement !== input ? says('list') : must && !tags.length ? says('valueMissing') : '');
    input.__dashName = name;
    input.__dashValue = () => tags.slice();
    const first = [].concat(value ?? typed0.split(',').map((x) => x.trim()).filter(Boolean)).map(String);
    if (input.form) input.form.addEventListener('reset', () => setTimeout(() => { if (signal.aborted) return; input.value = ''; handle.set(first); }), { signal });
    const handle = {
      el: box,
      get value() { return tags.slice(); },
      set(next) { tags = [...new Set([].concat(next ?? []).map(String))]; draw(); },
      add: (t) => add(t, true),
      remove(t) { const v = tags.find((x) => same(x, String(t))); if (v != null) { tags = tags.filter((x) => x !== v); changed(); } },
      destroy() {
        if (signal.aborted) return;
        control.abort();
        if (combo) combo.destroy();
        for (const k of ['__dashCheck', '__dashName', '__dashValue', '__dashTags']) delete input[k];
        input.value = tags.join(', ');
        input.className = was;
        input.name = name;
        input.required = must;
        input.removeAttribute('aria-required');
        box.replaceWith(input);
      },
    };
    input.__dashTags = handle;
    input.value = '';
    handle.set(first);
    voiceOf(input);
    return handle;
  };

  // Text that becomes a box when it is pressed: Dash.inline(el, { value, onSave }). Enter (or the tick) saves, Escape puts it
  // back; onSave(value) may take its time, and false or an error keeps the box open and says why. type: 'number' | 'textarea' | 'select' …,
  // options for a select, check(value) returns what is wrong, format(value) how it reads, empty what stands for nothing.
  Dash.inline = (target, { value = '', type = 'text', options, check, onSave, format, empty = 'Empty', label = 'Edit', attrs = {} } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    let now = value, editing = false, busy = false;
    const opts = (options || []).map((o) => (o && typeof o === 'object' ? { value: String(o.value ?? o.label), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));
    const reads = (v) => (format ? format(v) : type === 'select' ? opts.find((o) => o.value === String(v))?.label ?? v : v);
    const show = () => {
      editing = false;
      const t = reads(now), none = t == null || t === '';
      node.innerHTML = `<button type="button" class="inline-edit" aria-label="${esc(label)}: ${esc(none ? empty : t)}"><span${none ? ' class="muted"' : ''}>${esc(none ? empty : t)}</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M10.5 2.5l3 3-8 8H2.5v-3z"/></svg></button>`;
    };
    const err = (t) => {
      const e = node.querySelector('.err');
      if (!e) return;
      e.textContent = t || '';
      e.hidden = !t;
      const i = node.querySelector('.input');
      if (t) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    };
    const edit = () => {
      if (editing) return;
      editing = true;
      const id = 'dash-inline-' + ++ids, more = Object.entries(attrs).map(([k, v]) => ` ${esc(k)}="${esc(v)}"`).join('');
      const field = type === 'textarea' ? `<textarea class="input sm" rows="3" aria-label="${esc(label)}" aria-describedby="${id}"${more}>${esc(now ?? '')}</textarea>`
        : type === 'select' ? `<span class="select"><select class="input sm" aria-label="${esc(label)}" aria-describedby="${id}"${more}>${opts.map((o) => `<option value="${esc(o.value)}"${o.value === String(now) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></span>`
        : `<input class="input sm" type="${esc(type)}" value="${esc(now ?? '')}" aria-label="${esc(label)}" aria-describedby="${id}"${more}>`;
      node.innerHTML = `<div class="inline-form"><div class="row">${field}<button type="button" class="btn sm primary" data-inline-save>Save</button><button type="button" class="btn sm ghost" data-inline-cancel>Cancel</button></div><div class="err" id="${id}" role="alert" hidden></div></div>`;
      const i = node.querySelector('.input');
      i.focus({ preventScroll: true });
      if (i.select) i.select();
    };
    const leave = () => { show(); node.querySelector('.inline-edit').focus({ preventScroll: true }); };
    const save = async () => {
      if (busy) return;
      const i = node.querySelector('.input'), raw = i.value, v = type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
      const bad = problemOf(i) || (check ? check(v) : '');
      if (typeof bad === 'string' && bad) { err(bad); i.focus(); return; }
      if (same0(v, now)) { leave(); return; }
      busy = true;
      err('');
      i.readOnly = true;
      let no = '';
      try { if ((await Dash.busy(node.querySelector('[data-inline-save]'), () => (onSave ? onSave(v) : true))) === false) no = 'That wasn’t saved.'; } catch (e) { no = (e && e.message) || String(e); }
      busy = false;
      if (!editing || !node.contains(i)) return; // destroyed, or put back, meanwhile
      i.readOnly = false;
      if (no) { err(no); i.focus(); return; }
      now = v;
      leave();
    };
    const same0 = (a, b) => String(a ?? '') === String(b ?? '');
    const control = new AbortController(), { signal } = control;
    node.addEventListener('click', (e) => {
      if (e.target.closest('.inline-edit')) edit();
      else if (e.target.closest('[data-inline-save]')) save();
      else if (e.target.closest('[data-inline-cancel]') && !busy) leave();
    }, { signal });
    node.addEventListener('keydown', (e) => {
      if (!editing || e.isComposing) return;
      if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); leave(); }
      // (no form of its own: it may be in one, which Enter must not send)
      if (e.key === 'Enter' && e.target.matches('.input') && (e.target.tagName !== 'TEXTAREA' || e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    }, { signal });
    show();
    return { el: node, get value() { return now; }, set(v) { now = v; if (!editing) show(); }, edit, cancel() { if (editing && !busy) leave(); }, destroy() { control.abort(); node.textContent = ''; } };
  };

  // A select that can be searched: Dash.multi(select) puts a button in its place that says what is picked, and opens a list with a
  // search box and boxes to tick (a <select multiple>) or one to pick. The select stays the field: a form sends it, its change
  // event fires, and Dash.form checks it. search: true | false (from 8 options on), noun for "3 regions", placeholder, all: what
  // it says when nothing is picked. .update() after the options change, .open(), .destroy()
  Dash.multi = (target, { search, noun = 'picked', placeholder, width, label } = {}) => {
    const sel = el(target);
    if (!sel || sel.tagName !== 'SELECT') return null;
    sel.__dashMulti?.destroy();
    const many = sel.multiple;
    const control = new AbortController(), { signal } = control;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'input multi-btn';
    btn.id = 'dash-multi-' + ++ids;
    const host = sel.closest('.select') || sel;
    const box = document.createElement('span');
    box.className = 'multi';
    const name = () => label || sel.getAttribute('aria-label') || (sel.labels[0] && sel.labels[0].textContent.trim()) || 'Choose';
    const rows = () => [...sel.options].filter((o) => !o.hidden).map((o, i) => ({ id: String(i), value: o.value, title: o.textContent.trim(), sub: o.dataset.sub, group: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '', off: o.disabled || o.parentElement.disabled, o }));
    const draw = () => {
      const on = [...sel.selectedOptions].filter((o) => o.value !== '' || many);
      const t = !on.length ? placeholder ?? ((!many && sel.selectedOptions[0]?.textContent.trim()) || 'Choose') : on.length < 3 ? on.map((o) => o.textContent.trim()).join(', ') : `${on.length} ${noun}`;
      btn.innerHTML = `<span class="multi-text${on.length ? '' : ' muted'}">${esc(t)}</span>`;
      btn.setAttribute('aria-label', `${name()}: ${t}`);
      btn.disabled = sel.disabled;
      for (const a of ['aria-invalid', 'aria-describedby']) { if (sel.hasAttribute(a)) btn.setAttribute(a, sel.getAttribute(a)); else btn.removeAttribute(a); }
    };
    const fire = () => {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let pop = null, list = null;
    const open = () => {
      if (pop || sel.disabled) return;
      const all = rows(), find = search ?? all.length >= 8;
      pop = Dash.popup(btn, `${find ? '<label class="search"><input class="input sm" type="search" placeholder="Search" aria-label="Search"></label>' : ''}<div class="multi-list"></div>`
        + `${many ? '<div class="multi-foot"><button type="button" class="link quiet" data-multi="all">All</button><button type="button" class="link quiet" data-multi="none">None</button></div>' : ''}`,
      { label: name(), cls: 'multi-pop', width: width || `${Math.max(220, Math.round(btn.getBoundingClientRect().width))}px`, onClose: () => { if (list) list.destroy(); pop = list = null; } });
      if (!pop) return;
      const grouped = all.some((r) => r.group);
      list = Dash.list(pop.el.querySelector('.multi-list'), {
        rows: all, select: many ? 'many' : 'one', selected: all.filter((r) => r.o.selected).map((r) => r.id), can: (r) => !r.off, group: grouped ? 'group' : undefined, height: 280, label: name(),
        empty: 'Nothing to choose',
        onSelect: (got) => {
          const on = new Set([].concat(got || []).map((r) => r.o));
          for (const r of all) r.o.selected = on.has(r.o);
          draw();
          fire();
          if (!many && pop) pop.close();
        },
        onPick: () => { if (pop) pop.close(); },
      });
      const box = pop.el.querySelector('input[type="search"]'), opt = () => pop && pop.el.querySelector('[role="option"][tabindex="0"]');
      if (box) {
        box.addEventListener('input', () => list.filter(box.value));
        box.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && opt()) { e.preventDefault(); opt().focus(); } });
      }
      pop.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-multi]');
        if (b) list.select(b.dataset.multi === 'all' ? list.shown.filter((r) => !r.off).map((r) => r.id) : []);
        else if (!many && e.target.closest('[role="option"]:not([aria-disabled="true"])') && pop) pop.close(); // the one that is picked already
      });
      (box || opt() || pop.el).focus({ preventScroll: true });
    };
    btn.addEventListener('click', open, { signal });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } }, { signal });
    sel.addEventListener('focus', () => btn.focus(), { signal }); // a click on its label, or Dash.form going to it
    sel.addEventListener('change', draw, { signal });
    if (sel.form) sel.form.addEventListener('reset', () => setTimeout(draw), { signal });
    const wasTab = sel.getAttribute('tabindex'), wasHidden = sel.getAttribute('aria-hidden');
    host.classList.add('multi-off');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    host.before(box);
    box.append(host, btn);
    draw();
    const watch = new MutationObserver(draw); // its options, and what a form says about it
    watch.observe(sel, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby', 'disabled', 'aria-label'], childList: true, subtree: true });
    const handle = { el: btn, open, update: draw, close() { if (pop) pop.close(); }, destroy() { if (signal.aborted) return; control.abort(); watch.disconnect(); if (pop) pop.close(); box.replaceWith(host); host.classList.remove('multi-off'); if (wasTab == null) sel.removeAttribute('tabindex'); else sel.setAttribute('tabindex', wasTab); if (wasHidden == null) sel.removeAttribute('aria-hidden'); delete sel.__dashMulti; } };
    sel.__dashMulti = handle;
    return handle;
  };

  // A code from a message, one box drawn as several: Dash.code({ label: 'Code', name: 'code', length: 6 }). It takes a paste, and the
  // code a phone offers. Once it is full it fires dash:code (detail: the code) and, with submit: true, sends its form.
  // letters: true takes letters too, as capitals.
  Dash.code = ({ label = 'Code', name = 'code', id, length = 6, letters = false, submit = false, required = true, disabled = false, value = '' } = {}) => {
    const n = clamp(Math.round(Number(length)) || 6, 3, 10);
    return `<span class="code-field"><input${id ? ` id="${esc(id)}"` : ''} name="${esc(name)}" aria-label="${esc(label)}" value="${esc(value)}" maxlength="${n}" inputmode="${letters ? 'text' : 'numeric'}" autocomplete="one-time-code" autocapitalize="characters"`
      + ` spellcheck="false" pattern="${letters ? '[A-Za-z0-9]' : '[0-9]'}{${n}}" title="All ${n} ${letters ? 'characters' : 'digits'}."${letters ? ' data-letters' : ''}${submit ? ' data-submit' : ''}${required ? ' required' : ''}${disabled ? ' disabled' : ''}>${Array.from({ length: n }, (_, i) => (i < String(value).length ? '<i class="on"></i>' : '<i></i>')).join('')}</span>`;
  };
  const codeLen = (input) => (input.maxLength > 0 ? input.maxLength : 6);
  const codeWell = (input, text) => String(text).replace('letters' in input.dataset ? /[^a-z0-9]/gi : /\D/g, ''); // what a code can have
  const codeAt = (input) => { // which boxes are filled, and which one the next character goes into (all that are selected)
    const cells = input.parentElement.querySelectorAll('i'), s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    cells.forEach((c, i) => { c.classList.toggle('at', s === e ? i === Math.min(s, cells.length - 1) : i >= s && i < e); c.classList.toggle('on', i < input.value.length); });
    input.__dashLen = input.value.length;
  };
  // into box i (or the first empty one): what is in it is selected, so that the next character takes its place
  const codeTo = (input, i) => {
    const len = input.value.length, at = clamp(i, 0, Math.min(len, codeLen(input) - 1));
    if (document.activeElement === input) input.setSelectionRange(at, Math.min(at + 1, len));
    codeAt(input);
  };
  const codeBoxAt = (input, x) => { // the box at a place on the screen
    const r = [...input.parentElement.querySelectorAll('i')].map((c) => c.getBoundingClientRect());
    return r.findIndex((c, i) => i === r.length - 1 || x < (c.right + r[i + 1].left) / 2);
  };
  const codeIn = (input) => {
    const n = codeLen(input), raw = input.value, was = input.__dashLen ?? 0;
    const clean = codeWell(input, raw).slice(0, n), v = 'letters' in input.dataset ? clean.toUpperCase() : clean;
    const at = Math.min(codeWell(input, raw.slice(0, input.selectionStart ?? raw.length)).length, v.length);
    if (raw !== v) { input.value = v; if (document.activeElement === input) input.setSelectionRange(at, at); }
    // typed over one: on with the next. Between two, while there is room: the rest moves along. After the last of a full one
    // there is no more to type
    if (at < v.length && (v.length === n || v.length === was)) codeTo(input, at); else codeAt(input);
    if (v.length < n) { input.__dashCode = ''; return; }
    if (input.__dashCode === v) return; // said once
    input.__dashCode = v;
    input.dispatchEvent(new CustomEvent('dash:code', { bubbles: true, detail: v }));
    if ('submit' in input.dataset && input.form) input.form.requestSubmit();
  };

  // ---- dashboard tools (1.16)

  // A box to find and do anything: Dash.palette({ items, key: 'mod+k' }). An item: { label, sub, group, icon (HTML), keys (its
  // shortcut, shown), words (more to find it by), href | run(item), tone, disabled }. items: a list, or (query) => list or a
  // promise of one. recent: a store key: what was picked last comes first while nothing is typed. onPick(item): the others.
  // .open(query), .close(), .isOpen, .update(items), .stop()
  const FIND = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="m11 11 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const onMac = () => hasDom && /Mac|iPhone|iPad/.test(navigator.platform || '');
  // 'mod+shift+k' as key caps: Ctrl Shift K, or ⌘ ⇧ K on a Mac; 'g then s' as two presses
  Dash.keys = (keys) => {
    const mac = onMac(), name = { mod: mac ? '⌘' : 'Ctrl', ctrl: mac ? '⌃' : 'Ctrl', cmd: '⌘', meta: mac ? '⌘' : 'Meta', shift: mac ? '⇧' : 'Shift', alt: mac ? '⌥' : 'Alt', enter: '↵', escape: 'Esc', up: '↑', down: '↓', left: '←', right: '→' };
    return `<span class="keys">${String(keys ?? '').trim().split(/\s+/).filter(Boolean).map((k) => (k === 'then' ? '<span>then</span>'
      : (k === '+' ? ['+'] : k.split('+')).map((x) => `<kbd>${esc(name[x.toLowerCase()] || (x.length === 1 ? x.toUpperCase() : x))}</kbd>`).join(''))).join(' ')}</span>`;
  };
  Dash.palette = ({ items = [], key = 'mod+k', placeholder = 'Search or jump to…', label = 'Commands', empty = 'Nothing by that name', recent, max = 50, onPick } = {}) => {
    if (!hasDom) return null;
    const uid = 'dash-palette-' + ++ids;
    let list = items, d = null, shown = [], at = -1, seq = 0, timer = 0;
    const keyOf = (it) => String(it.key ?? it.href ?? it.label);
    const lately = () => { const r = recent ? Dash.store.get(recent) : null; return Array.isArray(r) ? r.map(String) : []; };
    const rank = (it, q) => { // how well an item fits: its name from the start, its words from theirs, anywhere in it, elsewhere (its group …); 9: not at all
      if (!q) return 0;
      if (!Dash.match(it, q, ['label', 'sub', 'group', 'words'])) return 9;
      const name = String(it.label ?? '').toLowerCase(), all = q.toLowerCase(), words = all.split(/\s+/), parts = name.split(/[\s\-_/.:]+/);
      return name.startsWith(all) ? 0 : words.every((w) => parts.some((x) => x.startsWith(w))) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3;
    };
    const go = (i) => {
      const input = d.querySelector('input'), was = d.querySelector('[aria-selected="true"]'), o = d.querySelector(`[data-i="${i}"]`);
      if (was) was.setAttribute('aria-selected', 'false');
      at = o ? i : -1;
      if (!o) { input.removeAttribute('aria-activedescendant'); return; }
      o.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', o.id);
    };
    const toAt = () => { const o = d.querySelector('[aria-selected="true"]'); if (at === 0) d.querySelector('.palette-list').scrollTop = 0; else if (o) o.scrollIntoView({ block: 'nearest' }); };
    const step = (by) => { // to the next one that can be picked, around the ends
      for (let k = 1, n = shown.length; k <= n; k++) { const i = (((at + by * k) % n) + n) % n; if (!shown[i].disabled) { go(i); toAt(); return; } }
    };
    const draw = (found, q, note) => {
      const groups = new Map(), was = q ? [] : lately(); // groups, in the order their first item has
      const put = (g, it) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); };
      for (const k of was) { const it = found.find((x) => keyOf(x) === k); if (it) put('Recent', it); }
      const ranked = found.map((it, i) => ({ it, i, r: typeof list === 'function' ? 0 : rank(it, q) })).filter((x) => x.r < 9).sort((a, b) => a.r - b.r || a.i - b.i);
      for (const { it } of ranked) if (!was.includes(keyOf(it))) put(it.group || '', it);
      shown = [];
      const row = (it) => {
        const i = shown.push(it) - 1;
        return `<div class="palette-item${toneClass(it.tone)}" role="option" id="${uid}-${i}" data-i="${i}" aria-selected="false"${it.disabled ? ' aria-disabled="true"' : ''}>${it.icon ? `<span class="nav-icon">${it.icon}</span>` : ''}`
          + `<span class="palette-text"><span class="palette-name">${markWords(String(it.label ?? ''), q)}</span>${it.sub ? `<span class="palette-sub">${markWords(String(it.sub), q)}</span>` : ''}</span>${it.keys ? Dash.keys(it.keys) : ''}</div>`;
      };
      let html = '', n = 0;
      for (const [g, rows] of groups) {
        const some = rows.slice(0, Math.max(0, max - n));
        if (some.length) html += g ? `<div role="group" aria-labelledby="${uid}-g${n}"><div class="palette-group" id="${uid}-g${n}">${esc(g)}</div>${some.map(row).join('')}</div>` : some.map(row).join('');
        n += some.length;
      }
      const box = d.querySelector('.palette-list');
      box.innerHTML = html || `<div class="palette-empty" role="option" aria-disabled="true" aria-selected="false">${esc(note || empty)}</div>`;
      box.scrollTop = 0;
      go(shown.findIndex((it) => !it.disabled));
      voiceOf(box).textContent = q ? note || (shown.length ? fmt.plural(shown.length, 'result') : empty) : '';
    };
    const ask = () => {
      const q = d.querySelector('input').value.trim(), my = ++seq;
      clearTimeout(timer);
      if (typeof list !== 'function') { draw(list, q); return; }
      const run = async () => {
        let got = [], why = '', done = false;
        setTimeout(() => { if (d && my === seq && !done) { if (shown.length) d.querySelector('.palette-list').setAttribute('aria-busy', 'true'); else draw([], q, 'Searching…'); } }, 200);
        try { got = await list(q); } catch (e) { why = `Couldn’t search: ${(e && e.message) || e}`; }
        done = true;
        if (!d || my !== seq) return;
        d.querySelector('.palette-list').removeAttribute('aria-busy');
        draw(Array.isArray(got) ? got : [], q, why);
      };
      if (q) timer = setTimeout(run, 120); else run();
    };
    const gone = (x) => { // closed, by us or by Escape: at once, so that what is picked can open another one
      if (d !== x) return;
      d = null;
      shown = [];
      seq++;
      clearTimeout(timer);
    };
    const close = () => { const x = d; if (!x) return; gone(x); x.close(); };
    const pick = (i, e) => {
      const it = shown[i];
      if (!it || it.disabled) return;
      if (recent) Dash.store.set(recent, [keyOf(it), ...lately().filter((k) => k !== keyOf(it))].slice(0, 5));
      close();
      if (it.run) it.run(it);
      else if (it.href == null) { if (onPick) onPick(it); } else if (e && (e.ctrlKey || e.metaKey)) window.open(safeHref(it.href), '_blank', 'noopener');
      else location.href = safeHref(it.href);
    };
    const open = (q = '') => {
      if (!d) {
        const x = document.createElement('dialog');
        d = x;
        x.className = 'palette';
        x.setAttribute('aria-label', label);
        x.innerHTML = `<label class="palette-head">${FIND}<input type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="${uid}" aria-label="${esc(label)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" enterkeyhint="go"></label>`
          + `<div class="palette-list" role="listbox" id="${uid}" aria-label="${esc(label)}"></div><div class="palette-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> pick</span><span><kbd>Esc</kbd> close</span></div>`;
        const input = x.querySelector('input');
        let outside = false;
        input.addEventListener('input', ask);
        input.addEventListener('keydown', (e) => {
          if (e.isComposing || e.altKey) return;
          const mac = e.ctrlKey && onMac();
          if (e.key === 'ArrowDown' || (mac && e.key === 'n')) step(1);
          else if (e.key === 'ArrowUp' || (mac && e.key === 'p')) step(-1);
          else if (e.key === 'PageDown' || e.key === 'PageUp') { const by = e.key === 'PageDown' ? 1 : -1; for (let k = 0; k < 8 && (by > 0 ? at < shown.length - 1 : at > 0); k++) step(by); } else if (e.key === 'Enter') pick(at, e);
          else return;
          e.preventDefault();
        });
        x.addEventListener('mousemove', (e) => { const o = e.target.closest('[data-i]'); if (o && Number(o.dataset.i) !== at && !o.hasAttribute('aria-disabled')) go(Number(o.dataset.i)); });
        x.addEventListener('mousedown', (e) => { outside = e.target === x; if (!e.target.closest('input')) e.preventDefault(); }); // the box keeps the focus
        x.addEventListener('click', (e) => { if (e.target === x && outside) { close(); return; } const o = e.target.closest('[data-i]'); if (o) pick(Number(o.dataset.i), e); });
        x.addEventListener('close', () => { gone(x); x.remove(); });
        document.body.append(x);
        openModal(x);
      }
      const input = d.querySelector('input');
      input.value = q;
      input.focus();
      ask();
    };
    const off = key ? Dash.key(key, () => { if (d) close(); else open(); }, { inInputs: /\b(mod|ctrl|meta|cmd)\b/i.test(key) }) : () => {};
    return {
      open, close,
      get isOpen() { return Boolean(d); },
      update(next) { list = next || []; if (d) ask(); },
      stop() { off(); close(); },
    };
  };

  // Lines as they come: Dash.log('out', { height: 320 }), then .add('text'), .add({ time, level: 'warn', source, text }) or a list.
  // It stays at the end until the reader scrolls up; then a button says how many are new. max: the oldest go. tools: true puts
  // a filter, Wrap, Copy and Clear above it. time: false leaves the times out, wrap: false scrolls sideways. The colours a
  // terminal shows (ANSI) are kept. .add(), .clear(), .filter(text or test), .wrap(on), .end(), .lines, .text, .count, .destroy()
  const ANSI = { 31: 'bad', 32: 'ok', 33: 'warn', 34: 'blue', 35: 'purple', 36: 'teal', 90: 'muted', 91: 'bad', 92: 'ok', 93: 'warn', 94: 'blue', 95: 'purple', 96: 'teal' };
  const plainText = (s) => String(s ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '');
  const ansiHtml = (s, q) => {
    const parts = String(s ?? '').split(/\x1b\[([0-9;]*)m/);
    let out = '', bold = false, tone = '';
    parts.forEach((part, i) => {
      if (i % 2) {
        const codes = part === '' ? [0] : part.split(';').map(Number);
        for (let k = 0; k < codes.length; k++) {
          const n = codes[k];
          if (n === 38 || n === 48) k += codes[k + 1] === 5 ? 2 : codes[k + 1] === 2 ? 4 : 0; // one of 256 colours, or any: left out
          else if (n === 0) { bold = false; tone = ''; } else if (n === 1) bold = true; else if (n === 22) bold = false; else if (n === 39 || (n >= 30 && n <= 37 && !ANSI[n]) || n === 97) tone = ''; else if (ANSI[n]) tone = ANSI[n];
        }
        return;
      }
      const text = plainText(part);
      const cls = [tone && (tone === 'muted' ? tone : `tone ${tone}`), bold && 'log-b'].filter(Boolean).join(' ');
      if (text) out += cls ? `<span class="${cls}">${markWords(text, q)}</span>` : markWords(text, q);
    });
    return out;
  };
  Dash.log = (target, { lines = [], max = 2000, time = true, wrap = true, height = 320, filter, tools = false, live = false, label = 'Log', noun = 'line', empty = 'Nothing yet' } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashLog?.destroy();
    const control = new AbortController(), { signal } = control;
    let data = [], test = null, words = '', due = 0, fresh = [], unread = 0, at = true, seq = 0;
    node.classList.add('log');
    node.innerHTML = `${tools ? `<div class="log-tools"><input class="input sm" type="search" placeholder="Filter" aria-label="Filter the ${esc(noun)}s" autocomplete="off"><span class="log-count muted" role="status"></span>`
      + `<button type="button" class="btn sm ghost" data-log="wrap" aria-pressed="${Boolean(wrap)}">Wrap</button><button type="button" class="btn sm ghost" data-log="copy" data-label="Copy">Copy</button><button type="button" class="btn sm ghost" data-log="clear">Clear</button></div>` : ''}`
      + `<div class="log-box"><div class="log-lines"${wrap ? '' : ' data-nowrap'} role="log" aria-live="${live ? 'polite' : 'off'}" aria-label="${esc(label)}" tabindex="0"></div><button type="button" class="btn sm log-new" hidden></button></div>`;
    const box = node.querySelector('.log-lines'), more = node.querySelector('.log-new'), search = node.querySelector('.log-tools input');
    if (height) box.style.setProperty('--log-h', typeof height === 'number' ? height + 'px' : String(height));
    const norm = (l) => (l && typeof l === 'object' ? { ...l, text: String(l.text ?? '') } : { text: String(l ?? '') });
    const cut = () => { if (data.length > max) data = data.slice(-max); return data; };
    const fits = (l) => !test || test(l);
    const setTest = (q) => {
      test = typeof q === 'function' ? q : String(q ?? '').trim() ? (l) => Dash.match({ t: plainText(l.text), l: l.level, s: l.source }, q) : null;
      words = test && typeof q === 'string' ? q.trim() : '';
    };
    const LEVEL = { error: 'bad', err: 'bad', fatal: 'bad', critical: 'bad', warn: 'warn', warning: 'warn', debug: 'muted', trace: 'muted', ok: 'ok', success: 'ok' };
    const html = (l) => {
      const lv = String(l.level ?? '').toLowerCase(), d = time && l.time != null ? new Date(Dash.time(l.time)) : null, when = d && valid(d);
      return `<div class="log-line${toneClass(LEVEL[lv])}" data-n="${l.n}">${when ? `<time class="log-time" datetime="${d.toISOString()}" title="${esc(fmt.time(l.time))}">${esc(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }))}</time>` : ''}`
        + `${lv ? `<span class="log-level">${esc(lv)}</span>` : ''}${l.source ? `<span class="log-source">${markWords(String(l.source), words)}</span>` : ''}<span class="log-text">${ansiHtml(l.text, words)}</span></div>`;
    };
    const atEnd = () => box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    const note = () => {
      more.hidden = at || !unread;
      if (!more.hidden) more.textContent = `${fmt.int(unread)} new ${unread === 1 ? noun : noun + 's'} ↓`;
      const c = node.querySelector('.log-count');
      if (c) c.textContent = test ? `${fmt.int(data.filter(fits).length)} / ${fmt.int(data.length)}` : '';
    };
    const toEnd = () => { box.scrollTop = box.scrollHeight; };
    const end = () => { at = true; unread = 0; toEnd(); note(); };
    const all = () => { // drawn anew
      cancelAnimationFrame(due);
      due = 0;
      fresh = [];
      const list = cut().filter(fits);
      box.innerHTML = list.length ? list.map(html).join('') : `<p class="empty">${esc(test ? 'Nothing by that name' : empty)}</p>`;
      if (at) toEnd();
      note();
    };
    const flush = () => { // what came since the last frame, at once
      due = 0;
      const list = fresh.slice(-max).filter(fits), oldest = cut()[0]?.n ?? Infinity, gone = [...box.querySelectorAll(':scope > .log-line')].filter((x) => Number(x.dataset.n) < oldest);
      fresh = [];
      if (gone.length) {
        const top = box.scrollTop, tall = box.scrollHeight;
        for (const x of gone) x.remove();
        if (!at) box.scrollTop = Math.max(0, top - (tall - box.scrollHeight)); // what the reader looks at stays where it is
      }
      if (list.length) {
        box.querySelector(':scope > .empty')?.remove();
        box.insertAdjacentHTML('beforeend', list.map(html).join(''));
        if (!at) unread += list.length;
      }
      if (at) toEnd();
      note();
    };
    const put = (x, out) => { for (const l of [].concat(x)) { const line = norm(l); for (const text of line.text.replace(/\r?\n$/, '').split(/\r?\n/)) { const one = { ...line, text, n: ++seq }; data.push(one); if (out) out.push(one); } } };
    const add = (x) => {
      put(x, fresh);
      if (!seq) return;
      if (data.length > max * 2) cut();
      if (fresh.length > max * 2) fresh = fresh.slice(-max);
      if (!due) due = requestAnimationFrame(flush);
    };
    const handle = {
      el: node, add, end,
      get lines() { return cut().map(({ n, ...l }) => l); },
      get text() { return cut().filter(fits).map((l) => [time && l.time != null && Number.isFinite(Dash.time(l.time)) ? new Date(Dash.time(l.time)).toISOString() : '', l.level, l.source, plainText(l.text)].filter((x) => x != null && x !== '').join(' ')).join('\n'); },
      get count() { return { shown: cut().filter(fits).length, total: data.length }; },
      clear() { data = []; unread = 0; at = true; all(); },
      filter(q) { setTest(q); if (search && typeof q !== 'function' && search.value.trim() !== String(q ?? '').trim()) search.value = q ?? ''; all(); return handle.count.shown; },
      wrap(on = true) { box.toggleAttribute('data-nowrap', !on); const b = node.querySelector('[data-log="wrap"]'); if (b) b.setAttribute('aria-pressed', String(Boolean(on))); if (at) toEnd(); },
      destroy() { if (signal.aborted) return; control.abort(); if (watch) watch.disconnect(); cancelAnimationFrame(due); node.textContent = ''; node.classList.remove('log'); node.__dashLog = undefined; },
    };
    box.addEventListener('scroll', () => { at = atEnd(); if (at) unread = 0; note(); }, { passive: true, signal });
    more.addEventListener('click', () => { end(); box.focus({ preventScroll: true }); }, { signal });
    if (search) search.addEventListener('input', () => handle.filter(search.value), { signal });
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-log]');
      if (!b) return;
      if (b.dataset.log === 'wrap') handle.wrap(b.getAttribute('aria-pressed') !== 'true');
      else if (b.dataset.log === 'clear') handle.clear();
      else b.dataset.copy = handle.text; // (the click goes on to the page, which copies it)
    }, { signal });
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (at) toEnd(); }) : null; // narrower: lines wrap
    if (watch) watch.observe(box);
    if (filter != null) { setTest(filter); if (search && typeof filter === 'string') search.value = filter; }
    put(lines);
    all();
    node.__dashLog = handle;
    return handle;
  };

  // What a value is made of, to open and close: Dash.json('out', value, { open: 1 }). open: how many levels are open (true: all of
  // them, up to a few thousand rows); the rest is drawn once it is opened, long lists in hundreds. copy: true adds a button.
  // .set(value), .open(levels), .value, .destroy(). Dash.json.html(value, { open, max }) is the same as HTML, at most max rows.
  const jsonPlain = (v) => (v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v && typeof v === 'object' && typeof v.toJSON === 'function' ? v.toJSON() : v);
  const jsonText = (v) => { try { return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? String(x) : jsonPlain(x)), 2) ?? String(v); } catch (e) { return String((e && e.message) || e); } };
  const jsonDraw = (root, { open = 1, chunk = 100, maxText = 2000, budget = Infinity, lazy = null } = {}) => {
    let left = budget;
    const leaf = (v) => {
      if (v === null) return '<span class="json-null">null</span>';
      if (typeof v === 'string') return `<span class="json-str">${esc(JSON.stringify(v.length > maxText ? v.slice(0, maxText) : v))}</span>${v.length > maxText ? `<span class="muted"> … ${fmt.int(v.length - maxText)} more</span>` : ''}`;
      if (typeof v === 'number' || typeof v === 'bigint') return `<span class="json-num">${esc(String(v))}${typeof v === 'bigint' ? 'n' : ''}</span>`;
      if (typeof v === 'boolean') return `<span class="json-bool">${v}</span>`;
      return `<span class="json-null">${esc(typeof v === 'function' ? 'function' : String(v))}</span>`;
    };
    const name = (k) => (k == null ? '' : `<span class="json-key">${esc(k)}</span><span class="json-at">: </span>`);
    // entries a to b of a list or an object: each one, or parts of a hundred
    const inside = (entries, depth, above, a = 0, b = entries.length) => {
      if (b - a <= chunk) return entries.slice(a, b).map(([k, v]) => draw(k, v, depth, above)).join('');
      let out = '';
      for (let i = a; i < b; i += chunk) out += part(`<span class="json-sum">${i}…${Math.min(b, i + chunk) - 1}</span>`, false, () => inside(entries, depth, above, i, Math.min(b, i + chunk)));
      return out;
    };
    const part = (head, isOpen, body) => {
      const now = isOpen && left > 0, n = now || !lazy ? null : lazy(body);
      return `<details class="json-part"${now ? ' open' : ''}${n != null ? ` data-part="${n}"` : ''}><summary>${head}</summary><div class="json-in">${n == null ? body() : ''}</div></details>`;
    };
    const draw = (k, raw, depth, above) => {
      if (left-- <= 0 && !lazy) return left === -1 ? '<div class="json-row muted">…</div>' : '';
      const v = jsonPlain(raw);
      if (!v || typeof v !== 'object') return `<div class="json-row">${name(k)}${leaf(v)}</div>`;
      if (above.includes(raw)) return `<div class="json-row">${name(k)}<span class="json-null">(itself)</span></div>`;
      if (above.length > 100) return `<div class="json-row">${name(k)}<span class="json-null">…</span></div>`;
      const list = Array.isArray(v), entries = list ? v.map((x, i) => [i, x]) : Object.entries(v), [l, r] = list ? '[]' : '{}';
      if (!entries.length) return `<div class="json-row">${name(k)}<span class="json-sum">${l}${r}</span></div>`;
      return part(`${name(k)}<span class="json-sum">${l}<span class="json-n">${list ? fmt.plural(entries.length, 'item') : fmt.plural(entries.length, 'key')}</span>${r}</span>`, open === true || depth < open, () => inside(entries, depth + 1, [...above, raw]));
    };
    return draw(null, root, 0, []);
  };
  Dash.json = (target, value, { open = 1, copy = false, label = 'Data', chunk = 100, maxText = 2000 } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashJson?.destroy();
    const control = new AbortController(), { signal } = control;
    let now = value, parts = [], levels = open;
    const draw = () => {
      parts = [];
      node.classList.add('json');
      node.setAttribute('role', 'group');
      node.setAttribute('aria-label', label);
      node.innerHTML = (copy ? '<button type="button" class="btn sm ghost json-copy" data-label="Copy">Copy</button>' : '') + jsonDraw(now, { open: levels, chunk, maxText, budget: levels === true ? 3000 : Infinity, lazy: (body) => parts.push(body) - 1 });
    };
    node.addEventListener('toggle', (e) => { // (toggle doesn't bubble)
      const d = e.target, n = d.dataset && d.dataset.part;
      if (n == null || !d.open) return;
      delete d.dataset.part;
      d.lastElementChild.innerHTML = parts[n]();
    }, { capture: true, signal });
    node.addEventListener('click', (e) => { const b = e.target.closest('.json-copy'); if (b) b.dataset.copy = jsonText(now); }, { signal }); // (the click goes on to the page, which copies it)
    const handle = {
      el: node,
      get value() { return now; },
      set(v) { now = v; draw(); },
      open(n = true) { levels = n; draw(); },
      destroy() { if (signal.aborted) return; control.abort(); node.textContent = ''; node.classList.remove('json'); node.removeAttribute('role'); node.removeAttribute('aria-label'); node.__dashJson = undefined; },
    };
    draw();
    node.__dashJson = handle;
    return handle;
  };
  Dash.json.html = (value, { open = 1, label = 'Data', max = 1000, chunk = 100, maxText = 2000 } = {}) => `<div class="json" role="group" aria-label="${esc(label)}">${jsonDraw(value, { open, chunk, maxText, budget: max })}</div>`;

  // Panes with a bar between them that can be moved: <div class="panes" data-panes="files" data-sizes="30 70">…</div> at load, or
  // Dash.panes(el, { sizes: [30, 70], min: 160, vertical, height, store, onChange }). The bar takes the arrow keys (Shift: more),
  // Home and End; a double click puts the sizes back. store (or data-panes) remembers them. On a phone they stack.
  // .sizes, .set(list), .reset(), .destroy()
  Dash.panes = (target, { sizes, min, vertical, height, store, label = 'Resize', onChange } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashPanes?.destroy();
    const control = new AbortController(), { signal } = control;
    const panes = [...node.children].filter((x) => !x.classList.contains('pane-bar'));
    if (panes.length < 2) return null;
    const up = vertical ?? 'vertical' in node.dataset, least = min ?? (Number(node.dataset.min) || (up ? 60 : 120)), keep = store ?? (node.dataset.panes || '');
    const even = (l) => { const t = l.reduce((a, b) => a + b, 0); return l.map((x) => (x / t) * 100); };
    const ok = (l) => Array.isArray(l) && l.length === panes.length && l.every((x) => Number.isFinite(x) && x > 0);
    const given = sizes || (node.dataset.sizes || '').split(/[\s,]+/).filter(Boolean).map(Number), saved = keep ? Dash.store.get(keep) : null;
    const first = even(ok(given) ? given : panes.map(() => 1));
    let now = ok(saved) ? even(saved) : first.slice();
    node.classList.add('panes');
    const wasUp = 'vertical' in node.dataset;
    node.toggleAttribute('data-vertical', up);
    if (height) node.style.setProperty('--panes-h', typeof height === 'number' ? height + 'px' : String(height));
    const bars = panes.slice(1).map((p, i) => {
      const b = document.createElement('div');
      b.className = 'pane-bar';
      b.tabIndex = 0;
      if (!panes[i].id) panes[i].id = 'dash-pane-' + ++ids;
      for (const [k, v] of Object.entries({ role: 'separator', 'aria-orientation': up ? 'horizontal' : 'vertical', 'aria-label': label, 'aria-controls': panes[i].id, 'aria-valuemin': '0', 'aria-valuemax': '100' })) b.setAttribute(k, v);
      p.before(b);
      return b;
    });
    const room = () => Math.max(1, panes.reduce((n, p) => n + p.getBoundingClientRect()[up ? 'height' : 'width'], 0));
    const rtl = () => (!up && getComputedStyle(node).direction === 'rtl' ? -1 : 1);
    const draw = () => {
      panes.forEach((p, i) => p.style.setProperty('--pane', now[i].toFixed(4)));
      bars.forEach((b, i) => b.setAttribute('aria-valuenow', String(Math.round(now.slice(0, i + 1).reduce((x, y) => x + y, 0)))));
    };
    const done = () => { if (keep) Dash.store.set(keep, now.map((x) => +x.toFixed(2))); if (onChange) onChange(handle.sizes); };
    const shift = (i, by, from = now) => { // the bar after pane i, by so many percent of the room; a pane that is under the least already only grows
      const floor = (least / room()) * 100, pair = from[i] + from[i + 1], low = Math.min(floor, pair / 2), a = clamp(from[i] + by, Math.min(low, from[i]), pair - Math.min(low, from[i + 1]));
      const moved = Math.abs(a - now[i]) > 0.01;
      now = now.slice();
      now[i] = a;
      now[i + 1] = pair - a;
      draw();
      return moved;
    };
    bars.forEach((b, i) => {
      b.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        e.preventDefault();
        b.focus({ preventScroll: true });
        try { b.setPointerCapture(e.pointerId); } catch { /* a press a page made */ }
        const x0 = up ? e.clientY : e.clientX, from = now.slice(), all = room(), way = rtl(), drag = new AbortController();
        let moved = false;
        node.classList.add('sizing');
        const stop = () => { drag.abort(); node.classList.remove('sizing'); if (moved) done(); };
        b.addEventListener('pointermove', (m) => { if (shift(i, ((((up ? m.clientY : m.clientX) - x0) * way) / all) * 100, from)) moved = true; }, { signal: drag.signal });
        for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, stop, { signal: drag.signal });
        signal.addEventListener('abort', () => { drag.abort(); node.classList.remove('sizing'); }, { once: true });
      }, { signal });
      b.addEventListener('dblclick', () => handle.reset(), { signal });
      b.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const n = (e.shiftKey ? 10 : 2) * rtl();
        const by = { [up ? 'ArrowUp' : 'ArrowLeft']: -n, [up ? 'ArrowDown' : 'ArrowRight']: n, Home: -100, End: 100 }[e.key];
        if (!by) return;
        e.preventDefault();
        if (shift(i, by)) done();
      }, { signal });
    });
    const handle = {
      el: node,
      get sizes() { return now.map((x) => +x.toFixed(2)); },
      set(l) { if (ok(l)) { now = even(l); draw(); done(); } },
      reset() { handle.set(first); },
      destroy() {
        if (signal.aborted) return;
        control.abort();
        for (const b of bars) b.remove();
        for (const p of panes) p.style.removeProperty('--pane');
        node.toggleAttribute('data-vertical', wasUp);
        node.__dashPanes = undefined;
      },
    };
    draw();
    node.__dashPanes = handle;
    return handle;
  };

  // How much, in a grid: Dash.heatmap({ rows: ['Mon', …], cols: ['00', …], values: [[3, 8, …], …], label: 'Requests' }) is a table with a shade
  // per cell, darker for more (one hue: tone), and a legend. The largest value is the darkest (or max), min the palest; null is a
  // gap. format writes a value; show: true puts it in the cell; every: 3 names every third column. Pointing at a cell says all of it.
  const shadeOf = (v, lo, hi) => (v == null || !Number.isFinite(Number(v)) ? '' : Number(v) <= lo ? 0 : clamp(Math.ceil(((Number(v) - lo) / (hi - lo || 1)) * 5), 1, 5));
  const heatLegend = (lo, hi, format) => `<div class="heat-legend"><span>${esc(format(lo))}</span>${[0, 1, 2, 3, 4, 5].map((l) => `<i data-l="${l}"></i>`).join('')}<span>${esc(format(hi))}</span></div>`;
  Dash.heatmap = ({ rows = [], cols = [], values = [], label = 'Values', tone, min = 0, max, format = (v) => fmt.compact(v), show = false, legend = true, every = 1, gap = 'no data' } = {}) => {
    const all = values.flat().filter((v) => v != null && Number.isFinite(Number(v))).map(Number), lo = Number(min), hi = Math.max(max ?? (all.length ? Math.max(...all) : lo + 1), lo);
    const cell = (r, c, v) => {
      const l = shadeOf(v, lo, hi), say = l === '' ? gap : format(v);
      return `<td data-l="${l}" data-tooltip="${esc(`${r}, ${c}: ${say}`)}">${show && l !== '' ? esc(say) : `<span class="sr-only">${esc(say)}</span>`}</td>`;
    };
    return `<div class="heat${show ? ' shown' : ''}${toneClass(tone)}"><div class="heat-scroll" tabindex="0" role="group" aria-label="${esc(label)}"><table class="heatmap"><caption class="sr-only">${esc(label)}</caption>`
      + `<thead><tr><td></td>${cols.map((c, i) => `<th scope="col">${i % every ? `<span class="sr-only">${esc(c)}</span>` : `<span>${esc(c)}</span>`}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map((r, y) => `<tr><th scope="row">${esc(r)}</th>${cols.map((c, x) => cell(r, c, values[y]?.[x])).join('')}</tr>`).join('')}</tbody></table></div>`
      + `${legend ? heatLegend(lo, hi, format) : ''}</div>`;
  };
  // Days as squares, a column per week: Dash.days([{ date: '2026-11-25', value: 7 }, …], { weeks: 26, label: 'Deploys', noun: 'deploy' }).
  // Days that aren't given are 0; several of one day add up; to: the last day (today). first: the day weeks start on (1: Monday).
  Dash.days = (points, { weeks = 26, to, label = 'Days', tone, max, format = (v) => fmt.num(v, Number.isInteger(v) ? 0 : 1), noun = '', first = 1, legend = true } = {}) => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayOf = (x) => { const m = typeof x === 'string' && x.match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? new Date(+m[1], m[2] - 1, +m[3], 12) : dateOf(x); };
    const by = new Map(), last = dayOf(to ?? Date.now()), days = [];
    for (const p of points || []) { const d = dayOf(p.date ?? p.t); if (valid(d)) by.set(iso(d), (by.get(iso(d)) ?? 0) + (Number(p.value) || 0)); }
    const d0 = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 12);
    for (let i = (weeks - 1) * 7 + ((d0.getDay() - first + 7) % 7); i >= 0; i--) days.push(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - i, 12));
    const vals = days.map((d) => by.get(iso(d)) ?? 0), top = Math.max(...vals), hi = Math.max(max ?? top, 1), total = vals.reduce((a, b) => a + b, 0);
    const word = (v) => `${format(v)}${noun ? ` ${v === 1 ? noun : noun + 's'}` : ''}`, full = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const month = (w) => days[w * 7].toLocaleDateString('en-GB', { month: 'short' }), starts = [];
    for (let w = 0; w * 7 < days.length; w++) if (!w || month(w) !== month(w - 1)) starts.push(w);
    // a month's name above the first week that starts in it, unless the next name would run into it
    const heads = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => { const i = starts.indexOf(w); return `<span>${i >= 0 && (i === starts.length - 1 || starts[i + 1] - w > 2) ? esc(month(w)) : ''}</span>`; }).join('');
    const side = Array.from({ length: 7 }, (_, i) => `<span>${i % 2 ? '' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(first + i) % 7]}</span>`).join('');
    const say = `${label}: ${word(total)} in ${fmt.plural(days.length, 'day')}${total ? `, the most on ${full(days[vals.indexOf(top)])} (${word(top)})` : ''}`;
    return `<div class="heat${toneClass(tone)}"><div class="heat-scroll" tabindex="0" role="group" aria-label="${esc(label)}"><div class="days" role="img" aria-label="${esc(say)}"><div class="days-side">${side}</div><div class="days-months">${heads}</div>`
      + `<div class="days-grid">${days.map((d, i) => `<i data-l="${shadeOf(vals[i], 0, hi)}" data-tooltip="${esc(`${full(d)}: ${word(vals[i])}`)}"></i>`).join('')}</div></div></div>${legend ? heatLegend(0, hi, format) : ''}</div>`;
  };

  // ---- boards (1.17)

  // Cards in columns: Dash.board('tasks', { columns: [{ id: 'todo', title: 'To do' }, { id: 'doing', title: 'Doing', limit: 3 }], cards,
  // column: 'status' }). column is the field of a card that says which column it is in. title and sub are fields or functions,
  // lead(card) (above the title) and end(card) (below) HTML, href a link, tone a card's colour.
  // A card is moved by mouse (anywhere on it) or finger (its grip), with the arrow keys on its grip, or from the grip's menu.
  // onMove(cards, { card, from, to, index }) has them in the new order; false or an error puts it back. move: false (or a
  // function) is a board, or a card, that stays; can(card, column) says which columns a card may go to.
  // A column: { id, title, tone, limit (more than that many is marked), empty, add: false }. onAdd(column): a + in each head.
  // onPick(card, event), menu(card) and onMenu(value, card), filter, height: as in Dash.list.
  // .update(cards) .cards .columns(list) .filter(text or test) .count .move(key, column, index) .redraw() .destroy()
  Dash.board = (target, { columns = [], cards = [], key = 'id', column = 'column', title = 'title', sub = 'sub', lead, end, href, tone = 'tone', move = true, can = () => true, onMove, onPick,
    menu, onMenu, onAdd, filter, height, noun = 'card', label = 'Board', empty = 'Nothing here' } = {}) => {
    const node = el(target);
    if (!node || !hasDom) return null;
    node.__dashBoard?.destroy();
    const control = new AbortController(), { signal } = control;
    const uid = 'dash-board-' + ++ids;
    const get = (f, c) => (typeof f === 'function' ? f(c) : f != null && c ? c[f] : null);
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    const idOf = (c) => String(get(key, c)), titleOf = (c) => String(get(title, c) ?? ''), nameOf = (k) => String(k.title ?? k.id);
    let data = cards || [], cols = columns || [];
    let test = null, words = '';
    let dragging = false, late = false; // from the press on a card until it is let go nothing is drawn
    let held = null; // an update that came meanwhile, or while a move is being saved
    let queue = [], saved = []; // moves that are shown but not saved yet, and those saved since the first of them
    const setTest = (q) => {
      test = typeof q === 'function' ? q : String(q ?? '').trim() ? (c) => Dash.match({ t: get(title, c), s: get(sub, c) }, q, ['t', 's']) : null;
      words = test && typeof q === 'string' ? q.trim() : '';
    };
    if (filter != null) setTest(filter);
    const colOf = (c) => cols.find((k) => same(k.id, c[column]));
    const inCol = (id, list = data) => list.filter((c) => same(c[column], id));
    const seenIn = (id) => (test ? inCol(id).filter(test) : inCol(id));
    const cardOf = (id, list = data) => list.find((c) => idOf(c) === id) || null;
    const movable = (c) => (typeof move === 'function' ? move(c) : move) !== false;
    const say = (text) => { voiceOf(node).textContent = text; };

    const cardHtml = (c) => {
      const id = esc(idOf(c)), name = esc(titleOf(c)), h = href ? get(href, c) : null, s = get(sub, c), l = lead ? lead(c) : '', e = end ? end(c) : '', t = get(tone, c);
      const text = markWords(titleOf(c), words);
      const open = h != null ? `<a class="board-open" href="${esc(safeHref(h))}" draggable="false" data-key="dash-open ${id}">${text}</a>`
        : onPick ? `<button type="button" class="board-open" data-key="dash-open ${id}">${text}</button>` : `<span class="board-open">${text}</span>`;
      const grip = movable(c) ? `<button type="button" class="icon-btn entry-grip" data-grip data-key="dash-grip ${id}" aria-haspopup="menu" aria-label="Move ${name}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight">${GRIP}</button>` : '';
      const dots = menu ? `<button type="button" class="icon-btn row-dots" data-dots data-key="dash-dots ${id}" aria-haspopup="menu" aria-label="More for ${name}">⋯</button>` : '';
      return `<li class="board-card${grip ? ' movable' : ''}${t ? ' toned' + toneClass(t) : ''}" data-key="${id}">${l ? `<div class="board-lead">${l}</div>` : ''}${open}`
        + `${s != null && s !== '' ? `<div class="board-sub">${markWords(String(s), words)}</div>` : ''}${e ? `<div class="board-end">${e}</div>` : ''}${grip || dots ? `<div class="board-tools">${grip}${dots}</div>` : ''}</li>`;
    };
    const colHtml = (k, n) => {
      const all = inCol(k.id), list = test ? all.filter(test) : all, some = list.length !== all.length, over = k.limit != null && all.length > k.limit, id = esc(k.id);
      const count = some ? `${fmt.int(list.length)} of ${fmt.int(all.length)}` : k.limit != null ? `${fmt.int(all.length)} / ${fmt.int(k.limit)}` : fmt.int(all.length);
      const read = (some ? `${fmt.int(list.length)} of ` : '') + fmt.plural(all.length, noun) + (k.limit == null ? '' : `, ${over ? 'more than' : 'at most'} ${fmt.int(k.limit)}`);
      return `<div class="board-col" role="group" aria-labelledby="${uid}-${n}"><div class="board-head${toneClass(k.tone)}">${k.tone ? '<span class="dot"></span>' : ''}<h3 class="board-name" id="${uid}-${n}">${esc(nameOf(k))}</h3>`
        + `<span class="count-badge${over ? ' bad' : ''}"><span aria-hidden="true">${count}</span><span class="sr-only">${esc(read)}</span></span>`
        + `${onAdd && k.add !== false ? `<button type="button" class="icon-btn board-add" data-add="${id}" data-key="dash-add ${id}" aria-label="Add to ${esc(nameOf(k))}"><span aria-hidden="true">+</span></button>` : ''}</div>`
        + `<div class="board-zone" data-zone="${id}" data-key="dash-zone ${id}">${list.length ? `<ul class="board-cards" aria-labelledby="${uid}-${n}">${list.map(cardHtml).join('')}</ul>` : `<p class="board-none">${esc(!some ? k.empty ?? empty : words ? 'None by that name' : 'None to show')}</p>`}</div></div>`;
    };
    const liOf = (id) => node.querySelector(`li[data-key="${CSS.escape(id)}"]`);
    const draw = (force = false) => {
      if (signal.aborted) return;
      if (dragging) { late = true; return; }
      const had = document.activeElement, inside = had && had !== node && node.contains(had), li = inside ? had.closest('.board-card') : null;
      const peers = li ? [...li.parentElement.children].map((x) => x.dataset.key) : [], i = li ? peers.indexOf(li.dataset.key) : -1;
      const markup = `<div class="board" role="group" aria-label="${esc(label)}" data-key="dash-board">${cols.map(colHtml).join('')}</div>`;
      Dash.render(node, markup, { force: force && node.__dashHtml !== markup });
      if (inside && !node.contains(document.activeElement)) { // the card with the focus is gone: the next one
        const next = liOf([...peers.slice(i + 1), ...peers.slice(0, Math.max(i, 0)).reverse()].find((k) => liOf(k)) ?? '');
        ((next && (next.querySelector('[data-grip]') || next.querySelector('button, a'))) || node.querySelector('button, a'))?.focus({ preventScroll: true });
      }
    };

    // a list of the cards with one of them in a column, before another (null: the column's last); cards of other columns stay
    const put = (list, id, to, before) => {
      const c = cardOf(id, list), rest = list.filter((x) => x !== c);
      let j = before == null ? -1 : rest.findIndex((x) => idOf(x) === before && same(x[column], to));
      if (j < 0) { j = rest.length; while (j && !same(rest[j - 1][column], to)) j--; if (!j) j = rest.length; }
      const there = same(c[column], to) ? c : { ...c, [column]: to };
      return [...rest.slice(0, j), there, ...rest.slice(j)];
    };
    const orderIn = (id, list) => inCol(id, list).map(idOf).join('\n');
    const afterOf = (c, list) => { const all = inCol(c[column], list), next = all[all.indexOf(c) + 1]; return next ? idOf(next) : null; };
    // place i among the cards that show in a column, as the key of the card it is before
    const beforeAt = (c, to, i) => {
      const all = inCol(to).filter((x) => x !== c), list = test ? all.filter(test) : all;
      if (i < list.length) return idOf(list[Math.max(i, 0)]);
      const next = list.length ? all[all.indexOf(list[list.length - 1]) + 1] : null; // (after the last that shows, before hidden ones)
      return next ? idOf(next) : null;
    };
    // an update that waited: a card that it still has where a move took it from is from before that move
    const settle = (moves) => {
      let list = held;
      held = null;
      for (const m of moves) {
        const c = cardOf(m.id, list);
        if (c && same(c[column], m.from) && (!same(m.from, m.to) || afterOf(c, list) === m.after)) list = put(list, m.id, m.to, m.before);
      }
      data = list;
    };
    const save = async () => {
      while (queue.length) {
        const m = queue[0];
        let no = false, why = null;
        try { no = (await onMove(m.next.slice(), { card: m.card, from: m.from, to: m.to, index: m.index })) === false; } catch (e) { no = true; why = e; }
        if (signal.aborted) { for (const x of queue.splice(0)) x.resolve(false); return; }
        if (!no) { saved.push(queue.shift()); m.resolve(true); continue; }
        const lost = queue.splice(0); // it goes back, and what was moved after it
        data = m.was; // (an update that waits comes below)
        draw(true);
        say(lost.length > 1 ? `${fmt.plural(lost.length, 'move')} undone` : `${m.title} was put back`);
        if (why) Dash.toast((why && why.message) || String(why), { tone: 'bad' });
        for (const x of lost) x.resolve(false);
      }
      if (held) { settle(saved); draw(); }
      saved = [];
    };
    // a card into a column, before another → a promise of whether it stays there
    const place = (c, k, before) => {
      const id = idOf(c), from = c[column], here = same(from, k.id);
      if (!here && can(c, k.id) === false) { say(`${titleOf(c)} can’t go to ${nameOf(k)}`); return Promise.resolve(false); }
      const was = data, next = put(was, id, k.id, before);
      if (here && orderIn(k.id, was) === orderIn(k.id, next)) return Promise.resolve(true);
      const after = afterOf(c, was), card = cardOf(id, next);
      data = next;
      draw(true);
      const li = liOf(id), list = seenIn(k.id), at = list.indexOf(card);
      if (li) li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      say(`${titleOf(c)}: ${nameOf(k)}${at < 0 ? '' : `, ${at + 1} of ${list.length}`}`);
      if (!onMove) return Promise.resolve(true);
      return new Promise((resolve) => {
        queue.push({ id, card, title: titleOf(c), from, to: k.id, before, after, was, next, index: inCol(k.id).indexOf(card), resolve });
        if (queue.length === 1) save();
      });
    };
    const step = (c, i) => place(c, colOf(c), beforeAt(c, c[column], i));
    const backTo = (id, part) => { if (document.activeElement === document.body || !document.activeElement) liOf(id)?.querySelector(part)?.focus({ preventScroll: true }); };
    const moveMenu = async (c, at) => {
      const id = idOf(c), k = colOf(c), list = seenIn(k.id), i = list.indexOf(c), n = list.length - 1;
      const v = await Dash.menu(at, [...cols.filter((x) => x !== k).map((x) => ({ label: `Move to ${nameOf(x)}`, value: { to: x.id }, disabled: can(c, x.id) === false })), ...(cols.length > 1 ? ['-'] : []),
        { label: 'Move to the top', value: { at: 0 }, disabled: i <= 0 }, { label: 'Move up', value: { at: i - 1 }, disabled: i <= 0 },
        { label: 'Move down', value: { at: i + 1 }, disabled: i >= n }, { label: 'Move to the end', value: { at: n }, disabled: i >= n }], { label: `Move ${titleOf(c)}` });
      const now = cardOf(id), to = v && v.to !== undefined ? cols.find((x) => same(x.id, v.to)) : null;
      backTo(id, '[data-grip]');
      if (!now || !v) return;
      if (to) place(now, to, beforeAt(now, to.id, 0)); else if (v.at != null && colOf(now)) step(now, v.at);
    };
    const openMenu = async (c, at) => {
      const list = menu(c), id = idOf(c);
      if (!list || !list.length) return;
      const v = await Dash.menu(at, list);
      backTo(id, '[data-dots]');
      if (v != null && onMenu) onMenu(v, cardOf(id) || c);
    };
    // something of the page's own in a card (a link, a button, a box): a press there is not the card's
    const own = (t, li) => { const x = t.closest('a, button, input, select, textarea, label, summary'); return Boolean(x) && li.contains(x) && !x.matches('.board-open'); };
    const hit = (e) => { const li = e.target.closest && e.target.closest('.board-card'), c = li && node.contains(li) ? cardOf(li.dataset.key) : null; return c ? { li, c } : {}; };
    const on = (type, fn) => node.addEventListener(type, fn, { signal });
    on('pointerdown', (e) => {
      const { li, c } = hit(e);
      if (!c || e.button || dragging || !movable(c)) return;
      if (!e.target.closest('[data-grip]') && (e.pointerType !== 'mouse' || e.ctrlKey || own(e.target, li))) return;
      const id = idOf(c), may = new Map();
      const over = () => {
        dragging = false;
        if (held && !queue.length) { settle(saved); saved = []; late = true; }
        if (late) { late = false; draw(true); }
      };
      dragging = true;
      dragRow(e, li, {
        zones: () => [...node.querySelectorAll('.board-zone')],
        rowsIn: (z) => [...z.querySelectorAll('.board-card')],
        can: (z) => may.get(z) !== false,
        sideways: true,
        onStart() {
          for (const z of node.querySelectorAll('.board-zone')) {
            const k = cols.find((x) => same(x.id, z.dataset.zone));
            may.set(z, Boolean(k) && (same(k.id, c[column]) || can(c, k.id) !== false));
            z.parentElement.classList.toggle('no-drop', !may.get(z));
          }
        },
        onDrop(z, i) {
          dragging = false;
          if (held && !queue.length) { settle(saved); saved = []; late = true; }
          const now = cardOf(id), k = cols.find((x) => same(x.id, z.dataset.zone)), row = [...z.querySelectorAll('.board-card')].filter((x) => x !== li)[i];
          if (!now || !k) return;
          const there = row && cardOf(row.dataset.key);
          place(now, k, there ? idOf(there) : beforeAt(now, k.id, Infinity));
        },
        onEnd() {
          for (const x of node.querySelectorAll('.no-drop')) x.classList.remove('no-drop');
          over();
        },
      }).then((was) => { if (!was) setTimeout(over); }); // (a click: after it)
    });
    on('dragstart', (e) => { const { c } = hit(e); if (c && movable(c)) e.preventDefault(); }); // (a picture or a link in a card: the card is dragged)
    on('click', (e) => {
      if (dragging && !held && !late) dragging = false; // (a press that was a click: what comes of it shows at once)
      const add = e.target.closest('[data-add]');
      if (add) { const k = cols.find((x) => same(x.id, add.dataset.add)); if (k && onAdd) onAdd(k); return; }
      const { li, c } = hit(e);
      if (!c) return;
      const b = e.target.closest('[data-grip], [data-dots]');
      if (b) { if (b.hasAttribute('data-grip')) moveMenu(c, b); else openMenu(c, b); return; }
      if (!onPick || own(e.target, li)) return;
      if (!li.contains(document.activeElement)) li.querySelector('.board-open').focus({ preventScroll: true }); // (what it opens gives the focus back there)
      onPick(c, e);
    });
    if (menu) on('contextmenu', (e) => {
      const { li, c } = hit(e);
      if (!c || e.target.closest('input, textarea')) return;
      e.preventDefault();
      openMenu(c, e.clientX || e.clientY ? e : li.querySelector('[data-dots]'));
    });
    on('keydown', (e) => {
      const { li, c } = hit(e);
      if (!c || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select')) return;
      if (menu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) { e.preventDefault(); openMenu(c, li.querySelector('[data-dots]')); return; }
      if (e.shiftKey || !e.target.closest('[data-grip]') || !/^Arrow/.test(e.key)) return;
      e.preventDefault();
      const i = seenIn(c[column]).indexOf(c);
      if (e.key === 'ArrowUp') { if (i > 0) step(c, i - 1); return; }
      if (e.key === 'ArrowDown') { step(c, i + 1); return; }
      const by = (e.key === 'ArrowRight') === (getComputedStyle(node).direction !== 'rtl') ? 1 : -1;
      for (let n = cols.indexOf(colOf(c)) + by; n >= 0 && n < cols.length; n += by) if (can(c, cols[n].id) !== false) { place(c, cols[n], beforeAt(c, cols[n].id, i)); return; }
    });
    const handle = {
      el: node,
      get cards() { return data.slice(); },
      get count() { const all = cols.flatMap((k) => inCol(k.id)); return { shown: test ? all.filter(test).length : all.length, total: all.length }; },
      update(next) { if (dragging || queue.length) { held = next || []; return; } data = next || []; draw(); },
      columns(next) { cols = next || []; draw(true); },
      filter(q) { setTest(q); draw(true); return handle.count.shown; },
      move(k, to, i = 0) { const c = cardOf(String(k)), there = cols.find((x) => same(x.id, to)); return c && there ? place(c, there, beforeAt(c, there.id, i)) : Promise.resolve(false); },
      redraw() { draw(true); },
      destroy() {
        if (signal.aborted) return;
        control.abort();
        node.textContent = '';
        node.classList.remove('board-tall');
        node.style.removeProperty('--board-h');
        node.__dashHtml = undefined;
        node.__dashBoard = undefined;
      },
    };
    node.__dashBoard = handle;
    if (height) { node.classList.add('board-tall'); node.style.setProperty('--board-h', Number(height) + 'px'); }
    voiceOf(node);
    draw();
    return handle;
  };

  // ---- forms that say what is wrong (1.13)
  // Dash.form(form, { rules, onSubmit }): checks a form's fields and puts what is wrong under each, instead of the
  // browser's bubbles. The fields' own checks count (required, type="email", minlength, pattern, min, max, step), and
  // rules adds the page's: a function per name that returns the problem as text, or anything else when it is fine.
  //   const f = Dash.form('account', {
  //     rules: {
  //       name: (v) => /\s/.test(v) && 'Leave out the spaces.',
  //       again: (v, all) => v !== all.password && 'The passwords differ.',     // all: the other fields' values
  //       handle: async (v) => (await taken(v)) && 'That name is taken.',       // asked once the reader leaves the field
  //       '': (all) => all.from > all.to && 'The start is after the end.',      // about the form as a whole
  //     },
  //     onSubmit: async (values) => { await Dash.api('/api/accounts', { method: 'POST', json: values }); },
  //   });
  // A field is checked once the reader leaves it changed; a problem that shows goes as soon as it is put right. Submitting
  // checks all of them (a rule also runs on an empty field; several: a list) and goes to the first problem. onSubmit(values,
  // f, button) runs once all is fine, with the button busy; without it the form goes on as it would. An error it throws shows
  // above the buttons, or on the fields when it has errors: { name: 'text' } (or its body has, as Dash.api's errors do).
  // Values: text as typed; a number box a number (null when empty); one checkbox true or false, several of a name (or a
  // name ending in []) a list; files a File or a list. Disabled fields are left out, and not checked.
  // The message goes into the field's .err (made when there is none), or into an element with data-error-for="name".
  // data-problem="Text" on a field: its own words for the browser's checks; Dash.form.text has the kit's, to translate.
  // A button with formnovalidate skips the checks. No code: <form data-validate>. Fields that are drawn again keep their
  // marks; a form that is drawn again as a whole is followed by its id.
  // Returns { el, values(), errors, check(which), error(name, text), fail(err), clear(), destroy() }: check() of all, of
  // a name, a list of names, or the fields in an element, resolves true or false and goes to the first problem; error()
  // puts a text on a field ('' for the form) until it is changed; fail() shows a thrown error as onSubmit's are.
  const describe = (e, id, on) => { // an id in or out of an element's aria-describedby; the others stay
    const list = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id);
    if (on) list.push(id);
    if (list.length) e.setAttribute('aria-describedby', list.join(' ')); else e.removeAttribute('aria-describedby');
  };
  const thenable = (x) => Boolean(x && typeof x.then === 'function');
  const texty = (e) => e.tagName === 'TEXTAREA' || /^(text|search|url|tel|email|password)$/.test(e.type);
  const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
  // what the browser's checks say about one control (and the kit's own widgets: __dashCheck), as text
  const problemOf = (e) => {
    if (!e.willValidate) return '';
    const v = e.validity, t = texty(e), n = e.value.length;
    const key = v.badInput ? 'badInput'
      : v.valueMissing || (e.required && t && e.type !== 'password' && !e.value.trim()) ? 'valueMissing'
      : v.typeMismatch ? 'typeMismatch'
      : t && n && e.minLength > n ? 'tooShort' // (the browser's own looks only at what was typed, not at what a page put in)
      : t && e.maxLength >= 0 && n > e.maxLength ? 'tooLong'
      : ['patternMismatch', 'rangeUnderflow', 'rangeOverflow', 'stepMismatch'].find((k) => v[k]);
    if (key) { const words = e.dataset.problem || Dash.form.text[key]; return String(typeof words === 'function' ? words(e) : words); }
    return v.customError ? e.validationMessage : e.__dashCheck ? e.__dashCheck() : '';
  };
  const FORM_WRAPS = '.input-group, .date-field, .select, .search, .dropzone, .slider, .num-row, .num-field, .tag-box, .code-field, .range-field, .multi, .checkline, .switch, .choice, label';
  // forms with an id that were drawn again as a whole: what was made for the old one moves to the new one
  const followed = new Set();
  let follower = null;
  const followForms = () => {
    for (const f of followed) {
      const now = f.form.isConnected ? null : document.getElementById(f.form.id);
      if (now && now.tagName === 'FORM') { if (now.__dashForm) followed.delete(f); else f.move(now); }
    }
  };
  Dash.form = (target, { rules = {}, onSubmit, unsaved = false } = {}) => {
    let form = el(target);
    if (!form || form.tagName !== 'FORM') return null;
    if (form.__dashForm) form.__dashForm.destroy(); // made again: the new rules
    const keep = unsaved && hasDom && !form.__dashUnsaved ? Dash.unsaved(form) : null; // (1.18)
    let bubbles = true;
    const state = new Map(); // by field: { touched, text, wait, run, value, page, asked }. By name, so a redraw keeps it
    const marks = new WeakMap(); // control: what we put on it
    const ours = new WeakSet(); // messages and .field boxes we wrote to
    const made = new Map(), added = new Set(); // messages we added: by key where there is no .field; all of them
    const line = { page: '', rule: '', lost: '' }, warned = new Set();
    let lineShown = false, busy = false, pass = false;
    const words = (x) => (typeof x === 'string' ? x : '');
    const told = (x) => (x && x.message ? x.message : String(x));
    const at = (u) => { if (!state.has(u.key)) state.set(u.key, {}); return state.get(u.key); };

    // the fields: one per control, one per group of radios or of checkboxes
    const units = () => {
      const list = [], groups = new Map(), count = new Map();
      for (const e of form.elements) {
        if (!/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || /^(submit|button|reset|image)$/.test(e.type) || e.__dashPart || e.matches(':disabled')) continue;
        const name = e.__dashName || e.name || e.id, g = name && /^(radio|checkbox)$/.test(e.type) ? e.type + ' ' + name : null;
        if (g && groups.has(g)) { groups.get(g).els.push(e); continue; }
        const n = (count.get(name) || 0) + 1;
        count.set(name, n);
        const u = { name, key: !name ? e : n > 1 ? `${name} ${n}` : name, els: [e], e };
        if (g) groups.set(g, u);
        list.push(u);
      }
      return list;
    };
    const unitOf = (e) => units().find((u) => u.els.includes(e)), unitAt = (k) => units().find((u) => u.key === k);
    const valueOf = ({ e, els, name }) => {
      if (e.__dashValue) return e.__dashValue();
      if (e.type === 'checkbox') return els.length > 1 || name.endsWith('[]') ? els.filter((x) => x.checked).map((x) => x.value) : e.checked;
      if (e.type === 'radio') return (els.find((x) => x.checked) || { value: '' }).value;
      if (e.type === 'file') return e.multiple ? [...e.files] : e.files[0] || null;
      if (e.tagName === 'SELECT' && e.multiple) return [...e.selectedOptions].map((o) => o.value);
      if (/^(number|range)$/.test(e.type)) return e.value === '' ? null : Number(e.value);
      return e.value;
    };
    const values = () => {
      const out = new Map();
      for (const u of units()) {
        if (!u.e.name && !u.e.__dashName) continue;
        const v = valueOf(u), more = out.has(u.name);
        if (more || (u.name.endsWith('[]') && !Array.isArray(v))) out.set(u.name, more ? [].concat(out.get(u.name), v) : [v]);
        else out.set(u.name, v);
      }
      return Object.fromEntries(out);
    };
    const nameOf = (u) => {
      const group = u.els.length > 1 && u.e.closest('fieldset, [role="radiogroup"], [role="group"]');
      const from = group ? group.querySelector(':scope > legend') : u.e.labels && u.e.labels[0];
      const copy = from && from.cloneNode(true);
      if (copy) for (const x of copy.querySelectorAll('.err, .hint, select, textarea, output, button')) x.remove();
      return ((copy && copy.textContent) || (group || u.e).getAttribute('aria-label') || u.name || '').replace(/\s+/g, ' ').trim();
    };

    // where a field's message goes
    const fieldOf = (u) => { const f = u.e.closest('.field'); return f && !f.contains(form) && u.els.every((x) => f.contains(x)) ? f : null; };
    const wrapOf = (e) => { let out = e; for (let n = e.parentElement; n && n !== form; n = n.parentElement) if (n.matches(FORM_WRAPS)) out = n; return out; };
    const slotOf = (u, make) => {
      const own = u.name && [...form.querySelectorAll('[data-error-for]')].find((x) => x.dataset.errorFor === u.name);
      if (own) return own;
      const field = fieldOf(u);
      const there = field ? [...field.querySelectorAll('.err')].find((x) => x.closest('.field') === field) : made.get(u.key);
      if (there && there.getRootNode() === u.e.getRootNode()) return there; // (also in a form that is out of the page)
      if (!make) return null;
      const err = document.createElement('div');
      err.className = field ? 'err' : 'field-err';
      err.hidden = true;
      if (field) field.append(err);
      else {
        made.set(u.key, err);
        let box = u.e.parentElement; // a group's message goes after the box that holds just that group
        while (box && box !== form && !u.els.every((x) => box.contains(x))) box = box.parentElement;
        const alone = u.els.length > 1 && box && box !== form && units().every((x) => x.key === u.key || !box.contains(x.e));
        if (!alone) wrapOf(u.els[u.els.length - 1]).after(err);
        else if (box.tagName === 'FIELDSET') box.append(err);
        else box.after(err);
      }
      added.add(err);
      return err;
    };
    const mark = (e, bad, slot) => {
      const was = marks.get(e) || { bad: false, id: '' };
      if (!bad) { if (was.bad) e.removeAttribute('aria-invalid'); } else if (e.getAttribute('aria-invalid') !== 'true') e.setAttribute('aria-invalid', 'true');
      if (!form.contains(e)) e.toggleAttribute('data-dash-form', bad); // (a control with form="…": dash.css looks for this)
      let id = '';
      if (slot) {
        if (!slot.id) slot.id = 'dash-err-' + ++ids;
        if (was.id === slot.id || !(e.getAttribute('aria-describedby') || '').split(/\s+/).includes(slot.id)) id = slot.id; // (a page's own stays its own)
      }
      if (was.id && was.id !== id) describe(e, was.id, false);
      if (id && was.id !== id) describe(e, id, true);
      if (bad || id || marks.has(e)) marks.set(e, { bad, id });
    };
    const lineEl = (make) => {
      const there = form.querySelector('.form-error, .modal-error');
      if (there || !make) return there;
      const p = document.createElement('p');
      p.className = 'form-error';
      p.setAttribute('role', 'alert');
      const b = [...form.elements].find((x) => x.type === 'submit' && form.contains(x)), box = b && b.closest('.dialog-actions, .row, .input-group, .field, form');
      if (b) (box === form ? b : box).before(p); else form.append(p);
      added.add(p);
      return p;
    };
    // put what is known on the page; nothing is written that is there already, so it can run as often as it likes
    const paint = () => {
      if (form.__dashForm !== me) return; // made again
      const slots = new Map(), boxes = new Map();
      for (const u of units()) {
        const s = state.get(u.key) || {}, text = s.text || '', wait = !text && Boolean(s.wait);
        const slot = slotOf(u, Boolean(text || wait)), field = fieldOf(u);
        if (slot) { const x = slots.get(slot) || { text: '', wait: false }; slots.set(slot, { text: x.text || text, wait: x.wait || wait }); }
        if (field) boxes.set(field, boxes.get(field) || Boolean(text));
        for (const e of u.els) mark(e, Boolean(text), text || wait ? slot : null);
      }
      for (const [slot, x] of slots) {
        const say = x.text || (x.wait ? Dash.form.text.checking : '');
        if (!say && !ours.has(slot)) continue; // (a page's own words, until there is something to say)
        ours.add(slot);
        if (slot.textContent !== say) slot.textContent = say;
        slot.toggleAttribute('data-checking', !x.text && x.wait);
        if (!say && 'dashHide' in slot.dataset) slot.hidden = true; else if (say && slot.hidden) { slot.hidden = false; slot.dataset.dashHide = ''; }
        if (slot.closest('label')) slot.setAttribute('aria-hidden', 'true'); // not part of the control's name; it still describes it
      }
      for (const [field, bad] of boxes) if (bad || ours.has(field)) { ours.add(field); field.classList.toggle('invalid', bad); }
      const say = [line.page, line.rule, line.lost].filter(Boolean).join(' ');
      if (say || lineShown) {
        const p = lineEl(Boolean(say));
        if (p && p.textContent !== say) p.textContent = say;
        if (p && p.matches('.form-error')) p.hidden = !say;
        lineShown = Boolean(say);
      }
    };
    // for a screen reader whose reader has already moved on: a line that is there before it speaks, outside the form (which
    // may be drawn again), in its dialog if it is in one (from outside a modal one nothing is heard)
    const voice = () => voiceOf(form);
    const announce = (text) => { voice().textContent = text; };

    // what is wrong with a field: text, or a promise of it when a rule has to ask. mayAsk: false uses only answers that are in.
    const problem = (u, s, v, all, mayAsk) => {
      for (const e of u.els) { const t = problemOf(e); if (t) return t; }
      const list = u.name && Object.hasOwn(rules, u.name) ? [].concat(rules[u.name]) : [];
      if (!s.asked) s.asked = [];
      const from = (i) => {
        for (; i < list.length; i++) {
          let c = s.asked[i];
          if (!c || !same(c.value, v)) {
            if (!mayAsk && (c || list[i].constructor.name === 'AsyncFunction')) continue; // a rule that asks: not on every key
            const out = list[i](v, all, u.e);
            if (!thenable(out)) { if (words(out)) return out; continue; }
            c = s.asked[i] = { value: v, out };
            const mine = c;
            c.out = out.then((x) => (mine.out = words(x)), (x) => { if (s.asked[i] === mine) s.asked[i] = { value: {} }; throw x; });
            c.out.catch(() => {}); // (looked at below, or asked again)
          }
          if (!thenable(c.out)) { if (c.out) return c.out; continue; }
          const next = i + 1;
          return c.out.then((x) => x || from(next));
        }
        return '';
      };
      return from(0);
    };
    // check a field and keep what came out; returns the text, or a promise of it when the answer has to be waited for.
    // sure: a rule that can't answer counts as a problem.
    const settle = (u, all, { mayAsk = false, sure = false, tell = false } = {}) => {
      const s = at(u), v = valueOf(u), before = s.text;
      if (s.wait && !sure && same(s.value, v)) return ''; // its answer is on the way
      const run = (s.run = (s.run || 0) + 1);
      if (s.page && !same(s.page.value, v)) s.page = null;
      s.value = v;
      const cant = (x) => (sure ? Dash.form.text.cantCheck(told(x)) : '');
      const set = (text) => {
        s.wait = false;
        s.text = text;
        if (tell && text && text !== before) announce(`${nameOf(unitAt(u.key) || u)}: ${text}`);
        return text;
      };
      let out;
      try { out = s.page ? s.page.text : problem(u, s, v, all, mayAsk); } catch (x) { setTimeout(() => { throw x; }); out = cant(x); }
      if (!thenable(out)) return set(out);
      s.wait = true;
      s.text = '';
      return out.then(words, cant).then((text) => { if (s.run === run) { set(text); paint(); } return text; });
    };
    const whole = (all) => { // the rule about the form itself
      if (!Object.hasOwn(rules, '')) return '';
      let out = '';
      try { out = rules[''](all); } catch (x) { setTimeout(() => { throw x; }); return told(x); }
      return thenable(out) ? out.then(words, told) : words(out);
    };

    const tabOf = (panel) => { // the tab that shows a panel: the nearest one of its name
      for (let n = panel.parentElement; n; n = n.parentElement) { const t = [...n.querySelectorAll('[role="tab"]')].find((b) => b.dataset.value === panel.dataset.tab); if (t) return t; }
      return null;
    };
    const reveal = (e, tabs) => {
      for (let n = e.parentElement; n; n = n.parentElement) {
        if (n.tagName === 'DETAILS') n.open = true;
        const t = tabs && n.hidden && n.dataset.tab != null && tabOf(n);
        if (t) t.click();
      }
    };
    const seen = (e) => e.getClientRects().length > 0;
    const take = (e) => { e.focus({ preventScroll: true }); return document.activeElement === e; };
    // go to the first problem; what can't be shown where it belongs goes on the form's line
    const goTo = (bad) => {
      let gone = false;
      line.lost = '';
      for (const u of bad) {
        reveal(u.e, !gone);
        const field = fieldOf(u);
        const can = [...u.els.filter((x) => x.checked), ...u.els, ...(field ? field.querySelectorAll('button, input, select, textarea, [tabindex="0"]') : [])].filter(seen);
        const to = gone ? can[0] : can.find(take);
        if (to && !gone) { gone = true; (field || wrapOf(to)).scrollIntoView({ block: 'nearest' }); }
        const away = gone && u.e.closest('[data-tab][hidden]'); // in another tab: its turn comes
        if (!to && !away) line.lost = [line.lost, `${nameOf(u)}: ${at(u).text}`].filter(Boolean).join(' ');
      }
      paint();
      if (!gone && lineShown) lineEl().scrollIntoView({ block: 'nearest' });
    };
    const which = (w) => {
      const all = units();
      if (w == null) return all;
      if (w.nodeType) return all.filter((u) => w.contains(u.e));
      const names = [].concat(w);
      return all.filter((u) => names.includes(u.name));
    };
    // check fields: true or false, or a promise of it. Asks again while the reader keeps changing them.
    const run = (w) => {
      const list = which(w), all = values(), snap = () => units().map((u) => [u.key, valueOf(u)]), was = snap();
      const out = list.map((u) => { const s = at(u); s.touched = true; s.page = null; return settle(u, all, { mayAsk: true, sure: true }); });
      const rule = w == null ? whole(all) : '';
      if (w == null) {
        line.page = '';
        for (const k of Object.keys(rules)) if (k && !warned.has(k) && !list.some((u) => u.name === k)) { warned.add(k); console.warn(`Dash.form: no field is named “${k}”`); }
      }
      const end = (texts, text) => {
        if (w == null) line.rule = text;
        const bad = list.map((u, i) => [unitAt(u.key), texts[i]]).filter(([u, say]) => { // (drawn again meanwhile, or gone)
          const s = u && at(u);
          if (s && !s.page) Object.assign(s, { text: say, wait: false, value: valueOf(u) });
          return s && s.text;
        }).map(([u]) => u);
        if (bad.length > 1) announce(Dash.form.text.count(bad.length));
        paint();
        goTo(bad);
        return !bad.length && !text;
      };
      paint();
      if (!out.some(thenable) && !thenable(rule)) return end(out, rule);
      return Promise.all([rule, ...out]).then(([text, ...texts]) => {
        if (form.__dashForm !== me || !form.isConnected) return false; // closed, or made again
        const now = snap(), moved = now.length !== was.length || now.some(([k, v], i) => k !== was[i][0] || !same(v, was[i][1]));
        return moved ? run(w) : end(texts, text);
      });
    };
    const put = (u, say) => { // the page's words on a field, until it is changed
      const s = at(u), value = valueOf(u);
      Object.assign(s, { run: (s.run || 0) + 1, wait: false, value, text: say, page: say ? { value, text: say } : null }); // (an answer still on its way is too late)
    };
    const error = (name, text = '') => {
      const say = text == null ? '' : String(text), u = name && units().find((x) => x.name === name);
      if (u) put(u, say); else if (name) return false; else line.page = say;
      paint();
      return true;
    };
    const fail = (x) => {
      if (form.__dashForm !== me) return;
      const by = [x && x.errors, x && x.body && x.body.errors].find((o) => o && typeof o === 'object' && !Array.isArray(o));
      const list = Object.entries(by || {}).map(([k, t]) => [k, words(Array.isArray(t) ? t[0] : t)]).filter(([, t]) => t);
      const rest = list.filter(([k, t]) => !k || !error(k, t)).map(([k, t]) => (k ? `${k}: ${t}` : t));
      error('', rest.length || !list.length ? rest.join(' ') || told(x) : '');
      goTo(units().filter((u) => at(u).text));
    };
    const clear = () => { state.clear(); Object.assign(line, { page: '', rule: '', lost: '' }); announce(''); paint(); };
    const handle = {
      get el() { return form; },
      get unsaved() { return form.__dashUnsaved || null; },
      values, error, fail, clear,
      get errors() {
        const out = units().map((u) => [u.name, (state.get(u.key) || {}).text]).filter(([k, t]) => k && t);
        const say = [line.page, line.rule].filter(Boolean).join(' ');
        return Object.fromEntries(say ? [...out, ['', say]] : out);
      },
      check: async (w) => run(w),
      destroy() {
        clear();
        for (const x of added) x.remove();
        watch.disconnect();
        form.noValidate = !bubbles;
        delete form.dataset.dashForm;
        delete form.__dashForm;
        followed.delete(me);
        if (keep) keep.destroy();
      },
    };
    const fresh = () => { // fields redrawn: the marks and messages go on the new ones
      const all = values();
      for (const u of units()) { const s = state.get(u.key); if (s && (s.text || s.wait) && !same(s.value, valueOf(u))) settle(u, all); }
      paint();
    };
    const watch = new MutationObserver(fresh);
    const me = { // what the page wiring calls
      get form() { return form; },
      move(f) {
        form = f;
        bubbles = !f.noValidate;
        f.noValidate = true;
        f.dataset.dashForm = '';
        f.__dashForm = me;
        watch.observe(f, { childList: true, subtree: true });
        fresh();
      },
      destroy: handle.destroy, clear, check: () => run(),
      key: (e) => { const u = unitOf(e); return u && at(u).touched ? u.key : undefined; }, // of a field that was changed
      here: (k) => { const u = unitAt(k); return Boolean(u) && u.els.includes(document.activeElement); }, // is the focus still in it (or its group)?
      many: (e) => { const u = unitOf(e); return Boolean(u) && u.els.length > 1 && e.type === 'checkbox'; },
      input(e) {
        const u = unitOf(e);
        if (!u) return;
        at(u).touched = true;
        const all = values();
        for (const x of units()) { const s = state.get(x.key); if (s && (s.text || s.wait)) settle(x, all); }
        if (line.rule) { const t = whole(all); if (!thenable(t)) line.rule = t; }
        if (line.lost) line.lost = '';
        paint();
      },
      left(k) {
        const u = unitAt(k);
        if (!u || !form.isConnected) return;
        const all = values();
        settle(u, all, { mayAsk: true, tell: true });
        for (const x of units()) if (x.key !== u.key && (state.get(x.key) || {}).touched) settle(x, all, { tell: true }); // it may be about this one
        paint();
      },
      submit(e) {
        if (pass) { pass = false; return; } // checked, and let go on
        const by = e.submitter;
        if (busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        const ok = (by && by.formNoValidate) || run();
        if (ok === true && !onSubmit) return;
        e.preventDefault();
        e.stopImmediatePropagation(); // wrong, not known yet, or onSubmit's
        if (ok === false) return;
        const btn = by || [...form.elements].find((x) => x.type === 'submit');
        const held = btn && document.activeElement === btn;
        busy = true;
        (async () => {
          let on = false;
          try {
            await Dash.busy(btn, async () => {
              if (!(await ok)) return;
              if (onSubmit) { await onSubmit(values(), handle, by); if (form.__dashUnsaved) form.__dashUnsaved.saved(); } else on = true;
            });
          } catch (x) { fail(x); } finally { busy = false; }
          if (held && (!document.activeElement || document.activeElement === document.body)) (btn.isConnected ? btn : document.getElementById(btn.id) || btn).focus({ preventScroll: true }); // (a busy button lets go of the focus)
          if (on && form.isConnected) { pass = true; form.requestSubmit(by && by.form === form ? by : null); pass = false; }
        })();
      },
    };
    me.move(form);
    voice();
    if (form.id) {
      followed.add(me);
      if (!follower) { follower = new MutationObserver(followForms); follower.observe(document.documentElement, { childList: true, subtree: true }); }
    }
    // what the server wrote into the page counts, until the reader changes the field
    const wrote = units().filter((u) => { const f = fieldOf(u); return f && f.classList.contains('invalid'); });
    for (const u of wrote) {
      const field = fieldOf(u), slot = slotOf(u), say = slot ? slot.textContent.trim() : '', marked = (x) => x.e.getAttribute('aria-invalid') === 'true';
      const mates = wrote.filter((x) => fieldOf(x) === field), one = mates.find(marked) || mates[0]; // in a field of several: the marked ones, or the first
      if (say && (u === one || marked(u))) { ours.add(slot).add(field); put(u, say); }
    }
    paint();
    return handle;
  };
  // the kit's words for the browser's checks: a text, or a function of the control
  Dash.form.text = {
    valueMissing: (e) => (e.type === 'checkbox' ? 'Tick this to go on.' : e.type === 'radio' || e.tagName === 'SELECT' ? 'Choose one.'
      : e.type === 'file' ? 'Choose a file.' : /^(date|month|week)/.test(e.type) ? 'Choose a date.' : e.type === 'time' ? 'Choose a time.' : 'Fill this in.'),
    badInput: (e) => (e.type === 'number' ? 'Enter a number.' : e.type === 'time' ? 'Enter a whole time.' : 'Enter a whole date.'),
    typeMismatch: (e) => (e.type === 'url' ? 'Enter a whole address, like https://example.com.' : 'Enter an email address, like name@example.com.'),
    tooShort: (e) => `Use at least ${fmt.plural(e.minLength, 'character')}.`,
    tooLong: (e) => `Use at most ${fmt.plural(e.maxLength, 'character')}.`,
    patternMismatch: (e) => e.title || 'That isn’t in the right form.',
    rangeUnderflow: (e) => (isNum(e.min) ? `Use ${e.min} or more.` : `Choose ${e.min} or later.`),
    rangeOverflow: (e) => (isNum(e.max) ? `Use ${e.max} or less.` : `Choose ${e.max} or earlier.`),
    stepMismatch: (e) => {
      const step = Number(e.step || 1), base = Number(e.min || 0);
      if (!isNum(e.value)) return 'Choose another one.';
      return step === 1 && Number.isInteger(base) ? 'Use a whole number.' : `Use steps of ${step}${base ? ` from ${base}` : ''}.`;
    },
    date: 'Enter a date as YYYY-MM-DD.', // Dash.datepicker
    dateRange: (from, to) => (from && to ? `Choose a day from ${from} to ${to}.` : from ? `Choose ${from} or later.` : `Choose ${to} or earlier.`),
    list: 'Choose one from the list.', // Dash.combobox, strict
    checking: 'Checking…',
    cantCheck: (why) => `Couldn’t check this: ${why}`,
    count: (n) => `${fmt.plural(n, 'field')} to fix`,
  };

  // ---- unsaved changes (1.18)

  // Dash.unsaved('profile') watches a form. Once the reader has made a field with a name different from what it was,
  // the form is changed: it gets data-dirty, an .unsaved-note in it shows, and leaving the page asks first (the browser's
  // own question). Putting the field back makes it clean again; so do .saved(), a reset, and a submit that goes on (also a
  // dialog's own button). Discard doesn't put the fields back: a dialog the page opens again, it fills again.
  // A dialog with a changed form in it asks "Discard your changes?" before ×, Cancel, Escape or a click outside close it;
  // its other buttons, and the page's own close(), don't ask. What the page puts in a field is where it starts: a form
  // filled after it is watched, or drawn again with new values, isn't changed by that.
  // No code: <form data-unsaved>. Dash.form(el, { unsaved: true }) and Dash.modal({ unsaved: true }) do it too; what
  // onSubmit or onAction saves without an error is saved. onChange(dirty, handle) when that flips.
  // Dash.unsaved.leave(within) asks before the page changes what it shows by itself: a promise of true (nothing was
  // changed, or the reader chose to discard it). The words: Dash.unsaved.text. A form drawn again as a whole is followed
  // by its id. Handle: { el, dirty, changed (the names), saved(), destroy() }
  const watching = new Set();
  let unloadOn = false, lastSubmit = null;
  const shown = (w) => { const f = w.form(); return Boolean(f) && !f.closest('dialog:not([open])'); }; // (one in a closed dialog is gone for the reader)
  const onUnload = (e) => {
    const s = lastSubmit; // (a submit that goes on is saved after it, but Firefox asks before that)
    const left = [...watching].filter((w) => w.dirty && shown(w) && !(s && s.form === w.form() && !s.e.defaultPrevented && Date.now() - s.at < 3000));
    if (!left.length) return;
    e.preventDefault();
    e.returnValue = ''; // (older browsers)
  };
  const unloadGuard = () => {
    const need = [...watching].some((w) => w.dirty);
    if (need === unloadOn || !hasDom) return;
    unloadOn = need; // only while something is changed: a page with this listener isn't kept for the back button
    if (need) window.addEventListener('beforeunload', onUnload); else window.removeEventListener('beforeunload', onUnload);
  };
  // the value of each field with a name, as text: several of a name (radios, checkboxes) are one
  const snapshot = (form) => {
    const out = new Map(), seen = new Map();
    for (const e of form.elements) {
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || /^(submit|button|reset|image)$/.test(e.type) || e.__dashPart) continue;
      const name = e.__dashName || e.name;
      if (!name) continue;
      if (/^(radio|checkbox)$/.test(e.type)) {
        const was = out.get(name);
        out.set(name, (was ? was + '\u0001' : '') + (e.checked ? e.value : ''));
        continue;
      }
      const n = (seen.get(name) || 0) + 1;
      seen.set(name, n);
      const v = e.__dashValue ? JSON.stringify(e.__dashValue()) ?? '' : e.type === 'file' ? [...e.files].map((f) => `${f.name} ${f.size}`).join('\u0001')
        : e.tagName === 'SELECT' && e.multiple ? [...e.selectedOptions].map((o) => o.value).join('\u0001') : e.value;
      out.set(n > 1 ? `${name}\u0002${n}` : name, v);
    }
    return out;
  };
  Dash.unsaved = (target, { onChange } = {}) => {
    let form = el(target);
    if (!form || form.tagName !== 'FORM' || !hasDom) return null;
    if (form.__dashUnsaved) return form.__dashUnsaved;
    const start = snapshot(form), touched = new Set(); // where each field starts, and the names the reader changed
    let dirty = false, changed = [];
    const nameOf = (k) => k.split('\u0002')[0];
    const now = () => { // the form, or the one drawn in its place
      if (!form.isConnected && form.id) { const f = document.getElementById(form.id); if (f && f.tagName === 'FORM' && !f.__dashUnsaved) { delete form.__dashUnsaved; form.removeAttribute('data-dirty'); form = f; form.__dashUnsaved = handle; } }
      return form;
    };
    const look = () => {
      const f = now(), values = snapshot(f);
      for (const [k, v] of values) if (!touched.has(nameOf(k)) || !start.has(k)) start.set(k, v); // what the page put there
      changed = [...new Set([...values].filter(([k, v]) => start.get(k) !== v).map(([k]) => nameOf(k)))];
      const was = dirty;
      dirty = changed.length > 0;
      f.toggleAttribute('data-dirty', dirty);
      if (dirty !== was) { unloadGuard(); if (onChange) onChange(dirty, handle); }
    };
    const saved = () => {
      touched.clear();
      for (const [k, v] of snapshot(now())) start.set(k, v);
      look();
    };
    const handle = {
      get el() { return now(); },
      get dirty() { return dirty; },
      get changed() { return changed.slice(); },
      saved,
      destroy() { watching.delete(me); now().removeAttribute('data-dirty'); delete now().__dashUnsaved; if (dirty) { dirty = false; unloadGuard(); } },
    };
    const me = { // what the page wiring calls
      form: () => (now().isConnected ? form : null),
      get dirty() { return dirty; },
      input(e) { const name = e.__dashName || e.name; if (name) touched.add(name); look(); },
      look, saved,
    };
    form.__dashUnsaved = handle;
    handle.__me = me;
    watching.add(me);
    look();
    return handle;
  };
  Dash.unsaved.text = { note: 'Unsaved changes', ask: 'Discard your changes?', text: 'What you changed here hasn’t been saved.', discard: 'Discard', keep: 'Keep editing' };
  // the changed forms in an element (or the page): ask the reader first. → true: go on (the forms count as saved now)
  const unsavedIn = (within) => [...watching].filter((w) => w.dirty && w.form() && (!within || within === document || within.contains(w.form())));
  const askDiscard = async (list) => {
    const t = Dash.unsaved.text;
    if (!(await Dash.confirm(t.text, { title: t.ask, ok: t.discard, cancel: t.keep, tone: 'bad' }))) return false;
    for (const w of list) w.saved();
    return true;
  };
  let leaving = null; // the question leave() has open: a call meanwhile (a double click on a link) adds its forms and gets the same answer
  Dash.unsaved.leave = async (within) => {
    const list = unsavedIn(within && el(within));
    if (!list.length) return true;
    if (leaving) { for (const w of list) leaving.list.add(w); return leaving.answer; }
    const all = new Set(list);
    leaving = { list: all, answer: askDiscard(all).finally(() => { leaving = null; }) };
    return leaving.answer;
  };
  // a dialog closed by the reader (×, Cancel, Escape, a click outside): null when it can just close, else a promise of yes or no
  const asking = new WeakSet(); // (one question at a time for a dialog)
  const mayClose = (d) => {
    const list = unsavedIn(d);
    if (!list.length) return null;
    if (asking.has(d)) return Promise.resolve(false);
    asking.add(d);
    return askDiscard(list).finally(() => asking.delete(d));
  };
  const closeAsked = (d) => { const q = mayClose(d); if (!q) d.close(); else q.then((yes) => { if (yes && d.open) d.close(); }); };

  // ---- menus and tooltips (wired below; no code needed)
  //
  // A menu: <details class="menu"><summary class="btn">Actions</summary><div class="menu-list">
  //   <button type="button">Rename</button><hr><button type="button" class="bad">Delete</button></div></details>
  // It closes on a click outside, on Escape (back to its button) and once an item is chosen; .menu.end opens leftwards.
  // Inside a box that scrolls (a .table-wrap) it can be cut off: Dash.menu draws the same list above everything.
  // A tooltip: data-tooltip="Text" on anything; it shows on hover and keyboard focus, kept inside the window.

  let tipEl = null;
  let tipFor = null;
  let tipBy = ''; // 'hover' or 'focus': each kind hides for its own reasons
  const hideTip = () => {
    if (tipFor) describe(tipFor, 'dash-tooltip', false);
    if (tipEl) tipEl.hidden = true;
    tipFor = null;
  };
  const showTip = (target, by = tipBy) => {
    tipBy = by;
    const text = target.getAttribute('data-tooltip');
    if (!text || !target.isConnected) { hideTip(); return; }
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tooltip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.id = 'dash-tooltip';
    }
    lift(tipEl, target); // inside the popup or dialog the target is in: those sit above the rest of the page
    if (tipFor && tipFor !== target) describe(tipFor, 'dash-tooltip', false);
    tipFor = target;
    tipEl.textContent = text;
    tipEl.hidden = false;
    describe(target, 'dash-tooltip', true);
    const r = target.getBoundingClientRect();
    const t = tipEl.getBoundingClientRect();
    const gap = 8;
    const left = clamp(r.left + r.width / 2 - t.width / 2, gap, Math.max(gap, document.documentElement.clientWidth - t.width - gap));
    const above = r.top - t.height - gap >= gap;
    tipEl.style.left = left + 'px';
    tipEl.style.top = (above ? r.top - t.height - gap : r.bottom + gap) + 'px';
  };
  const closeMenus = (keep) => {
    for (const m of document.querySelectorAll('details.menu[open]')) if (!keep || (m !== keep && !m.contains(keep))) m.open = false;
  };

  // ---- page wiring: runs once, on its own

  if (hasDom) {
    Dash.theme.apply(); // before first paint when dash.js is in <head>
    if (Dash.store.get(Dash.config.privacyKey) === true) document.documentElement.dataset.values = 'hidden'; // too

    // the sticky top bar's height, for things that stick under it (0 when it scrolls away, as on phones)
    const syncTopbar = () => {
      const bar = document.querySelector('.topbar');
      const h = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    };
    const ready = () => {
      Dash.theme.apply();
      markPrivacy();
      syncTopbar();
      const bar = document.querySelector('.topbar');
      if (bar && typeof ResizeObserver !== 'undefined') new ResizeObserver(syncTopbar).observe(bar);
      window.addEventListener('resize', syncTopbar);
      if (Dash.store.get(Dash.config.sideKey) === 'rail') for (const s of document.querySelectorAll('.shell')) s.classList.add('collapsed');
      for (const b of document.querySelectorAll('[data-toggle-side]')) b.setAttribute('aria-expanded', String(!document.querySelector('.shell.collapsed')));
      const drawer = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches && document.querySelector('.shell.offcanvas');
      if (drawer) for (const b of document.querySelectorAll('[data-toggle-side]')) b.setAttribute('aria-expanded', 'false'); // a closed drawer
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
    if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => Dash.theme.apply());

    const setRail = (rail) => { // the sidebar as a rail of icons, or whole again
      for (const s of document.querySelectorAll('.shell')) s.classList.toggle('collapsed', rail);
      for (const b of document.querySelectorAll('[data-toggle-side]')) b.setAttribute('aria-expanded', String(!rail));
      Dash.store.set(Dash.config.sideKey, rail ? 'rail' : 'open');
      document.dispatchEvent(new CustomEvent('dash:side', { detail: { collapsed: rail } })); // for pages that lay out by it
    };
    // a group in the rail: there is no room to open it in, so the sidebar comes back with the group open
    document.addEventListener('click', (e) => {
      const s = e.target.closest && e.target.closest('.shell.collapsed > .sidebar .nav-group > summary');
      if (!s || drawerShell()) return;
      e.preventDefault();
      s.parentElement.open = true;
      setRail(false);
    });
    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (!t.closest) return;
      const menu = t.closest('details.menu');
      closeMenus(menu);
      if (menu && t.closest('.menu-list') && t.closest('button, a, [data-value]')) menu.open = false; // an item was chosen
      let hit;
      if ((hit = t.closest('.ip[data-ip]'))) {
        toggleIp(hit);
      } else if ((hit = t.closest('[data-privacy]'))) {
        Dash.privacy.toggle();
      } else if ((hit = t.closest('[data-theme-set]'))) {
        Dash.theme.set(hit.dataset.themeSet);
      } else if ((hit = t.closest('[data-copy]'))) {
        const text = hit.dataset.copy;
        const ok = await Dash.copy(text);
        if (!ok || !hit.hasAttribute('data-quiet')) Dash.toast(ok ? 'Copied' : 'Couldn’t copy', { tone: ok ? '' : 'bad', ms: 1600 });
        if (ok && !hit.classList.contains('copied')) {
          const label = hit.innerHTML;
          lastCopy = { text, until: Date.now() + COPY_MS };
          hit.classList.add('copied');
          if (hit.classList.contains('btn')) hit.textContent = 'Copied ✓';
          setTimeout(() => {
            hit.classList.remove('copied');
            if (hit.classList.contains('btn')) hit.innerHTML = label;
            // the same button drawn again by a re-render meanwhile
            for (const b of document.querySelectorAll('[data-copy].copied')) {
              if (b !== hit && b.dataset.copy === text) { b.classList.remove('copied'); if (b.classList.contains('btn')) b.textContent = b.dataset.label || 'Copy'; }
            }
          }, COPY_MS);
        }
      } else if ((hit = t.closest('[data-toggle-side]')) && drawerShell()) {
        const shell = drawerShell();
        sideDrawer(shell, !shell.classList.contains('side-open'), hit);
      } else if ((hit = t.closest('[data-toggle-side]'))) {
        const shell = document.querySelector('.shell');
        setRail(!(shell && shell.classList.contains('collapsed')));
      } else if ((hit = t.closest('[data-popup]'))) {
        const src = document.getElementById(hit.dataset.popup);
        if (src) Dash.popup(hit, src.tagName === 'TEMPLATE' ? src.content.cloneNode(true) : src.innerHTML);
      } else if ((hit = t.closest('[data-dismiss]'))) {
        const pop = popups.slice().reverse().find((p) => p.el.contains(hit));
        const box = hit.closest('dialog, .notice, [data-dismissable]');
        if (pop) pop.close(); else if (box && box.tagName === 'DIALOG') closeAsked(box); else if (box) box.remove();
      } else if (t.tagName === 'DIALOG' && t.matches('.dialog, .drawer, .modal') && lastPress.target === t
        && !/^(none|closerequest)$/i.test(t.getAttribute('closedby') || '')) {
        // a click on the backdrop (outside the box) closes it, when the press started there too: not a drag out of a field
        const r = t.getBoundingClientRect();
        const out = (x, y) => x < r.left || x > r.right || y < r.top || y > r.bottom;
        if (out(e.clientX, e.clientY) && out(lastPress.x, lastPress.y)) closeAsked(t);
      }
    });
    // the last press: where a click started, and (with no popovers in the browser) a press outside a popup closes it
    document.addEventListener('pointerdown', (e) => {
      lastPress = { target: e.target, x: e.clientX, y: e.clientY, seq: lastPress.seq + 1 };
      if (!nativePop) for (const p of popups.slice().reverse()) if (!p.el.contains(e.target)) p.dismiss();
      pressed = true;
    }, true);
    for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, () => { pressed = false; }, true);
    document.addEventListener('click', (e) => {
      clickOf = e.detail ? lastPress.seq : -1; // a click from a key (detail 0) has no press
      setTimeout(() => { clickOf = -1; });
    }, true);
    // more fields (1.15): − and + (a press that is held goes on), codes, ranges, and passwords that can be shown
    let holding = 0;
    const letGo = () => { if (!holding) return; clearTimeout(holding); holding = 0; };
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest && e.target.closest('.num-field [data-step]');
      if (!b || e.button || b.disabled) return;
      const field = b.closest('.num-field'), input = field.querySelector('input'), by = Number(b.dataset.step) || 1, was = input ? input.value : '';
      e.preventDefault();
      try { field.setPointerCapture(e.pointerId); } catch { /* a press a page made */ } // (the button may go off under the pointer: the release still comes)
      if (input && e.pointerType === 'mouse') input.focus({ preventScroll: true });
      numStep(field, by);
      const again = (ms) => { holding = setTimeout(() => { if (field.isConnected && !b.disabled && numStep(field, by)) again(70); }, ms); };
      again(420);
      const done = () => {
        letGo();
        for (const t of ['pointerup', 'pointercancel', 'blur']) window.removeEventListener(t, done);
        if (input && input.value !== was) input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      for (const t of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(t, done);
    });
    document.addEventListener('click', (e) => {
      const t = e.target.closest ? e.target : null;
      if (!t) return;
      const step = e.detail === 0 && t.closest('.num-field [data-step]'); // (a screen reader's press: no pointer)
      if (step) {
        const field = step.closest('.num-field');
        if (numStep(field, Number(step.dataset.step) || 1)) field.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
      }
      const eye = t.closest('[data-peek]');
      const box = eye && (document.getElementById(eye.dataset.peek) || (eye.closest('.input-group, .field, label') || document).querySelector('input[type="password"], input[data-peeked]'));
      if (box) {
        const show = box.type === 'password';
        box.type = show ? 'text' : 'password';
        box.toggleAttribute('data-peeked', show);
        eye.setAttribute('aria-pressed', String(show));
        if (!eye.firstElementChild) eye.textContent = show ? 'Hide' : 'Show';
      }
    });
    document.addEventListener('submit', (e) => { // a password goes out as one
      for (const i of e.target.querySelectorAll('input[data-peeked]')) {
        i.type = 'password';
        i.removeAttribute('data-peeked');
        for (const b of (i.closest('.input-group, .field, label') || e.target).querySelectorAll('[data-peek]')) { b.setAttribute('aria-pressed', 'false'); if (!b.firstElementChild) b.textContent = 'Show'; }
      }
    }, true);
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.matches || !t.matches('input')) return;
      if (t.type === 'range' && t.closest('.range-field')) rangeMove(t);
      else if (t.type === 'number' && t.closest('.num-field')) numEnds(t.closest('.num-field'));
      else if (t.matches('.code-field > input')) { if (e.isComposing) codeAt(t); else codeIn(t); }
    });
    document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('.num-field input')) numEnds(e.target.closest('.num-field')); });
    document.addEventListener('reset', (e) => setTimeout(() => { // what they show goes back too
      for (const n of e.target.querySelectorAll('.num-field')) numEnds(n);
      for (const n of e.target.querySelectorAll('.range-field input:first-of-type')) rangeMove(n);
      for (const n of e.target.querySelectorAll('.code-field > input')) { n.__dashCode = ''; codeAt(n); }
    }));
    // a range (Dash.range): a press on its track takes the nearer end there, and along
    document.addEventListener('pointerdown', (e) => {
      const track = !e.button && e.isPrimary && e.target.classList && e.target.classList.contains('range-track') ? e.target : null;
      const [a, b] = track ? track.querySelectorAll('input[type="range"]') : [];
      if (!b || a.disabled || b.disabled) return;
      const r = track.getBoundingClientRect(), lo = Number(a.min || 0), span = Number(a.max || 100) - lo;
      const valueAt = (x) => lo + ((x - r.left - 9) / (r.width - 18)) * span; // (a thumb is 18 px wide; the box keeps it to its ends and steps)
      const v = valueAt(e.clientX), end = v - Number(a.value) < Number(b.value) - v ? a : b, was = end.value;
      const to = (x) => { const old = end.value; end.value = valueAt(x); if (end.value !== old) end.dispatchEvent(new Event('input', { bubbles: true })); };
      const control = new AbortController(), { signal } = control;
      const done = () => { control.abort(); if (end.value !== was) end.dispatchEvent(new Event('change', { bubbles: true })); };
      let live = e.pointerType !== 'touch'; // a finger may be about to scroll: it has to tap, or to go sideways
      if (live) { e.preventDefault(); end.focus({ preventScroll: true }); to(e.clientX); }
      window.addEventListener('pointermove', (m) => { if (m.pointerId === e.pointerId && (live ||= Math.abs(m.clientX - e.clientX) > 6)) to(m.clientX); }, { signal });
      window.addEventListener('pointerup', (u) => { if (u.pointerId === e.pointerId) { if (live || Math.abs(u.clientY - e.clientY) < 12) to(u.clientX); done(); } }, { signal });
      window.addEventListener('pointercancel', (u) => { if (u.pointerId === e.pointerId) done(); }, { signal });
    });
    // a code (Dash.code): a press goes into the box that is pressed, arrows from box to box, and a character replaces the one
    // that is there
    const codeOf = (t) => (t && t.matches && t.matches('.code-field > input') ? t : null);
    let finger = false, composing = false;
    const codeHit = (e) => { const f = !e.button && !e.shiftKey && e.target.closest && e.target.closest('.code-field'), i = f && codeOf(f.querySelector('input')); return i && !i.disabled ? i : null; };
    document.addEventListener('pointerdown', (e) => { finger = e.pointerType === 'touch' || e.pointerType === 'pen'; }, true);
    document.addEventListener('mousedown', (e) => {
      const i = finger ? null : codeHit(e);
      if (!i) return;
      e.preventDefault(); // (it would put the caret before or after the character)
      i.focus({ preventScroll: true });
      if (e.detail > 1) { i.select(); codeAt(i); } else codeTo(i, codeBoxAt(i, e.clientX));
    });
    document.addEventListener('click', (e) => { const i = finger ? codeHit(e) : null; if (i) codeTo(i, codeBoxAt(i, e.clientX)); }); // (a finger's press has to give it the focus itself, for the keyboard)
    document.addEventListener('keydown', (e) => {
      const i = codeOf(e.target);
      if (!i || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const s = i.selectionStart, x = i.selectionEnd, some = x - s > 1;
      const to = { ArrowLeft: some ? s : Math.min(s, codeLen(i) - 1) - 1, ArrowRight: some ? x - 1 : s + 1, Home: 0, ArrowUp: 0, End: i.value.length, ArrowDown: i.value.length }[e.key];
      if (to == null) return;
      e.preventDefault();
      codeTo(i, to);
    });
    document.addEventListener('beforeinput', (e) => { // a letter doesn't take a digit's place
      const i = codeOf(e.target);
      if (i && e.inputType === 'insertText' && e.data && !e.isComposing && !codeWell(i, e.data)) e.preventDefault();
    });
    document.addEventListener('compositionstart', () => { composing = true; });
    document.addEventListener('compositionend', (e) => { composing = false; const i = codeOf(e.target); if (i) codeIn(i); });
    document.addEventListener('paste', (e) => { // maxlength would cut "123 456" before the space is taken out
      const i = codeOf(e.target), text = i && !i.disabled && e.clipboardData ? e.clipboardData.getData('text') : '';
      if (!text) return;
      e.preventDefault();
      const n = codeLen(i), got = codeWell(i, text).slice(0, n), s = got.length < n ? i.selectionStart ?? i.value.length : 0, x = i.selectionEnd ?? s;
      if (!got) return; // nothing a code can have: what is there stays
      i.value = got.length < n ? (i.value.slice(0, s) + got + i.value.slice(Math.max(x, s + got.length))).slice(0, n) : got;
      i.setSelectionRange(s + got.length, s + got.length);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.addEventListener('focusin', (e) => { const i = codeOf(e.target); if (i) codeAt(i); });
    document.addEventListener('selectionchange', () => {
      const i = codeOf(document.activeElement);
      if (!i || composing) return;
      const s = i.selectionStart;
      if (s === i.selectionEnd && s < i.value.length && i.value.length === codeLen(i)) codeTo(i, s); else codeAt(i); // (a full one has no room for one more)
    });
    // a dialog closing: what floats inside it moves down to the next layer
    document.addEventListener('close', (e) => {
      const d = e.target;
      if (!d || d.tagName !== 'DIALOG') return;
      const i = modals.indexOf(d);
      if (i >= 0) modals.splice(i, 1);
      for (const p of popups.slice()) if (d.contains(p.el)) p.close();
      if (tipEl && d.contains(tipEl)) { hideTip(); document.body.appendChild(tipEl); }
      for (const n of [toastEl, noticeBox]) if (n && d.contains(n)) lift(n);
    }, true);
    // a modal dialog the page opened itself (in browsers that say so): the same as one of dash.js's own
    document.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d && d.tagName === 'DIALOG' && e.newState === 'open' && isModal(d)) opened(d);
    }, true);
    // charts drawn with Dash.bars(points, { read }) (they carry data-read): the hovered column's title goes in
    // their readout line, and the line's own text comes back when the pointer leaves. Other charts are left alone.
    let reading = null;
    document.addEventListener('mouseover', (e) => {
      const col = e.target.closest && e.target.closest('.chart[data-read] .chart-col');
      const chart = col ? col.closest('.chart') : null;
      if (reading && reading !== chart) { const r = reading.querySelector('.chart-read'); if (r) r.textContent = r.dataset.default || ''; }
      reading = chart;
      if (col) { const r = chart.querySelector('.chart-read'); if (r) r.textContent = col.title; }
    });
    document.addEventListener('keydown', (e) => {
      const ip = e.target.closest && e.target.closest('.ip[data-ip]');
      if (ip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleIp(ip); }
      if (e.key === 'Escape') {
        hideTip();
        if (!nativePop && popups.length) { e.preventDefault(); popups[popups.length - 1].close(); return; } // browsers with popovers do this
        const open = document.querySelector('details.menu[open]');
        if (open) { e.preventDefault(); closeMenus(); open.querySelector('summary')?.focus(); } // only the menu: a dialog around it stays
      }
    });
    // ---- 1.13: forms (Dash.form). A field that is left while the pointer is down waits for the click: a message that
    // pushes the Save button away from under it would lose that click.
    const formOf = (e) => (e.target && e.target.form && e.target.form.__dashForm) || null;
    let pressing = false, later = [], waiting = 0;
    const released = () => {
      pressing = false;
      clearTimeout(waiting);
      const now = later;
      later = [];
      if (now.length) setTimeout(() => { for (const fn of now) fn(); });
    };
    const left = (f, e) => {
      const k = f.key(e); // (the box may be drawn again before it is looked at)
      if (k === undefined) return;
      const go = () => { if (!f.here(k)) f.left(k); };
      if (!pressing) { setTimeout(go); return; } // (after a strict combobox has put its text right)
      later.push(go);
      clearTimeout(waiting);
      waiting = setTimeout(released, 1200); // a press that ended where the page can't see it (a select's own list)
    };
    document.addEventListener('pointerdown', () => { pressing = true; }, true);
    for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, released, true);
    document.addEventListener('input', (e) => { const f = formOf(e); if (f) f.input(e.target); });
    document.addEventListener('change', (e) => {
      const f = formOf(e), t = e.target;
      if (!f) return;
      f.input(t);
      if (f.many(t)) return; // a group of checkboxes: once it is left
      if (document.activeElement !== t) left(f, t); // (a calendar's pick)
      else if (!texty(t) && !/^(number|date|month|week|time|datetime-local)$/.test(t.type)) f.left(f.key(t)); // (a date is whole only once it is left)
    });
    document.addEventListener('focusout', (e) => { const f = formOf(e); if (f) left(f, e.target); });
    document.addEventListener('reset', (e) => { const f = e.target.__dashForm; if (f) setTimeout(() => { if (!e.defaultPrevented) f.clear(); }); });
    // ---- 1.18: unsaved changes. <form data-unsaved> is watched from the reader's first press or focus in it, so what the
    // page fills in before that is where it starts.
    const unsavedOf = (t) => {
      const f = t && (t.form || (t.closest && t.closest('form')));
      if (!f) return null;
      if (!f.__dashUnsaved && f.id) for (const w of watching) w.form(); // one drawn in place of a watched one takes its watcher
      if (!f.__dashUnsaved && f.matches('form[data-unsaved]')) Dash.unsaved(f);
      return f.__dashUnsaved || null;
    };
    for (const type of ['focusin', 'pointerdown', 'beforeinput']) document.addEventListener(type, (e) => { const w = unsavedOf(e.target); if (w) w.__me.look(); }, true);
    for (const type of ['input', 'change']) document.addEventListener(type, (e) => { const w = unsavedOf(e.target); if (w) w.__me.input(e.target); }, true);
    document.addEventListener('reset', (e) => { const w = e.target.__dashUnsaved; if (w) setTimeout(() => { if (!e.defaultPrevented) w.saved(); }); }); // (it is put back after the event)
    document.addEventListener('submit', (e) => { // one that goes on is saved (a dialog's own buttons), or leaves the page: no question
      lastSubmit = { form: e.target, e, at: Date.now() };
      const w = e.target.__dashUnsaved;
      if (w) setTimeout(() => { if (!e.defaultPrevented) w.saved(); });
    }, true);
    document.addEventListener('keydown', (e) => { // Escape in a dialog with changes: ask first. (Not by its cancel event alone: after
      // two or so, browsers close the dialog without letting the page stop it.) A popup or menu open in it takes the key.
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      const d = topModal();
      if (!d || popups.length || /^none$/i.test(d.getAttribute('closedby') || '')) return; // (an open menu has taken it already)
      const q = mayClose(d);
      if (!q) return;
      e.preventDefault();
      q.then((yes) => { if (yes && d.open) d.close(); });
    });
    document.addEventListener('cancel', (e) => { // a close the browser asks for in another way (a phone's back button) ...
      const d = e.target;
      if (d.tagName !== 'DIALOG' || !e.cancelable) return;
      d.addEventListener('cancel', (c) => { // ... asks after the dialog's own listeners, which may keep it open (Dash.modal's dismissable: false)
        if (c !== e || c.defaultPrevented) return;
        const q = mayClose(d);
        if (!q) return;
        c.preventDefault();
        q.then((yes) => { if (yes && d.open) d.close(); });
      }, { once: true });
    }, true); // (it doesn't bubble)
    // <form data-validate>: at load (what the server wrote into it is marked then), or once one that comes later is used
    const validated = (f) => { if (f && f.matches && f.matches('form[data-validate]') && !f.__dashForm) Dash.form(f); };
    const wireForms = () => { for (const f of document.querySelectorAll('form[data-validate]')) validated(f); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireForms); else wireForms();
    const wirePanes = () => { for (const x of document.querySelectorAll('[data-panes]')) if (!x.__dashPanes) Dash.panes(x); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wirePanes); else wirePanes();
    for (const type of ['focusin', 'input']) document.addEventListener(type, (e) => validated(e.target.form), true);
    document.addEventListener('submit', (e) => { validated(e.target); const f = e.target.__dashForm; if (f) f.submit(e); }, true);
    document.addEventListener('invalid', (e) => { // (submitted by a script before anyone touched it)
      const f = e.target.form;
      if (!f || !f.matches('form[data-validate]')) return;
      e.preventDefault();
      if (!f.__dashForm) { validated(f); f.__dashForm.check(); }
    }, true);
    // ---- 1.8: sliders show their value; drop zones take dropped files; the sidebar as a drawer on smaller screens
    document.addEventListener('input', (e) => {
      const r = e.target;
      if (!r.matches || !r.matches('.slider > input[type="range"]')) return;
      const out = r.parentElement.querySelector(':scope > output');
      if (out) out.textContent = r.value + (r.dataset.unit || '');
    });
    const zoneOf = (e) => (e.target && e.target.closest ? e.target.closest('.dropzone') : null);
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    // accept="image/*,.pdf,text/csv": the files a picker with that accept would offer
    const accepts = (input) => {
      const want = (input.getAttribute('accept') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      return (f) => !want.length || want.some((w) => (w.startsWith('.') ? f.name.toLowerCase().endsWith(w)
        : w.endsWith('/*') ? (f.type || '').toLowerCase().startsWith(w.slice(0, -1)) : (f.type || '').toLowerCase() === w));
    };
    for (const type of ['dragenter', 'dragover']) {
      document.addEventListener(type, (e) => {
        const z = zoneOf(e);
        if (!z || !hasFiles(e)) return;
        e.preventDefault(); // or the browser opens the file instead
        e.dataTransfer.dropEffect = 'copy';
        z.classList.add('over');
      });
    }
    document.addEventListener('dragleave', (e) => {
      const z = zoneOf(e);
      if (z && !z.contains(e.relatedTarget)) z.classList.remove('over');
    });
    document.addEventListener('drop', (e) => {
      const z = zoneOf(e);
      if (!z) return;
      z.classList.remove('over');
      const input = z.querySelector('input[type="file"]');
      if (!input || input.disabled || !hasFiles(e)) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files].filter(accepts(input));
      if (!files.length) return;
      const dt = new DataTransfer();
      for (const f of input.multiple ? files : files.slice(0, 1)) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true })); // as if chosen
    });
    document.addEventListener('change', (e) => {
      const z = zoneOf(e);
      if (!z || e.target.type !== 'file') return;
      const list = z.querySelector('.files');
      const names = [...e.target.files].map((f) => f.name);
      if (list) list.textContent = names.length > 3 ? `${names.length} files: ${names.slice(0, 2).join(', ')} …` : names.join(', ');
    });

    // .shell.offcanvas: up to 900 px the sidebar is a drawer over the page. [data-toggle-side] opens and closes it there;
    // Escape, a click outside it or on one of its links closes it; the page behind can't be reached while it's open.
    const narrow = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 900px)') : null;
    let drawerBy = null, inerted = [];
    const drawerShell = () => (narrow && narrow.matches ? document.querySelector('.shell.offcanvas') : null);
    const sideDrawer = (shell, open, by) => {
      shell.classList.toggle('side-open', open);
      // everything but the drawer is out of reach while it's open (what the page made inert itself stays so)
      for (const n of inerted) n.inert = false;
      inerted = [];
      const side0 = shell.querySelector(':scope > .sidebar');
      if (open && side0) {
        for (let n = side0; n && n !== document.body && n.parentElement; n = n.parentElement) {
          for (const sib of n.parentElement.children) if (sib !== n && !sib.inert && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(sib.tagName)) { sib.inert = true; inerted.push(sib); }
        }
      }
      for (const b of document.querySelectorAll('[data-toggle-side]')) b.setAttribute('aria-expanded', String(open));
      const side = shell.querySelector(':scope > .sidebar');
      if (open) {
        drawerBy = by || document.activeElement;
        const first = side && (side.querySelector('[aria-current="page"], [aria-current="true"]') || side.querySelector('a[href], button:not([disabled]), input, [tabindex="0"]'));
        if (first) setTimeout(() => first.focus({ preventScroll: true })); // once it's visible
      } else if (drawerBy) {
        if (drawerBy.isConnected) drawerBy.focus({ preventScroll: true });
        drawerBy = null;
      }
    };
    // Dash.side.open() / close(): the drawer from code (open does nothing wider than 900 px, and says so: false)
    Dash.side = { open: () => { const s = drawerShell(); if (s) sideDrawer(s, true); return Boolean(s); },
      close: () => { const s = document.querySelector('.shell.offcanvas.side-open'); if (s) sideDrawer(s, false); } };
    // wider again: the drawer is the sidebar again, and the toggles say so
    if (narrow) narrow.addEventListener?.('change', () => {
      const open = document.querySelector('.shell.offcanvas.side-open');
      if (open) sideDrawer(open, false);
      if (!narrow.matches || document.querySelector('.shell.offcanvas')) for (const b of document.querySelectorAll('[data-toggle-side]'))
        b.setAttribute('aria-expanded', String(narrow.matches ? false : !document.querySelector('.shell.collapsed')));
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      const open = document.querySelector('.shell.offcanvas.side-open');
      if (!open || !t.closest) return;
      if (t === open || (t.closest('.sidebar') && t.closest('a[href], .nav-item:not(summary)') && open.contains(t))) sideDrawer(open, false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.shell.offcanvas.side-open');
      if (open && !popups.length && !document.querySelector('dialog[open], details.menu[open]')) { e.preventDefault(); sideDrawer(open, false); }
    });
    // hidden values: the choice made in another tab, or while the browser kept this page for its back button
    const followPrivacy = () => {
      const on = Dash.store.get(Dash.config.privacyKey);
      if (typeof on === 'boolean') setPrivacy(on); // nothing stored (cleared, blocked): as it is
    };
    window.addEventListener('storage', (e) => { if (e.key === Dash.config.privacyKey) followPrivacy(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) followPrivacy(); });
    // text boxes: clicking or typing shows one, until the reader leaves it. Not focus: Tab goes through boxes too, and
    // not a finger's press: that may be the start of a scroll (its click comes after).
    const showBox = (e) => {
      if (Dash.privacy.on && e.target.matches?.('input[data-private], textarea[data-private]')) e.target.classList.add('reveal');
    };
    document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') showBox(e); });
    document.addEventListener('click', showBox);
    document.addEventListener('input', (e) => { if (e.target === document.activeElement) showBox(e); }); // (not the browser filling it in)
    document.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-private]')) e.target.classList.remove('reveal'); });
    document.addEventListener('close', (e) => { // a dialog that closes takes the focus out without a focusout
      for (const box of e.target.querySelectorAll?.('.reveal[data-private]') || []) box.classList.remove('reveal');
    }, true);
    // tooltips: data-tooltip on hover or keyboard focus
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('[data-tooltip]');
      if (t) { if (t !== tipFor) showTip(t, 'hover'); } else if (tipFor && tipBy === 'hover') hideTip();
    });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest && e.target.closest('[data-tooltip]');
      if (t && t.matches(':focus-visible')) showTip(t, 'focus'); else if (tipFor) hideTip();
    });
    document.addEventListener('focusout', () => { if (tipFor && tipBy === 'focus') hideTip(); });
    window.addEventListener('scroll', () => { if (tipFor) showTip(tipFor); }, { passive: true, capture: true }); // it follows its element
  }

  if (typeof module === 'object' && module.exports) module.exports = Dash;
  else root.Dash = Dash;
})(typeof globalThis !== 'undefined' ? globalThis : this);
