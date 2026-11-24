# Changelog

Dashboards keep a copy of `dash.css` and `dash.js`; the first line of each file says which version it is. Versions only add things: a page that worked with an older copy works the same with a newer one.

## 1.12.0 (2026-11-24)

Table rows to pick, and rows that open.

- `Dash.table(…, { select })`: a box on every row, one in the header, Shift-click for a range, and a bar with the count and your actions that stays at the bottom of the window. What is picked is kept by `key` through a refresh, sorting, paging and a search. `.selected`, `.select(keys)`; `.csv(rows)` and `.download(name, rows)` take rows now.
- `Dash.table(…, { expand })`: a button (or a click on the row) opens a row's details: markup, an element, a promise of either, or something you draw. The details stay the same element through a refresh, so a chart, a table or a half-typed note in them keeps its place. `.expanded`, `.expand(key)`.
- A table inside a table's details is its own: the outer one's hover, sticky header and phone cards no longer reach it.
- A table made again on the same element: the old one stops listening.

## 1.11.1 (2026-11-24)

- The colours page and the README show the four series colours, and the README's list of builders for a strict style policy names `Dash.lines` and `Dash.progress`.
- One CSS declaration that changed nothing is gone from `.line-ends`.

## 1.11.0 (2026-11-24)

A line chart over time.

- `Dash.lines(el, series, options)`: one line per series on one axis, with round values and round local times, limits drawn across, gaps where there is no value, areas and dashed lines. A crosshair reads every series at once for the mouse, a finger and the arrow keys, and a screen reader hears each point. It works under a strict style policy, in high contrast and on phones, and `private: true` hides its numbers with `Dash.privacy`. `.update()`, `.csv()`, `.download()`.
- Four series colours (`--series-1` to `--series-4`, `.series-1`…), picked by measure so that every pair can be told apart in light and dark, by colour-blind readers too. The other tones are as they were.

## 1.10.0 (2026-11-24)

Values the reader can hide, for meetings and screenshots.

