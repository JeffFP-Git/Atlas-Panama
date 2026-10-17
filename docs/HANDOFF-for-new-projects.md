# Atlas Panama: technical handoff for a new project

Written Oct 16 2026 from a review of the atlaspanama.com codebase, so a separate Claude session (a loan-management platform for Financiera Platino) can reuse what was learned. It contains no secrets, keys, passwords, tokens or customer data. Environment variables are listed by name only.

Owner: Jeff (non-programmer; explain things in plain language, one step at a time).

## What matters most for the loan platform (read this first)

1. **Authentication must be built from scratch.** Atlas Panama has no user accounts: subscribers use emailed magic links and admins share one API key. That is fine for a $1 product, not for borrower and loan data. Build individual staff logins, MFA, roles, expiring sessions and an audit log of who changed what (section 3).
2. **Use a real database from day one.** Atlas Panama stores everything in JSON files on one disk with no off-site backup. Loan files need Postgres (or similar) with migrations and backups, plus encrypted object storage for documents (section 5).
3. **The Registro Público module is the most reusable part.** Login, captcha handling, search by finca / owner / company, and full-record reading can be packaged as one module. For a lender: check title, owners, liens and Prelación before funding, and monitor collateral and borrower companies during the loan. Atlas Panama itself could provide the monitoring (sections 4 and 9).
4. **The lessons learned will save real time and money:** data wiped on every deploy until it was moved to a persistent volume; a cron scheduler that silently skipped runs; an inherited captcha key that faked success for weeks; Railway blocking SMTP email (section 8).

---

## 1. Tech stack

| Layer | What we use | Notes |
|---|---|---|
| Language | JavaScript, Node.js 20, ES modules (`"type": "module"`) | No TypeScript, no build step. |
| Web server | Express 5 (`api.js`, ~2,600 lines) | Serves the API and the static pages in `public/`. |
| Front end | Plain HTML + vanilla JS in `public/` | No framework. Bilingual ES/EN via a `TRANSLATIONS` object, `data-i18n` attributes and a toggle saved in `localStorage`. |
| Browser automation | Puppeteer 24 + `puppeteer-extra` (stealth plugin + reCAPTCHA plugin) | Drives the Registro Público (RP) website. Runs system Google Chrome inside Docker. |
| Scheduling | `node-cron` + a self-healing catch-up checker | See lessons learned: cron alone silently missed runs. |
| PDF generation | Puppeteer `page.pdf()` on our own HTML report (`lib/pdfReport.js`) | We do NOT capture RP's own print output. |
| Database | **None.** JSON files on a persistent disk volume | `@neondatabase/serverless` is in package.json but is not used anywhere. For a loan platform, use a real database (Postgres) from day one. |
| Hosting | Railway (Hobby plan), one service built from `Dockerfile.api`, persistent volume mounted at `/data` | Every push to `master` redeploys automatically. |
| Tests | `vitest`, only two old test files | Almost all verification was done with live end-to-end runs, not automated tests. |

### Third-party services

| Service | What it does here | Env vars (names only) |
|---|---|---|
| **Registro Público (rp.gob.pa)** | The government registry we read. Three login accounts (code supports up to four) for failover. | `RP_USERNAME`, `RP_PASSWORD`, `RP_USERNAME_2..4`, `RP_PASSWORD_2..4`, `RP_LOGINS_PAUSED` |
| **2Captcha** | Solves the reCAPTCHA on the RP login page, through `puppeteer-extra-plugin-recaptcha`. | `CAPTCHA_API_KEY`, `CAPTCHA_PROVIDER`, `CAPTCHA_MODE`, `CAPTCHA_DEBUG` |
| **Stripe** | Checkout (hosted payment page), recurring subscriptions ($1/mo, $10/yr), Customer Portal (update card, cancel), webhooks. Products and prices are created by code via `lookup_key` (`lib/stripe.js`), not by hand-made price IDs. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`STRIPE_PRICE_ID` exists in Railway but is unused) |
| **Postmark** | All outbound email, through its **HTTPS API** (Railway blocks outbound SMTP ports). Delivery/bounce webhook alerts us when an address bounces. | `SMTP_PASS` (reused as the Postmark server token), `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `POSTMARK_MESSAGE_STREAM`, `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASS` |
| **Gmail (SMTP, nodemailer)** | Used only in early development (needs a 16-character Gmail *App Password*). Replaced by Postmark. Old code paths still reference SMTP variables. | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_SECURE`, `SMTP_FROM` |
| **Google Workspace** | Human inboxes on the business domain (operations@, monitoring@). Not called by code. | none |
| **Squarespace** | Domain registrar and DNS for atlaspanama.com (CNAMEs to Railway, Postmark DKIM, SPF/DMARC). | none |
| **Railway** | Hosting, environment variables, persistent volume. | `PORT`, `DATA_DIR` |

