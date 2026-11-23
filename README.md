# dash-ui

The look of my dashboards (an agent monitor, a fleet monitor, a leaderboard, a payout page and a balances page) as one kit:

- **`dash.css`**: the colour tokens, light and dark, and every component;
- **`dash.js`**: the formatters, small HTML builders, inline charts, toasts and fetch/poll helpers those pages kept rewriting.

It's plain CSS and one plain script: no build step, no dependencies, no framework. A page links the two files (or pastes them in) and writes ordinary HTML.

| | |
|---|---|
| `index.html` | every component, with made-up data, light and dark |
| `examples/overview.html` | an agent-dash style page: top-bar limits, a collapsible sidebar, donut, gauges, column chart, cards |
| `examples/portfolio.html` | balances and payout style: hero number, stats, toolbar, sortable paged table, editor dialog, live updates |
| `examples/fleet.html` | fleet and leaderboard style: status banner, server cards, timeline lanes, leaderboard with server rows and a drawer |
| `examples/login.html` | the sign-in page |
| `examples/starter.html` | the smallest useful page; copy it to start a new dashboard |

To look at them:

```sh
python3 -m http.server 8096 --bind 127.0.0.1    # in this folder
ssh -L 8096:127.0.0.1:8096 <this server>         # from your machine, then open http://127.0.0.1:8096/
```

## Using it

```html
<head>
  <link rel="stylesheet" href="dash.css">
  <script src="dash.js"></script>   <!-- in <head>: puts the saved light/dark choice on before the page paints -->
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="mark">M</span><h1>My dashboard</h1></div>
    <span class="sub">what it watches</span>
    <div class="top-right"><span id="live"></span></div>
  </header>
  <main class="page">
    <div class="stats" id="stats"></div>
    <div class="panel"><div class="panel-head"><h3>Items</h3></div><div id="table"></div></div>
  </main>
  <script>
    const table = Dash.table('table', {            // sortable, cards on a phone, keeps the reader's place
      columns: [
        { key: 'name', label: 'Name', main: true },
        { key: 'value', label: 'Value', num: true, format: (v) => Dash.fmt.compact(v) },
        { key: 'at', label: 'Updated', html: (i) => Dash.ago(i.at) },   // "12 min ago", kept current
      ],
      sort: { key: 'value', dir: 'desc', store: 'items.sort' },
    });
    Dash.poll(async () => {                        // now, then every 15 s, again when the tab comes back
      const items = await Dash.api('api/items');   // a failure shows in the top bar; it keeps retrying
      Dash.render('stats', Dash.stat('Items', items.length) + Dash.stat('Total', Dash.fmt.compact(Dash.sum(items, 'value'))));
      table.update(items);
    }, 15000, { live: 'live' });                   // live: the top bar's status follows by itself
  </script>
</body>
```

`examples/starter.html` is this page, working.

Four habits keep a dashboard short:

- **`Dash.render(id, html)` instead of `innerHTML =`** for anything that refreshes. It writes only when the HTML changed, waits while the reader is selecting text there, and keeps the focused control (and what's typed in it), open `<details>` and inner scroll positions. Give elements that should keep their state an `id` or a `data-key`. Pass `{ force: true }` to write anyway.
- **`Dash.poll(fn, ms, { live: 'live' })`** runs the top bar's status for you: Connecting…, Live, the error (and it keeps retrying), or "No update since 14:05" when updates stop.
- **`Dash.table(id, { columns })`** for a list: sorting, paging, a search filter, CSV, cards on phones and an empty state, from one description of the columns.
- **Attributes instead of handlers:** `data-copy`, `data-tooltip`, `data-toggle-side`, `data-theme-set` and `data-dismiss` work with no code, and so does a `<details class="menu">` (see the end of the dash.js section).

**A page that must be one file** (a server that sends only the page): put `<style id="dash-ui-css"></style>` and `<script id="dash-ui-js"></script>` in its `<head>`, then run `python3 tools/paste.py page.html` to fill them, and again after the kit changes. `--check` says whether a page's copy is current. Nothing in either file refers to the other or to a path.

**Copies and versions:** a dashboard keeps its own copy of the two files (the balances dashboard has them in `public/dash-ui/`). The first line of each file names the version, and `CHANGELOG.md` says what each version added. Versions only add things, so a newer copy can replace an older one. When a page needs something the kit lacks, add it here, then copy the files again; don't edit a copy.

## The look

These are the rules the five dashboards settled on and the user approved ("looks good, I like that style and color").

- **Colour:** warm neutral backgrounds (`#f5f4ef` light, `#151514` dark) with white or near-black panels. The page follows the system light/dark setting unless the person picks one.
- **Surfaces:** panels and cards have a 14 px radius, a 1 px line and a soft shadow (no shadow in dark).
- **Status:** colour is a tint behind coloured text, `color-mix(in srgb, var(--c) 12%, var(--card))`. Pills show statuses, small rounded tags show facts.
- **Chrome:** a slim one-line top bar, never a boxed one. No heavy chrome.
- **Type:** 15 px base text. Numbers are always `tabular-nums`. Section titles are small uppercase muted labels.
- **Charts:** inline SVG or CSS in the page's own colours. No chart libraries.
- **Phones:** the top bar stops sticking, and tables turn into one small card per row.
- **Copying:** reuse these classes and tokens; don't add new colours or one-off styles.

## Colours

Surfaces and text: `--bg`, `--card`, `--soft` (a block inside a card, table headers), `--line`, `--text`, `--muted`, `--faint`.

| tone | light | dark | used for |
|---|---|---|---|
| `accent` | `#c96442` | `#e08a68` | Claude's colour, shares |
| `blue` | `#2158d4` | `#7ba7ff` | working, links, focus, selection, default bars |
| `ok` | `#157838` | `#4ade80` | healthy, paid, up |
| `warn` | `#a84e08` | `#f0b04a` | stale, probation, outside the cut |
| `bad` | `#c81e1e` | `#ff7d7d` | errors, incidents, blocked, down |
| `orange` | `#b83e0b` | `#ff9b55` | needs you (agent-dash's "waiting"; deliberately not `warn`) |
| `teal` | `#0f766e` | `#42d3bf` | a second series, running |
| `purple` | `#6d3fd1` | `#b79dff` | shell |
| `pink` | `#b5179e` | `#f28fd8` | ultra |
| `gold` `silver` `bronze` | `#965b07` … | `#f0c04a` … | medals, USD |
| `idle` | `#6b6862` | `#a7a59e` | idle, closed |
| `neutral` | `--muted` | | default grey |

**Contrast:** every tone clears WCAG AA (4.5:1) as text on a card and inside its own tinted pill, tag or rank (10–14 % tints), light and dark. `accent` (3.9:1) and `faint` (3.5:1) are not meant for body text. A test keeps it that way.

**How colour reaches a component:** every coloured component draws with one variable, `--c`, and a tone class sets it. So `<span class="pill ok">`, `<span class="tag teal">`, `<div class="panel ring bad">`, `<span class="bar warn">` and `<span class="dot orange">` all work the same way.

- Components set their own default with `:where()`, so any tone class wins.
- A `.dot`, or text with `.tone`, takes the colour of the pill, card or row it sits in.
- `up`, `down` and `flat` are tones too, for changes.

**Light and dark:** `<html data-theme="light|dark">` forces one; no attribute follows the system. `Dash.theme` remembers the choice (`localStorage` `dash.theme`). Buttons with `data-theme-set="system|light|dark"` switch it. The dark palette is written twice in `dash.css`, and a test keeps the two copies equal.

**Names used by the existing dashboards:** they all use the same values under different names. To move one over, rename:

| dash-ui | was |
|---|---|
| `--ok` | `--green` (payout, leaderboard) |
| `--bad` | `--red` (payout, leaderboard), `--hot` (fleet), `--error` (agent-dash) |
| `--warn` | `--amber` (payout, leaderboard) |
| `--teal` | `--running` (agent-dash), the second series colour (payout, balances) |
| `--purple` | `--shell` (agent-dash) |
| `--orange` | `--waiting` (agent-dash) |
| `--blue` | `--busy` (agent-dash), the first series colour (balances) |
| `--pink` | `--ultra` (agent-dash) |
| `--gold` | `--usd` (payout) |
| `--mono` | `--font-mono` (payout, leaderboard) |

## Layout

| class | what |
|---|---|
| `.topbar` | Slim, sticky top bar (static on phones; `.topbar.static-md` is static from 900 px down, for a page whose sidebar stacks on top there). Holds `.brand` (`.mark` logo square, `h1`), `.sub`, `.top-right` (pushed right), `.top-link`, `.live`, `.topstat` (a reading with a `.meter`). |
| `.page` | The content column: 1320 px max, 24 px gutters. `.page.wide` is 1480 px, `.page.narrow` 1000 px. |
| `.page-head`, `.page-title`, `.page-note` | Page heading, 22 px. |
| `.section`, `.section-head`, `.section-title`, `.kicker` | Sections with small uppercase titles. |
| `.shell` > `.sidebar` + `.content` | Sidebar layout. `.shell.collapsed` makes the sidebar a rail of icons; a `[data-toggle-side]` button switches it and it's remembered. Inside: `.side-head`, `.count-badge`, `.nav-item` (`.nav-icon`, `.nav-main` › `.nav-name` + `.nav-sub`, `.nav-meta`; `aria-current="true"` marks the selected item, `.attn` tints it). |
| `.grid` | Equal columns: `style="--cols:3"`, `.span-2`. One column below 900 px. Panels in a grid of your own: add `grid` to it too, so the panels lose the margin they get when stacked. |
| `.cards` | Auto-filling card grid, `--card-min` (300 px) per card. |
| `.stats` | Auto-fitting stat tiles, `--stat-min` (180 px); two across on a phone (`--stat-min-sm`, 140 px; `100%` for one per row). |
| `.toolbar` | Search, filters and buttons above a table. |
| `.row`, `.vstack`, `.grow`, `.push` | Flex row, vertical stack, fill, push right. |
| `.footer` | Muted small print. |

**Breakpoints:** 900 px (the sidebar goes on top, grids and the hero go to one column, open tables scroll, `.stack-md` tables become cards), 640 px (phones: static top bar, `.hide-sm`, stacked tables, two stats across).

## Components

**Surfaces**
- `.panel`: a section, with `.panel-head` (`h3`, `.read` on the right, or a `.seg`/`.btn` last) and `.panel-note`. `.panel.flush` has no padding.
- `.card`: one of many in `.cards`, with `.card-head`, `.card-title`, `.card-sub` and `.card-foot`.
- `.stat`: `.label`, `.value` (with `small` for a unit) and `.note` (one line; `.note.wrap` may run to two). A `button.stat` can be clicked. `.stats.fixed` puts exactly `--stat-cols` (4) tiles across, two from 900 px down.
- `.hero` and `.big`: the one big number on the page, with `.hero-line` under it.
- `.ring`: an orange ring for something that needs attention. Add a tone to change the colour: `.ring bad`.
- `.banner`: the status line with a big dot. `.active` pulses, so `.banner.active.bad` means an incident is on now. It holds `.badge`, `.banner-title` and `.banner-text`.
- `.callout`: a soft block, or a tinted one with a tone, with a `.callout-title`. `.callout.solid` is coloured text on its own.
- `.kv`: a definition grid. `.facts` is a line of facts with dots between them.
- `.empty`, `.empty.boxed` (dashed) and `.empty-title`: empty states.
- `.skel`, `.skel.wide/.mid/.short`: loading lines.
- `.tabs`: a row of tab buttons over panels (`Dash.tabs` shows one panel at a time). A `.count-badge` in a tab holds a count.
- `.timeline`: events on a line (`Dash.timeline` builds it), with a dot in each event's tone. The dots and the line stay in high contrast, in the text colour.

**Labels**
- `.pill`: a status, usually with a `.dot` (`.dot.pulse`, `.dot.hollow`). `.pill.lg` is the size of the 24 h change.
- `.tag`: a small fact. `.tag.plain` is neutral, `.tag.outline` has a ring instead of a tint. Group them in `.tags`.
- `.rank`: "#2 of 14", in medal colours for the top three (`Dash.rank` builds it).
- `.chip`: a pill with a border. A `button.chip` with `aria-pressed` is a choice. Group them in `.chips`, or `.chips.scroll` for one sideways-scrolling line.
- `.chg` with `.up`, `.down` or `.flat`: a signed change in its colour.
- Text utilities: `.muted`, `.faint`, `.strong`, `.sub`, `.mono`, `.num`, `.unit` (a unit after a number: `12.5 <span class="unit">ms</span>`), `.ellipsis`, `.clamp` (`--lines`), `.invisible` (hidden, keeps its space), `kbd`, `code`.

**Controls**
- `.btn`: also `.primary` (text-coloured; `.primary.blue` for a blue one), `.ghost`, `.danger`, `.sm`, `.round` and `.block`. `.btn.busy` spins its icon; `aria-busy="true"` (what `Dash.busy` sets) puts a spinner before the label.
- `.spinner`: a loading ring on its own, `.spinner.lg` a bigger one; a tone colours it (`<span class="spinner blue" role="status" aria-label="Loading"></span>`).
- `.icon-btn`: a 28 px icon button. `aria-expanded` turns its chevron (not on a button that opens a popup, which has `aria-haspopup`); `.danger` turns it red on hover.
- `.link`: a button that looks like a link. `.link.quiet` is muted.
- `.seg`: a segmented control.
  - Buttons with `aria-pressed` are a choice; links with `aria-current="page"` are views.
  - `.seg.lg` is for top-bar view tabs.
  - `.seg.solid` is the bordered look from the payout and leaderboard dashboards.
  - A `<span>` inside a button holds a count.
- `.input`: text, select and textarea. `.input.mono` is for addresses.
- `.search` wraps an `.input` with an icon `svg` and an optional `.count` (typed text stops 100 px from the right; `--count-w` for a longer count).
- `.field`: a label, an `.input`, then `.hint` or `.err`. `.field.invalid` turns it red.
- `.switch`: `<label class="switch"><input type="checkbox"><span class="track"></span> Label</label>`.
- `.checkline`, and `details > summary`.
- `.menu`: `<details class="menu"><summary class="btn">Actions</summary><div class="menu-list">…</div></details>`. The list holds buttons and links, `<hr>` and `.menu-label`; a tone on an item colours it (`class="bad"`). `.menu.end` opens leftwards. It closes on a click outside, on Escape (only the menu, inside a dialog too) and once an item is chosen. Inside a sideways-scrolling `.table-wrap` the list gets cut off: there, use `Dash.menu`, which draws the same list above everything.
- `data-tooltip="text"`: a tooltip on hover and keyboard focus, kept inside the window, in an open dialog or popup too. Use it for a word or a line; a `title` is enough for long text.
- `.popup` (`Dash.popup`, `Dash.menu`, `data-popup`): a box beside a button, above everything. Inside it, `.popup-title`, `.popup-text` and `.popup-actions` give a small question or note its shape.

**Tables**
- `.table` inside a `.panel` has a rounded header strip. Wrap it in `.table-wrap` to make the table its own card.
- Sort headers: `<th aria-sort="descending"><button data-sort="key">` (`Dash.th` writes these). `th.num` and `td.num` align right. A `.unit` in a header isn't uppercased, so ms stays ms.
- `.table.compact`: 8 px between columns instead of 12, for a table with many of them.
- `td.actions` (and `th.actions`): a row's buttons, at the right and as narrow as they are. On a stacked card they sit in its top-right corner; `--actions-w` on the table (96 px) keeps the title clear of them.
- Row states:
  - `tr.marked`: a bar on the left plus a tint, blue unless a tone is added;
  - `tr.dim`;
  - `tr.sub`: rows that belong to the one above;
  - `tr.group`: a heading row;
  - `tr.cut`: a dashed cut line;
  - `tr.click`: pointer cursor;
  - `.empty-row`.
- `.table.stack` turns each row into a small card on phones. Give each `td` a `data-label`; the `td.main` cell is the row's title. Add `.stack-md` to do it from 900 px down instead, for a table too wide for a tablet.
- `.table.sticky` inside `.table-wrap.open` keeps the header under the top bar while the page scrolls.
- `.pager`: `Dash.pager` writes it.

**Bars and charts** (the builders in dash.js write all of these)
- `.bar`: also `.thin` and `.tinted`. `.meter` is the small top-bar version. `.split` shows parts of a whole. `.share` puts a bar and a percentage side by side.
- `.legend`: `.legend-item` (an `i` swatch, a name and `b` for the value). `.legend.list` puts one per line.
- `.hbars`: a list of horizontal bars. `--hb-label` and `--hb-value` set the column widths.
- `.chart`: a column chart with a value axis.
  - `Dash.bars(points, { read: 'Total 2.1M' })` adds a `.chart-read` line above it: hovering a column shows that column's `title` there, and the text comes back when the pointer leaves.
  - A `.partial` column is the hour still running.
  - A point with `parts: [{ value, tone }]` is a stacked column, the first part at the bottom; pair it with a `Dash.legend`.
  - Inside a `.panel` under 480 px, the `.minor` x labels hide.
- `.donut` beside a `.legend.list`, in `.donut-wrap`.
- `.gauges`, `.gauge`: half-circle gauges.
- `.spark`: a sparkline, with `.spark-labels` under it.
- `.lanes`: the fleet dashboard's timeline; `Dash.lanes` builds it. By hand: `.lane-label`, then a `.lane` with `.span` (a run) and `.mark` (an event) placed with `left:%`, then a `.lane-axis`. Axis labels with `.minor` hide on phones, where they would run into each other; `.major` ones are bold; `.start` begins at the left edge and `.end` ends at the right. A mark's `title` reaches only a mouse, so give each `.lane` `role="img"` and an `aria-label` saying what it shows (`Dash.lanes` does). In high contrast the lane and its runs get outlines and the marks stay solid.

**Feedback**
- `.toast` (`Dash.toast`): a short message at the bottom; with an action (`Undo`) it has a button. Toasts and notices show above an open dialog, inside it.
- `.notices` › `.notice` (`Dash.notify`): an alert in the corner that stays.
- `<dialog class="dialog">`: centred. Use `.dialog-body`, `.hint` and `.dialog-actions`.
- `<dialog class="drawer">`: from the right. Use `.drawer-body` and `.drawer-head`. Open either with `el.showModal()`. `[data-dismiss]`, Escape or a click on the backdrop closes it. For a question, `Dash.confirm`, `Dash.ask` and `Dash.dialog` build one on the spot. A click on the backdrop closes it only when the press started there too, so selecting text in a field and letting go outside keeps it open.
- `<dialog class="modal">` (`Dash.modal`): a head with the title and ×, a `.modal-body` that scrolls when long, and a `.modal-foot` with the buttons. `data-size` is `sm` (400 px), `md` (560), `lg` (760), `xl` (1040) or `full`; `data-drawer` puts it on the right, full height.
- `.live` with `data-state="on|stale|off|connecting"`: the connection status (the dot pulses while connecting).
- `.flash`: highlights a value that just changed.
- `.ip`: a blurred IP address (`Dash.maskIps`).
- `.login-page` on `<body>`, then `form.login` with `.lead` and `.note`: the sign-in page.

## dash.js

Builders return HTML strings, with every value escaped. Put them in with `innerHTML`, and handle clicks with one listener on a parent (`Dash.on`). Times are in milliseconds. Missing numbers print as `—`.

| | |
|---|---|
| `Dash.$(id)`, `Dash.esc(s)`, `Dash.on(parent, type, selector, fn)` | element by id; HTML escaping; one delegated listener (`fn(event, matchedEl)`) |
| `Dash.store.get(key, fallback)` / `.set(key, value)` | JSON in localStorage that never throws |
| `Dash.fmt.num(n, d)`, `.int`, `.compact` | `1,234.50`, `1,234,567`, `2.5` / `950` / `1.2k` / `15k` / `3.4M` |
| `Dash.fmt.usd(n, d?)`, `.pct(n, d)`, `.share(n)` | `$1,235` from $100, `$12.35` below; `12.3%`; `100%` / `12%` / `1.5%` / `<0.1%` |
| `Dash.fmt.amount(n, d=4)`, `.signed(n, d=4)`, `.signedUsd(n, d?)`, `.dir(n, eps)` | `<0.0001`; `+1.2345` / `−0.0100` / `0`; `+$733` (`+$732.60` with `d` 2); `'up'` / `'down'` / `'flat'` |
| `Dash.fmt.dur(ms)`, `.span(ms)`, `.ago(t)` | `3h 5m`; `2.7 h`; `just now` / `40 s ago` / `12 min ago` / `2.5 h ago` / `3 d ago` |
| `Dash.fmt.clock(t)`, `.when(t)`, `.utc(t)` | `14:05`; `Nov 21, 14:05`; `Nov 21, 02:22 UTC` (ms, Date or ISO string) |
| `Dash.fmt.date(t, { utc })`, `.time(t, { seconds, utc })`, `.until(t)` | `Nov 21` (`Nov 21, 2025` in another year); `14:05:09`; `in 3h 5m` / `now`. `date` and `time` read `t` as `Dash.time` does; the older `clock`, `when` and `utc` still read text the browser's way |
| `Dash.time(x, { seconds })` | milliseconds from what a server sends: ms, a Date, ISO text (no zone = UTC), an HTTP date, or seconds with `seconds: true`; `NaN` for anything else |
| `Dash.ago(t)`, `Dash.until(t)` | `<time>` that keeps itself current (`12 min ago`, `in 3h 5m`; updated every 15 s), the full time as its tooltip |
| `Dash.fmt.short(s, 6, 6)`, `.plural(n, word)` | `acct_7…k2m9xq`; `23 servers` |
| `Dash.tone(v, { 75: 'warn', 90: 'bad' }, base, { below })` | the tone of the highest threshold reached (`base`, `'ok'`, below them); `below: true` when lower is worse; `''` for no value |
| `Dash.sum(rows, key)`, `Dash.groupBy(rows, key)` | a column's total (blanks count 0); rows by a key, in first-seen order (`key` may be a function) |
| `Dash.match(row, query, fields)` | true when every word of the query is in one of the fields (any case) |
| `Dash.csv(rows, columns)`, `Dash.download(name, content)` | rows as CSV (formula-looking text gets a leading `'`; text that is just a number, like `-3`, stays a number); hand the reader a file |
| `Dash.pill(text, tone)`, `Dash.tag(text, tone)`, `Dash.chg(v, text, { eps, title })`, `Dash.rank(pos, of)` | small labels (`eps`: a change this small is flat) |
| `Dash.stat(label, value, { unit, note, tone, title })` | a stat tile; `tone` colours the value |
| `Dash.copyButton(text, label, { quiet })` | a Copy button; it still says "Copied ✓" if a refresh redraws it in that moment; `quiet`: no toast |
| `Dash.sortBy(rows, key or fn, 'asc'/'desc')` | sorted copy: numbers as numbers, text by locale (`web-2` before `web-10`), blanks last both ways |
| `Dash.sorter({ key, dir, store, firstDir })` | sort state: `.toggle(key)` flips or switches, `.apply(rows, getters)`, remembered under `store` |
| `Dash.th(label, key, sort, { num, title, cls, unit, mark })` | a sortable header cell; `unit: 'ms'` after the label; `mark: false` for a second column with the same sort key; `key` null for a plain header |
| `Dash.paginate(rows, page, perPage)`, `Dash.pager(p, { noun, sizes })`, `Dash.pageItems(page, pages)` | one page of rows; the pager (`[data-page]` clicks, `[data-per-page]` changes) |
| `Dash.table(el, { columns, rows, sort, perPage, sizes, noun, key, rowClass, empty, cls, wrap, onRow, filter })` | a whole table from its columns (below); `.update(rows)`, `.filter(fn)`, `.count`, `.csv()`, `.download(name)`, `.goto(page)`, `.sort` |
| `Dash.bar(frac, tone)`, `Dash.meter(frac, tone)`, `Dash.split(parts)`, `Dash.legend(items, { list, button })` | bars and legends (`parts`/`items`: `{ value, tone, label }`) |
| `Dash.hbars(rows, { max, format, button })` | `{ label, value, tone, text, key }` per row |
| `Dash.bars(points, { height, ticks, labelEvery, minorEvery, format, max, read })` | column chart, `{ label, value, tone, title, partial }` per column, or `parts: [{ value, tone }]` for a stacked one; `read`: a readout line for the hovered column |
| `Dash.timeline(items, { empty })` | `{ title, time, text, tone }` per event; `time` as `Dash.time` reads it shows as "12 min ago", other text as it is |
| `Dash.applyStyles(el)` | with `Dash.config.csp`: sets the builders' sizes in `el` (the page by default) at once (see *Pages with a strict style policy* below) |
| `Dash.lanes(el, rows, { from, to, ticks, axis, nouns, labelWidth, empty })` | lanes on a time axis (`.lanes`), `{ label, sub, spans: [{ from, to, tone, title }], marks: [{ at, tone, title }], say }` per row. The range is the last 24 h unless given; a span with no `to` is still going. It cuts spans at the edges and leaves out what is outside; titles (or the times) are tooltips; each lane gets a spoken summary (`say` to write your own, `nouns` to name what it counts). The axis has `ticks` parts (4), labelled with `axis(t, i, n)` or the clock, "−54 h" or dates. It places everything through the CSSOM, so it works under a strict `style-src` CSP. `el` can be the page's own `.lanes` box. `Dash.lanes.html(rows, options)` is the markup alone, and `Dash.lanes.place(el)` places it once it is in the page |
| `Dash.donut(segments, { center, sub })`, `Dash.gauge(frac, { name, sub, tone })`, `Dash.spark(values, { tone, height, area, labels })` | donut; gauge (ok → warn at 0.7 → bad at 0.9 unless a tone is given); sparkline |
| `Dash.maskIps(text)`, `Dash.hideIps(text)` | blur IPv4 addresses (a click shows every copy of that address); `(IP hidden)` for tooltips |
| `Dash.copy(text)` | clipboard with the old fallback for plain-HTTP pages; returns true/false |
| `Dash.toast(msg, { tone, ms, action, onAction })` | short message; with `action: 'Undo'` it has a button and stays 6 s |
| `Dash.notify({ key, title, status, text, tone, onClick, ms, max })`, `Dash.notify.dismiss(key)` | alert in the corner |
| `Dash.api(url, { method, json, etag, headers })` | fetch JSON. Errors carry `.status` and the server's `{ error }` text. A 401 goes to `Dash.config.loginUrl` when set. `etag: true` reuses the last body on a 304. |
| `Dash.poll(fn, ms, { hiddenMs, live, staleAfter })` | run now and every `ms`, one at a time, again as soon as the tab is visible; `.now()`, `.stop()`. `live`: the id of a `.live` status it keeps right (stale after `staleAfter`, 3 × `ms`) |
| `Dash.render(el, html, { force })` | refresh a part of the page without losing the reader's place (above); true when it wrote |
| `Dash.socket(path, { onMessage, onState, retryMs })` | WebSocket that reconnects; close code 1008 goes to the login page |
| `Dash.live(el, 'on'/'stale'/'off', text, title)` | the connection status |
| `Dash.seg(el, { value, store, onChange })` | a `.seg` or `.chips` as one choice (`data-value` buttons); `.value`, `.set(v)`. Reads a saved number or plain string too |
| `Dash.tabs(el, { value, store, hash, panels, onChange })` | a `.tabs` row: shows the `[data-tab]` panel of the chosen button; `hash: 'view'` keeps it in the address (`#view=list`); arrow keys move |
| `Dash.search(input, { onChange, debounce, key, store })` | a search box: `onChange(query)` once typing pauses, Escape clears, `/` jumps to it; `.count(shown, total)` fills its `.count`. With `store`, a remembered query is put back and `onChange` runs with it right after (on the next tick) |
| `Dash.key(combo, fn, { inInputs })` | a shortcut (`'/'`, `'g'`, `'mod+k'`, `'shift+?'`) that stays quiet while the reader types; returns a remover |
| `Dash.hash.get(key)`, `.set({ key: value }, { push })`, `.on(fn)`, `.parse`, `.format` | the part of the address after `#` as settings (`#view=list&id=7`); `null` removes a key |
| `Dash.dialog({ title, text, body, actions, cancel, drawer, focus })` | a dialog made on the spot; resolves `{ value, fields }` (`value` null when cancelled; `fields`: the named inputs in `body`) |
| `Dash.confirm(text, { title, ok, cancel, tone, anchor })`, `Dash.ask(title, { value, placeholder, type, required })` | yes/no (Cancel has the focus; `tone: 'bad'` for a red button; `anchor`: ask in a popup beside that button instead); one line of text or null |
| `Dash.alert(text, { title, ok, tone })` | a message with one button; resolves once it is read |
| `Dash.modal({ title, text, body, actions, cancel, size, drawer, dismissable, focus, onAction, onClose })` | a modal you keep a handle on (below) |
| `Dash.popup(anchor, content, { placement, align, width, cls, label, focus, onClose })` | a box beside an element or at a point (below); calling it again for the same element closes it |
| `Dash.menu(anchor, items, { placement, align, label })` | a menu beside a button, or at the pointer for a right-click; resolves to the chosen value or null (below) |
| `Dash.busy(button, work)` | the button is disabled with a spinner until `work` (a function or a promise) is done; returns its result |
| `Dash.place(rect, size, view, { placement, align, offset })` | where a box goes beside a rectangle, flipped and kept inside the window (what `Dash.popup` uses) |
| `Dash.theme.get/set/current()`, `Dash.color(name)` | light/dark; a token's current value (for a canvas) |
| `Dash.flash(el)` | highlight a change |

**Attributes that work with no code:**
- `data-copy="text"`: copies the text, toasts "Copied" (not with `data-quiet`), and the button says "Copied ✓" for a moment.
- `data-theme-set`: switches light, dark or system.
- `data-toggle-side`: collapses or expands the sidebar, then fires `dash:side` on `document` (`e.detail.collapsed`) for a page that lays out by it.
- `data-dismiss`: closes the popup, dialog or drawer it's in (the innermost), or removes the notice.
- `data-popup="id"`: opens the content of `<template id="id">` (or of any element with that id) in a popup beside the button; a second click closes it.
- `data-tooltip="text"`: a tooltip on hover and keyboard focus.
- `<details class="menu">`: closes on a click outside, on Escape and once an item is chosen.
- `.ip`: click or Enter shows that IP address everywhere on the page.

`Dash.config` holds `loginUrl` (null), `themeKey` (`'dash.theme'`), `sideKey` (`'dash.side'`) and `csp` (false, below).

**Pages with a strict style policy.** A page served with `Content-Security-Policy: style-src 'self'` (no `'unsafe-inline'`) drops every `style=""` in markup, and the builders that size things write sizes that way: `Dash.bar`, `Dash.meter`, `Dash.split`, `Dash.hbars`, `Dash.bars` and `Dash.spark`. On such a page, set `Dash.config.csp = true` before drawing anything:

- The builders then write their numbers as `data-css-*` attributes instead. The kit sets them through the CSSOM, which the policy allows. It does this at once wherever the kit puts markup in (`Dash.render`, popups, modals, dialogs), and before the next paint for markup the page puts in itself.
- Only numbers are set, only on the kit's own pieces (a `.bar`'s fill, a chart's columns, and so on), so other markup can't use it to style anything.
- `Dash.applyStyles(el)` sets them at once, for a page that measures right after putting markup in.
- `Dash.lanes` works under the policy either way. The kit's own tooltips and popups always do.
- With `csp` off (the default), the builders write `style=""` exactly as before.

**`Dash.table` columns.** Each column is `{ key, label }` plus what it needs:
- `num: true` aligns it right; `unit`, `title` and `cls` as for `Dash.th`; `main: true` makes it the card title on a phone;
- `value: (row) => …` when what it shows and sorts by isn't `row[key]`;
- `format: (value, row) => text` for text (escaped), or `html: (row) => markup` for a builder's output (`Dash.pill`, `Dash.ago`, …);
- `sort: false` for a column that doesn't sort; `firstDir: 'asc'` for one whose first click should sort up (names, latency).

**`Dash.modal`.** For more than a question: a form that saves, details that keep updating, a long list.

```js
const m = Dash.modal({
  title: 'Edit web-1', size: 'lg', cancel: 'Cancel',
  body: '<label class="field"><span>Name</span><input class="input" name="name" required></label>',
  actions: [{ label: 'Delete', value: 'delete', tone: 'bad' }, { label: 'Save', value: 'save', primary: true }],
  onAction: async (value, m) => {
    if (value === 'save') await Dash.api('/api/servers/1', { method: 'PUT', json: m.fields() }); // an error shows in the foot and keeps it open
    if (value === 'delete' && !(await Dash.confirm('Delete web-1?', { tone: 'bad', ok: 'Delete' }))) return false; // false keeps it open
  },
});
const { value, fields } = await m.closed; // value: the action's, or null after ×, Cancel, Escape or a click outside
```

- The action button is busy (disabled, with a spinner) while `onAction` runs.
- Enter in a field presses the `primary` action, after the fields' own checks (`required`, `type="email"`). Give your own buttons in the body `type="button"`.
- `m.update({ title, text, body, actions })` changes it while it is open; the body is redrawn like `Dash.render`, so what the reader is typing stays. `m.body` is the part that scrolls, `m.error(text)` shows a line in the foot, `m.close(value)` ends it.
- `dismissable: false`: no ×, and Escape and clicks outside do nothing, for something that must finish. `drawer: true` slides it in from the right.

**`Dash.popup` and `Dash.menu`.** A popup floats above everything, a sideways-scrolling table or an open dialog included. It closes on a click outside, on Escape (the focus goes back to its button) or with `.close()`, and it follows its button when the page scrolls or a refresh redraws it (the new copy with the same id, `data-key`, or tag and `data-` attributes; with none, it closes).

```js
Dash.popup(button, '<p class="popup-title">web-1</p><p class="popup-text">Checked 2 min ago</p>', { align: 'end' });

const choice = await Dash.menu(button, [
  { heading: 'Server' },
  { label: 'Rename', value: 'rename', hint: 'F2' },
  { label: 'Wrap lines', checked: true },
  '-',
  { label: 'Delete', value: 'delete', tone: 'bad', disabled: !canDelete },
]);

row.addEventListener('contextmenu', async (e) => { e.preventDefault(); const v = await Dash.menu(e, items); }); // at the pointer
```

- `content`: HTML, an element, or a function `(popup) => …`. `placement`: `bottom` (default), `top`, `right` or `left`; it flips when there's no room, and stays inside the window. `align`: `start`, `center` or `end`. `focus: true` puts the focus inside.
- The handle: `.el`, `.close(value)`, `.update(content)`, `.closed` (a promise of the close value).
- A menu moves with the arrow keys, Home, End and first letters; Enter picks, Tab and Escape leave. An item is a string or `{ label, value, hint, tone, disabled, checked, href }`; `'-'` is a line and `{ heading }` a small label.
- It uses the browser's own popovers where there are some, and works the same without them.

Options: `sort: { key, dir, store }`; `perPage` (0 = no pager) and `sizes`; `noun` for the pager's "of 23 servers"; `key` (a field or a function) so a refresh keeps the focused row; `rowClass: (row) => 'marked bad'`; `empty` text; `cls` (table classes, `'stack'` by default); `wrap: true` for a table that is its own card; `onRow(row, event)` for a click or Enter on a row (not on a button or link inside it); `filter` to start filtered. It draws with `Dash.render`.

## Where it came from

| piece | from |
|---|---|
| tokens, `--c` tints, pills, dots, tags, callouts, sidebar and rail, donut, gauges, column chart, hbars, notices | agent-dash (`dashboard.html`) |
| `data-theme` light/dark, banner, stats, cards, timeline lanes, table header strip, blurred IPs, sign-in with an error box | fleet dashboard |
| hero, split bar, 24 h change pills, toolbar and search, switch, dialog editor, toast, flash, stacked phone rows | balances dashboard |
| pager and page numbers, chips, solid segmented control, ETag fetch, sparkline | payout dashboard |
| sticky table header under the top bar, medals, blocked tag, sub-rows, drawer, skeletons, copy feedback | leaderboard dashboard |

Where the dashboards disagreed, this kit follows agent-dash and the balances dashboard, which the user praised:

- the soft segmented control is the default (`.seg.solid` keeps the other look);
- `.dot` is 8 px (9 px in `.live`);
- `.toast` is the message at the bottom and `.notice` is the alert in the corner;
- active states use ARIA attributes (`aria-pressed`, `aria-current`, `aria-sort`) instead of `.on`/`.active` classes.

## Moving a dashboard onto it

1. Back up the page, then link `dash.css` and `dash.js` (or paste them in).
2. Rename the colour variables with the table above, and delete the page's own `:root` blocks.
3. Swap components one area at a time, checking with screenshots at 390, 860, 1200 and 1440 px in light and dark. Compare the old and the new page side by side with the same data: visible text, colours and column counts should match.
   - `.seg button.on` / `.active` become `aria-pressed="true"`;
   - `.leaderboard`, `.scroller` tables become `.table`;
   - the page's own `esc`/`fmt*`/`ago`/`copy` helpers become `Dash.*`;
   - hand-written "keep focus / keep open details / don't refresh while selecting" code becomes `Dash.render`, and the try/catch around each fetch that sets the status becomes `Dash.poll(…, { live })`;
   - a status that names a colour goes through a lookup table (`{ waiting: 'orange', … }[s] || 'idle'`), never straight into `class`: some status words are also kit classes (`.shell` is the sidebar layout).
4. Keep the page's own `<style>` for what is really its own, such as a one-off grid of columns.

## Tests

```sh
node --test test/dash.test.mjs
```

The tests cover the formatters, sorting, paging, escaping in every builder, and chart sizes. They also check that the two dark palettes in `dash.css` are equal, that every token has a dark value, and that every class used in the pages and in dash.js exists in `dash.css`. For layout, `test/screens.mjs` loads every page in headless Chromium at 390, 700, 860 and 1440 px, light and dark. It fails on a page wider than the window, a console error, or a stacked table whose rows aren't cards at the right widths (or whose `td.actions` left the card's corner). It needs Playwright, which the kit itself doesn't:

`test/behaviour.mjs` checks in the same browser what a node test can't see: `Dash.render` keeping focus, typing, open details, scroll and a selection; the poll's live status; the chart readout; copy buttons across a redraw; the sidebar event; the search count; saved choices in `Dash.seg`; `.topbar.static-md` and phone tiles; `Dash.table`, tabs, menus, tooltips, dialogs, `Dash.search`, `Dash.key`, live times and stacked columns; and modals, popups and menus (each popup check runs with the browser's own popovers and without them), and what shows above an open dialog; lanes; and, on a page served with `style-src 'self'` (`test/csp.html`), `Dash.lanes` and the sizing builders with `Dash.config.csp`, drawn as without the policy and with no violations. `KIT=<dir>` serves `dash.css` and `dash.js` from another folder, to try a change (the node tests read it too).

```sh
npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
npm run screens            # SHOTS=1 npm run screens also saves the screenshots to screens/
npm run behaviour
```
