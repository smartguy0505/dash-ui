# Contributing to dash-ui

For people and for coding agents. The [README](README.md) says what the kit has and how a page uses it; this says how to change it.

In one minute:

1. The kit is `dash.css` and `dash.js`, written by hand. There is nothing to build or install to use it.
2. `docs/`, `dash-utils.css` and `screenshots/` are **generated**. Change what they come from, never the files themselves.
3. Versions only add things: a page written for an older version must look and work as it did.
4. The repository is public: **made-up data only**.
5. A change is done when the three test suites pass, its docs are written, and somebody has *looked at it and used it* in a browser.

## Get it running

```sh
git clone https://github.com/smartguy0505/dash-ui.git
cd dash-ui
npm run serve          # or any static server: http://127.0.0.1:8096/ is the gallery, /docs/ the docs, /examples/… whole pages
```

Edit `dash.css` or `dash.js`, reload the page. For the browser checks, once:

```sh
npm i --no-save playwright-core && npx playwright-core install --only-shell chromium
```

(A current Node; the suites are run on Node 24. `playwright-core` is not a dependency of the kit and stays out of `package.json`.)

## Where things are

| | | |
|---|---|---|
| `dash.css` | by hand | tokens, components, small screens, high contrast. A block per component: `/* ---- boards (1.17) ---- */` |
| `dash.js` | by hand | one script, `window.Dash`, also `require('./dash.js')` in Node. A block per component: `// ---- boards (1.17)` |
| `dash-utils.css` | `node tools/utils.mjs` | the utility classes |
| `docs-src/*.html` | by hand | the docs' pages; every example in them is live |
| `docs/*.html`, `docs/search.js` | `node tools/docs.mjs` | the docs site. (`docs/docs.css` and `docs/docs.js` are by hand) |
| `index.html` | by hand | the gallery: every component on one page |
| `examples/` | by hand | whole pages made with the kit |
| `screenshots/` | `node tools/shots.mjs` | the pictures in the README |
| `test/` | by hand | the tests, and the pages they open |
| `README.md` | by hand | the reference: every class, every function |
| `CHANGELOG.md` | by hand | what each version added |

## Ground rules

**No build step, no dependencies.** Plain CSS, one plain script, browsers as they are today.

**Versions only add.** No class, function, option or default changes its meaning. If something has to look different, it gets a new name or an option. A fix may change what was plainly broken; the changelog says so.

**Made-up data only**, in pages, docs, tests, screenshots and commit messages. No real people, customers, accounts, servers, addresses or keys. For IP addresses use the documentation ranges (`192.0.2.x`, `198.51.100.x`, `203.0.113.x`).

**What comes from data is text.** Every builder escapes it (`esc`), and a link goes through `safeHref`. Options that take HTML say so (`lead`, `end`).

**Every component works**

- in light and dark, with colours from the tokens only (`var(--blue)`, never a colour of its own);
- from a 390 px phone to a wide screen, without the page scrolling sideways;
- by mouse, by finger and by keyboard, and when it is read out;
- on a page that reads from the right (`margin-inline-start`, not `margin-left`);
- with reduced motion, and in high contrast (forced colours), where backgrounds and shadows are gone;
- under `Content-Security-Policy: style-src 'self'`: new builders write no `style=""`; sizes are set from the script.

**A refresh keeps the reader's place.** Dashboards are drawn again every few seconds. Focus, scroll, what is selected, typed, open or being dragged stays.

**Both files can be pasted into a page**, so neither has a closing script or style tag in it, not even in a comment.

## How a component is made

**CSS.** `.thing`, with parts named after it: `.thing-head`, `.thing-row`. Its colour is one variable, `--c`, with a default in `:where()`; the tone classes (`.ok`, `.warn`, `.bad`, `.blue` …) set it. States are ARIA attributes (`[aria-pressed="true"]`, `[aria-current]`), not `.active`. The dark palette is written twice; keep the two the same (a test compares them).

**JavaScript.** There are two kinds of function:

- *Builders* take data and give HTML: `Dash.pill('Healthy', 'ok')`. They need no page, so they also work in Node.
- *Components* take an element (or its id) and options, and give a handle: `const board = Dash.board('work', { … })`. A component

  - gives `null` if there is no such element, or no page;
  - takes the place of an earlier one on the same element (`node.__dashThing?.destroy()`);
  - has `el`, `update(data)` and `destroy()`, and puts all its listeners on one `AbortController`'s signal;
  - draws with `Dash.render`, and gives what takes the focus or scrolls a `data-key`, so that both survive a redraw;
  - holds a redraw back while the reader is in the middle of something (a press, a drag, an open field);
  - says what changed to a screen reader (`voiceOf(node).textContent = …`);
  - takes `title`, `sub`, `key` and the like as a field's name or a function, as `Dash.list` does.