---

## 2. Architecture

```
api.js                 Express app: routes, job queue, signup pipeline, Stripe/Postmark webhooks
public/                Static bilingual pages (home, subscribe, payment, verify, Q&A, contact, legal)
lib/
  auth.js              RP login, reCAPTCHA handling, session cookies, reliable input typing
  puppet.js            Builds the Puppeteer instance (stealth + captcha plugin)
  rpAccounts.js        Rotates RP accounts on login failure; RP_LOGINS_PAUSED kill switch
  propertySearch.js    Property search on RP (by folio / código de ubicación / owner name)
  entitySearch.js      Company / foundation search on RP (by name / RUC)
  propertyRecordExtraction.js, entityRecordExtraction.js, fullRecordExtraction.js,
  datosGenerales.js    Read every tab of an RP record into structured JSON
  changeDetection.js   Generic diff between two snapshots (any tab, any row)
  snapshotStore.js     Saves one JSON + PDF per subscription per day
  pdfReport.js         Builds the HTML report and renders it to PDF
  dailyScheduler.js    Daily checks (cron + catch-up checker), retries, weekly digest dispatch
  email.js, emailTranslations.js   Postmark sending; all subscriber email text in ES/EN
  adminAlerts.js       Detailed internal alert emails when something fails
  stripe.js            Products/prices by lookup key, Checkout, Customer Portal
  trials.js            Free-trial eligibility (hashed emails + card fingerprints)
  introPipelineStorage.js  JSON-file "database" of subscription requests
  retention.js         Deletes data 60 days after cancellation (privacy policy)
  analytics.js, campaigns.js, dailyReport.js   Cookieless visit counting, ?src= tags, daily email report
  leads.js             "Email me the link" follow-ups
  dataPaths.js         One place that decides where persistent files live (DATA_DIR)
scraper.js, finca.js, mercantil.js, propertyintel.js
                       Original whole-building scraper; several functions are reused by the modules above
scripts/build-legal-pages.js   Generates the Terms/Privacy HTML from one source (never edit the HTML)
```

**How a request flows:**
1. Signup form → `POST /subscribe/submit` → a job is added to an in-memory queue (`MAX_CONCURRENCY = 1`, so only one RP browser session runs at a time).
2. The job logs into RP, searches, and classifies the result: **A** = one match, **B** = 2–15 (user picks one), **C** = 16+ (user refines the search).
3. The user confirms by email (double opt-in), then goes to Stripe Checkout or a free trial.
4. A Stripe webhook or the return page activates the subscription.
5. The scheduler checks each subscription daily at 19:00 Panama time and saves a snapshot. A change emails the same day. Routine "no change" emails are batched into one weekly digest per recipient.

---

## 3. Authentication (important: very little to reuse here)

Atlas Panama has **no user accounts, no passwords, no sessions and no MFA**. That was a deliberate choice for a $1 product:

