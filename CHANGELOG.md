# Changelog

Dashboards keep a copy of `dash.css` and `dash.js`; the first line of each file says which version it is. Versions only add things: a page that worked with an older copy works the same with a newer one.

## Unreleased

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