- `Dash.mask(text)` writes a value, or a fixed blurred stand-in while values are hidden: the real one isn't in the page then, so there is nothing to select, copy or find. `Dash.mask.text` is the same for titles, labels and toasts.
- `Dash.privacy`: `.on`, `.set`, `.toggle`, `.onChange`, and `.button('balances')`, the eye that does it ("Hide balances", "Show balances"); a button with `data-privacy` in the page is one too. The choice is remembered (`Dash.config.privacyKey`), applied before the first paint, and followed by the browser's other open tabs. Hiding drops a text selection and an open tooltip, so neither keeps a value showing.
- `Dash.table` columns: `private: true` (or the stand-in's text).
- `<input data-private>`: dots while values are hidden, until the reader clicks or types in it.

## 1.9.2 (2026-11-24)

Fixes found by an audit of every page. Nothing looks different outside high contrast, except where a page was too narrow.

- **High contrast (forced colours)** hid whatever was only a background or a shadow: bars, meters, splits, columns, progress, legend keys, dots, switches, skeletons, and which segment, chip, tab, sidebar item or page was chosen. Now data keeps its tones inside a line in the system's ink, what is chosen takes the system's highlight, and pills, tags, callouts, toasts and tooltips get an edge. A text box shows its focus (the ring was a shadow) and a wrong one a dashed border. Lanes and the timeline keep their tones too.
- `Dash.timeline`: a time still to come counts down ("in 3h 5m") instead of reading "just now", and turns into "2 min ago" by itself. Up to a minute ahead still reads as now, since clocks differ. Past times are written as before.
- Sort headings and `.top-link` can be pressed a little outside their text (they were 18 to 20 px tall).
- Narrow pages: a `.chip` longer than its row wraps inside itself, one wide child no longer widens everything else in a `.vstack`, and `.topstat` wraps on phones.

## 1.9.1 (2026-11-23)

- `Dash.combobox` with `strict: true`: a box the reader empties now stays empty (it used to get the last pick back), and its pick is cleared.
- `Dash.combobox(...).value` is the picked option only while the box still shows it; after the reader types something else it is null (it used to keep the old pick).

## 1.9.0 (2026-11-23)

The last two pieces of the component set, and a docs site. All additive.

- **`Dash.combobox(input, options)`** (`.combo-list`): a text box with suggestions that narrow as the reader types, from a list or from a function that asks a server (answers that come back after the reader typed on are dropped). Arrow keys, Enter and a click pick; Escape closes the list only, inside a dialog too; the box keeps the focus throughout. `strict: true` allows only a suggestion. It is an ARIA combobox (`role="combobox"`, a `listbox`, `aria-activedescendant`).
- **`Dash.datepicker(input, options)`** (`.date-field`, `.calendar`): a calendar button for a `YYYY-MM-DD` box, with `min`, `max` and `firstDay`. The calendar is a grid the keyboard moves through (arrows, Home and End, PageUp and PageDown, with Shift a year); days outside the range can't be picked; today is marked.
- **Docs:** `docs/` is a site with a page per part of the kit and per utility group: live examples with their code to copy, a preview on a phone and in the other theme, and a search (the combobox). `docs-src/` holds the pages and `node tools/docs.mjs` writes `docs/`; a test checks that every class and function in the kit is on some page.

## 1.8.0 (2026-11-23)

The form, navigation and progress pieces a component kit is expected to have, in the kit's look. All additive: no existing class or builder changes.

- **Forms:**
  - `.choices` (radios or checkboxes as cards) and `.checks` (a column of checklines, `.checks.across` for a line);
  - `.select`, a select with the kit's arrow;
  - `.input-group` with `.affix`: text and buttons joined to an input;
  - `.input.sm` and `.input.lg`; `textarea.input.autosize`, which grows as it is typed into (where the browser can);
  - `.slider` and **`Dash.slider`**: a range with its value beside it, kept current by dash.js;
  - `.dropzone`: drop files on it, or click to choose. A drop fills the file input (only kinds its `accept` allows) and fires `input` and `change` as a choice would. The names show in it.
- **Navigation:**
  - **`Dash.crumbs`** (`.crumbs`): breadcrumbs. A link that would run script becomes `#`;
  - **`Dash.stepper`** (`.stepper`, `.vertical`): the steps of a task, with done and failed steps said to screen readers. On a phone only the current step's name shows;
  - `.shell.offcanvas`: up to 900 px the sidebar is a drawer over the page. While it is open, the rest of the page is inert; Escape, a click outside or a link closes it, and the focus goes back. **`Dash.side.open()`** and **`.close()`**;
  - `.bottom-nav` for phones, and `.fab` (`.extended`), a floating button for the main action that sits above it.
- **People, counts and progress:**
  - **`Dash.avatar`** and **`Dash.avatars`** (`.avatar`, `.avatars`): initials in a colour from the name, or a picture, and a few overlapping with "+3";
  - `data-badge`: a count or a dot on a button or an icon;
  - **`Dash.progress`** and **`Dash.progressCircle`** (`.progress`, `.progress-circle`): a bar and a circle, with a running one for an amount not known yet (steady when motion is turned off). `Dash.config.csp` sizes the bar without inline styles, like the other bars.
- **Lists and surfaces:** **`Dash.entries`** (`.entries`): a list of things, a line or two each, as links or buttons if asked; `.accordion`; `.divider`; `.card-media`.
- None of the new class names is a utility name in `dash-utils.css`, and the tests check that.
- The gallery has a new "Forms, steps and lists" section.

## 1.7.0 (2026-11-23)

Utility classes, in the style of Tailwind, made from the kit's tokens. All additive: they live in a new, optional file, so a page that doesn't link it sees no change.

- **`dash-utils.css`** has about 3,600 classes (220 KB, 26 KB gzipped). Groups:
  - display, position and inset, flex, grid (including `grid-cols-fit-*`, cards that wrap), alignment;
  - padding, margin, gap and space between, in 4 px steps;
  - widths and heights; text size, weight, alignment, wrapping and clamping;
  - colours from every token, with tints (`bg-blue/10`);
  - borders, radius, shadow, ring, opacity, motion and cursor.
- **Variants**, per group, where pages use them:
  - `hover:` (only on devices that hover), `group-hover:`, `focus:`, `focus-visible:`, `focus-within:`, `active:`, `disabled:`;
  - the widths `sm:` (from 641 px), `md:` (from 901 px), `lg:` (1024) and `xl:` (1280), plus `max-sm:` and `max-md:`. These follow the kit's own phone and smaller-screen widths, not Tailwind's;
  - `dark:`, the system setting or `data-theme`, both ways as the palette, and `print:`.
- **A utility wins over the kit's rules** (`btn px-8`, `panel p-0`) without `!important`: every rule is `.name:not(#\#)`. Inline styles, the `hidden` attribute and `!important` rules still win.
- **No utility takes the name of a kit class.** `block`, `fixed` and `sticky` skip the one kit piece that uses them as a modifier (`.btn.block`, `.stats.fixed`, `.table.sticky`). The kit's `grid`, `grow`, `invisible` and `sr-only` stay as they are. The README lists how they differ from Tailwind.
- `tools/utils.mjs` writes the file (`npm run utils`). Pages link the committed result.
- `tools/paste.py` also fills an optional `<style id="dash-ui-utils"></style>` for pages that must be one file.
- `examples/utilities.html`: a page laid out with utilities and no CSS of its own.
- Tests:
  - node: the file is what the generator writes; no names clash with kit classes, read from the real selectors; shorthands come before their parts and the variants in order; widths and dark selectors; colours only from tokens; a size budget of 240 KB and 30 KB gzipped;
  - browser (`test/utils.html`): every rule parses; utilities beat the kit while its modifiers keep their meaning; `[hidden]` and inline styles still win; and the widths, `dark:` four ways, hover, group-hover, focus-visible and print all work.

## 1.6.0 (2026-11-23)

Every builder now works on a page with a strict style policy. All additive: with the new setting off, nothing changes.

- `Dash.config.csp = true` is for a page served with `Content-Security-Policy: style-src 'self'`, which drops every `style=""` in markup. With it, `Dash.bar`, `Dash.meter`, `Dash.split`, `Dash.hbars`, `Dash.bars` and `Dash.spark` write their sizes as `data-css-*` numbers, and the kit sets them through the CSSOM.
- When the kit puts markup in (`Dash.render`, popups, modals, dialogs), it sets the sizes at once, so a popup is placed at its real size. For markup the page puts in itself, the sizes are set before the next paint.
- `Dash.applyStyles(el)` sets them at once, for a page that measures straight away.
- Only numbers are set, only on the kit's own pieces (a `.bar`'s fill, a chart's columns and grid, a stacked column's parts, a chart's height, a sparkline's dot), so injected markup can't use it to style anything.
- CSS: `.spark-box`, the sparkline's box and dot in this mode.
- With the setting off (the default), the builders write exactly what 1.5.0 did, byte for byte. A test pins it.
- Tests: the strict-policy page (`test/csp.html`, which was `lanes-csp.html`) checks four things:
  - the builders draw exactly as they do without the policy, whether the page, `Dash.render` or `Dash.applyStyles` put the markup in;
  - a chart has its full height the moment a popup, a dialog or a modal opens;
  - `data-css-*` does nothing outside the kit's pieces;
  - there are no policy violations, read after they are reported. A `style=""` put in on purpose shows they would be seen.
