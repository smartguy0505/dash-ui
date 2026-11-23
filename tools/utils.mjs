// Writes dash-utils.css: the utility classes (p-4, flex, gap-2, text-muted, md:grid-cols-3, hover:bg-soft, dark:hidden …),
// made from the kit's own tokens. Pages don't run this: they link the file it writes, which is committed.
//
//   node tools/utils.mjs          write dash-utils.css
//   node tools/utils.mjs --check  exit 1 if dash-utils.css is not what this script writes
//
// How the file works:
// - Every rule is `.name:not(#\#)`. The :not(#\#) matches every element but counts as an id, so a utility beats the
//   kit's own rules (.panel .head, .table td, .btn:hover …) without !important. Inline styles, the kit's few
//   !important rules ([hidden], .hide-sm) and a page's own !important still win.
// - No utility has the name of a class dash.css or dash.js uses for something else (the tests check). block, fixed
//   and sticky skip the one kit piece that uses them as a modifier (.btn.block, .stats.fixed, .table.sticky).
// - Order: the plain classes, then states (hover:, focus: …), then widths (max-md:, max-sm:, sm:, md:, lg:, xl:),
//   then dark: and print:. A later one wins over an earlier one of the same specificity.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

// ---- scales (px: the kit is in px)
const SPACE = { 0: '0', px: '1px', 0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 2.5: '10px', 3: '12px', 3.5: '14px', 4: '16px', 5: '20px', 6: '24px', 7: '28px',
  8: '32px', 10: '40px', 12: '48px', 14: '56px', 16: '64px', 20: '80px', 24: '96px' };
const BIG = { 28: '112px', 32: '128px', 36: '144px', 40: '160px', 44: '176px', 48: '192px', 56: '224px', 64: '256px', 72: '288px', 80: '320px', 96: '384px' };
const SIZE = { ...SPACE, ...BIG };
const FRACTION = { '1/2': '50%', '1/3': '33.333333%', '2/3': '66.666667%', '1/4': '25%', '3/4': '75%', '1/5': '20%', '2/5': '40%', '3/5': '60%', '4/5': '80%',
  '1/6': '16.666667%', '5/6': '83.333333%' };
const NEG = ['px', 0.5, 1, 2, 3, 4, 6, 8];
// the kit's colour tokens: each follows light and dark by itself
const TOKENS = ['bg', 'card', 'text', 'muted', 'faint', 'line', 'soft', 'accent', 'blue', 'ok', 'warn', 'bad', 'teal', 'purple', 'orange', 'pink', 'gold',
  'silver', 'bronze', 'idle'];
const COLOURS = { ...Object.fromEntries(TOKENS.map((t) => [t, `var(--${t})`])), tone: 'var(--c, currentColor)', current: 'currentColor',
  transparent: 'transparent', inherit: 'inherit', white: '#fff', black: '#000' };
const TINTS = [5, 10, 15, 20, 30, 50];
const tint = (t, n) => `color-mix(in srgb, var(--${t}) ${n}%, transparent)`;
export const WIDTHS = { sm: 641, md: 901, lg: 1024, xl: 1280 }; // sm: past the kit's phone layout (≤ 640), md: past its smaller screens (≤ 900)
export const MAX_WIDTHS = { 'max-md': 900, 'max-sm': 640 }; // the kit's own two: what .stack-md and .hide-sm use

// ---- the groups: [name, declarations] pairs, and which variants each group has
const groups = [];
// variants: a list (every rule gets them), or { variant: true | (name) => bool } for some rules only
const group = (title, variants, rules) => groups.push({ title, variants: Array.isArray(variants) ? Object.fromEntries(variants.map((v) => [v, true])) : variants,
  rules: rules.filter(Boolean) });
// at the widths, spacing has the steps pages switch between, not every one
const RSTEP = new Set(['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', 'auto']);
const step = (n) => RSTEP.has(n.slice(n.lastIndexOf('-') + 1)) && !n.startsWith('-');
const BASE_TINT = /\/(5|10|15|20)$/;
const each = (obj, fn) => Object.entries(obj).flatMap(([k, v]) => [].concat(fn(k, v)));
const R = 'responsive', MAX = 'max', H = 'hover', F = 'focus', FV = 'focus-visible', FW = 'focus-within', A = 'active', D = 'disabled', G = 'group-hover',
  DK = 'dark', P = 'print';

