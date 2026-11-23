# Changelog

Dashboards keep a copy of `dash.css` and `dash.js`; the first line of each file says which version it is. Versions only add things: a page that worked with an older copy works the same with a newer one.

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
