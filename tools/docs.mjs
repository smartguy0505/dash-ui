#!/usr/bin/env node
// Writes the docs site: docs/<page>.html from docs-src/<page>.html, and docs/search.js (what the search box finds).
//   node tools/docs.mjs            write docs/ (links the kit as ../dash.css: GitHub Pages from the repo's root)
//   node tools/docs.mjs --check    exit 1 if docs/ isn't what this writes (the tests run it)
//   node tools/docs.mjs --flat DIR the same pages with the kit beside them, in DIR (for hosting the docs on their own)
// In a source page:
//   <section id="select" data-terms=".select .input-group Dash.slider">  the names the search finds there (and the
//     coverage test counts: every class in dash.css and every Dash function is in some section's data-terms)
//   <example>…HTML, and <script>s…</example>   shown live, and printed under it from the same text, with Copy,
//     Phone and Dark buttons. Its scripts run where it stands, after dash.js.
//   <example frame>…</example>                   one that takes the whole screen (a bottom nav, a drawer): not put in the
//     page, only printed; Phone and Other theme show it alone
//   <utilities group="flex"></utilities>         the group's classes from tools/utils.mjs, with what each sets
//   <components></components>                    every component by its class: a card per section of the pages under "Components"
// A section's data-nav is its name in the sidebar, where its h2 is too long for that.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { groupList, WIDTHS, MAX_WIDTHS } from './utils.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const version = JSON.parse(read('package.json')).version;
const Dash = createRequire(import.meta.url)('../dash.js');

// [file, title, side group, one line for the page's head and the search]
export const PAGES = [
  ['index', 'Getting started', 'Start', 'Two files and a page: what dash-ui is, how to add it, and how a page is put together.'],
  ['components', 'All components', 'Start', 'Every component in the kit, by its class.'],
  ['colours', 'Colours and themes', 'Foundations', 'The palette as tokens, the tones every component takes, and light and dark.'],
  ['layout', 'Page layout', 'Foundations', 'The top bar, the page, grids, rows and the phone navigation.'],
  ['text', 'Text', 'Foundations', 'Text styles: sizes, tones, numbers, code, and text that is cut short.'],
  ['buttons', 'Buttons', 'Components', 'Buttons, icon buttons, links, segmented controls, menus, the floating button and spinners.'],
  ['forms', 'Forms', 'Components', 'Inputs, fields, selects, input groups, checkboxes and radios, choices, switches, sliders, file drops, suggestions, dates, and saying what is wrong.'],
  ['labels', 'Labels and badges', 'Components', 'Status pills, tags, chips, changes, ranks, avatars and badges.'],
  ['lists', 'Lists and trees', 'Components', 'Lists to read, to pick from and to put in order, trees, facts and timelines.'],
  ['tables', 'Tables', 'Components', 'Tables with sorting, row states, sticky headers, and rows that become cards on a phone.'],
  ['charts', 'Charts and progress', 'Components', 'Bars, meters, legends, column charts, donuts, gauges, sparklines, lanes and progress.'],
  ['surfaces', 'Panels and cards', 'Components', 'Panels, cards, stat tiles, the big number, callouts, banners, accordions and dividers.'],
  ['navigation', 'Navigation', 'Components', 'The sidebar with its groups and its drawer, the section being read, tabs, breadcrumbs, steps and pages.'],
  ['overlays', 'Modals and popups', 'Components', 'Modals, dialogs, drawers, questions, popups, menus and tooltips.'],
  ['feedback', 'Feedback', 'Components', 'Toasts, notices, the live status, flashes, empty states and loading lines.'],
  ['privacy', 'Privacy and sign-in', 'Components', 'Hiding amounts and addresses behind an eye, and the sign-in page.'],
  ['helpers', 'dash.js helpers', 'JavaScript', 'Formatting, times, rendering, fetching and polling, the store, keys, search and the page hash.'],
  ['utilities', 'Utility classes', 'Utilities', 'dash-utils.css: what it is, how a utility beats the kit, variants, widths, dark and print.'],
  ['utilities-layout', 'Layout utilities', 'Utilities', 'Display, position, overflow, flex, grid and alignment.'],
  ['utilities-spacing', 'Spacing utilities', 'Utilities', 'Padding, margin, gap and space between, in 4 px steps.'],
  ['utilities-sizing', 'Sizing utilities', 'Utilities', 'Widths, heights and sizes.'],
  ['utilities-type', 'Type utilities', 'Utilities', 'Text size, weight, alignment, wrapping, clamping and numbers.'],
  ['utilities-colour', 'Colour utilities', 'Utilities', 'Text, background and border colours from the tokens, with tints.'],
  ['utilities-effects', 'Borders and effects', 'Utilities', 'Borders, radius, shadows, rings, opacity, motion and interaction.'],
];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dedent = (s) => {
  const lines = s.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
};

