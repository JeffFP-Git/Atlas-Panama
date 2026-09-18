# Archived: legacy "intro pipeline"

Moved out of `public/` on 2026-09-15, along with removing its backing routes from
`api.js` (not just hiding the HTML — the routes are gone, not password-protected).

`intro.html` was an early, single-Finca prototype signup page that predates the
current `/subscribe/*` product (`subscribe.html`/`verify.html`/`payment.html`). It
called `/intro/submit`, `/intro/request/:id`, `/intro/request/:id/confirm`,
`/intro/request/:id/schedule`, and `/intro/pdf/:id` — all removed from `api.js`, along
with the `'introPipeline'` job type and the `processIntroPipeline()` function that used
`lib/introFincaPipeline.js`. `/intro/requests` (plural, an admin listing route) existed
too but had no frontend caller at all — also removed.

No frontend page besides `intro.html` called any of these, so nothing else was
affected. Verified live: server boots clean, all confirmed subscriptions still load
and schedule correctly, `/subscribe/submit` and the rest of the real product are
untouched.

**Not touched, left in place:** `lib/introFincaPipeline.js` and
`lib/introPropertyIntelPipeline.js` (the latter was never actually imported by
`api.js` even before this — just mentioned in a comment) — small, inert files, no
reason to delete them. `lib/introPipelineStorage.js` was **not** touched at all: it's
a dual-purpose file — its older functions (`createRequest`, `getRequest`,
`updateRequest`, `listRequests`, `confirmProperty`, `scheduleDailyRuns`) were only used
by this now-removed intro pipeline, but its newer functions
(`createSubscriptionRequest`, `getSubscriptionRequest`, `updateSubscriptionRequest`,
`confirmSubscription`, `deleteSubscriptionRequest`, `listSubscriptionRequests`) are the
real, current product's storage layer. Same file, so it stays as-is.