// layout
group('display', [R, MAX, DK, P, G], [
  ['block', 'display: block'], ['inline-block', 'display: inline-block'], ['inline', 'display: inline'], ['flex', 'display: flex'],
  ['inline-flex', 'display: inline-flex'], ['inline-grid', 'display: inline-grid'], ['contents', 'display: contents'], ['flow-root', 'display: flow-root'],
  ['list-item', 'display: list-item'], ['hidden', 'display: none'],
]);
// `grid` is the kit's own (display: grid with a 14px gap and var(--cols, 2) columns): the widths get a plain display: grid
const gridDisplay = [['grid', 'display: grid']];
group('position', [R], [['static', 'position: static'], ['relative', 'position: relative'], ['absolute', 'position: absolute'], ['fixed', 'position: fixed'],
  ['sticky', 'position: sticky']]);
const INSET = { 0: '0', px: '1px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', auto: 'auto', full: '100%', '1/2': '50%' };
// shorthands before their parts, so inset-0 top-2 is top 8px (here and in every group below)
group('inset', [], [
  ...[['inset', 'inset'], ['inset-x', 'inset-inline'], ['inset-y', 'inset-block'], ['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left']]
    .flatMap(([n, p]) => [...each(INSET, (k, v) => [[`${n}-${k}`, `${p}: ${v}`]]), ...(n.length > 7 || n.startsWith('inset') ? [] : ['px', 1, 2].map((k) => [`-${n}-${k}`, `${p}: -${SPACE[k]}`]))]),
]);
group('z-index', [], [...[0, 10, 20, 30, 40, 50].map((n) => [`z-${n}`, `z-index: ${n}`]), ['z-auto', 'z-index: auto']]);
group('overflow', [], ['', '-x', '-y'].flatMap((a) => ['auto', 'hidden', 'visible', 'scroll', 'clip'].map((v) => [`overflow${a}-${v}`, `overflow${a}: ${v}`])));
group('box', [], [
  ['box-border', 'box-sizing: border-box'], ['box-content', 'box-sizing: content-box'], ['isolate', 'isolation: isolate'],
  ['visible', 'visibility: visible'], ['not-sr-only', 'position: static; width: auto; height: auto; margin: 0; overflow: visible; clip: auto; white-space: normal'],
  ['aspect-auto', 'aspect-ratio: auto'], ['aspect-square', 'aspect-ratio: 1 / 1'], ['aspect-video', 'aspect-ratio: 16 / 9'], ['aspect-4/3', 'aspect-ratio: 4 / 3'],
  ...['contain', 'cover', 'fill', 'none', 'scale-down'].map((v) => [`object-${v}`, `object-fit: ${v}`]), ['object-center', 'object-position: center'],
  ['object-top', 'object-position: top'],
]);
group('visibility on hover', [G, FW], [['visible', 'visibility: visible'], ['invisible', 'visibility: hidden']].map(([n, d]) => [n, d]));