- 145 browser checks and 32 node tests. All 131 deliberate breakages of the kit are caught, 15 of them new.

## 1.5.0 (2026-11-23)

`Dash.lanes`: the timeline lanes from data. All additive.

- `Dash.lanes(el, rows, options)` draws lanes on a time axis, one row per thing, each with its runs (`spans`) and events (`marks`). The range is the last 24 h unless `from` and `to` say otherwise. Times are anything `Dash.time` reads, and a run with no end is still going.
- It does the parts each page got wrong by hand. It cuts runs at the edges and leaves out what lies outside. It labels the axis: the clock up to a day, then "−54 h" or dates, and "now" when the range ends now. In-between labels are `.minor`, so they hide on phones.
- Titles show as the kit's tooltips. Without a title, the times do. Each lane is `role="img"`, with a summary a screen reader reads: "api-eu-west (team-a): 3 load tests, 2 incidents: …". `say` replaces the summary, and `nouns` names what it counts.
- It never writes `style=""` into its markup. Positions go in through the CSSOM, so it works on a page whose policy is `style-src 'self'`. `Dash.lanes.html` gives the markup alone, and `Dash.lanes.place(el)` positions it once it is in the page.
- `el` can be the page's own `.lanes` box, which it fills, or any box, where it adds one. `labelWidth` sets the label column; a number means pixels.
- CSS: `.lane-axis .start` and `.end` align the first and last labels to the edges, and `.lanes > .empty` spans the whole box.
- The gallery and `examples/fleet.html` now draw their lanes with it.
- Tests: the node tests can check a copy of the kit (`KIT=<dir>`), as the browser tests do. There are new node tests for the markup and 12 new browser checks (139), run on a page served under `style-src 'self'`. All 116 deliberate breakages of the kit are caught, 23 of them new.

## 1.4.1 (2026-11-23)

Fixes in the timeline lanes, and lanes and the timeline in high contrast. Pages need no change; `.minor` is new and optional.

