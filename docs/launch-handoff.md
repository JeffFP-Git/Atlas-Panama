# Launch handoff checklist (Claude Code ⇄ Claude in Chrome ⇄ Jeff)

**Who does what**
- **Claude Code:** code, publishing to the live site, curl checks, anything that touches secrets (prefixes only).
- **Claude in Chrome:** dashboard clicks in Stripe, Railway, Squarespace — non-secret things only, with Jeff's OK before saving. **Cannot** reveal/copy/type secrets, change or delete DNS records, or delete anything. No memory between sessions → every brief must be self-contained.
- **Jeff only:** secrets (API keys, webhook signing secrets), DNS deletes, deletions, real-card purchases.
- Every handoff = one copyable block. Aim for one round trip.

## Done (Oct 3, 2026)

- [x] Stripe Business website → `https://atlaspanama.com`
- [x] Site live: homepage pricing, footer, `/contact`, `/terms`, `/privacy`, `/terminos`, `/privacidad`; Chrome-review fixes (cancellation wording, `/subscribe` headline/numbering/accents)
- [x] Stripe Public details: support email `operations@atlaspanama.com`, support URL `/contact`, privacy `/privacy`, terms `/terms`
- [x] Stripe product description updated
- [x] **Stripe task "Provide a valid business URL": COMPLETED.** Payments and payouts active.
- [x] Railway `api` vars checked: `FRONTEND_URL=https://atlaspanama.com`, `API_BASE_URL` not set (code falls back to `FRONTEND_URL` — correct), `STRIPE_WEBHOOK_SECRET` exists (old, from Jon's test-mode endpoint)
- [x] Repo has no dependency on `app.atlaspanama.com` or `api.atlaspanama.com` → both Squarespace CNAMEs safe to delete
- [x] Code: webhook now also handles `customer.subscription.deleted` (stops monitoring + sends an internal alert when a Stripe subscription ends)

## In progress — switch Stripe from TEST to LIVE

Found: **`STRIPE_SECRET_KEY` on Railway is a TEST key (`sk_test_`)** — real customers would get a test-mode checkout.

How the code uses Stripe (so we know what's needed):
- **Prices:** no price-ID variables. `lib/stripe.js` looks up prices by lookup key (`atlas_monthly_v1` $1/month, `atlas_annual_v1` $10/year, USD) and **creates the product and both prices itself** on the first checkout in whichever mode the key belongs to. So nothing needs creating by hand in live mode.
- **Webhook:** `POST https://atlaspanama.com/webhooks/stripe` (reachable — returns 400 to unsigned requests, as it should). Events handled: `checkout.session.completed`, `customer.subscription.deleted`.
- **Checkout return URLs:** built from `FRONTEND_URL` → `https://atlaspanama.com/subscribe/request/<id>/checkout-success…` and `…/payment.html?…&result=cancelled`.
- **Customer Portal:** not used. Cancellations are by email; Jeff cancels in the Stripe Dashboard.
- The old TEST-mode webhook `https://api.atlaspanama.com/stripe/webhook` is Jon's leftover (wrong host and path) — ignore it.

Steps:
- [ ] Chrome: create the LIVE webhook endpoint (brief given Oct 3)
- [ ] Jeff: live secret key → Railway `STRIPE_SECRET_KEY`; live webhook signing secret → Railway `STRIPE_WEBHOOK_SECRET`; deploy once
- [ ] Jeff: delete Squarespace CNAMEs `app` and `api`
- [ ] Verify: Jeff's own first subscription shows no "Test mode" label on Stripe's checkout; Chrome confirms the webhook delivery succeeded in Stripe's log; Claude Code checks the subscription activated

## Oct 3 update

- [x] Chrome: LIVE webhook created — `we_1UMWh7L7hEKlxMTikoCYm9Xk`, `https://atlaspanama.com/webhooks/stripe`, events `checkout.session.completed` + `customer.subscription.deleted`, API version 2020-08-27 (OK). Route verifies signatures (400 when unsigned).
- [x] Stripe account: no active tasks; payments + payouts active.
- [x] Jeff deleted CNAME `app`.
- [x] `STRIPE_PRICE_ID` in Railway is unused by the code → leave it.
- [x] Code: `DATA_DIR` storage setting + `GET /admin/storage-check` published (commit `0a824ee`).
- [x] **Persistent storage fixed + verified** (`DATA_DIR=/data`, volume `api-volume`; survived a redeploy). Live Stripe key + webhook secret deployed. Was: Chrome reads the Railway volume's mount path and adds `DATA_DIR` = that path. Jeff deploys once (together with the live Stripe key + webhook secret). Claude Code verifies with `/admin/storage-check` and one extra redeploy.
- [x] (already set) Stripe Billing → failed payments → "If all retries fail" = Cancel the subscription.
- [ ] Jeff: delete CNAME `api`.
- [ ] Jeff: own property + entity signup (live purchase); check no "Test mode" label.

## Open TODOs

See CLAUDE.md → "START HERE — current status" for the full post-launch list.
