# Archived: whole-building scraper admin UI

Moved out of `public/` on 2026-09-15 so the Atlas Panama subscription app never serves,
runs, or shares a job queue with the whole-building scraper tool.

- `index.html` — "Panama Scraper Dashboard," the admin UI for running whole-building
  scrapes (`POST /run`, jobType `'main'`).
- `simple.html` — "Panama Scraper – Simple Runner," a lighter version of the same thing.

**These files are inert here** — the backend route that powered them (`POST /run` and
the `'main'` jobType branch in `api.js`'s job worker) was removed from this app's
`api.js`, not just hidden. Dropping these files back into `public/` will not make them
work again without also restoring that backend code.

**The real, complete, working copy of the whole-building scraper lives at
`~/atlaspanama-jon/Building Search/`** — the preserved, untouched original (see this
project's `CLAUDE.md` → "Folder structure"). It has its own `api.js`, `public/`
(including these same two files), `.env`, and `package.json`, and can be run as its own
separate process/port whenever it's needed — that's how to "run the building scraper
app" per the user's Sept 2026 request, rather than reviving it inside this app.

Why this was split out: the whole-building scraper and the Atlas Panama subscription
app used to share one process and one `MAX_CONCURRENCY=1` job queue — a long building
scrape could sit in front of real subscriber-facing jobs (signup searches, daily
monitoring) and delay them. Removing the `'main'` jobType/`/run` route from this app's
queue eliminates that risk entirely, since there's no longer any way to enqueue a
building-scrape job here.

Not touched, and still shared on purpose: `scraper.js`, `lib/finca.js`,
`lib/mercantil.js`, and `lib/propertyintel.js` stay in this app because the
subscription product's own extraction code (`lib/entityRecordExtraction.js`,
`lib/propertyRecordExtraction.js`) reuses several of their low-level functions
(`extractDatosGenerales`, `openFirstMercantilResult`, `extractMercantilMembers`,
`navigateToInmuebles`, `queryByFolioAndLocationCode`, `openFirstResultModal`,
`clickPrelacionTabAndExtract`). Those are genuinely load-bearing here, not leftovers.

Also left alone (out of scope for this cleanup, but flagged for later): `intro.html`
and its backend (`/intro/*` routes, `lib/introFincaPipeline.js`, jobType
`'introPipeline'`) are a separate, earlier single-Finca prototype that predates the
current `/subscribe/*` product — not "building scraper" code, but also not part of the
current live subscriber journey. `POST /run/finca` and `POST /run/mercantil` are
similarly orphaned admin routes with no frontend calling them anymore (now admin-key
protected, like everything else here, but not relocated).