// flex and grid
group('flex', { [R]: (n) => !/^(basis|order-\d)/.test(n) }, [
  ['flex-row', 'flex-direction: row'], ['flex-row-reverse', 'flex-direction: row-reverse'], ['flex-col', 'flex-direction: column'],
  ['flex-col-reverse', 'flex-direction: column-reverse'], ['flex-wrap', 'flex-wrap: wrap'], ['flex-nowrap', 'flex-wrap: nowrap'],
  ['flex-wrap-reverse', 'flex-wrap: wrap-reverse'], ['flex-1', 'flex: 1 1 0%; min-width: 0'], ['flex-auto', 'flex: 1 1 auto'],
  ['flex-initial', 'flex: 0 1 auto'], ['flex-none', 'flex: none'], ['grow-0', 'flex-grow: 0'], ['shrink', 'flex-shrink: 1'], ['shrink-0', 'flex-shrink: 0'],
  ...each({ 0: '0', auto: 'auto', full: '100%', ...FRACTION, ...Object.fromEntries([16, 24, 32, 40, 48, 56, 64, 72, 80].map((k) => [k, SIZE[k]])) },
    (k, v) => [[`basis-${k}`, `flex-basis: ${v}`]]),
  ...Array.from({ length: 12 }, (_, i) => [`order-${i + 1}`, `order: ${i + 1}`]), ['order-first', 'order: -9999'], ['order-last', 'order: 9999'],
  ['order-none', 'order: 0'],
]);
group('grid', { [R]: (n) => /^(grid-cols|col-span|col-auto|grid-flow-(row|col)$)/.test(n) }, [
  ...Array.from({ length: 12 }, (_, i) => [`grid-cols-${i + 1}`, `grid-template-columns: repeat(${i + 1}, minmax(0, 1fr))`]),
  ['grid-cols-none', 'grid-template-columns: none'], ['grid-cols-subgrid', 'grid-template-columns: subgrid'],
  // cards that wrap: as many columns as fit, each at least that wide (40 = 160px …), never wider than the box
  ...[32, 40, 48, 56, 64, 72, 80, 96].map((k) => [`grid-cols-fit-${k}`, `grid-template-columns: repeat(auto-fit, minmax(min(${SIZE[k]}, 100%), 1fr))`]),
  ...Array.from({ length: 6 }, (_, i) => [`grid-rows-${i + 1}`, `grid-template-rows: repeat(${i + 1}, minmax(0, 1fr))`]), ['grid-rows-none', 'grid-template-rows: none'],
  ...Array.from({ length: 12 }, (_, i) => [`col-span-${i + 1}`, `grid-column: span ${i + 1} / span ${i + 1}`]), ['col-span-full', 'grid-column: 1 / -1'],
  ['col-auto', 'grid-column: auto'],
  ...Array.from({ length: 13 }, (_, i) => [`col-start-${i + 1}`, `grid-column-start: ${i + 1}`]),
  ...Array.from({ length: 13 }, (_, i) => [`col-end-${i + 1}`, `grid-column-end: ${i + 1}`]),
  ...Array.from({ length: 6 }, (_, i) => [`row-span-${i + 1}`, `grid-row: span ${i + 1} / span ${i + 1}`]), ['row-span-full', 'grid-row: 1 / -1'],
  ['row-auto', 'grid-row: auto'],
  ['grid-flow-row', 'grid-auto-flow: row'], ['grid-flow-col', 'grid-auto-flow: column'], ['grid-flow-dense', 'grid-auto-flow: dense'],
  ['grid-flow-row-dense', 'grid-auto-flow: row dense'], ['grid-flow-col-dense', 'grid-auto-flow: column dense'],
  ['auto-rows-auto', 'grid-auto-rows: auto'], ['auto-rows-min', 'grid-auto-rows: min-content'], ['auto-rows-fr', 'grid-auto-rows: minmax(0, 1fr)'],
  ['auto-cols-auto', 'grid-auto-columns: auto'], ['auto-cols-fr', 'grid-auto-columns: minmax(0, 1fr)'],
]);
const ALIGN = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly',
  stretch: 'stretch', normal: 'normal' };
const PLACE = { start: 'start', end: 'end', center: 'center', stretch: 'stretch' };
const ITEMS = { start: 'flex-start', end: 'flex-end', center: 'center', baseline: 'baseline', stretch: 'stretch' };
group('alignment', { [R]: (n) => /^(justify|items|self)-/.test(n) && !/^justify-(items|self)/.test(n) }, [
  ...each({ ...PLACE, between: 'space-between', around: 'space-around', evenly: 'space-evenly' }, (k, v) => [[`place-content-${k}`, `place-content: ${v}`]]),
  ...each(PLACE, (k, v) => [[`place-items-${k}`, `place-items: ${v}`]]),
  ...each({ auto: 'auto', ...PLACE }, (k, v) => [[`place-self-${k}`, `place-self: ${v}`]]),
  ...each(ALIGN, (k, v) => [[`justify-${k}`, `justify-content: ${v}`]]),
  ...each(ALIGN, (k, v) => [[`content-${k}`, `align-content: ${v}`]]),
  ...each(PLACE, (k, v) => [[`justify-items-${k}`, `justify-items: ${v}`]]),
  ...each({ auto: 'auto', ...PLACE }, (k, v) => [[`justify-self-${k}`, `justify-self: ${v}`]]),
  ...each(ITEMS, (k, v) => [[`items-${k}`, `align-items: ${v}`]]),
  ...each({ auto: 'auto', ...ITEMS }, (k, v) => [[`self-${k}`, `align-self: ${v}`]]),
]);

