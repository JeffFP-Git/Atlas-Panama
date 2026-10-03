# Launch handoff checklist (Claude Code ⇄ Claude in Chrome)

Running checklist shared between Claude Code (code, deploys, curl checks, anything
touching secrets — prefixes only) and Claude in Chrome (dashboard clicks in Stripe,
Squarespace, Railway UI, using only values Claude Code confirmed). Every handoff is
one copyable block: DONE, BLOCKED, and exact values for the next step.

**Stripe review deadline:** task "Provide a valid business URL" is in review.
If it fails: payouts pause **Oct 17, 2026**, payments pause **Oct 31, 2026**.

## Done

- [x] Oct 3 — Stripe Business website → `https://atlaspanama.com` (Chrome)
- [x] Oct 3 — Site live: homepage pricing, footer, `/contact`, `/terms`, `/privacy`, `/terminos`, `/privacidad` (Code, commit `95cfdd9`)
- [x] Oct 3 — Stripe Public details: support email `operations@atlaspanama.com`, support URL `/contact`, privacy URL `/privacy`, terms URL `/terms` (Chrome)
- [x] Oct 3 — Repo search for `app.atlaspanama.com`: no live dependency in code, emails, or configs (only an `api.js` redirect, now removed). Docs/CLAUDE.md mentions are history only. (Code)
- [x] Oct 3 — Site fixes from Chrome's review: legal-page language link reworded; cancellation wording aligned to "email operations@atlaspanama.com" on homepage, `/contact`, and Terms §11 (no Customer Portal exists); `/subscribe` headline says daily, button renumbered 4, title "Búsqueda Diaria", Spanish email label, "Suscripción" spelling (Code — deployed after Jeff's OK)

## Waiting on Chrome

- [ ] **Railway → service `api` → Variables:** report the full values of `API_BASE_URL` and `FRONTEND_URL` (not secrets — they're public website addresses). They build the links in confirmation emails and the Stripe checkout return/cancel URLs. Must be `https://atlaspanama.com`.
- [ ] **Same page:** report only the first 8 characters of `STRIPE_SECRET_KEY` (expect `sk_live_`) and whether `STRIPE_WEBHOOK_SECRET` exists (yes/no — don't show it). There is no `STRIPE_PRICE_ID` variable: the code finds/creates its prices by lookup key in whichever mode the key belongs to, so a live key means live prices automatically.
- [ ] **Stripe → Developers → Webhooks (live mode):** list any endpoint URLs. If one exists it should be `https://atlaspanama.com/webhooks/stripe`.
- [ ] Update the Stripe product description (text below).
- [ ] Delete the Squarespace `app` CNAME → **only after** `API_BASE_URL`/`FRONTEND_URL` are confirmed not to be `app.atlaspanama.com`.
- [ ] Re-check the Stripe review task status; copy its exact wording.

## Proposed Stripe product description

> Daily monitoring of Panama Public Registry (Registro Público) records for a property or legal entity, with email alerts when changes are detected. Subscription charged at signup and then automatically every month ($1 USD) or every year ($10 USD) until cancelled.

## Open TODOs (not blocking the Stripe review)

- Swap in the attorney-approved Terms/Privacy before public launch (`scripts/build-legal-pages.js`, both languages, then rerun it).
- Business phone line → update `public/site-footer.js`, `public/contact.html`, Stripe support phone.
- Optional later: Stripe Customer Portal self-service cancel link (then update Terms §11, `/contact`, homepage text).
- If `STRIPE_SECRET_KEY` turns out to be `sk_test_`: stop, tell Jeff, do not take real payments until switched to live keys.