- **Subscribers:** every subscription has a random 32-byte `accessToken`. Each emailed link carries `?requestId=…&token=…`, which acts as a "magic link" (verify, choose plan, manage subscription). Tokens never expire, and they're compared with plain `!==`, not a timing-safe comparison.
- **Billing self-service:** handled entirely by Stripe's hosted Customer Portal, reached through a token link.
- **Admin:** routes are protected by one shared `API_KEY`, accepted from a header, a Bearer token, or a `?apiKey=` query string. It originally let everyone in when `API_KEY` was unset; since Oct 16 2026 it fails closed (503). One job-cancel route was also missing the key check and is now protected.
- **Webhooks:** Stripe uses signature verification (`STRIPE_WEBHOOK_SECRET`); Postmark uses HTTP Basic Auth.

**For a loan platform, build real authentication:** individual staff logins, hashed passwords (or Google Workspace SSO), MFA, roles (admin, loan officer, read-only), expiring sessions, and an audit log of who changed what. Fail closed when a secret is missing.

---

## 4. The Registro Público module in detail

**Site:** `https://www.rp.gob.pa`. The login page is `LoginUsuario`; search is at `/BusquedaFolios`. The site is built on DevExpress grids, which shapes most of the quirks below.

**Login (`lib/auth.js` → `performLogin`):**
1. Launch Chrome through `puppeteer-extra` with stealth, plus the reCAPTCHA plugin when `CAPTCHA_API_KEY` is set (`lib/puppet.js`).
2. Optionally restore saved session cookies (`session/session-cookies.json`); `isLoggedIn()` checks for a logout link or the "CONSULTAS WEB" nav and the absence of password inputs.
3. Type the username and password, then handle the captcha. Try clicking the reCAPTCHA checkbox first (sometimes it passes with no challenge). If a challenge opens, close it and call `page.solveRecaptchas()`, which sends the challenge to 2Captcha and injects the token.
4. Submit; retry the solve and submit a couple of times; on failure, switch to the next RP account (`rpAccounts.advanceToNextAccount`).
5. Diagnostics are recorded on every attempt (`getLastLoginDiagnostics`): plugin loaded or not, solve time, number of solutions.

**Search by property (`lib/propertySearch.js`):**
- By **folio / código de ubicación**: the "Datos del folio" (top) tab.
- By **owner name**: the "Datos del Inmueble" tab → "Titularidad" section.
- **Never use the "Matriz" section.** It looks like a folio filter but returns every child parcel of a parent parcel (Finca Madre).
- A folio number is NOT unique nationally (each province has its own catalog, and a folio can exist both as a Finca and as a Propiedad Horizontal unit), so expect several results.
- Results are read from the DevExpress grid. Column headers live in a separate sticky container, not the table. All result pages are followed.

**Search by company / foundation (`lib/entitySearch.js`):** by name or full RUC (the bare folio digits return nothing). Name search ignores accents. If a company search finds nothing and the name contains "fundación", it retries as a foundation.

**Reading a record:** open the record, read Datos Generales section by section (`<h5>` headings + `<dl>` pairs), then discover every tab dynamically and read each grid (Prelación, Miembros Relacionados, Apoderados, Registro Electrónico Vigentes/No Vigentes, Folios Madre, and so on). The "Descargas" tab is skipped.

**Documents:** we do **not** download RP's documents or use its "Imprimir" button (it's a client-side print popup, nothing to capture). We save the extracted data as JSON and render our own PDF.

