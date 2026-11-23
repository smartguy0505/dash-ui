/* dash-ui 1.9.0 helpers: formatting, small HTML builders, charts, toasts, fetch and polling for the dashboards.
   A plain script with no dependencies: a script tag for dash.js in <head> gives window.Dash, and puts the
   saved light/dark choice on the page before it paints. In Node, require('./dash.js') returns the same object
   (the parts that need a page are skipped).

   House idiom: builders return HTML strings with every value escaped; pages put them in with innerHTML and
   handle clicks with one listener on a parent (data- attributes say what was clicked). */
(function (root) {
  'use strict';
  const hasDom = typeof document !== 'undefined';
  const Dash = { version: '1.9.0', config: { loginUrl: null, themeKey: 'dash.theme', sideKey: 'dash.side', csp: false } };

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
  };
  const liveTime = (kind, t) => {
    const ms = Dash.time(t);
    if (!Number.isFinite(ms)) return NONE;
    if (hasDom && !ticker) ticker = setInterval(tick, 15000);
    return `<time datetime="${new Date(ms).toISOString()}" data-${kind}="${ms}" title="${esc(fmt.when(ms))}">${esc(kind === 'ago' ? fmt.ago(ms) : fmt.until(ms))}</time>`;
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
  // format ((value, row) → text), html (row → HTML from a builder, not escaped), sort: false, firstDir: 'asc', main.
  // Options: cls (table classes, 'stack' by default: cards on phones), wrap (the table as its own card), perPage
  // (0: no pager), sizes, noun, key (row → data-key, so Dash.render keeps its focus), rowClass (row → class),
  // empty (text when there are no rows), onRow (row, event): a click or Enter on a row, not on a control in it,
  // filter (row → keep it?).
  // It draws with Dash.render, so a refresh keeps the reader's place.
  Dash.table = (target, { columns, rows = [], sort = {}, perPage = 0, sizes, noun = 'row', key, rowClass, empty = 'Nothing to show',
    cls = 'stack', wrap = false, onRow, filter } = {}) => {
    const node = el(target);
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
      const inner = c.html ? c.html(r) : esc(c.format ? c.format(v, r) : v == null || v === '' ? NONE : v);
      const classes = [c.num ? 'num' : '', c.main ? 'main' : '', c.cls || ''].filter(Boolean).join(' ');
      return `<td${classes ? ` class="${esc(classes)}"` : ''}${c.main ? '' : ` data-label="${esc(c.label)}"`}>${inner}</td>`;
    };
    let test = filter || null;
    const visible = () => {
      const kept = test ? data.filter(test) : data;
      return sorter.key != null ? sorter.apply(kept, getters) : kept;
    };
    const html = () => {
      const sorted = visible();
      const p = size ? Dash.paginate(sorted, page, size) : { rows: sorted };
      if (size) page = p.page;
      next = p.rows;
      const head = columns.map((c) => Dash.th(c.label, c.sort === false ? null : c.key, sorter, { num: c.num, title: c.title, cls: c.cls, unit: c.unit })).join('');
      const body = next.length ? next.map((r, i) => {
        const k = key == null ? null : typeof key === 'function' ? key(r) : r[key];
        const classes = [onRow ? 'click' : '', rowClass ? rowClass(r) : ''].filter(Boolean).join(' ');
        return `<tr data-i="${i}"${k != null ? ` data-key="${esc(k)}"` : ''}${classes ? ` class="${esc(classes)}"` : ''}${onRow ? ' tabindex="0"' : ''}>${columns.map((c) => cell(c, r)).join('')}</tr>`;
      }).join('') : `<tr class="empty-row"><td colspan="${columns.length}">${esc(empty)}</td></tr>`;
      const table = `<table class="table${cls ? ' ' + esc(cls) : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      return (wrap ? `<div class="table-wrap" data-key="dash-table-wrap">${table}</div>` : table) + (size ? Dash.pager(p, { noun, sizes }) : '');
    };
    // (a refresh that waits for a selection leaves the old rows on screen, so clicks must still map to those)
    const draw = (force = false) => {
      const markup = html();
      const wrote = Dash.render(node, markup, { force });
      if (wrote || node.__dashHtml === markup) shown = next;
      return wrote;
    };
    const rowOf = (e) => {
      const tr = e.target.closest('tbody tr[data-i]');
      return tr && node.contains(tr) && !e.target.closest('a, button, input, select, textarea, label, summary') ? shown[Number(tr.dataset.i)] : null;
    };
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort], [data-page]');
      if (b && node.contains(b)) {
        if (b.dataset.sort != null) { sorter.toggle(b.dataset.sort); page = 1; } else page = Number(b.dataset.page);
        draw(true);
        return;
      }
      const sel = window.getSelection ? getSelection() : null;
      if (sel && !sel.isCollapsed && node.contains(sel.anchorNode)) return; // the reader selected text, not a row
      const r = onRow && rowOf(e);
      if (r) onRow(r, e);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !onRow || e.target.tagName !== 'TR') return;
      const r = rowOf(e);
      if (r) onRow(r, e);
    });
    node.addEventListener('change', (e) => {
      if (!e.target.matches('[data-per-page]')) return;
      size = Number(e.target.value) || size;
      page = 1;
      draw(true);
    });
    draw();
    return {
      update(next) { data = next || []; draw(); },
      get rows() { return data; },
      get shown() { return shown; },
      get page() { return page; },
      goto(n) { page = n; draw(true); },
      sort: sorter,
      redraw() { draw(true); },
      // keep only rows that pass fn (null: all): table.filter((r) => Dash.match(r, query, ['name', 'region']))
      filter(fn) { test = fn || null; page = 1; draw(); },
      // how many rows pass the filter, of how many
      get count() { return { shown: visible().length, total: data.length }; },
      // every row that passes the filter, sorted, as CSV; download saves it as a file
      csv() { return Dash.csv(visible(), columns.map((c) => ({ key: c.key, label: c.label, value: c.value }))); },
      download(name = 'table.csv') { Dash.download(name, this.csv()); },
    };
  };

  // ---- bars and charts. Colours come from tone class names ('ok', 'blue', 'teal', …); sizes from dash.css.

  const pctOf = (v, max) => (max > 0 ? clamp((Number(v) || 0) / max * 100, 0, 100) : 0);
  const w = (p) => `width:${+p.toFixed(2)}%`;

  // ---- pages with a strict style policy (Content-Security-Policy: style-src 'self', no 'unsafe-inline')
  // Such a page drops every style="" in markup. With Dash.config.csp = true, the builders that size things (bar,
  // meter, split, bars, spark, progress; Dash.lanes always does) write their numbers as data-css-* attributes instead, and
  // the kit sets them through the CSSOM, which the policy allows: at once wherever the kit puts markup in
  // (Dash.render, popups, modals, dialogs), and before the next paint for markup the page puts in itself (a
  // MutationObserver). Only numbers, only these properties, only on the kit's own pieces: other markup can't
  // style anything this way. Dash.applyStyles(el) applies them at once, for a page that measures right after
  // putting markup in. Off (the default), the builders write style="" exactly as before.
  const STYLED = [
    ['.bar > i, .meter > i, .split > i, .progress > i', 'data-css-w', 'width', (v) => v + '%'],
    ['.chart-col > i', 'data-css-h', 'height', (v) => v + '%'],
    ['.chart-grid', 'data-css-top', 'top', (v) => v + '%'],
    ['.chart-col u', 'data-css-grow', 'flex-grow', (v) => String(v)],
    ['.chart-plot', 'data-css-chart-h', '--chart-h', (v) => v + 'px'],
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
  // "12 min ago", the full time as its tooltip) or other text shown as it is; html instead of text for markup.
  Dash.timeline = (items, { empty = 'Nothing yet' } = {}) => (!items.length ? `<p class="empty">${esc(empty)}</p>`
    : `<ol class="timeline">${items.map((it) => {
      const t = it.time == null || it.time === '' ? '' : Number.isFinite(Dash.time(it.time)) ? Dash.ago(it.time) : esc(it.time);
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
  Dash.render = (target, html, { force = false } = {}) => {
    const node = el(target);
    if (!node) return false;
    html = String(html);
    if (!force && node.__dashHtml === html) return false;
    const sel = getSelection();
    if (!force && sel && !sel.isCollapsed && sel.rangeCount && (node.contains(sel.getRangeAt(0).commonAncestorContainer) || sel.containsNode(node, true))) return false;
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
        if (focus.value != null && 'value' in again) again.value = focus.value; // what the reader is typing
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
  // focus: a selector for what has the focus (the first input by default).
  Dash.dialog = ({ title = '', text = '', body = '', actions = [{ label: 'OK', value: 'ok', primary: true }], cancel = 'Cancel', drawer = false, focus } = {}) => new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = drawer ? 'drawer' : 'dialog';
    const all = (cancel ? [{ label: cancel, cancel: true }] : []).concat(actions);
    const btn = (a) => (a.cancel ? `<button type="button" class="btn ghost" data-dismiss>${esc(a.label)}</button>`
      : `<button class="btn${a.primary || a.tone ? ' primary' : ''}${a.tone ? ' ' + esc(a.tone) : ''}" value="${esc(a.value ?? a.label)}">${esc(a.label)}</button>`);
    d.innerHTML = `<form class="${drawer ? 'drawer-body' : 'dialog-body'}" method="dialog">${title ? `<h2>${esc(title)}</h2>` : ''}`
      + `${text ? `<p class="hint">${esc(text)}</p>` : ''}${body}<div class="dialog-actions">${all.map(btn).join('')}</div></form>`;
    document.body.appendChild(d);
    if (Dash.config.csp) Dash.applyStyles(d);
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
  Dash.ask = async (title, { text = '', value = '', placeholder = '', ok = 'OK', cancel = 'Cancel', required = true, type = 'text' } = {}) => {
    const r = await Dash.dialog({
      title, text, cancel, actions: [{ label: ok, value: 'ok', primary: true }],
      body: `<input class="input dialog-input" name="answer" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}>`,
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
  // Enter in a field presses the primary one, after the fields' own checks (required, type="email", …). Buttons
  // of your own in the body need type="button". An error thrown by onAction shows in the foot (so does m.error(text)).
  // dismissable: false drops the × and ignores Escape and clicks outside: only its buttons or m.close() end it.
  // text: a line under the title. focus: a selector (the first field by default). onClose({ value, fields }).
  // update({ body }) redraws like Dash.render: what the reader is typing, the focus and the scroll stay.
  // Handle: el, body (the part that scrolls), fields(), update({ title, text, body, actions }), error(text),
  // close(value), closed (a promise of { value, fields }; value is null after ×, Cancel, Escape or a click outside).
  Dash.modal = ({ title = '', text = '', body = '', actions = [], cancel = '', size = 'md', drawer = false, dismissable = true,
    focus, onAction, onClose, cls = '' } = {}) => {
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
    const error = (msg) => { const e = q('.modal-error'); if (e) e.textContent = msg || ''; };
    const drawFoot = () => {
      foot.innerHTML = '<span class="modal-error" role="alert"></span>'
        + (cancel ? `<button type="button" class="btn ghost" data-dismiss>${esc(cancel)}</button>` : '')
        + acts.map((a) => `<button type="${a.primary ? 'submit' : 'button'}" class="btn${a.primary || a.tone ? ' primary' : ''}${a.tone ? ' ' + esc(a.tone) : ''}">${esc(a.label)}</button>`).join('');
      [...foot.querySelectorAll('.btn:not([data-dismiss])')].forEach((b, i) => { b.__dashAct = acts[i]; });
      foot.hidden = !cancel && !acts.length;
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
        error(err && err.message ? err.message : String(err));
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
    const handle = { el: d, body: bodyEl, fields, update, error, close, closed };
    drawFoot();
    update({ title, text, body });
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
    if (nativePop) box.setAttribute('popover', 'auto'); else box.hidden = true;
    let done = false;
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
      box.addEventListener('beforetoggle', (e) => { if (e.newState === 'closed' && !own) shutByPress(); });
      box.addEventListener('toggle', (e) => { if (e.newState === 'closed') finish(null); });
      try { box.showPopover(); } catch { /* not in the page */ }
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

  // ---- a text box with suggestions (1.9)
  // Dash.combobox(input, { options, onPick }): options is a list (strings, or { value, label, sub }), or a function
  // (query) => a list or a promise of one, asked as the reader types (for a server search). The suggestions open as the
  // reader types, or on ArrowDown or a click; arrows move, Enter or a click picks, Escape or Tab closes. What's typed
  // stays unless strict: true, which puts the last pick back (or empties the box) when it matches no suggestion.
  // Returns { value (the picked option), set(value), close(), destroy() }.
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
    // the typed words in bold where they are in a suggestion
    const marked = (text, q) => {
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
        ? shown.map((o, i) => `<div class="combo-option" role="option" id="${box.id}-${i}" data-i="${i}" aria-selected="false"><span>${marked(o.label, q)}</span>`
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
        if (exact) { picked = exact; input.value = exact.label; if (onPick) onPick(exact); } else input.value = picked ? picked.label : '';
      }
    });
    input.addEventListener('input', onInput);
    input.addEventListener('click', onClick);
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
    box.addEventListener('pointerdown', (e) => e.preventDefault()); // the box keeps the focus
    box.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) pick(Number(o.dataset.i)); });
    box.addEventListener('mousemove', (e) => { const o = e.target.closest('[data-i]'); if (o && Number(o.dataset.i) !== active) move(Number(o.dataset.i)); });
    return {
      get value() { return picked; },
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
    btn.addEventListener('click', onBtn);
    input.addEventListener('change', onChange);
    input.addEventListener('keydown', onKey);
    return {
      get value() { const d = value(); return d && inRange(d) ? isoDay(d) : null; },
      set: (iso) => { const d = dayOf(iso); input.value = d ? isoDay(d) : ''; onChange(); },
      open, close,
      destroy: () => { close(); btn.remove(); wrap.replaceWith(input); input.removeEventListener('change', onChange); input.removeEventListener('keydown', onKey); },
    };
  };

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
    if (tipFor) tipFor.removeAttribute('aria-describedby');
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
    if (tipFor && tipFor !== target) tipFor.removeAttribute('aria-describedby');
    tipFor = target;
    tipEl.textContent = text;
    tipEl.hidden = false;
    target.setAttribute('aria-describedby', 'dash-tooltip');
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

    // the sticky top bar's height, for things that stick under it (0 when it scrolls away, as on phones)
    const syncTopbar = () => {
      const bar = document.querySelector('.topbar');
      const h = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    };
    const ready = () => {
      Dash.theme.apply();
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

    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (!t.closest) return;
      const menu = t.closest('details.menu');
      closeMenus(menu);
      if (menu && t.closest('.menu-list') && t.closest('button, a, [data-value]')) menu.open = false; // an item was chosen
      let hit;
      if ((hit = t.closest('.ip[data-ip]'))) {
        toggleIp(hit);
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
        const shells = document.querySelectorAll('.shell');
        const rail = !(shells[0] && shells[0].classList.contains('collapsed'));
        for (const s of shells) s.classList.toggle('collapsed', rail);
        hit.setAttribute('aria-expanded', String(!rail));
        Dash.store.set(Dash.config.sideKey, rail ? 'rail' : 'open');
        document.dispatchEvent(new CustomEvent('dash:side', { detail: { collapsed: rail } })); // for pages that lay out by it
      } else if ((hit = t.closest('[data-popup]'))) {
        const src = document.getElementById(hit.dataset.popup);
        if (src) Dash.popup(hit, src.tagName === 'TEMPLATE' ? src.content.cloneNode(true) : src.innerHTML);
      } else if ((hit = t.closest('[data-dismiss]'))) {
        const pop = popups.slice().reverse().find((p) => p.el.contains(hit));
        const box = hit.closest('dialog, .notice, [data-dismissable]');
        if (pop) pop.close(); else if (box && box.tagName === 'DIALOG') box.close(); else if (box) box.remove();
      } else if (t.tagName === 'DIALOG' && t.matches('.dialog, .drawer, .modal') && lastPress.target === t
        && !/^(none|closerequest)$/i.test(t.getAttribute('closedby') || '')) {
        // a click on the backdrop (outside the box) closes it, when the press started there too: not a drag out of a field
        const r = t.getBoundingClientRect();
        const out = (x, y) => x < r.left || x > r.right || y < r.top || y > r.bottom;
        if (out(e.clientX, e.clientY) && out(lastPress.x, lastPress.y)) t.close();
      }
    });
    // the last press: where a click started, and (with no popovers in the browser) a press outside a popup closes it
    document.addEventListener('pointerdown', (e) => {
      lastPress = { target: e.target, x: e.clientX, y: e.clientY, seq: lastPress.seq + 1 };
      if (!nativePop) for (const p of popups.slice().reverse()) if (!p.el.contains(e.target)) p.dismiss();
    }, true);
    document.addEventListener('click', (e) => {
      clickOf = e.detail ? lastPress.seq : -1; // a click from a key (detail 0) has no press
      setTimeout(() => { clickOf = -1; });
    }, true);
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
      if (t === open || (t.closest('.sidebar') && t.closest('a[href], .nav-item') && open.contains(t))) sideDrawer(open, false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.shell.offcanvas.side-open');
      if (open && !popups.length && !document.querySelector('dialog[open], details.menu[open]')) { e.preventDefault(); sideDrawer(open, false); }
    });
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
