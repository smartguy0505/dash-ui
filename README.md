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
    <div class="stats">
      <div class="stat"><div class="label">Requests</div><div class="value">1.84M</div><div class="note">today</div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Items</h3></div><table class="table stack" id="table"></table></div>
  </main>
  <script>
    Dash.poll(async () => {
      const items = await Dash.api('api/items');
      // … render with Dash.esc / Dash.fmt …
      Dash.live('live', 'on', 'Live');
    }, 15000);
  </script>
</body>
```

`examples/starter.html` is this page, working.

Single-file dashboards, like agent-dash's `dashboard.html`, can paste `dash.css` into their `<style>` and `dash.js` into a `<script>`; nothing in either file refers to the other or to a path.

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
| `ok` | `#16803c` | `#4ade80` | healthy, paid, up |
| `warn` | `#b45309` | `#f0b04a` | stale, probation, outside the cut |
| `bad` | `#c81e1e` | `#ff7d7d` | errors, incidents, blocked, down |
| `orange` | `#c2410c` | `#ff9b55` | needs you (agent-dash's "waiting"; deliberately not `warn`) |
| `teal` | `#0f766e` | `#42d3bf` | a second series, running |
| `purple` | `#6d3fd1` | `#b79dff` | shell |
| `pink` | `#b5179e` | `#f28fd8` | ultra |
| `gold` `silver` `bronze` | `#a16207` … | `#f0c04a` … | medals, USD |
| `idle` | `#6e6b64` | `#a7a59e` | idle, closed |
| `neutral` | `--muted` | | default grey |

**Contrast:** dark mode clears WCAG AA (4.5:1) for every tone. In light mode, the text inside a tinted pill or tag is just under it for `ok`, `warn`, `orange`, `gold` and `silver` (4.2–4.4:1), and `accent` (3.9:1) and `faint` (3.5:1) are not meant for body text. A test keeps these from getting worse.

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
| `.topbar` | Slim, sticky top bar (static on phones). Holds `.brand` (`.mark` logo square, `h1`), `.sub`, `.top-right` (pushed right), `.top-link`, `.live`, `.topstat` (a reading with a `.meter`). |
| `.page` | The content column: 1320 px max, 24 px gutters. `.page.wide` is 1480 px, `.page.narrow` 1000 px. |
| `.page-head`, `.page-title`, `.page-note` | Page heading, 22 px. |
| `.section`, `.section-head`, `.section-title`, `.kicker` | Sections with small uppercase titles. |
| `.shell` > `.sidebar` + `.content` | Sidebar layout. `.shell.collapsed` makes the sidebar a rail of icons; a `[data-toggle-side]` button switches it and it's remembered. Inside: `.side-head`, `.count-badge`, `.nav-item` (`.nav-icon`, `.nav-main` › `.nav-name` + `.nav-sub`, `.nav-meta`; `aria-current="true"` marks the selected item, `.attn` tints it). |
| `.grid` | Equal columns: `style="--cols:3"`, `.span-2`. One column below 900 px. |
| `.cards` | Auto-filling card grid, `--card-min` (300 px) per card. |
| `.stats` | Auto-fitting stat tiles, `--stat-min` (180 px); two across on a phone. |
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

**Labels**
- `.pill`: a status, usually with a `.dot` (`.dot.pulse`, `.dot.hollow`). `.pill.lg` is the size of the 24 h change.
- `.tag`: a small fact. `.tag.plain` is neutral, `.tag.outline` has a ring instead of a tint. Group them in `.tags`.
- `.rank`: "#2 of 14", in medal colours for the top three (`Dash.rank` builds it).
- `.chip`: a pill with a border. A `button.chip` with `aria-pressed` is a choice. Group them in `.chips`, or `.chips.scroll` for one sideways-scrolling line.
- `.chg` with `.up`, `.down` or `.flat`: a signed change in its colour.
- Text utilities: `.muted`, `.faint`, `.strong`, `.sub`, `.mono`, `.num`, `.unit` (a unit after a number: `12.5 <span class="unit">ms</span>`), `.ellipsis`, `.clamp` (`--lines`), `.invisible` (hidden, keeps its space), `kbd`, `code`.

**Controls**
- `.btn`: also `.primary` (text-coloured; `.primary.blue` for a blue one), `.ghost`, `.danger`, `.sm`, `.round` and `.block`. `.btn.busy` spins its icon.
- `.icon-btn`: a 28 px icon button. `aria-expanded` turns its chevron; `.danger` turns it red on hover.
- `.link`: a button that looks like a link. `.link.quiet` is muted.
- `.seg`: a segmented control.
  - Buttons with `aria-pressed` are a choice; links with `aria-current="page"` are views.
  - `.seg.lg` is for top-bar view tabs.
  - `.seg.solid` is the bordered look from the payout and leaderboard dashboards.
  - A `<span>` inside a button holds a count.
- `.input`: text, select and textarea. `.input.mono` is for addresses.
- `.search` wraps an `.input` with an icon `svg` and an optional `.count`.
- `.field`: a label, an `.input`, then `.hint` or `.err`. `.field.invalid` turns it red.
- `.switch`: `<label class="switch"><input type="checkbox"><span class="track"></span> Label</label>`.
- `.checkline`, and `details > summary`.

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
  - Hovering a column puts its `title` in the `.chart-read` line above.
  - A `.partial` column is the hour still running.
  - Inside a `.panel` under 480 px, the `.minor` x labels hide.
- `.donut` beside a `.legend.list`, in `.donut-wrap`.
- `.gauges`, `.gauge`: half-circle gauges.
- `.spark`: a sparkline, with `.spark-labels` under it.
- `.lanes`: the fleet dashboard's timeline. `.lane-label`, then a `.lane` with `.span` (a run) and `.mark` (an event) placed with `left:%`, then a `.lane-axis`.

**Feedback**
- `.toast` (`Dash.toast`): a short message at the bottom.
- `.notices` › `.notice` (`Dash.notify`): an alert in the corner that stays.
- `<dialog class="dialog">`: centred. Use `.dialog-body`, `.hint` and `.dialog-actions`.
- `<dialog class="drawer">`: from the right. Use `.drawer-body` and `.drawer-head`. Open either with `el.showModal()`. `[data-dismiss]`, Escape or a click on the backdrop closes it.
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
| `Dash.fmt.short(s, 6, 6)`, `.plural(n, word)` | `acct_7…k2m9xq`; `23 servers` |
| `Dash.pill(text, tone)`, `Dash.tag(text, tone)`, `Dash.chg(v, text, { eps, title })`, `Dash.rank(pos, of)`, `Dash.copyButton(text)` | small labels (`eps`: a change this small is flat) |
| `Dash.sortBy(rows, key or fn, 'asc'/'desc')` | sorted copy: numbers as numbers, text by locale (`web-2` before `web-10`), blanks last both ways |
| `Dash.sorter({ key, dir, store, firstDir })` | sort state: `.toggle(key)` flips or switches, `.apply(rows, getters)`, remembered under `store` |
| `Dash.th(label, key, sort, { num, title, cls, unit, mark })` | a sortable header cell; `unit: 'ms'` after the label; `mark: false` for a second column with the same sort key; `key` null for a plain header |
| `Dash.paginate(rows, page, perPage)`, `Dash.pager(p, { noun, sizes })`, `Dash.pageItems(page, pages)` | one page of rows; the pager (`[data-page]` clicks, `[data-per-page]` changes) |
| `Dash.bar(frac, tone)`, `Dash.meter(frac, tone)`, `Dash.split(parts)`, `Dash.legend(items, { list, button })` | bars and legends (`parts`/`items`: `{ value, tone, label }`) |
| `Dash.hbars(rows, { max, format, button })` | `{ label, value, tone, text, key }` per row |
| `Dash.bars(points, { height, ticks, labelEvery, minorEvery, format, max })` | column chart, `{ label, value, tone, title, partial }` per column |
| `Dash.donut(segments, { center, sub })`, `Dash.gauge(frac, { name, sub, tone })`, `Dash.spark(values, { tone, height, area, labels })` | donut; gauge (ok → warn at 0.7 → bad at 0.9 unless a tone is given); sparkline |
| `Dash.maskIps(text)`, `Dash.hideIps(text)` | blur IPv4 addresses (a click shows every copy of that address); `(IP hidden)` for tooltips |
| `Dash.copy(text)` | clipboard with the old fallback for plain-HTTP pages; returns true/false |
| `Dash.toast(msg, { tone, ms })` | short message |
| `Dash.notify({ key, title, status, text, tone, onClick, ms, max })`, `Dash.notify.dismiss(key)` | alert in the corner |
| `Dash.api(url, { method, json, etag, headers })` | fetch JSON. Errors carry `.status` and the server's `{ error }` text. A 401 goes to `Dash.config.loginUrl` when set. `etag: true` reuses the last body on a 304. |
| `Dash.poll(fn, ms, { hiddenMs })` | run now and every `ms`, one at a time, again as soon as the tab is visible; `.now()`, `.stop()` |
| `Dash.socket(path, { onMessage, onState, retryMs })` | WebSocket that reconnects; close code 1008 goes to the login page |
| `Dash.live(el, 'on'/'stale'/'off', text, title)` | the connection status |
| `Dash.seg(el, { value, store, onChange })` | a `.seg` or `.chips` as one choice (`data-value` buttons); `.value`, `.set(v)` |
| `Dash.theme.get/set/current()`, `Dash.color(name)` | light/dark; a token's current value (for a canvas) |
| `Dash.flash(el)` | highlight a change |

**Attributes that work with no code:**
- `data-copy="text"`: copies the text, toasts "Copied", and the button says "Copied ✓" for a moment.
- `data-theme-set`: switches light, dark or system.
- `data-toggle-side`: collapses or expands the sidebar.
- `data-dismiss`: closes the dialog or drawer it's in, or removes the notice.
- `.ip`: click or Enter shows that IP address everywhere on the page.

`Dash.config` holds `loginUrl` (null), `themeKey` (`'dash.theme'`) and `sideKey` (`'dash.side'`).

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
3. Swap components one area at a time, checking with screenshots at 390, 860, 1200 and 1440 px in light and dark:
   - `.seg button.on` / `.active` become `aria-pressed="true"`;
   - `.leaderboard`, `.scroller` tables become `.table`;
   - the page's own `esc`/`fmt*`/`ago`/`copy` helpers become `Dash.*`.
4. Keep the page's own `<style>` for what is really its own, such as a one-off grid of columns.

## Tests

```sh
node --test test/dash.test.mjs
```

The tests cover the formatters, sorting, paging, escaping in every builder, and chart sizes. They also check that the two dark palettes in `dash.css` are equal, that every token has a dark value, and that every class used in the pages and in dash.js exists in `dash.css`. For layout, `test/screens.mjs` loads every page in headless Chromium at 390, 700, 860 and 1440 px, light and dark. It fails on a page wider than the window, a console error, or a stacked table whose rows aren't cards at the right widths (or whose `td.actions` left the card's corner). It needs Playwright, which the kit itself doesn't:

```sh
npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
npm run screens            # SHOTS=1 npm run screens also saves the screenshots to screens/
```