**Failure modes we hit:**
- **Fake captcha solves.** The plugin reported success in ~230 ms while sending requests to a dead 2Captcha account (an old developer's key). The login then failed silently. A real solve takes seconds. Log solve times and check the provider's dashboard.
- **Input fields clearing themselves** before submit. Fixed with `auth.lockInputValue()`, which keeps re-applying the value for a few seconds; one-time `.value =` writes, blur, and Tab presses all failed.
- **"No data to display" placeholder rows** while a grid loads, which made real rows look deleted (a false alert). Fix: never treat placeholders as rows; re-read empty sections; confirm any detected change with a second full reading before alerting.
- **Three wrong passwords in a row trigger an extra CAPTCHA.** Don't retry logins blindly.
- **Site-wide RP outages.** Handled with the `RP_LOGINS_PAUSED=1` kill switch and per-check retries (one retry per configured account, a fresh browser each time).
- **Brief internet drops** caused late-run failures in the old building scraper; now handled by retries.
- **Policy line we hold:** never probe RP's access controls or look for captcha bypasses. It's a government system and the business depends on good standing with it.

---

## 5. File storage

- Everything persistent lives under `DATA_DIR` (Railway volume at `/data`, 500 MB):
  - `intro-requests.json`: all subscription requests (the "database")
  - `MonitoringData/<subscriptionId>/<YYYY-MM-DD>.json` and `.pdf`: daily snapshots, keyed by ID so renames can't collide
  - small JSON logs (digest state, trial registry, leads, analytics per day)
- No user uploads exist. PDFs are generated by us and attached to emails; they are not served publicly.
- **Access control:** files are not in `public/`, so nothing is web-reachable except through admin routes protected by `API_KEY` (`/files`, `/admin/*`).
- **Retention:** `lib/retention.js` deletes a record, its snapshots and its email state 60 days after cancellation, and emails an internal audit list of what it deleted.
- **Weaknesses:** writes are plain `writeFileSync` (no atomic rename, no locking); the volume has no off-site backup; everything sits on one disk. Acceptable for a few hundred records; **not acceptable for loan files.** Use Postgres plus object storage (for example S3 or Cloudflare R2) with encryption, backups and signed short-lived download links.

---

## 6. Email and notification flow

- **Sender:** `monitoring@` on the business domain, via Postmark's HTTPS API. Replies go to a human Google Workspace inbox.
- **Subscriber emails** (all ES/EN, text written by hand, not machine-translated, in `lib/emailTranslations.js`):
  - search results (no match / pick one / refine)
  - confirm email and choose plan
  - welcome
  - change alert, same day, with a plain-language summary and the PDF
  - weekly digest: one email per recipient listing all their items; PDFs attached only for changed items when there are 3+ items
  - trial ending reminders
  - "we couldn't check today"
- **Internal emails:** `lib/adminAlerts.js` sends a detailed alert (subscriber ID, what failed, stack trace) to `ADMIN_ALERT_EMAIL` on any failed check, failed signup search or failed email send. The subscriber gets only a calm, vague message. `lib/dailyReport.js` sends a daily activity report at 00:01 (`DAILY_REPORT_EMAIL`).
- **Bounces/spam complaints:** the Postmark webhook triggers an admin alert.
- Stripe's own receipt emails are turned off; our welcome email is the receipt.

---

## 7. Deployment and environment

- **Production:** Railway builds `Dockerfile.api` (Debian bookworm + Google Chrome + `npm ci --omit=dev`). Pushing to `master` redeploys.
- **Safe redeploys:** on SIGTERM the app stops starting new jobs and lets the running one finish. On startup it re-queues signups interrupted in the last 6 hours, and the catch-up checker re-runs any daily check that didn't finish. Even so, avoid deploying during the daily check window.
- **Development:** the same code runs locally with `node api.js` and a local `.env` (Stripe test keys, `HEADLESS` toggle). No staging environment yet; planned as a second Railway environment with test keys and an empty volume.
- **Environment variable names** (values live only in Railway / `.env`):
  - App: `PORT`, `NODE_ENV`, `API_KEY`, `API_BASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `DATA_DIR`, `DAILY_RUN_TIME`, `MAX_QUEUE`
  - Browser: `HEADLESS`, `FORCE_HEADLESS`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_USER_DATA_DIR`, `USER_DATA_DIR`
  - RP: `RP_USERNAME`, `RP_PASSWORD`, `RP_USERNAME_2..4`, `RP_PASSWORD_2..4`, `RP_LOGINS_PAUSED`
  - Captcha: `CAPTCHA_API_KEY`, `CAPTCHA_PROVIDER`, `CAPTCHA_MODE`, `CAPTCHA_DEBUG`
  - Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Email: `SMTP_PASS`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `POSTMARK_MESSAGE_STREAM`, `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASS`, `ADMIN_ALERT_EMAIL`, `DAILY_REPORT_EMAIL` (plus legacy `SMTP_*`)
- `.env` values with special characters must be quoted, or they get cut off.

---

## 8. Lessons learned

**What broke:**
1. **Data wiped on every deploy.** Files were written inside the container, not on the volume. Fix: one `DATA_DIR` module, set to the volume path, plus a `/admin/storage-check` route that proves data survives a redeploy. *Verify persistence on day one.*
2. **`node-cron` silently skipped a scheduled run** with no error. Fix: a catch-up checker every 15 minutes ("has today's work been done? if not, do it"). *Never trust a timer alone; check the result.*
3. **Wrong API key from a previous developer** made captcha solving fake-succeed for weeks. *Audit every inherited secret, and log enough (timings, counts) to notice something impossible.*
4. **Railway blocks outbound SMTP.** Use the email provider's HTTPS API.
5. **"Sent" logged when the send had actually failed.** Always check the real result before logging success.
6. **Secrets leaking into logs** (tokens in request URLs). Redact query strings and bodies in request logging.
7. **Unauthenticated admin routes** inherited from the old code, and admin auth that failed open when the key was missing (both fixed). Audit every route; fail closed.
8. **False change alerts** from loading placeholders. Confirm before alerting; a false alarm on a fraud product destroys trust.
9. **Stripe "Link"** kept appearing in Checkout and enrolling people until it was disabled with a payment-method configuration; `payment_method_types: ['card']` alone did not remove it.
10. **Stale server processes** during local testing made "fixed" code look broken. Restart before every live test.

**What I'd do differently:**
- Start with a real database and migrations instead of JSON files.
- Build staging on Railway from the start, with Stripe test keys.
- Write automated tests for the pure logic (change detection, pricing, trial rules, date handling), plus a recorded-HTML fixture suite for the RP parsers, so a site change is caught by a test rather than a customer.
- Make language support (ES/EN) and a single translation dictionary part of the foundation, not a later pass. That paid off here.
- Keep the old prototype code out of the production app (we had to archive unused routes and a building scraper that shared the job queue).
- Plan RP capacity early: one serial queue handles a few hundred daily checks. Hundreds of loans plus collateral checks will need parallel workers, one per RP account.

---

## 9. What could be extracted into reusable modules

For the loan platform these are the most useful, roughly in order:

1. **RP client** (`auth.js`, `puppet.js`, `rpAccounts.js`, `propertySearch.js`, `entitySearch.js`, the record-extraction files, `datosGenerales.js`). Package it as one module with a small interface: `login()`, `searchProperty({folio, codigo, owner})`, `searchEntity({name, ruc})`, `readRecord(match)`. Direct uses for a lender: check title, owners, liens and Prelación before funding; monitor collateral fincas and borrower companies during the loan. (Atlas Panama itself could be the monitoring service, so this needn't be rebuilt.)
2. **Change detection + snapshots** (`changeDetection.js`, `snapshotStore.js`). Generic "compare today with yesterday" for any structured record.
3. **Reliable scheduler** (`dailyScheduler.js` pattern): cron plus a catch-up checker, retries with fresh sessions, admin alerts on final failure. Fits payment-due reminders and late-fee runs.
4. **Email layer** (`email.js` Postmark HTTPS sender, `emailTranslations.js` bilingual dictionary, `adminAlerts.js`).
5. **Stripe helpers** (`stripe.js`): products by lookup key, Checkout, Customer Portal, webhook handling. Useful if borrowers pay online; loan repayments may need ACH or local bank rails instead.
6. **PDF report generator** (`pdfReport.js`): HTML → PDF with highlights; good for loan statements and payoff letters.
7. **Ops patterns:** the kill-switch variable, graceful SIGTERM draining, interrupted-job recovery, the daily activity report, cookieless analytics with `?src=` tags, and the 60-day retention purge with an audit email.
8. **Legal-page generator** (`scripts/build-legal-pages.js`): one source producing the Spanish governing text and the bilingual version.

**Not worth reusing:** the authentication model (too thin for financial data), the JSON-file storage, and the in-memory job queue (use a persistent queue once the database exists).
