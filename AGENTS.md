# For coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything here: it is written for you too. The short of it:

- `dash.css` and `dash.js` are written by hand. `docs/*.html`, `docs/search.js`, `dash-utils.css` and `screenshots/` are generated (`node tools/docs.mjs`, `node tools/utils.mjs`, `node tools/shots.mjs`): never edit those.
- No build step, no dependencies. Versions only add things. Made-up data only: the repository is public.
- Run `npm test`, `npm run behaviour` and `npm run screens`, and look at what you made in a browser, in light, dark and on a phone, before you say that it works.