- Every event in a lane (`.lane .mark`) was 30 px tall in a 20 px lane and ran into the row below: the brand logo's `.mark` rule gave it that height. Events now fit inside their lane.
- An event is 4 px wide. The pointer now finds it up to 5 px either side, so its title is easier to bring up.
- `.minor` on an axis label hides it on phones, where the labels ran into each other. `examples/fleet.html` uses it.
- High contrast (forced colours) drops background colours, so lanes, runs and events, and the timeline's dots and line, disappeared. Now the lane and its runs get outlines, and the events and dots show in the text colour.
- A mark's title reaches only a mouse. The examples now give each lane `role="img"` and an `aria-label` that says what it shows, and the README says to.
- Tests: 127 browser checks, 6 of them new; 5 of those fail on 1.4.0, and the sixth checks that `.minor` labels still show on a wide screen. All 93 deliberate breakages of the kit are caught, 8 of them new.

## 1.4.0 (2026-11-23)

Modals, popups and menus, and things that show properly above an open dialog. All additive.

- `Dash.modal`: a dialog you keep a handle on. It has a head with the title and ×, a body that scrolls when long, and buttons at its foot. It comes in five sizes, or as a drawer. `onAction` can save first: returning false or throwing keeps it open, and the error shows in the foot. While it runs the button is busy. `update()` changes it while it is open without losing what is being typed. With `dismissable: false`, only its buttons end it.
- `Dash.popup`: a box beside a button or at a point. It sits above everything and closes on a click outside or on Escape. It follows its button through a scroll or a table refresh. Calling it twice toggles it. With no code, `data-popup="id"` does the same with a `<template>`.
- `Dash.menu`: a menu of choices beside a button, or at the pointer for a right-click. It has arrow keys, first letters, ticks, hints, headings, disabled and red items. It resolves to the chosen value. It is never cut off by a box that scrolls.
- `Dash.confirm(text, { anchor })` asks in a small popup beside the button. `Dash.alert(text)` shows a message with one button.
- `Dash.busy(button, work)` disables the button with a spinner until the work is done. `aria-busy="true"` on a `.btn` and `.spinner` are the CSS for it.
- `Dash.toast(msg, { action: 'Undo', onAction })` gives a toast a button.
- `Dash.place` holds the placement maths `Dash.popup` uses: below or beside, flipped, kept inside the window.

Fixes:

- With a dialog open, toasts and notices showed dimmed under it and could not be clicked. They now show inside it.
- Escape on an open `.menu` inside a dialog closed the dialog too. Now it closes the menu only.
- Pressing in a dialog's field and letting go over the backdrop, as when selecting text, closed the dialog. A backdrop click now has to start there.
- Tests: 121 browser checks, each popup check run with and without the browser's own popovers. All 85 deliberate breakages of the kit are caught. A check whose run crashes still reports the failures found before it.

## 1.3.1 (2026-11-21)

Fixes in 1.3.0's new pieces, found by checking the paths around each one:

- `Dash.table`: a row click while a refresh waits (the reader had text selected in the table) got the row of the new order, not the one on screen. Selecting text in a row no longer counts as clicking it. With `wrap: true`, the sideways scroll survives a refresh.
- `Dash.search` with `store`: a remembered query is applied on load (`onChange` runs with it), not just put back in the box.
- Tooltips inside an open dialog or drawer showed under it; they are drawn in the dialog now.
- `Dash.fmt.date` and `.time` read times as `Dash.time` does (text without a zone is UTC; loose text is "—"), so they agree with `Dash.ago` and the timeline.
- `Dash.csv`: text that is just a number (`-3`, `+1.5`) stays a number instead of getting a leading `'`.
- Tests: 71 browser checks; a check that crashes prints a FAIL line.

## 1.3.0 (2026-11-21)

More pieces, so a dashboard needs less of its own code. All additive.