// spacing
const sides = (p, prop) => ({ [p]: [prop], [p + 'x']: [prop + '-inline'], [p + 'y']: [prop + '-block'], [p + 't']: [prop + '-top'], [p + 'r']: [prop + '-right'],
  [p + 'b']: [prop + '-bottom'], [p + 'l']: [prop + '-left'] });
const spacing = (prefix, prop, scale) => Object.entries(sides(prefix, prop)).flatMap(([n, [p]]) => each(scale, (k, v) => [[`${n}-${k}`, `${p}: ${v}`]]));
group('padding', { [R]: step }, spacing('p', 'padding', SPACE));
group('margin', { [R]: step }, Object.entries(sides('m', 'margin')).flatMap(([n, [p]]) => [
  ...each({ ...SPACE, auto: 'auto' }, (k, v) => [[`${n}-${k}`, `${p}: ${v}`]]), ...NEG.map((k) => [`-${n}-${k}`, `${p}: -${SPACE[k]}`])]));
group('gap', { [R]: step }, [['gap', 'gap'], ['gap-x', 'column-gap'], ['gap-y', 'row-gap']].flatMap(([n, p]) => each(SPACE, (k, v) => [[`${n}-${k}`, `${p}: ${v}`]])));
group('space between', [], [['space-x', 'margin-inline-end'], ['space-y', 'margin-block-end']]
  .flatMap(([n, p]) => each(SPACE, (k, v) => [[`${n}-${k}`, `> :not(:last-child)|${p}: ${v}`]])));

// sizes
const LENGTHS = { auto: 'auto', full: '100%', min: 'min-content', max: 'max-content', fit: 'fit-content' };
group('size', [], [...each(SPACE, (k, v) => [[`size-${k}`, `width: ${v}; height: ${v}`]]), ['size-full', 'width: 100%; height: 100%']]);
group('width', { [R]: (n) => /^(w-(auto|full|fit|screen|\d\/\d|16|20|24|32|40|48|56|64|72|80|96)|min-w-0|max-w-)$/.test(n) || /^max-w-/.test(n) }, [
  ...each({ ...SIZE, ...FRACTION, ...LENGTHS, screen: '100vw' }, (k, v) => [[`w-${k}`, `width: ${v}`]]),
  ...each({ 0: '0', full: '100%', min: 'min-content', max: 'max-content', fit: 'fit-content', ...Object.fromEntries([32, 40, 48, 56, 64, 72, 80, 96].map((k) => [k, SIZE[k]])) },
    (k, v) => [[`min-w-${k}`, `min-width: ${v}`]]),
  ...each({ none: 'none', xs: '320px', sm: '384px', md: '448px', lg: '512px', xl: '576px', '2xl': '672px', '3xl': '768px', '4xl': '896px', '5xl': '1024px',
    '6xl': '1152px', '7xl': '1280px', full: '100%', min: 'min-content', max: 'max-content', fit: 'fit-content', prose: '65ch', page: 'var(--page-max)' },
  (k, v) => [[`max-w-${k}`, `max-width: ${v}`]]),
]);
group('height', [], [
  ...each({ ...SIZE, ...LENGTHS, screen: '100vh', dvh: '100dvh' }, (k, v) => [[`h-${k}`, `height: ${v}`]]),
  ...each({ 0: '0', full: '100%', screen: '100vh', dvh: '100dvh', fit: 'fit-content', ...Object.fromEntries([32, 40, 48, 64, 80, 96].map((k) => [k, SIZE[k]])) },
    (k, v) => [[`min-h-${k}`, `min-height: ${v}`]]),
  ...each({ none: 'none', full: '100%', screen: '100vh', dvh: '100dvh', fit: 'fit-content', ...BIG }, (k, v) => [[`max-h-${k}`, `max-height: ${v}`]]),
]);