// ---- code in colour: tags, attributes, strings, comments, keywords (classes from docs.css, colours from the kit's tokens)
const span = (c, t) => `<span class="${c}">${t}</span>`;
const JS_WORDS = /^(const|let|var|await|async|return|new|if|else|for|of|in|function|true|false|null|undefined|try|catch|finally|throw|typeof)$/;
export const paintJs = (s) => s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(\d[\d_.e]*)\b|([A-Za-z_$][\w$]*)|([\s\S])/g,
  (m, com, str, num, word, other) => (com ? span('c-com', esc(com)) : str ? span('c-str', esc(str)) : num ? span('c-num', num)
    : word ? (JS_WORDS.test(word) ? span('c-key', word) : word === 'Dash' ? span('c-fn', word) : esc(word)) : esc(other)));
const paintTag = (t) => {
  const m = /^<(\/?)([\w-]+)([\s\S]*?)(\/?)>$/.exec(t);
  if (!m) return esc(t);
  const attrs = m[3].replace(/([^\s=]+)(=("[^"]*"|'[^']*'|[^\s>]+))?/g, (x, n, eq, v) => span('c-attr', esc(n)) + (eq ? '=' + span('c-str', esc(v)) : ''));
  return `&lt;${m[1]}${span('c-tag', m[2])}${attrs}${m[4]}&gt;`;
};
export const paintHtml = (s) => s.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)|<!--[\s\S]*?-->|<\/?[a-zA-Z][\w-]*(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g, (m, open, js, close) => {
  if (open) return paintTag(open) + paintJs(js) + paintTag(close);
  if (m.startsWith('<!--')) return span('c-com', esc(m));
  if (/^<\/?[a-zA-Z]/.test(m)) return paintTag(m);
  return esc(m);
});

// ---- the utilities a group has, from tools/utils.mjs: one row per class, and which variants it takes
const VARIANT_NOTE = { responsive: Object.keys(WIDTHS).map((w) => w + ':').join(' '), max: Object.keys(MAX_WIDTHS).map((w) => w + ':').join(' '),
  hover: 'hover:', 'group-hover': 'group-hover:', focus: 'focus:', 'focus-visible': 'focus-visible:', 'focus-within': 'focus-within:', active: 'active:',
  disabled: 'disabled:', dark: 'dark:', print: 'print:' };
const utilityTable = (title) => {
  const g = groupList().find((x) => x.title === title);
  if (!g) throw new Error(`no utility group "${title}"`);
  const variants = Object.entries(g.variants).filter(([, names]) => names.length);
  const head = variants.length
    ? `<p class="util-variants">With ${variants.map(([v, names]) => `<code>${esc(VARIANT_NOTE[v] || v + ':')}</code>${names.length < g.rules.length ? ` (${names.length === 1 ? esc(names[0]) : `${names.length} of them`})` : ''}`).join(', ')}.</p>`
    : '<p class="util-variants">No variants: these are the same at every width.</p>';
  const rows = g.rules.map(([n, d]) => `<tr><td><code>${esc(n)}</code></td><td><code class="decl">${esc(d.replace(/\|/, ' { ').replace(/^> /, '> ') + (d.includes('|') ? ' }' : ''))}</code></td></tr>`).join('');
  return `${head}<div class="table-wrap util-table"><table class="table compact"><thead><tr><th>Class</th><th>Sets</th></tr></thead><tbody>${rows}</tbody></table></div>`;
};

// ---- a page
const SECTION = /<section id="([^"]+)"(?: data-nav="([^"]*)")?(?: data-terms="([^"]*)")?[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/g;
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const sectionsOf = (src) => [...src.replace(/<example[\s\S]*?<\/example>/g, '').matchAll(SECTION)] // (an example may hold sections of its own)
 .map(([, id, nav, terms, h]) => ({ id, title: strip(h), nav: nav || strip(h), terms: (terms || '').split(/\s+/).filter(Boolean) }));