Look at a neighbour before writing a new one: `Dash.list` (1.14) and `Dash.board` (1.17) show all of this. Comments say *why*, or what would go wrong without it; plain words, short sentences, as in the rest of the file.

## A change, step by step

For a new component; a fix needs the steps that apply.

1. **CSS** in its block in `dash.css`, before `/* ---- smaller screens ---- */`; what changes on a phone, or in high contrast, goes in those blocks.
2. **JavaScript** in its block in `dash.js`, with a comment on top that says how it is called.
3. **A test page**, `test/thing.html`, and checks in `test/behaviour.mjs` under a new `// ---- 1.x thing (test/thing.html)` line. What has no page (formats, builders) is checked in `test/dash.test.mjs`.
4. **Docs**: a `<section id="thing" data-terms="Dash.thing .thing .thing-row …">` in a page of `docs-src/`. Every class in `dash.css` and every `Dash` function must be named in some section (a test counts them). [How a source page is written](README.md#the-docs).
5. **The gallery** (`index.html`), and the class and function lists in `README.md`.
6. **The version**, in four places: the first line of `dash.css`, the first line of `dash.js`, `version:` in `dash.js`, and `package.json`. A new thing is a new middle number (1.17.0), a fix a new last one (1.17.1). Put what changed on top of `CHANGELOG.md`.
7. **What is generated**:

   ```sh
   node tools/utils.mjs && node tools/docs.mjs
   node tools/shots.mjs            # if a page in the README's pictures looks different now
   ```

8. **The three suites** (below), then look at it: light and dark, on a phone, with the keyboard alone.

## Tests

```sh
npm test                           # 2 s: formats, escaping, the palettes, that docs/ is up to date and complete
npm run behaviour                  # some minutes: every component in a real browser
npm run screens                    # some minutes: every page at four widths, light and dark: nothing scrolls sideways, no errors
node test/only.mjs 1.17            # only the parts of behaviour.mjs with that in their name (no name: lists them)
KIT=/some/dir npm run behaviour    # with dash.css, dash.js and dash-utils.css from another folder
```

How to write a check that is worth having:

- **Use it as a reader does**: a real mouse (`page.mouse`), a real finger (touch events), real keys. Not `element.click()`, unless it is the page that calls.
- **Read what is on the screen**: text, order, boxes, pixels of a screenshot. A check that works a position out from the CSS agrees with the CSS even when the screen is wrong. That has happened here.
- **Break the code on purpose** and see the check fail. Copy the kit to a folder, take out a line, run with `KIT=` (or in place, and put it back). A line nothing fails without is either not needed or not checked.
- **No luck with time**: where the order of things matters, have the page hold its answer until the check lets it go. Don't wait 200 ms and hope.
- Wrong is a failed check, not a crash: a check that throws hides the ones after it.

Never weaken a check to get a change through. If it is wrong, say why in the commit.

## Commits and pull requests

- One thing per pull request. Say what it does, why, and how you tried it; add a picture in light, dark and at 390 px if it can be seen.
- A commit's first line says what changed in plain words (`1.16.2: the code box works as boxes do`).
- Add files by name, and read `git status` first: `node_modules` and `screens/` stay out (`*.png` is ignored; the README's pictures are WebP).
- Generated files go in the same commit as what they come from.

## For coding agents

Everything above, and:

- Read the component's neighbours in `dash.css` and `dash.js` before you write; match how they are written.
- Don't edit `docs/*.html`, `docs/search.js`, `dash-utils.css` or `screenshots/`. Don't add dependencies, a build step or a framework.
- Take a screenshot and *look at it* before you say that something works, and use it with real input. Passing checks are not enough.
- Report what you ran and what came out, also what failed and what you didn't try. The suites run in Chromium only: don't claim other browsers.
- Don't put names, addresses, keys, host names or paths from the machine you work on into the repository.
- Don't rewrite history, and don't force-push.

## What would help

- The suites in Firefox and Safari. So far they only run in Chromium.
- A pass with a real screen reader (NVDA, VoiceOver, TalkBack).
- Text contrast: the `faint` and `accent` colours are below 4.5 : 1 on some backgrounds.
- Examples: whole pages that use the kit for something new.