// text
const TEXT = { xs: ['12px', '1.4'], sm: ['13px', '1.45'], md: ['14px', '1.5'], base: ['15px', '1.5'], lg: ['17px', '1.45'], xl: ['20px', '1.35'],
  '2xl': ['24px', '1.3'], '3xl': ['30px', '1.2'], '4xl': ['38px', '1.1'], '5xl': ['48px', '1.05'] };
group('text size', [R], each(TEXT, (k, [s, l]) => [[`text-${k}`, `font-size: ${s}; line-height: ${l}`]]));
group('text align', [R], ['left', 'center', 'right', 'justify', 'start', 'end'].map((v) => [`text-${v}`, `text-align: ${v}`]));
group('text', [], [
  ['font-sans', 'font-family: var(--font)'], ['font-mono', 'font-family: var(--mono)'],
  ...each({ light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 }, (k, v) => [[`font-${k}`, `font-weight: ${v}`]]),
  ['italic', 'font-style: italic'], ['not-italic', 'font-style: normal'], ['tabular-nums', 'font-variant-numeric: tabular-nums'],
  ['normal-nums', 'font-variant-numeric: normal'],
  ...each({ none: '1', tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625', loose: '2' }, (k, v) => [[`leading-${k}`, `line-height: ${v}`]]),
  ...each({ tighter: '-.02em', tight: '-.01em', normal: '0', wide: '.025em', wider: '.05em', widest: '.1em' }, (k, v) => [[`tracking-${k}`, `letter-spacing: ${v}`]]),
  ['uppercase', 'text-transform: uppercase'], ['lowercase', 'text-transform: lowercase'], ['capitalize', 'text-transform: capitalize'],
  ['normal-case', 'text-transform: none'],
  ['underline', 'text-decoration-line: underline'], ['overline', 'text-decoration-line: overline'], ['line-through', 'text-decoration-line: line-through'],
  ['no-underline', 'text-decoration-line: none'], ['underline-offset-2', 'text-underline-offset: 2px'], ['underline-offset-4', 'text-underline-offset: 4px'],
  ['truncate', 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap'], ['text-ellipsis', 'text-overflow: ellipsis'], ['text-clip', 'text-overflow: clip'],
  ...['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'].map((v) => [`whitespace-${v}`, `white-space: ${v}`]),
  ['break-normal', 'overflow-wrap: normal; word-break: normal'], ['break-words', 'overflow-wrap: break-word'], ['break-anywhere', 'overflow-wrap: anywhere'],
  ['break-all', 'word-break: break-all'], ['break-keep', 'word-break: keep-all'],
  ['text-wrap', 'text-wrap: wrap'], ['text-nowrap', 'text-wrap: nowrap'], ['text-balance', 'text-wrap: balance'], ['text-pretty', 'text-wrap: pretty'],
  ...Array.from({ length: 6 }, (_, i) => [`line-clamp-${i + 1}`, `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${i + 1}; overflow: hidden`]),
  ['line-clamp-none', 'display: block; -webkit-line-clamp: unset; overflow: visible'],
  ['list-none', 'list-style-type: none'], ['list-disc', 'list-style-type: disc'], ['list-decimal', 'list-style-type: decimal'],
  ['list-inside', 'list-style-position: inside'], ['list-outside', 'list-style-position: outside'],
  ...['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom'].map((v) => [`align-${v}`, `vertical-align: ${v}`]),
]);
group('underline on hover', [H, G, FV], [['underline', 'text-decoration-line: underline'], ['no-underline', 'text-decoration-line: none']]);

// colours
group('text colour', [H, G, DK], each(COLOURS, (k, v) => [[`text-${k}`, `color: ${v}`]]));
// bg-<colour>/<n>: the colour at n% over what is behind (bg-blue/10 is a light blue in light mode, a dark one in dark)
group('background', { [H]: (n) => !n.includes('/') || BASE_TINT.test(n), [A]: (n) => !n.includes('/') || BASE_TINT.test(n), [G]: (n) => !n.includes('/'),
  [DK]: (n) => !n.includes('/') }, [
  ...each(COLOURS, (k, v) => [[`bg-${k}`, `background-color: ${v}`]]),
  ...TOKENS.flatMap((t) => TINTS.map((n) => [`bg-${t}/${n}`, `background-color: ${tint(t, n)}`])),
  ...TINTS.map((n) => [`bg-tone/${n}`, `background-color: color-mix(in srgb, var(--c, currentColor) ${n}%, transparent)`]),
]);
group('border width', [], [
  ['border', 'border: 1px solid var(--line)'], ['border-0', 'border-width: 0'], ['border-2', 'border: 2px solid var(--line)'],
  ['border-4', 'border: 4px solid var(--line)'],
  ...[['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left'], ['x', 'inline'], ['y', 'block']].flatMap(([s, side]) => [
    [`border-${s}`, `border-${side}: 1px solid var(--line)`], [`border-${s}-0`, `border-${side}-width: 0`], [`border-${s}-2`, `border-${side}: 2px solid var(--line)`]]),
  ['border-solid', 'border-style: solid'], ['border-dashed', 'border-style: dashed'], ['border-dotted', 'border-style: dotted'], ['border-none', 'border-style: none'],
  ['divide-x', '> :not(:last-child)|border-inline-end: 1px solid var(--line)'], ['divide-y', '> :not(:last-child)|border-block-end: 1px solid var(--line)'],
]);
group('border colour', { [H]: (n) => !n.includes('/'), [F]: (n) => !n.includes('/'), [FV]: (n) => !n.includes('/'), [FW]: (n) => !n.includes('/'),
  [DK]: (n) => !n.includes('/') }, [
  ...each(COLOURS, (k, v) => [[`border-${k}`, `border-color: ${v}`]]),
  ...TOKENS.flatMap((t) => [20, 30, 50].map((n) => [`border-${t}/${n}`, `border-color: ${tint(t, n)}`])),
]);
const RADIUS = { none: '0', sm: '4px', '': '6px', md: '8px', lg: 'var(--radius-sm)', xl: 'var(--radius)', '2xl': '20px', full: '9999px' };
group('radius', [], [
  ...each(RADIUS, (k, v) => [[k ? `rounded-${k}` : 'rounded', `border-radius: ${v}`]]),
  ...[['t', ['top-left', 'top-right']], ['r', ['top-right', 'bottom-right']], ['b', ['bottom-left', 'bottom-right']], ['l', ['top-left', 'bottom-left']]]
    .flatMap(([s, corners]) => each(RADIUS, (k, v) => [[k ? `rounded-${s}-${k}` : `rounded-${s}`, corners.map((c) => `border-${c}-radius: ${v}`).join('; ')]])),
]);
group('svg and controls', [], [
  ...each(COLOURS, (k, v) => [[`fill-${k}`, `fill: ${v}`], [`stroke-${k}`, `stroke: ${v}`], [`accent-${k}`, `accent-color: ${v}`]]),
  ['fill-none', 'fill: none'], ['stroke-none', 'stroke: none'], ['stroke-1', 'stroke-width: 1'], ['stroke-2', 'stroke-width: 2'],
]);

// effects
group('shadow and ring', { [H]: (n) => n.startsWith('shadow'), [F]: true, [FV]: true, [FW]: true }, [
  ['shadow-none', 'box-shadow: none'], ['shadow', 'box-shadow: var(--shadow)'], ['shadow-pop', 'box-shadow: var(--shadow-pop)'],
  // a ring: a box-shadow outline in --ring (the blue at 40% unless a ring-<colour> sets it); it replaces a shadow
  ...[0, 1, 2, 4].map((n) => [`ring-${n}`, `box-shadow: 0 0 0 ${n}px var(--ring, color-mix(in srgb, var(--blue) 40%, transparent))`]),
  ['ring-inset', 'box-shadow: inset 0 0 0 2px var(--ring, color-mix(in srgb, var(--blue) 40%, transparent))'],
  ...each(COLOURS, (k, v) => [[`ring-${k}`, `--ring: ${v}`]]),
  ['outline-none', 'outline: 2px solid transparent; outline-offset: 2px'],
]);
group('opacity', [H, G, D], [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100].map((n) => [`opacity-${n}`, `opacity: ${n / 100}`]));
group('motion', { [H]: (n) => /^-?(rotate|scale)-/.test(n), [G]: (n) => /^-?(rotate|scale)-/.test(n), [A]: (n) => n.startsWith('scale-') }, [
  ['transition', 'transition-property: color, background-color, border-color, opacity, box-shadow, transform, translate, scale, rotate; transition-duration: .15s; transition-timing-function: ease'],
  ['transition-colors', 'transition-property: color, background-color, border-color; transition-duration: .15s; transition-timing-function: ease'],
  ['transition-opacity', 'transition-property: opacity; transition-duration: .15s; transition-timing-function: ease'],
  ['transition-transform', 'transition-property: transform, translate, scale, rotate; transition-duration: .15s; transition-timing-function: ease'],
  ['transition-none', 'transition-property: none'],
  ...[75, 100, 150, 200, 300, 500].map((n) => [`duration-${n}`, `transition-duration: ${n}ms`]),
  ['ease-linear', 'transition-timing-function: linear'], ['ease-in', 'transition-timing-function: cubic-bezier(.4, 0, 1, 1)'],
  ['ease-out', 'transition-timing-function: cubic-bezier(0, 0, .2, 1)'], ['ease-in-out', 'transition-timing-function: cubic-bezier(.4, 0, .2, 1)'],
  ['animate-none', 'animation: none'], ['animate-spin', 'animation: spin .7s linear infinite'], ['animate-pulse', 'animation: pulse 1.4s ease-in-out infinite'],
  ...[0, 45, 90, 180].map((n) => [`rotate-${n}`, `rotate: ${n}deg`]), ['-rotate-90', 'rotate: -90deg'], ['-rotate-45', 'rotate: -45deg'],
  ...[90, 95, 100, 105, 110].map((n) => [`scale-${n}`, `scale: ${n / 100}`]),
]);
group('interaction', { [D]: (n) => /^(cursor-(not-allowed|default|auto)|pointer-events-none)$/.test(n) }, [
  ...['auto', 'default', 'pointer', 'wait', 'text', 'move', 'help', 'not-allowed', 'progress', 'grab', 'grabbing'].map((v) => [`cursor-${v}`, `cursor: ${v}`]),
  ['pointer-events-none', 'pointer-events: none'], ['pointer-events-auto', 'pointer-events: auto'],
  ...['none', 'text', 'all', 'auto'].map((v) => [`select-${v}`, `user-select: ${v}`]),
  ['resize', 'resize: both'], ['resize-none', 'resize: none'], ['resize-x', 'resize: horizontal'], ['resize-y', 'resize: vertical'],
  ['appearance-none', 'appearance: none'], ['scroll-smooth', 'scroll-behavior: smooth'],
]);

// ---- the CSS
const escName = (n) => n.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
const BUMP = ':not(#\\#)';
// a rule: `.name:not(#\#)` (+ state) { decls }, or `.name:not(#\#) > :not(:last-child) { decls }` for space-*/divide-*
const rule = (cls, decl, { state = '', before = '' } = {}) => {
  const [kids, body] = decl.includes('|') ? decl.split('|') : ['', decl];
  // a kit piece that uses this name as a modifier keeps its meaning there
  const keep = { block: ':not(.btn)', fixed: ':not(.stats)', sticky: ':not(.table)' }[cls] || '';
  return `${before}.${escName(cls)}${keep}${BUMP}${state}${kids ? ' ' + kids.trim() : ''} { ${body}; }`;
};
// [group, its rules for this variant]
const pick = (v) => groups.filter((g) => g.variants[v]).map((g) => ({ ...g, rules: g.variants[v] === true ? g.rules : g.rules.filter(([n]) => g.variants[v](n)) }));
const prefixed = (p, n) => `${p}:${n}`;

export function generate() {
  const version = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  const out = [];
  const names = new Set();
  const add = (n) => { names.add(n); return n; };
  out.push(`/* dash-ui ${version}: utility classes (optional, after dash.css). Written by tools/utils.mjs from the kit's tokens: edit that, not this. */`,
    '/* Every rule is .name:not(#\\#): the :not() counts as an id, so a utility beats the kit\'s own rules without !important. */', '');
  const section = (t) => out.push('', `/* ---- ${t} ---- */`);
  for (const g of groups) {
    if (g.title === 'visibility on hover' || g.title === 'underline on hover') continue; // only their variants
    section(g.title);
    for (const [n, d] of g.rules) {
      if (n === 'visible' && names.has('visible')) continue;
      out.push(rule(add(n), d));
    }
  }
  // states
  const STATES = [[F, ':focus'], [FV, ':focus-visible'], [FW, ':focus-within'], [A, ':active'], [D, ':disabled']];
  section('hover: (only where hovering is real), group-hover: (a .group parent hovered)');
  out.push('@media (hover: hover) {');
  for (const g of pick(H)) for (const [n, d] of g.rules) out.push('  ' + rule(add(prefixed('hover', n)), d, { state: ':hover' }));
  for (const g of pick(G)) for (const [n, d] of g.rules) out.push('  ' + rule(add(prefixed('group-hover', n)), d, { before: '.group:hover ' }));
  out.push('}');
  for (const [v, state] of STATES) {
    section(`${v}:`);
    for (const g of pick(v)) for (const [n, d] of g.rules) out.push(rule(add(prefixed(v, n)), d, { state }));
  }
  // widths: the kit's two max-widths first (the smaller wins), then min-widths ascending
  const atWidth = (p, media, list) => {
    section(`${p}: ${media}`);
    out.push(`@media ${media} {`);
    for (const g of list) for (const [n, d] of g.rules) out.push('  ' + rule(add(prefixed(p, n)), d));
    out.push('}');
  };
  for (const [p, px] of Object.entries(MAX_WIDTHS)) atWidth(p, `(max-width: ${px}px)`, pick(MAX));
  for (const [p, px] of Object.entries(WIDTHS)) {
    const list = pick(R);
    section(`${p}: (min-width: ${px}px)`);
    out.push(`@media (min-width: ${px}px) {`);
    for (const g of list) {
      for (const [n, d] of g.rules) out.push('  ' + rule(add(prefixed(p, n)), d));
      if (g.title === 'display') for (const [n, d] of gridDisplay) out.push('  ' + rule(add(prefixed(p, n)), d));
    }
    out.push('}');
  }
  // dark: both ways the kit turns dark (the system setting unless data-theme="light", or data-theme="dark")
  section('dark: (the system setting, unless the page is set to light; or data-theme="dark")');
  const darkRules = [];
  for (const g of pick(DK)) {
    for (const [n, d] of g.rules) darkRules.push([add(prefixed('dark', n)), d]);
    if (g.title === 'display') for (const [n, d] of gridDisplay) darkRules.push([add(prefixed('dark', n)), d]);
  }
  out.push('@media (prefers-color-scheme: dark) {');
  for (const [n, d] of darkRules) out.push('  ' + rule(n, d, { before: ':root:not([data-theme="light"]) ' }));
  out.push('}');
  for (const [n, d] of darkRules) out.push(rule(n, d, { before: ':root[data-theme="dark"] ' }));
  section('print:');
  out.push('@media print {');
  for (const g of pick(P)) {
    for (const [n, d] of g.rules) out.push('  ' + rule(add(prefixed('print', n)), d));
    for (const [n, d] of gridDisplay) out.push('  ' + rule(add(prefixed('print', n)), d));
  }
  out.push('}', '');
  return { css: out.join('\n'), names: [...names] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('dash-utils.css', root);
  const { css, names } = generate();
  if (process.argv.includes('--check')) {
    const now = readFileSync(file, 'utf8');
    if (now !== css) { console.error('dash-utils.css is not what tools/utils.mjs writes: run node tools/utils.mjs'); process.exit(1); }
    console.log('dash-utils.css is up to date');
  } else {
    writeFileSync(file, css);
    console.log(`dash-utils.css: ${names.length} classes, ${css.length} bytes`);
  }
}