- `Dash.table(el, { columns })`: a whole table from a description of its columns: sorting (remembered), paging, a filter, CSV export, cards on phones, an empty state, row clicks and Enter. `.update(rows)` redraws without losing the reader's place.
- `Dash.tabs` and `.tabs`: tab buttons over panels, remembered, optionally kept in the address (`#view=list`), with arrow keys.
- Menus: `<details class="menu">` with a `.menu-list` closes on a click outside, on Escape and once an item is chosen, with no code.
- Tooltips: `data-tooltip="…"` on anything; on hover and keyboard focus, kept inside the window.
- `Dash.confirm`, `Dash.ask`, `Dash.dialog`: a question in one line, answered as a promise.
- `Dash.timeline` and `.timeline`: events on a line.
- Stacked columns: a `Dash.bars` point with `parts: [{ value, tone }]`.
- `Dash.stat(label, value, { unit, note, tone })`: a stat tile.
- Live times: `Dash.ago(t)` and `Dash.until(t)` keep themselves current.
- `Dash.time(x)`: milliseconds from what a server sends (ISO text without a zone is UTC, seconds with `{ seconds: true }`); other text is `NaN`, not a guess.
- `Dash.fmt.date`, `.time`, `.until`.
- `Dash.tone(v, { 75: 'warn', 90: 'bad' })`: a tone from thresholds.
- `Dash.search` (debounced, Escape clears, `/` jumps to it, a count), `Dash.key` (shortcuts that stay quiet while typing), `Dash.match` (every word in some field).
- `Dash.hash`: the address after `#` as settings.
- `Dash.sum`, `Dash.groupBy`, `Dash.csv`, `Dash.download`.
- The gallery has a "Tabs and menus" section with all of it; the starter page uses `Dash.table`, `Dash.stat` and `Dash.ago`.
- Tests: 26 node tests, 65 browser checks.

## 1.2.0 (2026-11-21)

Simpler pages: less code for the things every dashboard does. All of it is opt-in; pages that don't use it work as before.

- `Dash.render(el, html, { force })`: refresh part of a page without losing the reader's place. It skips the write when nothing changed and while text is being selected there, and keeps focus (with what's typed and the caret), open `<details>` and inner scroll positions, matched by `id` or `data-key`.
- `Dash.poll(fn, ms, { live, staleAfter })`: with `live`, the top bar's status follows by itself (Connecting…, Live, the error, "No update since …").
- `Dash.bars(points, { read })`: a readout line that shows the hovered column, and its own text after.
- `Dash.copyButton(text, label, { quiet })`: "Copied ✓" survives a redraw in that moment; `quiet` (`data-quiet`) skips the toast.
- `data-toggle-side` fires `dash:side` (`detail.collapsed`).
- `Dash.seg` reads a saved number or plain string; a number works as `value`.
- `.topbar.static-md`, `--stat-min-sm` for phone tiles, `--count-w` for the search count.
- Fixed: typed text in a `.search` ran under its `.count`.
- `tools/paste.py`: fill a one-file page's `<style id="dash-ui-css">` and `<script id="dash-ui-js">`, or `--check` it.
- `test/behaviour.mjs` (`npm run behaviour`): the above in a real browser. The starter page uses `Dash.render` and `Dash.poll`'s `live`.

## 1.1.1 (2026-11-21)

- Light mode: `ok`, `warn`, `orange`, `gold` and `silver` are 5–8 % darker, `bronze` and `idle` 2 %, so text in a tinted pill, tag or rank (10–14 % tints) reaches WCAG AA, 4.5:1. Dark mode is unchanged. The contrast test now asks for 4.5 on those tints.
- `test/screens.mjs` (`npm run screens`): every page in a real browser at four widths, light and dark.
- The gallery shows the `connecting` live state.

## 1.1.0 (2026-11-21)

What the balances dashboard needed when it moved onto the kit:

- `.unit`: a unit after a number or in a table header (`Latency <span class="unit">ms</span>`); headers don't uppercase it.
- `Dash.th(label, key, sort, { unit, mark })`: `unit` adds one; `mark: false` for a second column that sorts by the same key; `key` null gives a plain, unsortable header.
- `Dash.chg(v, text, { eps, title })`: a small change counts as flat; a tooltip.
- `fmt.signedUsd(n, d)`: fixed decimals (`+$732.60`).
- `td.actions`: a row's buttons at the right, as narrow as they are; on a stacked card they sit in its top-right corner (`--actions-w` on the table keeps the title clear of them, 96px).
- `.table.compact`: 8px cell padding for a table with many columns.
- `.stats.fixed`: exactly `--stat-cols` tiles across (4), two from 900 px down. `.stat .note.wrap` lets a note run to a second line.
- `.live[data-state="connecting"]`: the dot pulses.
- `.invisible`: hidden but keeps its space (a button-sized gap so names line up).
- Icon buttons in table cells are centred on the text line (a row with a button-sized gap is no taller than one with a button).
- Version in the first line of both files, this changelog, and tests that they agree; a contrast test.

## 1.0.1 (8ff13f1)

- `.table.stack.stack-md`: rows become cards from 900 px down instead of 640.
- `.table-wrap` is `position: relative`, so an `.sr-only` label in a wide table no longer widens the page.

## 1.0.0 (7dcc13f, ed1f4cc)

The kit: tokens, components, helpers, the gallery and examples.
