/* dash-ui 1.3.0 helpers: formatting, small HTML builders, charts, toasts, fetch and polling for the dashboards.
   A plain script with no dependencies: a script tag for dash.js in <head> gives window.Dash, and puts the
   saved light/dark choice on the page before it paints. In Node, require('./dash.js') returns the same object
   (the parts that need a page are skipped).

   House idiom: builders return HTML strings with every value escaped; pages put them in with innerHTML and
   handle clicks with one listener on a parent (data- attributes say what was clicked). */
(function (root) {
  'use strict';
  const hasDom = typeof document !== 'undefined';
  const Dash = { version: '1.3.0', config: { loginUrl: null, themeKey: 'dash.theme', sideKey: 'dash.side' } };

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
  // a date: Nov 21 (this year), Nov 21, 2025 (another year); { utc: true } for the date in UTC
  fmt.date = (t, { utc = false } = {}) => {
    const d = dateOf(t);
    if (t == null || !valid(d)) return NONE;
    const year = utc ? d.getUTCFullYear() : d.getFullYear();
    return d.toLocaleDateString(utc ? 'en-US' : [], { month: 'short', day: 'numeric', ...(year !== new Date().getFullYear() ? { year: 'numeric' } : {}), ...(utc ? { timeZone: 'UTC' } : {}) });
  };
  // a time of day with seconds: 14:05:09; { seconds: false } for 14:05, { utc: true } for 14:05:09 UTC
  fmt.time = (t, { seconds = true, utc = false } = {}) => {
    const d = dateOf(t);
    if (t == null || !valid(d)) return NONE;
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
  // Numbers stay plain numbers; text a spreadsheet would run as a formula (starting =, +, -, @) gets a leading '.
  Dash.csv = (rows, columns) => {
    const cols = (columns || Object.keys(rows[0] || {})).map((c) => (typeof c === 'string' ? { key: c, label: c } : c));
    const cell = (v) => {
      if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
      if (typeof v === 'number') return String(v);
      let t = v instanceof Date ? v.toISOString() : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
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
      shown = p.rows;
      const head = columns.map((c) => Dash.th(c.label, c.sort === false ? null : c.key, sorter, { num: c.num, title: c.title, cls: c.cls, unit: c.unit })).join('');
      const body = shown.length ? shown.map((r, i) => {
        const k = key == null ? null : typeof key === 'function' ? key(r) : r[key];
        const classes = [onRow ? 'click' : '', rowClass ? rowClass(r) : ''].filter(Boolean).join(' ');
        return `<tr data-i="${i}"${k != null ? ` data-key="${esc(k)}"` : ''}${classes ? ` class="${esc(classes)}"` : ''}${onRow ? ' tabindex="0"' : ''}>${columns.map((c) => cell(c, r)).join('')}</tr>`;
      }).join('') : `<tr class="empty-row"><td colspan="${columns.length}">${esc(empty)}</td></tr>`;
      const table = `<table class="table${cls ? ' ' + esc(cls) : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      return (wrap ? `<div class="table-wrap">${table}</div>` : table) + (size ? Dash.pager(p, { noun, sizes }) : '');
    };
    const draw = (force = false) => Dash.render(node, html(), { force });
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
  // a bar filled to frac (0–1)
  Dash.bar = (frac, tone, { title, cls = '' } = {}) =>
    `<span class="bar${cls ? ' ' + esc(cls) : ''}${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}><i style="${w(pctOf(frac, 1))}"></i></span>`;
  Dash.meter = (frac, tone) => `<span class="meter${toneClass(tone)}"><i style="${w(pctOf(frac, 1))}"></i></span>`;
  // parts of a whole side by side: [{ value, tone, label }]
  Dash.split = (parts) => {
    const total = parts.reduce((s, p) => s + Math.max(0, Number(p.value) || 0), 0);
    return `<div class="split">${parts.map((p) => `<i class="${esc(p.tone || '')}" style="${w(pctOf(p.value, total))}"${p.label ? ` title="${esc(p.label)}"` : ''}></i>`).join('')}</div>`;
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
      return `<div class="chart-grid" style="top:${+(100 - (v / top) * 100).toFixed(2)}%"><span>${esc(format(v))}</span></div>`;
    }).join('');
    const cols = points.map((p) => {
      const v = total(p);
      const cls = ['chart-col', p.tone || '', v === 0 ? 'zero' : '', p.partial ? 'partial' : '', p.parts ? 'stacked' : ''].filter(Boolean).join(' ');
      const tip = p.title ?? `${p.label}: ${format(v)}`;
      const parts = p.parts && v ? p.parts.filter((x) => Number(x.value) > 0).map((x) => `<u${x.tone ? ` class="${esc(x.tone)}"` : ''} style="flex-grow:${+Number(x.value).toPrecision(6)}"></u>`).join('') : '';
      return `<div class="${esc(cls)}" title="${esc(tip)}"><i style="height:${+pctOf(v, top).toFixed(2)}%">${parts}</i></div>`;
    }).join('');
    const n = points.length;
    const xs = points.map((p, i) => {
      const show = i % labelEvery === 0 || i === n - 1;
      const pos = i === 0 ? 'start' : i === n - 1 ? 'end' : '';
      const minor = minorEvery && i % minorEvery !== 0 ? 'minor' : '';
      return `<span class="${[pos, minor].filter(Boolean).join(' ')}">${show ? `<b>${esc(p.label)}</b>` : ''}</span>`;
    }).join('');
    const head = read == null ? '' : `<div class="chart-read" data-default="${esc(read)}">${esc(read)}</div>`;
    return `<div class="chart"${read == null ? '' : ' data-read'}>${head}<div class="chart-plot" style="--chart-h:${height}px">${grid}<div class="chart-cols">${cols}</div></div><div class="chart-x">${xs}</div></div>`;
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
    const dot = `<span class="dot${toneClass(tone || 'blue')}" style="position:absolute;left:calc(${(ex / width * 100).toFixed(2)}% - 3.5px);top:calc(${(ey / height * 100).toFixed(2)}% - 3.5px);width:7px;height:7px"></span>`;
    const under = labels ? `<div class="spark-labels"><span>${esc(labels[0] ?? '')}</span><span>${esc(labels[1] ?? '')}</span></div>` : '';
    return `<div style="position:relative">${svg}${dot}</div>${under}`;
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
  Dash.toast = (msg, { tone = '', ms = 2400 } = {}) => {
    if (!toastEl) {
      toastEl = Object.assign(document.createElement('div'), { className: 'toast' });
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast' + toneClass(tone);
    void toastEl.offsetWidth; // restart the transition when one toast replaces another
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  };

  // an alert in the corner that stays until dismissed (or ms runs out): something that started needing you.
  // Dash.notify({ key: id, title: 'agent-7', status: 'needs you', text: 'Approve the edit?', tone: 'orange', onClick })
  // A second notify with the same key replaces the first. Dash.notify.dismiss(key) takes it away.
  let noticeBox = null;
  Dash.notify = ({ key, title = '', status = '', text = '', tone = 'orange', onClick, ms = 0, max = 4 } = {}) => {
    if (!noticeBox) {
      noticeBox = Object.assign(document.createElement('div'), { className: 'notices' });
      noticeBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(noticeBox);
    }
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
    d.addEventListener('close', () => {
      const fields = Object.fromEntries(new FormData(d.querySelector('form')));
      resolve({ value: d.returnValue || null, fields });
      d.remove();
    });
    d.showModal();
    const first = focus ? d.querySelector(focus) : d.querySelector('input, select, textarea');
    if (first) first.focus();
  });
  // Yes or no: if (await Dash.confirm('Delete 3 rules?', { ok: 'Delete', tone: 'bad' })) …  (Cancel has the focus)
  Dash.confirm = async (text, { title = '', ok = 'OK', cancel = 'Cancel', tone } = {}) => (await Dash.dialog({
    title: title || text, text: title ? text : '', cancel, actions: [{ label: ok, value: 'ok', primary: true, tone }], focus: '[data-dismiss]',
  })).value === 'ok';
  // One line of text, or null: const name = await Dash.ask('New name', { value: old, placeholder: 'web-1' })
  Dash.ask = async (title, { text = '', value = '', placeholder = '', ok = 'OK', cancel = 'Cancel', required = true, type = 'text' } = {}) => {
    const r = await Dash.dialog({
      title, text, cancel, actions: [{ label: ok, value: 'ok', primary: true }],
      body: `<input class="input dialog-input" name="answer" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}>`,
    });
    return r.value === 'ok' ? r.fields.answer : null;
  };

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
    if (store) { const saved = Dash.store.get(store); if (typeof saved === 'string') input.value = saved; }
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

  // ---- menus and tooltips (wired below; no code needed)
  //
  // A menu: <details class="menu"><summary class="btn">Actions</summary><div class="menu-list">
  //   <button type="button">Rename</button><hr><button type="button" class="bad">Delete</button></div></details>
  // It closes on a click outside, on Escape (back to its button) and once an item is chosen; .menu.end opens leftwards.
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
      document.body.appendChild(tipEl);
    }
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
      } else if ((hit = t.closest('[data-toggle-side]'))) {
        const shells = document.querySelectorAll('.shell');
        const rail = !(shells[0] && shells[0].classList.contains('collapsed'));
        for (const s of shells) s.classList.toggle('collapsed', rail);
        hit.setAttribute('aria-expanded', String(!rail));
        Dash.store.set(Dash.config.sideKey, rail ? 'rail' : 'open');
        document.dispatchEvent(new CustomEvent('dash:side', { detail: { collapsed: rail } })); // for pages that lay out by it
      } else if ((hit = t.closest('[data-dismiss]'))) {
        const box = hit.closest('dialog, .notice, [data-dismissable]');
        if (box && box.tagName === 'DIALOG') box.close(); else if (box) box.remove();
      } else if (t.tagName === 'DIALOG' && (t.classList.contains('drawer') || t.classList.contains('dialog'))) {
        // a click on the backdrop (outside the box) closes it
        const r = t.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
      }
    });
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
        const open = document.querySelector('details.menu[open]');
        if (open) { closeMenus(); open.querySelector('summary')?.focus(); }
      }
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