const href = (file, id) => (file === 'index' ? './' : file + '.html') + (id ? '#' + id : '');
// the sidebar: the pages by their class, each with its sections; on its own page a section is a link within it (Dash.spy marks it)
const sideNav = (current, all) => {
  const items = [];
  let group = '';
  for (const [file, title, g] of PAGES) {
    if (g !== group) { items.push({ heading: g }); group = g; }
    const parts = all[file];
    items.push(parts.length < 2 ? { label: title, href: href(file) }
      : { label: title, key: file, open: file === current, items: parts.map((p) => ({ label: p.nav, href: file === current ? '#' + p.id : href(file, p.id) })) });
  }
  return Dash.nav.html(items, { current: href(current) });
};
// every section of the pages under "Components", as cards by class
const componentCards = (all) => PAGES.filter((p) => p[2] === 'Components').map(([file, title, , blurb]) => {
  const src = read(`docs-src/${file}.html`);
  const cards = all[file].map((p) => {
    const at = src.indexOf(`<section id="${p.id}"`);
    const text = strip(/<p>([\s\S]*?)<\/p>/.exec(src.slice(at))?.[1] || '');
    const first = (/^.*?[.:!](?=\s+[A-Z.]|$)/.exec(text)?.[0] || text).replace(/:$/, '.');
    return `<a class="card" href="${href(file, p.id)}" data-find="${esc(p.terms.join(' '))}"><div class="card-title">${esc(p.title)}</div><div class="card-sub">${esc(first)}</div></a>`;
  }).join('\n');
  return `    <section class="docs-class" id="${file}">\n      <h2><a class="docs-class-name" href="${href(file)}">${esc(title)}</a> <span class="count-badge">${all[file].length}</span></h2>\n      <p>${esc(blurb)}</p>\n      <div class="cards">${cards}</div>\n    </section>`;
}).join('\n');

export function build({ kit = '../', bare = false } = {}) {
  const pages = {}, index = [], terms = [];
  const all = Object.fromEntries(PAGES.map(([file]) => [file, sectionsOf(read(`docs-src/${file}.html`))]));
  PAGES.forEach(([file, title, group, blurb], at) => {
    let src = read(`docs-src/${file}.html`);
    let n = 0;
    src = src.replace('<components></components>', () => componentCards(all));
    src = src.replace(/<utilities group="([^"]+)"><\/utilities>/g, (m, t) => utilityTable(t));
    src = src.replace(/<example((?:\s+[\w-]+(?:="[^"]*")?)*)>([\s\S]*?)<\/example>/g, (m, attrs, body) => {
      const code = dedent(body);
      const id = `ex-${++n}`;
      const title = (/\btitle="([^"]*)"/.exec(attrs) || [])[1];
      const cls = (/\bclass="([^"]*)"/.exec(attrs) || [])[1];
      const frame = /\sframe\b/.test(attrs);
      return `<figure class="example${cls ? ' ' + cls : ''}${frame ? ' framed' : ''}" id="${id}">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}`
        + (frame ? '<div class="example-view"><p class="muted">This one takes the whole screen, so it isn\'t shown in the page: open it with Phone or Other theme.</p></div>'
          : `<div class="example-view">\n${code}\n</div>`)
        + `<div class="example-bar"><button type="button" class="btn sm ghost" data-copy="${esc(code)}">Copy</button>`
        + `<button type="button" class="btn sm ghost" data-preview="phone">Phone</button><button type="button" class="btn sm ghost" data-preview="theme">Other theme</button></div>`
        + `<pre class="example-code"><code>${paintHtml(code)}</code></pre></figure>`;
    });
    const sections = all[file];
    const url = (h) => href(file, h);
    index.push({ t: title, p: group, u: url('') });
    for (const { id, title: h, terms: names } of sections) {
      index.push({ t: h, p: title, u: url(id) });
      for (const name of names) {
        terms.push({ name, page: file, id });
        index.push({ t: name, p: `${title} › ${h}`, u: url(id), k: 1 });
      }
    }
    const toc = sections.length > 1 ? `<nav class="chips docs-toc" aria-label="On this page">${sections.map((p) => `<a class="chip" href="#${p.id}">${esc(p.title)}</a>`).join('')}</nav>` : '';
    const prev = PAGES[at - 1], next = PAGES[at + 1];
    const link = (p, rel) => (p ? `<a class="docs-step ${rel}" href="${p[0] === 'index' ? './' : p[0] + '.html'}"><span class="faint">${rel === 'prev' ? 'Previous' : 'Next'}</span><b>${esc(p[1])}</b></a>` : '<span></span>');
    const head = `<title>${file === 'index' ? 'dash-ui docs' : esc(title) + ' · dash-ui'}</title>\n<meta name="description" content="${esc(blurb)}">\n`
      + `<link rel="stylesheet" href="${kit}dash.css">\n<link rel="stylesheet" href="${kit}dash-utils.css">\n<link rel="stylesheet" href="docs.css">\n<script src="${kit}dash.js"></script>\n`;
    const body = `<header class="topbar">
  <button type="button" class="icon-btn docs-menu" data-toggle-side aria-label="Pages"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  <a class="brand" href="./"><span class="mark">d</span><h1>dash-ui</h1></a><span class="tag plain docs-version">${esc(version)}</span>
  <div class="top-right">
    <label class="search docs-search"><span class="sr-only">Search the docs</span><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><path d="m11 11 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input class="input" type="search" id="docs-search" placeholder="Search" aria-keyshortcuts="/"><kbd class="docs-key">/</kbd></label>
    <div class="seg" role="group" aria-label="Theme"><button type="button" data-theme-set="system">Auto</button><button type="button" data-theme-set="light">Light</button><button type="button" data-theme-set="dark">Dark</button></div>
  </div>
</header>
<div class="shell offcanvas">
  <nav class="sidebar" aria-label="Pages">
    <label class="search docs-filter"><span class="sr-only">Filter the list</span><input class="input sm" id="docs-filter" type="search" placeholder="Filter components" autocomplete="off"></label>
    <div id="docs-nav">${sideNav(file, all)}</div>
  </nav>
  <main class="content docs" id="top" data-page="${file}">
    <header class="docs-head"><p class="docs-group">${esc(group)}</p><h1>${esc(title)}</h1><p class="docs-blurb">${esc(blurb)}</p>${toc}</header>
${src.trim()}
    <nav class="docs-steps" aria-label="More pages">${link(prev, 'prev')}${link(next, 'next')}</nav>
  </main>
</div>
<script src="search.js"></script>
<script src="docs.js"></script>
`;
    const doc = bare && file === 'index'
      ? `${head}<!-- dash-ui ${esc(version)} docs, written by tools/docs.mjs from docs-src/${file}.html -->\n${body}`
      : `<!doctype html>\n<html lang="en" data-kit="${kit}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}</head>\n<body>\n`
        + `<!-- dash-ui ${esc(version)} docs, written by tools/docs.mjs from docs-src/${file}.html: edit that, not this -->\n${body}</body>\n</html>\n`;
    pages[`${file}.html`] = bare && file === 'index' ? doc.replace('<title>', `<script>document.documentElement.dataset.kit = ${JSON.stringify(kit)};</script>\n<title>`) : doc;
  });
  pages['search.js'] = `/* dash-ui ${version} docs: what the search box finds (written by tools/docs.mjs) */\nwindow.DOCS_INDEX = [\n${index.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n];\n`;
  return { pages, terms };
}

