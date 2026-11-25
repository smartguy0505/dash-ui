/* dash-ui docs: the Phone and Other theme previews of an example, and the search box. Each example's code is in its Copy
   button (tools/docs.mjs writes the example, its code and that button from one text). */
(() => {
  const kit = new URL(document.documentElement.dataset.kit ?? '../', document.baseURI);
  const dark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  // the example alone, in a frame of its own: a sandbox, so its code can't reach this page (or its saved theme)
  const page = (code, theme, whole) => `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<link rel="stylesheet" href="${new URL('dash.css', kit)}"><link rel="stylesheet" href="${new URL('dash-utils.css', kit)}">`
    + `<script src="${new URL('dash.js', kit)}"><\/script>`
    + `<script>Dash.theme.get = () => ${JSON.stringify(theme)}; Dash.theme.apply();<\/script>` // a sandbox has no storage to read the theme from
    + `</head><body>${whole ? code : `<main class="page">${code}</main>`}</body></html>`; // whole: it brings its own top bar or page
  const preview = (ex, how) => {
    const code = ex.querySelector('[data-copy]').dataset.copy;
    const name = ex.querySelector('figcaption')?.textContent || ex.closest('section')?.querySelector('h2')?.textContent || 'Example';
    const theme = how === 'theme' ? (dark() ? 'light' : 'dark') : dark() ? 'dark' : 'light';
    const frame = document.createElement('iframe');
    frame.className = 'preview-frame' + (how === 'phone' ? ' phone' : '');
    frame.title = `${name}, ${how === 'phone' ? 'on a phone' : theme}`;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = page(code, theme, ex.classList.contains('framed') || /<main\b|class="topbar\b/.test(code));
    Dash.modal({ title: `${name}: ${how === 'phone' ? 'on a phone (390 px)' : theme}`, body: frame, size: how === 'phone' ? 'md' : 'lg', cancel: 'Close' });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.example-bar [data-preview]');
    if (b) preview(b.closest('.example'), b.dataset.preview);
  });
  // the "Other theme" buttons say which one they show
  const name = () => { for (const b of document.querySelectorAll('[data-preview="theme"]')) b.textContent = dark() ? 'Light' : 'Dark'; };
  name();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', name);
  new MutationObserver(name).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // a link to a section that has moved to another page since goes there
  const MOVED = {
    text: { pills: 'labels', tags: 'labels', chips: 'labels', changes: 'labels', avatars: 'labels', badges: 'labels', tooltips: 'overlays' },
    surfaces: { facts: 'lists', entries: 'lists', empty: 'feedback' },
    navigation: { timeline: 'lists' },
    layout: { sidebar: 'navigation', drawer: 'navigation' },
    feedback: { private: 'privacy', ips: 'privacy', login: 'privacy' },
  };
  const moved = () => {
    const id = location.hash.slice(1), to = MOVED[document.querySelector('main')?.dataset.page]?.[id];
    if (to && !document.getElementById(id)) location.replace(new URL(`${to}.html#${id}`, location.href.split('#')[0]).href);
  };
  moved();
  window.addEventListener('hashchange', moved);

  // the sidebar: its groups are remembered, its box filters it, and the section being read is marked
  const side = document.getElementById('docs-nav');
  if (side && Dash.nav) {
    const nav = Dash.nav(side, null, { current: side.querySelector('[aria-current="page"]')?.getAttribute('href'), store: 'dash-docs-nav' });
    Dash.spy(side);
    Dash.search('docs-filter', { key: null, onChange: (text) => nav.filter(text) });
  }

  // all components: the box shows the ones with the words in their name, their text, or their classes and functions
  const find = document.getElementById('docs-find');
  if (find) {
    const cards = [...document.querySelectorAll('.docs-class .card')], count = document.getElementById('docs-found');
    Dash.search(find, { key: null, onChange: (text) => {
      let n = 0;
      for (const c of cards) { c.hidden = !Dash.match({ t: c.textContent, f: c.dataset.find }, text, ['t', 'f']); if (!c.hidden) n += 1; }
      for (const s of document.querySelectorAll('.docs-class')) s.hidden = !s.querySelector('.card:not([hidden])');
      count.textContent = text ? (n ? Dash.fmt.plural(n, 'component') : 'Nothing by that name') : `${cards.length} components`;
    } });
    count.textContent = `${cards.length} components`;
  }

  // search every page, section and name (docs/search.js)
  const q = document.getElementById('docs-search');
  if (q && window.DOCS_INDEX && Dash.combobox) {
    const here = new URL('.', location.href);
    Dash.combobox(q, {
      label: 'Search the docs', max: 14, minChars: 1, empty: 'Nothing by that name',
      options: window.DOCS_INDEX.map((e) => ({ label: e.t, sub: e.p, value: e.u })),
      onPick: (o) => { location.href = new URL(o.value, here).href; },
    });
  }
  if (q) Dash.key('/', () => { q.focus(); q.select(); });
})();
