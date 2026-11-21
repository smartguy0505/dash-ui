/* dash-ui helpers: formatting, small HTML builders, charts, toasts, fetch and polling for the dashboards.
   A plain script with no dependencies: a script tag for dash.js in <head> gives window.Dash, and puts the
   saved light/dark choice on the page before it paints. In Node, require('./dash.js') returns the same object
   (the parts that need a page are skipped).

   House idiom: builders return HTML strings with every value escaped; pages put them in with innerHTML and
   handle clicks with one listener on a parent (data- attributes say what was clicked). */
(function (root) {
  'use strict';
  const hasDom = typeof document !== 'undefined';
  const Dash = { version: '1.0.0', config: { loginUrl: null, themeKey: 'dash.theme', sideKey: 'dash.side' } };

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
  fmt.signedUsd = (n) => {
    if (!isNum(n)) return NONE;
    const v = Number(n);
    if (Math.abs(v) < 0.005) return '$0.00';
    return (v > 0 ? '+' : '−') + fmt.usd(Math.abs(v));
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
  fmt.plural = (n, word, many = word + 's') => `${fmt.int(n)} ${Number(n) === 1 ? word : many}`;
  Dash.fmt = fmt;

  // ---- small HTML builders (all escape their text)

  const toneClass = (tone) => (tone ? ' ' + esc(tone) : '');
  Dash.pill = (text, tone, { dot = true, title } = {}) =>
    `<span class="pill${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}>${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
  Dash.tag = (text, tone, { title } = {}) => `<span class="tag${toneClass(tone)}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  // a signed change in its colour: Dash.chg(1.5, '+1.5 τ')
  Dash.chg = (v, text = fmt.signed(v)) => `<span class="chg ${fmt.dir(v)}">${esc(text)}</span>`;
  // a medal for the top three, a plain rank below: Dash.rank(2, 14) → "#2 of 14"
  Dash.rank = (pos, of, { title } = {}) => {
    if (!pos) return `<span class="rank"${title ? ` title="${esc(title)}"` : ''}>unranked</span>`;
    const medal = ['', ' gold', ' silver', ' bronze'][pos] || '';
    return `<span class="rank${medal}"${title ? ` title="${esc(title)}"` : ''}>#${esc(pos)}${of ? `<span>of ${esc(of)}</span>` : ''}</span>`;
  };
  Dash.copyButton = (text, label = 'Copy') => `<button type="button" class="btn sm" data-copy="${esc(text)}">${esc(label)}</button>`;

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
  Dash.th = (label, key, sort, { num = false, title, cls = '' } = {}) => {
    const on = sort && sort.key === key;
    const classes = [num ? 'num' : '', cls].filter(Boolean).join(' ');
    return `<th${classes ? ` class="${esc(classes)}"` : ''}${on ? ` aria-sort="${sort.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>`
      + `<button type="button" data-sort="${esc(key)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button></th>`;
  };
  // Sort state that remembers itself. A click on the sorted column flips it; a new column starts with its own direction.
  // const sort = Dash.sorter({ key: 'value', dir: 'desc', store: 'wallets.sort', firstDir: { name: 'asc' } })
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
  Dash.bars = (points, { height = 150, format = fmt.compact, max, ticks = 2, labelEvery = 1, minorEvery = 0 } = {}) => {
    const top = max ?? Dash.niceMax(Math.max(0, ...points.map((p) => Number(p.value) || 0)));
    const grid = Array.from({ length: ticks }, (_, i) => {
      const v = (top * (i + 1)) / ticks;
      return `<div class="chart-grid" style="top:${+(100 - (v / top) * 100).toFixed(2)}%"><span>${esc(format(v))}</span></div>`;
    }).join('');
    const cols = points.map((p) => {
      const v = Number(p.value) || 0;
      const cls = ['chart-col', p.tone || '', v === 0 ? 'zero' : '', p.partial ? 'partial' : ''].filter(Boolean).join(' ');
      const tip = p.title ?? `${p.label}: ${format(v)}`;
      return `<div class="${esc(cls)}" title="${esc(tip)}"><i style="height:${+pctOf(v, top).toFixed(2)}%"></i></div>`;
    }).join('');
    const n = points.length;
    const xs = points.map((p, i) => {
      const show = i % labelEvery === 0 || i === n - 1;
      const pos = i === 0 ? 'start' : i === n - 1 ? 'end' : '';
      const minor = minorEvery && i % minorEvery !== 0 ? 'minor' : '';
      return `<span class="${[pos, minor].filter(Boolean).join(' ')}">${show ? `<b>${esc(p.label)}</b>` : ''}</span>`;
    }).join('');
    return `<div class="chart"><div class="chart-plot" style="--chart-h:${height}px">${grid}<div class="chart-cols">${cols}</div></div><div class="chart-x">${xs}</div></div>`;
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
  Dash.poll = (fn, ms, { hiddenMs = ms * 4 } = {}) => {
    let timer = null;
    let running = false;
    let stopped = false;
    const run = async () => {
      clearTimeout(timer);
      if (running || stopped) return;
      running = true;
      try { await fn(); } catch (err) { console.warn('Dash.poll:', err); } finally {
        running = false;
        if (!stopped) timer = setTimeout(run, document.hidden ? hiddenMs : ms);
      }
    };
    const onShow = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onShow);
    run();
    return { now: run, stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); } };
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
  // const view = Dash.seg('filter', { store: 'wallets.filter', onChange: (v) => render() }); view.value
  Dash.seg = (target, { value, store, onChange } = {}) => {
    const node = el(target);
    const buttons = () => [...node.querySelectorAll('[data-value]')];
    const values = buttons().map((b) => b.dataset.value);
    let current = store && values.includes(Dash.store.get(store)) ? Dash.store.get(store)
      : values.includes(value) ? value : (buttons().find((b) => b.getAttribute('aria-pressed') === 'true') || buttons()[0] || {}).dataset?.value;
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
      let hit;
      if ((hit = t.closest('.ip[data-ip]'))) {
        toggleIp(hit);
      } else if ((hit = t.closest('[data-theme-set]'))) {
        Dash.theme.set(hit.dataset.themeSet);
      } else if ((hit = t.closest('[data-copy]'))) {
        const ok = await Dash.copy(hit.dataset.copy);
        Dash.toast(ok ? 'Copied' : 'Couldn’t copy', { tone: ok ? '' : 'bad', ms: 1600 });
        if (ok && !hit.classList.contains('copied')) {
          const label = hit.innerHTML;
          hit.classList.add('copied');
          if (hit.classList.contains('btn')) hit.textContent = 'Copied ✓';
          setTimeout(() => { hit.classList.remove('copied'); if (hit.classList.contains('btn')) hit.innerHTML = label; }, 1400);
        }
      } else if ((hit = t.closest('[data-toggle-side]'))) {
        const shells = document.querySelectorAll('.shell');
        const rail = !(shells[0] && shells[0].classList.contains('collapsed'));
        for (const s of shells) s.classList.toggle('collapsed', rail);
        hit.setAttribute('aria-expanded', String(!rail));
        Dash.store.set(Dash.config.sideKey, rail ? 'rail' : 'open');
      } else if ((hit = t.closest('[data-dismiss]'))) {
        const box = hit.closest('dialog, .notice, [data-dismissable]');
        if (box && box.tagName === 'DIALOG') box.close(); else if (box) box.remove();
      } else if (t.tagName === 'DIALOG' && (t.classList.contains('drawer') || t.classList.contains('dialog'))) {
        // a click on the backdrop (outside the box) closes it
        const r = t.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      const ip = e.target.closest && e.target.closest('.ip[data-ip]');
      if (ip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleIp(ip); }
    });
  }

  if (typeof module === 'object' && module.exports) module.exports = Dash;
  else root.Dash = Dash;
})(typeof globalThis !== 'undefined' ? globalThis : this);