const STATIC = ['docs.css', 'docs.js'];
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flat = args.includes('--flat') ? args[args.indexOf('--flat') + 1] : null;
  if (flat) {
    const { pages } = build({ kit: '', bare: true });
    mkdirSync(flat, { recursive: true });
    for (const [f, s] of Object.entries(pages)) writeFileSync(`${flat}/${f}`, s);
    for (const f of STATIC) copyFileSync(new URL(`docs/${f}`, root), `${flat}/${f}`);
    for (const f of ['dash.css', 'dash.js', 'dash-utils.css']) copyFileSync(new URL(f, root), `${flat}/${f}`);
    console.log(`${flat}: ${Object.keys(pages).length} files and the kit`);
  } else {
    const { pages } = build();
    const out = new URL('docs/', root);
    if (args.includes('--check')) {
      const stale = Object.entries(pages).filter(([f, s]) => !existsSync(new URL(f, out)) || readFileSync(new URL(f, out), 'utf8') !== s).map(([f]) => f);
      const extra = readdirSync(out).filter((f) => f.endsWith('.html') && !pages[f]);
      if (stale.length || extra.length) { console.error(`docs/ is out of date: ${[...stale, ...extra.map((f) => f + ' (no source)')].join(', ')}; run node tools/docs.mjs`); process.exit(1); }
      console.log('docs/ is up to date');
    } else {
      mkdirSync(out, { recursive: true });
      for (const [f, s] of Object.entries(pages)) writeFileSync(new URL(f, out), s);
      if (!existsSync(new URL('.nojekyll', root))) writeFileSync(new URL('.nojekyll', root), ''); // GitHub Pages: serve the repository's files as they are
      console.log(`docs/: ${Object.keys(pages).length - 1} pages and search.js`);
    }
  }
}
