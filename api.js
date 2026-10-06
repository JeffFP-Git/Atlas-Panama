import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { getPuppeteerLib } from './lib/puppet.js';
import { scrapeFincaPrelacionForName, exportFincaPrelacionToWorkbook } from './lib/finca.js';
import { scrapeMercantilForOwner, exportMercantilOnly } from './lib/mercantil.js';
import { searchEntityMatches } from './lib/entitySearch.js';
import { searchPropertyMatches } from './lib/propertySearch.js';
import * as auth from './lib/auth.js';
import * as storage from './lib/introPipelineStorage.js';
import * as trials from './lib/trials.js';
import * as analytics from './lib/analytics.js';
import { buildDailyReport, sendDailyReport, startDailyReport } from './lib/dailyReport.js';
import * as scheduler from './lib/dailyScheduler.js';
import { sendEmail, sendWelcomeEmail } from './lib/email.js';
import { getStripeClient, createCheckoutSession, createManageSession, PRICING } from './lib/stripe.js';
import { t as tEmail } from './lib/emailTranslations.js';
import { sendAdminAlertEmail } from './lib/adminAlerts.js';
import * as qaSearchLog from './lib/qaSearchLog.js';
import * as rpAccounts from './lib/rpAccounts.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, MONITORING_DIR } from './lib/dataPaths.js';
import * as snapshots from './lib/snapshotStore.js';

// Serial job runner: we intentionally run ONE job at a time to avoid concurrent Puppeteer runs
// and shared-state collisions (sessions, output files, RP site throttling).
// If you truly want concurrency, change this constant (but the default is intentionally serial).
const MAX_CONCURRENCY = 1;
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE || '1000', 10);          // safety cap

const app = express();

// Subscription access tokens and the admin API key are bearer-style secrets, not
// identifiers — logging them verbatim (as query params or POST body fields) means
// anyone with Railway log access effectively has them. Redact both logging points
// below (found during the Postmark SMTP outage investigation, Oct 2026).
const SENSITIVE_FIELD_NAMES = ['token', 'accesstoken', 'apikey', 'api_key', 'password'];

function redactSensitiveQueryParams(url) {
  try {
    const [pathPart, query] = url.split('?');
    if (!query) return url;
    const params = new URLSearchParams(query);
    let redacted = false;
    for (const key of params.keys()) {
      if (SENSITIVE_FIELD_NAMES.includes(key.toLowerCase())) {
        params.set(key, 'REDACTED');
        redacted = true;
      }
    }
    return redacted ? `${pathPart}?${params.toString()}` : url;
  } catch {
    return url;
  }
}

function redactSensitiveBody(body) {
  if (!body || typeof body !== 'object') return body;
  const clone = {};
  for (const [k, v] of Object.entries(body)) {
    clone[k] = SENSITIVE_FIELD_NAMES.includes(k.toLowerCase()) ? 'REDACTED' : v;
  }
  return clone;
}

// Enhanced request log (before body parsing to catch all requests)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  // Use process.stdout.write for immediate output (no buffering)
  process.stdout.write(`\n🌐 [${timestamp}] ${req.method} ${redactSensitiveQueryParams(req.url)}\n`);
  next();
});

// Stash the raw request body so /webhooks/stripe can verify Stripe's signature —
// Stripe requires the exact raw bytes, not the re-serialized parsed JSON.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// CORS configuration - allow requests from frontend domains
// Add your domains via environment variables: CORS_ORIGINS="https://www.example.com,https://app.example.com"
const corsOriginsFromEnv = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const allowedOrigins = [
  // Production domain — hardcoded rather than relying solely on CORS_ORIGINS,
  // since a missing/stale env var here silently 500s every real browser
  // request while curl/no-Origin requests keep working fine (hard to notice).
  'https://atlaspanama.com',
  'https://www.atlaspanama.com',
  // Local development
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  // S3 website endpoints (common regions - add yours if different)
  'http://panama-scraper-frontend.s3-website.us-east-1.amazonaws.com',
  'http://panama-scraper-frontend.s3-website.us-east-2.amazonaws.com',
  'https://panama-scraper-frontend.s3-website.us-east-1.amazonaws.com',
  'https://panama-scraper-frontend.s3-website.us-east-2.amazonaws.com',
  // S3 REST API endpoints (when using s3. instead of s3-website-)
  'https://panama-scraper-frontend.s3.us-east-1.amazonaws.com',
  'https://panama-scraper-frontend.s3.us-east-2.amazonaws.com',
  'http://panama-scraper-frontend.s3.us-east-1.amazonaws.com',
  'http://panama-scraper-frontend.s3.us-east-2.amazonaws.com',
  // CloudFront distributions (any CloudFront URL)
  /^https:\/\/.*\.cloudfront\.net$/,
  // Allow any localhost for development
  /^http:\/\/localhost:\d+$/,
  // Add custom domains from environment
  ...corsOriginsFromEnv,
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // For development, allow all origins (remove in production)
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Log request body after parsing (for POST requests)
app.use((req, res, next) => {
  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
    process.stdout.write(`   📦 Body: ${JSON.stringify(redactSensitiveBody(req.body))}\n`);
  }
  next();
});

// www.atlaspanama.com is a separate Railway custom domain pointed at this
// same service; redirect it to the root domain rather than serving it twice.
app.use((req, res, next) => {
  if (req.hostname === 'www.atlaspanama.com') {
    return res.redirect(301, `https://atlaspanama.com${req.originalUrl}`);
  }
  next();
});

// Count human visits to public pages for the daily report (no cookies; see lib/analytics.js)
app.use(analytics.trackPageView);

// Serve static dashboard
const ROOT_DIR = process.cwd();
app.use(express.static(path.join(ROOT_DIR, 'public')));

// public/ has no index.html, so the bare domain (e.g. atlaspanama.com) would
// 404 without this — about.html is the decided landing/marketing page.
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'about.html'));
});

// Legal pages. Spanish is the governing text (/terminos, /privacidad); /terms and
// /privacy are bilingual clause-by-clause versions (English translation + Spanish
// original). All four are generated by scripts/build-legal-pages.js — edit that
// script, not the HTML. Content is pending attorney review; URLs stay stable.
const STATIC_PAGES = {
  '/terminos': 'terminos.html',
  '/privacidad': 'privacidad.html',
  '/terms': 'terms.html',
  '/privacy': 'privacy.html',
  '/contact': 'contact.html',
};
for (const [route, file] of Object.entries(STATIC_PAGES)) {
  app.get(route, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', file));
  });
}

// Clean URL for the signup link used in ads/social posts (atlaspanama.com/subscribe)
// instead of the raw .html filename.
app.get('/subscribe', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'subscribe.html'));
});

app.get('/qa', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'qa.html'));
});

// Temporary side-by-side comparison page: simplified/Panamanian-tone rewrite of
// the Q&A copy, for the user to show for feedback before deciding whether to
// replace the live /qa page. Remove this route + public/qa-alt.html once decided.
app.get('/qa/1', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'qa-alt.html'));
});

// Anonymous Q&A search logging — no subscriber identity attached, just the query
// text/language/timestamp. See lib/qaSearchLog.js. Best-effort: never fails loudly,
// the page's own fetch call already ignores errors too.
app.post('/qa/search-log', (req, res) => {
  try {
    const { query, language } = req.body || {};
    if (query && typeof query === 'string') {
      qaSearchLog.logSearch(query, language);
    }
  } catch (err) {
    console.error('[API] Failed to log Q&A search:', err.message);
  }
  res.status(204).end();
});

// Job state
// status: queued | running | done | error | cancelled
const jobs = new Map(); // id -> { id, status, payload, timestamps, logs[] }
const queue = [];       // array of job ids in FIFO
let runningCount = 0;

function pushLog(id, msg) {
  const job = jobs.get(id);
  if (!job) return;
  const line = `[${new Date().toISOString()}] ${msg}`;
  job.logs.push(line);
  // Fan-out to any SSE listeners
  const listeners = sseClients.get(id);
  if (listeners) {
    listeners.forEach(res => res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`));
  }
}

async function startJob(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') return;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  runningCount++;
  pushLog(id, `Job started with payload ${JSON.stringify(job.payload)}`);

  const jobType = job.type || 'main';

  try {
    if (jobType === 'finca') {
      const name = String(job.payload?.name || job.payload?.corporateName || '').trim();
      if (!name) throw new Error('name_required');

      const headlessFlag =
        job.payload?.headless !== undefined
          ? !(job.payload.headless === 0 || job.payload.headless === '0' || job.payload.headless === false || job.payload.headless === 'false')
          : (process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true);

      const puppeteerLib = await getPuppeteerLib();
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      const userDataDir = job.payload?.userDataDir || process.env.USER_DATA_DIR || process.env.PUPPETEER_USER_DATA_DIR || '';

      const browser = await puppeteerLib.launch({
        headless: headlessFlag,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...(userDataDir ? { userDataDir } : {})
      });

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const result = await scrapeFincaPrelacionForName(page, name, {
          username: process.env.RP_USERNAME,
          password: process.env.RP_PASSWORD,
          isFoundation: job.payload?.isFoundation
        });

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'finca';
        const outputName =
          String(job.payload?.outputName || '').trim() ||
          `${slug}_finca_${id}.xlsx`;
        const outputPath = path.join(ROOT_DIR, 'BuildingData', outputName);

        await exportFincaPrelacionToWorkbook([result], outputPath);

        job.result = { outputName, outputPath, name, folio: result?.folio || '', rows: Array.isArray(result?.rows) ? result.rows.length : 0 };
        pushLog(id, `Finca job wrote ${outputName}`);
      } finally {
        await browser.close().catch(() => {});
      }
    } else if (jobType === 'mercantil') {
      const ownerName = String(job.payload?.ownerName || job.payload?.name || '').trim();
      if (!ownerName) throw new Error('ownerName_required');

      const headlessFlag =
        job.payload?.headless !== undefined
          ? !(job.payload.headless === 0 || job.payload.headless === '0' || job.payload.headless === false || job.payload.headless === 'false')
          : (process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true);

      const puppeteerLib = await getPuppeteerLib();
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      const userDataDir = job.payload?.userDataDir || process.env.USER_DATA_DIR || process.env.PUPPETEER_USER_DATA_DIR || '';

      const browser = await puppeteerLib.launch({
        headless: headlessFlag,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...(userDataDir ? { userDataDir } : {})
      });

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // mercantil.js expects to already be logged in via its own flow; it will navigate and scrape members.
        const mercantil = await scrapeMercantilForOwner(page, ownerName, {
          username: process.env.RP_USERNAME,
          password: process.env.RP_PASSWORD
        });

        const slug = ownerName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mercantil';
        const outputName =
          String(job.payload?.outputName || '').trim() ||
          `${slug}_mercantil_${id}.xlsx`;
        const outputPath = path.join(ROOT_DIR, 'BuildingData', outputName);

        await exportMercantilOnly([{ ownerName, mercantil }], outputPath);

        job.result = {
          outputName,
          outputPath,
          ownerName,
          mercantilFolio: mercantil?.mercantilFolio || '',
          rows: Array.isArray(mercantil?.rows) ? mercantil.rows.length : 0,
          notFound: !!mercantil?.notFound
        };
        pushLog(id, `Mercantil job wrote ${outputName}`);
      } finally {
        await browser.close().catch(() => {});
      }
    } else if (jobType === 'subscription') {
      const subscriptionId = String(job.payload?.subscriptionId || job.payload?.id || '').trim();
      if (!subscriptionId) throw new Error('subscriptionId_required');

      const subscription = storage.getSubscriptionRequest(subscriptionId);
      if (!subscription) throw new Error('subscription_not_found');

      // Run the exact same code path used by the production scheduler
      if (subscription.tipo === 'inmueble') {
        await scheduler.runPropertyIntelDaily(subscription);
      } else {
        await scheduler.runFincaDaily(subscription);
      }

      job.result = {
        subscriptionId: subscription.id,
        tipo: subscription.tipo,
        nameOrFolio: subscription.nameOrFolio,
        folio: subscription.folio,
        codigo: subscription.codigo
      };
    } else if (jobType === 'subscriptionPipeline') {
      const requestId = String(job.payload?.requestId || job.payload?.subscriptionId || job.payload?.id || '').trim();
      if (!requestId) throw new Error('requestId_required');

      const subscription = storage.getSubscriptionRequest(requestId);
      if (!subscription) throw new Error('subscription_not_found');

      await processSubscriptionPipeline(requestId);

      job.result = {
        requestId,
        tipo: subscription.tipo,
        email: subscription.email,
        nameOrFolio: subscription.nameOrFolio,
        folio: subscription.folio,
        codigo: subscription.codigo
      };
    } else {
      throw new Error(`unknown_job_type:${jobType}`);
    }

    job.status = 'done';
    job.endedAt = new Date().toISOString();
    pushLog(id, 'Job completed successfully');
  } catch (err) {
    job.status = 'error';
    job.endedAt = new Date().toISOString();
    job.error = err?.message || String(err);
    pushLog(id, `Job failed: ${job.error}`);
  } finally {
    runningCount--;
    // Notify SSE listeners of final state
    const listeners = sseClients.get(id);
    if (listeners) {
      listeners.forEach(res => res.write(`data: ${JSON.stringify({ type: 'status', status: job.status })}\n\n`));
    }
    // Start next jobs if capacity is available
    maybeStartNext();
  }
}

// Set when Railway asks this process to stop (SIGTERM during a redeploy). From then on no
// new queue jobs start; the one already running is allowed to finish (see shutdown
// handler near the bottom). Anything still queued is picked up again by the next
// process via recoverInterruptedSignups().
let shuttingDown = false;

function maybeStartNext() {
  if (shuttingDown) return;
  while (runningCount < MAX_CONCURRENCY && queue.length > 0) {
    const nextId = queue.shift();
    const job = jobs.get(nextId);
    if (!job || job.status !== 'queued') continue;
    // Fire and forget
    startJob(nextId);
  }
}

// SSE clients per jobId
const sseClients = new Map(); // jobId -> Set<res>

// Health
// Admin-only storage check: shows where persistent data lives and when that storage
// was first used. If "storageFirstUsedAt" stays the same across a redeploy, the
// Railway volume is working; if it resets to the latest deploy time, data is being
// wiped on every deploy (DATA_DIR isn't pointing at the volume).
const STORAGE_MARKER = path.join(DATA_DIR, '.storage-created-at');
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORAGE_MARKER)) fs.writeFileSync(STORAGE_MARKER, new Date().toISOString());
} catch (err) {
  console.error('[Storage] Could not write storage marker:', err.message);
}
const SERVER_STARTED_AT = new Date().toISOString();

// Daily activity report: preview any day's report as a web page (?date=YYYY-MM-DD,
// default yesterday; date=today for today so far), or resend it with ?send=1.
app.get('/admin/daily-report', requireAdminApiKey, async (req, res) => {
  const date = req.query.date === 'today' ? analytics.panamaDateString() : (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined);
  try {
    if (req.query.send === '1') {
      const sent = await sendDailyReport(date);
      return res.json({ ok: true, sent });
    }
    const { subject, html } = buildDailyReport(date);
    return res.send(`<html><head><meta charset="utf-8"><title>${subject}</title></head><body style="font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 16px;">${html}</body></html>`);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/admin/storage-check', requireAdminApiKey, (_req, res) => {
  let storageFirstUsedAt = null;
  try { storageFirstUsedAt = fs.readFileSync(STORAGE_MARKER, 'utf8').trim(); } catch {}
  res.json({
    ok: true,
    dataDirSetting: process.env.DATA_DIR || '(not set — using project folder)',
    dataDir: DATA_DIR,
    monitoringDir: MONITORING_DIR,
    storageFirstUsedAt,
    serverStartedAt: SERVER_STARTED_AT,
    subscriptionRequests: storage.listSubscriptionRequests().length,
    // Last daily check per active subscription (date of its newest snapshot)
    lastChecks: storage.listSubscriptionRequests({ confirmed: true, status: 'confirmed' }).map(s => ({
      name: scheduler.displayNameFor(s),
      email: s.email,
      lastCheck: snapshots.getLatestSnapshot(s.id)?.dateStr || null
    }))
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, running: runningCount, queued: queue.length, concurrency: MAX_CONCURRENCY });
});

// Whole-building scraper job submission ('main' jobType) has been removed from this
// app — that tool now lives standalone in ~/atlaspanama-jon/Building Search/ (the
// preserved, untouched original copy, which already has its own complete api.js/public/
// with this same route). Keeping it out of this process means a long-running building
// scrape can never sit in the same MAX_CONCURRENCY=1 queue as real subscriber-facing
// jobs (signup searches, daily monitoring) and delay them. See CLAUDE.md's Phase 3 log.

// Submit finca prelación job (non-blocking)
app.post('/run/finca', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type: 'finca',
    status: 'queued',
    payload: {
      name: body.name ?? body.corporateName,
      isFoundation: body.isFoundation,
      headless: body.headless,
      // Optional: force a shared/unique Chrome profile to reproduce locking issues
      userDataDir: body.userDataDir,
      // Optional: control output file name; default is unique per job
      outputName: body.outputName
    },
    enqueuedAt: new Date().toISOString(),
    logs: []
  };
  jobs.set(id, job);
  queue.push(id);
  maybeStartNext();
  return res.status(202).json({ ok: true, jobId: id, status: job.status, position: queue.indexOf(id) + 1 });
});

// Submit mercantil members job (non-blocking)
app.post('/run/mercantil', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type: 'mercantil',
    status: 'queued',
    payload: {
      ownerName: body.ownerName ?? body.name,
      headless: body.headless,
      userDataDir: body.userDataDir,
      outputName: body.outputName
    },
    enqueuedAt: new Date().toISOString(),
    logs: []
  };
  jobs.set(id, job);
  queue.push(id);
  maybeStartNext();
  return res.status(202).json({ ok: true, jobId: id, status: job.status, position: queue.indexOf(id) + 1 });
});

// Submit a subscription daily run job (non-blocking)
// Mirrors production scheduler behavior: runs runFincaDaily / runPropertyIntelDaily for that subscription.
app.post('/run/subscription', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const subscriptionId = String(body.subscriptionId || body.id || '').trim();
  if (!subscriptionId) {
    return res.status(400).json({ ok: false, error: 'subscriptionId_required' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type: 'subscription',
    status: 'queued',
    payload: { subscriptionId },
    enqueuedAt: new Date().toISOString(),
    logs: []
  };
  jobs.set(id, job);
  queue.push(id);
  maybeStartNext();
  return res.status(202).json({ ok: true, jobId: id, status: job.status, position: queue.indexOf(id) + 1 });
});

// Submit multiple subscription daily runs in one call (non-blocking)
app.post('/run/subscriptions', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const ids = Array.isArray(body.subscriptionIds) ? body.subscriptionIds : [];
  const cleaned = ids.map(x => String(x || '').trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return res.status(400).json({ ok: false, error: 'subscriptionIds_required' });
  }

  const jobIds = [];
  for (const subscriptionId of cleaned) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id,
      type: 'subscription',
      status: 'queued',
      payload: { subscriptionId },
      enqueuedAt: new Date().toISOString(),
      logs: []
    };
    jobs.set(id, job);
    queue.push(id);
    jobIds.push(id);
  }
  maybeStartNext();
  return res.status(202).json({ ok: true, jobIds });
});

// Submit a subscription "processing pipeline" job (the thing /subscribe/submit runs in background).
// This is what triggers processSubscriptionPipeline (search + classification + verification email).
app.post('/run/subscription-pipeline', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const requestId = String(body.requestId || body.subscriptionId || body.id || '').trim();
  if (!requestId) {
    return res.status(400).json({ ok: false, error: 'requestId_required' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type: 'subscriptionPipeline',
    status: 'queued',
    payload: { requestId },
    enqueuedAt: new Date().toISOString(),
    logs: []
  };
  jobs.set(id, job);
  queue.push(id);
  maybeStartNext();
  return res.status(202).json({ ok: true, jobId: id, status: job.status, position: queue.indexOf(id) + 1 });
});

// Batch enqueue subscription pipeline jobs
app.post('/run/subscription-pipelines', requireAdminApiKey, (req, res) => {
  if (queue.length + runningCount >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: 'queue_full' });
  }
  const body = req.body || {};
  const ids = Array.isArray(body.requestIds) ? body.requestIds : [];
  const cleaned = ids.map(x => String(x || '').trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return res.status(400).json({ ok: false, error: 'requestIds_required' });
  }

  const jobIds = [];
  for (const requestId of cleaned) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id,
      type: 'subscriptionPipeline',
      status: 'queued',
      payload: { requestId },
      enqueuedAt: new Date().toISOString(),
      logs: []
    };
    jobs.set(id, job);
    queue.push(id);
    jobIds.push(id);
  }
  maybeStartNext();
  return res.status(202).json({ ok: true, jobIds });
});

// Job status
app.get('/jobs/:id', requireAdminApiKey, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, job });
});

// SSE stream of progress logs and status for a job
// Note: EventSource (browser SSE client) can't set custom headers, so admin callers
// must pass the key as ?apiKey=... on this one — requireAdminApiKey already supports that.
app.get('/jobs/:id/stream', requireAdminApiKey, (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return res.status(404).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current snapshot
  res.write(`data: ${JSON.stringify({ type: 'status', status: job.status })}\n\n`);
  job.logs.forEach(line => res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`));

  // Register listener
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id).add(res);

  req.on('close', () => {
    const set = sseClients.get(id);
    if (set) set.delete(res);
  });
});

// Cancel a queued job
app.post('/jobs/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'not_found' });
  if (job.status !== 'queued') return res.status(409).json({ ok: false, error: 'cannot_cancel_now' });
  const idx = queue.indexOf(job.id);
  if (idx >= 0) queue.splice(idx, 1);
  job.status = 'cancelled';
  job.endedAt = new Date().toISOString();
  pushLog(job.id, 'Job cancelled');
  res.json({ ok: true, job });
});

// List jobs
app.get('/jobs', requireAdminApiKey, (_req, res) => {
  const list = Array.from(jobs.values()).sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : 1));
  res.json({ ok: true, jobs: list });
});

// View the live in-memory FIFO queue (ADMIN ONLY)
// This is the source of truth for the order jobs will run in.
// Reports only a count, never the actual usernames/passwords — safe to use for
// confirming a new RP_USERNAME_N/RP_PASSWORD_N pair actually took effect on Railway.
app.get('/admin/rp-accounts-status', requireAdminApiKey, (_req, res) => {
  res.json({ ok: true, accountCount: rpAccounts.accountCount() });
});

app.get('/queue', requireAdminApiKey, (_req, res) => {
  const running = Array.from(jobs.values())
    .filter(j => j && j.status === 'running')
    .map(j => ({
      id: j.id,
      type: j.type || 'main',
      startedAt: j.startedAt || null,
      enqueuedAt: j.enqueuedAt || null
    }));

  const queued = queue.map((id, idx) => {
    const j = jobs.get(id);
    return {
      position: idx + 1,
      id,
      type: j?.type || 'main',
      status: j?.status || 'queued',
      enqueuedAt: j?.enqueuedAt || null
    };
  });

  res.json({
    ok: true,
    concurrency: MAX_CONCURRENCY,
    runningCount,
    queuedCount: queue.length,
    running,
    queued
  });
});

// ===== File hosting (XLSX) =====
// List available .xlsx files in BuildingData/
app.get('/files', requireAdminApiKey, (_req, res) => {
  const dir = path.join(ROOT_DIR, 'BuildingData');
  fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    const rows = entries
      .filter(e => e.isFile() && /\.xlsx$/i.test(e.name))
      .map(e => {
        const stat = fs.statSync(path.join(dir, e.name));
        return {
          name: e.name,
          bytes: stat.size,
          modified: stat.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json({ ok: true, files: rows });
  });
});

// Download a specific .xlsx file
app.get('/files/:name', requireAdminApiKey, (req, res) => {
  const name = req.params.name || '';
  // prevent path traversal and allow only .xlsx
  if (!/^[A-Za-z0-9._-]+\.xlsx$/i.test(name)) {
    return res.status(400).json({ ok: false, error: 'invalid_filename' });
  }
  const filePath = path.join(ROOT_DIR, 'BuildingData', name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.sendFile(filePath);
});

// ===== Subscription API =====
// Submit subscription request (new user-facing endpoint)
app.post('/subscribe/submit', async (req, res) => {
  const startTime = Date.now();
  try {
    const { email, tipo, nameOrFolio, name, ruc, folio, codigo, ownerName, relationship, whatsappOptIn, whatsappPhone, language } = req.body;
    // `name` is the primary field for mercantil/fundacion (most subscribers know the
    // entity's name, not its RUC); `nameOrFolio` is accepted too for older callers.
    const entityName = name || nameOrFolio;
    const deferProcessing =
      req.body?.deferProcessing === true ||
      req.body?.deferProcessing === 1 ||
      req.body?.deferProcessing === '1' ||
      req.body?.deferProcessing === 'true';

    // Use process.stdout.write for immediate output
    process.stdout.write(`\n📥 [Subscribe] New subscription request received:\n`);
    process.stdout.write(`   Email: ${email}\n`);
    process.stdout.write(`   Tipo: ${tipo}\n`);
    if (tipo === 'inmueble') {
      process.stdout.write(`   Folio: ${folio || '(not provided)'}\n`);
      process.stdout.write(`   Código: ${codigo || '(not provided)'}\n`);
      process.stdout.write(`   Owner name: ${ownerName || '(not provided)'}\n`);
    } else {
      process.stdout.write(`   Name: ${entityName}\n`);
      process.stdout.write(`   RUC: ${ruc || '(not provided)'}\n`);
    }
    process.stdout.write(`   WhatsApp opt-in: ${whatsappOptIn ? 'yes (' + (whatsappPhone || 'no phone given') + ')' : 'no'}\n`);
    process.stdout.write(`   Language: ${language || 'es'}\n`);

    if (!email || !email.includes('@')) {
      process.stdout.write(`   ❌ Validation failed: valid_email_required\n`);
      return res.status(400).json({ ok: false, error: 'valid_email_required' });
    }

    if (!tipo || !['mercantil', 'fundacion', 'inmueble'].includes(tipo)) {
      process.stdout.write(`   ❌ Validation failed: valid_tipo_required\n`);
      return res.status(400).json({ ok: false, error: 'valid_tipo_required' });
    }

    // Relationship to the property/entity: optional since Oct 2026 (removed from the
    // signup form to reduce friction — Jeff's call; may come back later). Still
    // validated if a caller sends it.
    if (relationship && !['owner', 'interested_party', 'third_party'].includes(relationship)) {
      process.stdout.write(`   ❌ Validation failed: valid_relationship_required\n`);
      return res.status(400).json({ ok: false, error: 'valid_relationship_required' });
    }

    if ((tipo === 'mercantil' || tipo === 'fundacion') && !entityName && !ruc) {
      process.stdout.write(`   ❌ Validation failed: name_or_ruc_required\n`);
      return res.status(400).json({ ok: false, error: 'name_or_ruc_required' });
    }

    if (tipo === 'inmueble' && !folio && !ownerName) {
      process.stdout.write(`   ❌ Validation failed: folio_or_ownerName_required\n`);
      return res.status(400).json({ ok: false, error: 'folio_or_ownerName_required' });
    }

    const wantsWhatsapp = whatsappOptIn === true || whatsappOptIn === 'true';
    if (wantsWhatsapp && !whatsappPhone) {
      process.stdout.write(`   ❌ Validation failed: whatsapp_phone_required\n`);
      return res.status(400).json({ ok: false, error: 'whatsapp_phone_required' });
    }

    // Create request record (includes accessToken)
    const request = storage.createSubscriptionRequest({
      tipo,
      email,
      name: tipo !== 'inmueble' ? entityName : null,
      ruc: tipo !== 'inmueble' ? (ruc || null) : null,
      folio: tipo === 'inmueble' ? (folio || null) : null,
      codigo: tipo === 'inmueble' ? (codigo || null) : null,
      ownerName: tipo === 'inmueble' ? (ownerName || null) : null,
      relationship,
      whatsappOptIn: wantsWhatsapp,
      whatsappPhone: wantsWhatsapp ? whatsappPhone : null,
      language
    });
    
    process.stdout.write(`   ✅ Request created: ${request.id}\n`);
    
    // Email will be sent after processing completes (in processSubscriptionPipeline)
    // This ensures the email includes the property data for confirmation
    process.stdout.write(`   📧 Email will be sent after processing completes\n`);
    
    // IMPORTANT: Always serialize pipeline work through the job queue.
    // This prevents concurrent logins / Puppeteer sessions when multiple subscriptions are submitted.
    let enqueuedJobId = null;
    if (!deferProcessing) {
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        type: 'subscriptionPipeline',
        status: 'queued',
        payload: { requestId: request.id },
        enqueuedAt: new Date().toISOString(),
        logs: []
      };
      jobs.set(jobId, job);
      // High priority: user-initiated intro/subscription pipeline goes to the FRONT of the queue
      // so it will run immediately (or right after the currently running job).
      queue.unshift(jobId);
      enqueuedJobId = jobId;
      maybeStartNext();
      process.stdout.write(`   📥 Enqueued subscription pipeline job: ${jobId}\n`);
    } else {
      storage.updateSubscriptionRequest(request.id, { deferred: true });
      process.stdout.write(`   ⏸️  Processing deferred (deferProcessing=true)\n`);
    }
    
    const elapsed = Date.now() - startTime;
    process.stdout.write(`   ✅ Response sent in ${elapsed}ms (status: ${request.status})\n\n`);
    
    return res.status(202).json({ 
      ok: true, 
      requestId: request.id,
      jobId: enqueuedJobId,
      accessToken: request.accessToken, // Include token for polling
      status: request.status,
      message: deferProcessing
        ? 'Request created; processing deferred. Enqueue it via /run/subscription-pipeline when ready.'
        : 'Request created; pipeline enqueued and will run serially.'
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    process.stderr.write(`   ❌ Error after ${elapsed}ms: ${err.message || String(err)}\n\n`);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Get subscription request (with token verification)
app.get('/subscribe/request/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.query.token;
  
  const request = storage.getSubscriptionRequest(id);
  if (!request) {
    // Don't reveal if subscription exists
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  // Verify token if provided
  if (token) {
    if (!request.accessToken || request.accessToken !== token) {
      // Don't reveal if subscription exists
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
  } else {
    // Token required for security
    return res.status(400).json({ 
      ok: false, 
      error: 'token_required',
      message: 'Access token is required. Please use the link from your email.'
    });
  }
  
  // Return subscription data (including extracted data), plus whether this email still
  // qualifies for the free trial (the plan page shows the trial offer only if so).
  return res.json({ ok: true, request, trialEligible: request.confirmed !== true && trials.isEmailEligible(request.email), trialDays: trials.TRIAL_DAYS });
});

// Subscriber clicks "This is the one" from the disambiguation email (classification
// 'B' — a short list of candidate entities). Confirms that specific match, then sends
// the same verification-code email a single exact match ('A') would have gotten.
// "We're checking the Registro Público..." wording, adapted per tipo, used by both
// the select and one-click-verify endpoints below. Sent immediately via a streamed
// response so the subscriber sees it right away, even though (for now) the actual
// work behind these two specific links is fast — see respondWithWaitingThenResult.
function waitingMessageForTipo(tipo, lang) {
  if (lang === 'en') {
    const label = tipo === 'inmueble' ? 'property' : tipo === 'fundacion' ? 'foundation' : 'company';
    return `We are checking the Registro Público to find your ${label}. This can take a couple of minutes, so please be patient.`;
  }
  const label = tipo === 'inmueble' ? 'su propiedad' : tipo === 'fundacion' ? 'su fundación' : 'su sociedad';
  return `Estamos revisando el Registro Público para encontrar ${label}. Esto puede tardar un par de minutos; por favor tenga paciencia.`;
}

// Streams an immediate "please wait" message, then swaps in the real result once
// workFn() resolves — so the subscriber never sees a blank/loading browser tab with
// no explanation while a GET link (email button) is being processed server-side.
async function respondWithWaitingThenResult(res, waiting, workFn) {
  // waiting: { message, lang } (lang 'en' or 'es' — the subscriber's chosen language)
  const waitingMessage = typeof waiting === 'string' ? waiting : waiting.message;
  const lang = (waiting && waiting.lang) === 'en' ? 'en' : 'es';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.write(`<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:0 20px;">
    <div id="waiting">
      <h2 style="color:#667eea;">⏳ ${lang === 'en' ? 'Please wait...' : 'Por favor espere...'}</h2>
      <p>${waitingMessage}</p>
    </div>
    <div id="result" style="display:none;"></div>
  `);
  let resultHtml;
  try {
    resultHtml = await workFn();
  } catch (err) {
    resultHtml = `<h2 style="color:#e74c3c;">⚠️ ${lang === 'en' ? 'Something went wrong' : 'Algo salió mal'}</h2><p>${(err && err.message) || String(err)}</p>`;
  }
  res.write(`<script>
    document.getElementById('waiting').style.display = 'none';
    var r = document.getElementById('result');
    r.innerHTML = ${JSON.stringify(resultHtml)};
    r.style.display = 'block';
  </script></body></html>`);
  res.end();
}

app.get('/subscribe/request/:id/select', async (req, res) => {
  const { id } = req.params;
  const { token, index } = req.query;

  const request = storage.getSubscriptionRequest(id);
  if (!request) return res.status(404).send('Subscription request not found.');
  if (!token || request.accessToken !== token) return res.status(404).send('Subscription request not found.');
  if (request.status !== 'needs_disambiguation' || !Array.isArray(request.matches)) {
    return res.status(400).send('This selection link is no longer valid (the request may already be confirmed, or has expired).');
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= request.matches.length) {
    return res.status(400).send('Invalid selection.');
  }

  return respondWithWaitingThenResult(res, { message: waitingMessageForTipo(request.tipo, request.language), lang: request.language }, async () => {
    const match = request.matches[idx];
    const identity = matchIdentityFields(request.tipo, match);
    // The frontend expects datosDelFolio/datosDelInmueble to carry a rendered {html,
    // text} it can drop straight into the page, alongside the raw match fields.
    const storedMatchData = { ...match, ...renderMatchAsPropertyData(match) };

    storage.updateSubscriptionRequest(id, {
      status: 'completed',
      ...identity,
      datosDelFolio: storedMatchData,
      datosDelInmueble: request.tipo === 'inmueble' ? storedMatchData : null,
      matches: null
    });

    await sendConfirmedMatchVerificationEmail({ ...request, ...identity }, renderMatchAsPropertyData(match));

    return request.language === 'en'
      ? `<h2 style="color:#27ae60;">✓ Got it — ${matchDisplayLabel(request.tipo, match)}</h2>
      <p>We've sent you an email with a <strong>"Confirm Email &amp; Choose My Plan"</strong> button — click it to confirm your email and finish your subscription.</p>`
      : `<h2 style="color:#27ae60;">✓ Listo — ${matchDisplayLabel(request.tipo, match)}</h2>
      <p>Le enviamos un correo con el botón <strong>"Confirmar correo y elegir mi plan"</strong> — haga clic en él para confirmar su correo y completar su suscripción.</p>`;
  });
});

// Cancel subscription (GET from email link, or POST with body)
app.get('/subscribe/request/:id/cancel', async (req, res) => {
  return handleCancel(req, res, true);
});

app.post('/subscribe/request/:id/cancel', async (req, res) => {
  return handleCancel(req, res, false);
});

async function handleCancel(req, res, isGet) {
  const { id } = req.params;
  // Get token from query (GET) or body (POST)
  const token = isGet ? req.query.token : req.body.token;
  
  const request = storage.getSubscriptionRequest(id);
  if (!request) {
    // Don't reveal if subscription exists (prevent enumeration)
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  // Require token verification (from email link)
  if (!token) {
    return res.status(400).json({ 
      ok: false, 
      error: 'token_required',
      message: 'Access token is required. Please use the link from your email.'
    });
  }
  
  // Verify token matches subscription
  if (!request.accessToken || request.accessToken !== token) {
    // Don't reveal if subscription exists (prevent enumeration)
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  // Stop scheduled job
  try {
    scheduler.stopDailyJob(id);
  } catch (err) {
    console.error(`[API] Error stopping job for subscription ${id}:`, err);
  }
  
  // Update subscription status
  storage.updateSubscriptionRequest(id, {
    scheduled: false,
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  });
  
  console.log(`✅ Subscription ${id} cancelled by user`);
  
  // For GET requests, return HTML confirmation page
  if (isGet) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Subscription Cancelled</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #f44336; }
          p { color: #666; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✗ Subscription Cancelled</h1>
          <p>Your subscription has been cancelled. You will no longer receive daily emails.</p>
          <p>If you change your mind, you can create a new subscription anytime.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  return res.json({ 
    ok: true, 
    message: 'Subscription cancelled successfully',
    request: storage.getSubscriptionRequest(id)
  });
}

// Delete subscription (ADMIN ONLY)
app.delete('/subscribe/request/:id', requireAdminApiKey, (req, res) => {
  const { id } = req.params;
  
  const subscription = storage.getSubscriptionRequest(id);
  if (!subscription) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  // Stop scheduled job if running
  try {
    scheduler.stopDailyJob(id);
  } catch (err) {
    console.error(`[API] Error stopping job for subscription ${id}:`, err);
  }
  
  // Delete subscription
  const deleted = storage.deleteSubscriptionRequest(id);
  
  console.log(`[API] Deleted subscription: ${id}`);
  
  return res.json({ 
    ok: true, 
    message: 'Subscription deleted successfully',
    subscription: deleted
  });
});

// Update subscription (ADMIN ONLY)
app.put('/subscribe/request/:id', requireAdminApiKey, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const subscription = storage.getSubscriptionRequest(id);
  if (!subscription) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  // Don't allow updating certain fields
  const allowedFields = ['email', 'tipo', 'nameOrFolio', 'folio', 'codigo', 'status', 'scheduled', 'confirmed'];
  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (updates.hasOwnProperty(key)) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  // If status changed to cancelled, stop scheduled job
  if (filteredUpdates.status === 'cancelled' && subscription.status !== 'cancelled') {
    try {
      scheduler.stopDailyJob(id);
      filteredUpdates.scheduled = false;
    } catch (err) {
      console.error(`[API] Error stopping job for subscription ${id}:`, err);
    }
  }
  
  // If status changed to confirmed and wasn't scheduled, schedule it
  if (filteredUpdates.status === 'confirmed' && !subscription.scheduled) {
    const runTime = updates.runTime || '19:00';
    try {
      const updatedSub = storage.updateSubscriptionRequest(id, filteredUpdates);
      scheduler.scheduleDailyJob(updatedSub, runTime);
      filteredUpdates.scheduled = true;
    } catch (err) {
      console.error(`[API] Error scheduling job for subscription ${id}:`, err);
    }
  }
  
  const updated = storage.updateSubscriptionRequest(id, filteredUpdates);
  
  console.log(`[API] Updated subscription: ${id}`);
  
  return res.json({ 
    ok: true, 
    message: 'Subscription updated successfully',
    subscription: updated
  });
});

// End all subscriptions (ADMIN ONLY)
// Stops all scheduled jobs and cancels all active subscriptions
app.post('/subscribe/end-all', requireAdminApiKey, (req, res) => {
  try {
    // Get all subscriptions
    const allSubscriptions = storage.listSubscriptionRequests();
    
    let stoppedJobs = 0;
    let cancelledSubscriptions = 0;
    const errors = [];
    
    // Stop all scheduled jobs and cancel ALL subscriptions (not just confirmed ones)
    for (const subscription of allSubscriptions) {
      try {
        // Stop scheduled job if it exists (try to stop regardless of status)
        scheduler.stopDailyJob(subscription.id);
        if (subscription.scheduled || subscription.status === 'confirmed') {
          stoppedJobs++;
        }
      } catch (err) {
        // Ignore errors for jobs that don't exist
        if (!err.message || !err.message.includes('not found')) {
          console.error(`[API] Error stopping job for subscription ${subscription.id}:`, err);
          errors.push({ subscriptionId: subscription.id, error: 'Failed to stop job', details: err.message });
        }
      }
      
      // Cancel ALL subscriptions (set to cancelled regardless of current status)
      try {
        storage.updateSubscriptionRequest(subscription.id, {
          status: 'cancelled',
          scheduled: false,
          confirmed: false,
          cancelledAt: new Date().toISOString()
        });
        cancelledSubscriptions++;
      } catch (err) {
        console.error(`[API] Error cancelling subscription ${subscription.id}:`, err);
        errors.push({ subscriptionId: subscription.id, error: 'Failed to cancel subscription', details: err.message });
      }
    }
    
    console.log(`[API] Ended all subscriptions: ${stoppedJobs} jobs stopped, ${cancelledSubscriptions} subscriptions cancelled`);
    
    return res.json({
      ok: true,
      message: 'All subscriptions ended successfully',
      summary: {
        totalSubscriptions: allSubscriptions.length,
        jobsStopped: stoppedJobs,
        subscriptionsCancelled: cancelledSubscriptions,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (err) {
    console.error('[API] Error ending all subscriptions:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Public endpoint: Verify subscription with email and code
// Shared by both the manual-code POST endpoint and the one-click GET link below.
/**
 * Runs once at activation, before confirmAndScheduleSubscription: records the email as
 * having had its one subscription (so it never gets another free trial) and, if this
 * subscription started on a free trial, enforces one-trial-per-card — a card that
 * already had a trial has its trial ended immediately (billing starts today). Stores
 * trialStatus ('trialing' | 'ended_card_reused' | 'none') and trialEndsAt (YYYY-MM-DD)
 * for the welcome email, the plan page, and the trial-ending reminder.
 * Never throws: a Stripe hiccup here must not block activation.
 */
async function applyTrialRules(requestId, stripeSubscriptionId) {
  const request = storage.getSubscriptionRequest(requestId);
  if (!request || request.trialStatus) return; // already applied (success page + webhook can both fire)
  trials.recordEmail(request.email);
  let trialStatus = 'none';
  let trialEndsAt = null;
  try {
    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ['default_payment_method'] });
    if (sub.status === 'trialing' && sub.trial_end) {
      let fingerprint = sub.default_payment_method?.card?.fingerprint || null;
      if (!fingerprint && sub.customer) {
        const pms = await stripe.paymentMethods.list({ customer: sub.customer, type: 'card', limit: 1 });
        fingerprint = pms.data[0]?.card?.fingerprint || null;
      }
      if (fingerprint && trials.cardAlreadyUsed(fingerprint)) {
        await stripe.subscriptions.update(stripeSubscriptionId, { trial_end: 'now', proration_behavior: 'none' });
        trialStatus = 'ended_card_reused';
        console.log(`[Trial] ${requestId}: card already had a free trial — trial ended, billing starts today.`);
      } else {
        trials.recordCard(fingerprint);
        trialStatus = 'trialing';
        // Calendar date in Panama time, matching what Stripe shows the subscriber
        trialEndsAt = new Date(sub.trial_end * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Panama' });
      }
    }
  } catch (err) {
    console.error(`[Trial] Could not apply trial rules for ${requestId}:`, err.message);
    await sendAdminAlertEmail({
      subject: `Free-trial check failed: ${request.email}`,
      context: 'applyTrialRules',
      subscription: request,
      error: err
    }).catch(() => {});
  }
  storage.updateSubscriptionRequest(requestId, { trialStatus, trialEndsAt });
}

function confirmAndScheduleSubscription(requestId) {
  const confirmedRequest = storage.confirmSubscription(requestId, true);
  if (!confirmedRequest) return null;
  try {
    scheduler.scheduleDailyJob(confirmedRequest);
    console.log(`[API] Subscription ${requestId} confirmed and scheduled`);
  } catch (err) {
    console.error(`[API] Error scheduling job for ${requestId}:`, err);
    // Don't fail the request - subscription is confirmed even if scheduling fails
  }
  // Fire-and-forget: one-time welcome email, separate from daily monitoring emails
  // (which start the next scheduled check). Failure here shouldn't fail activation.
  // Payment details (plan label from the local PRICING table, renewal date fetched
  // from Stripe if we have a subscription ID) are best-effort — missing either one
  // just means the email skips that line rather than failing to send.
  (async () => {
    const planLabel = PRICING[confirmedRequest.plan]?.label || null;
    let renewalDate = null;
    if (confirmedRequest.stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        const sub = await stripe.subscriptions.retrieve(confirmedRequest.stripeSubscriptionId);
        // Newer Stripe API versions moved current_period_end from the subscription
        // onto each subscription item.
        const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
        if (periodEnd) {
          renewalDate = new Date(periodEnd * 1000).toISOString().slice(0, 10);
        }
      } catch (err) {
        console.error(`[API] Could not fetch Stripe subscription for welcome email (${requestId}):`, err.message);
      }
    }
    return sendWelcomeEmail({
      recipientEmail: confirmedRequest.email,
      displayName: scheduler.displayNameFor(confirmedRequest),
      manageUrl: scheduler.manageUrlFor(confirmedRequest),
      trialStatus: confirmedRequest.trialStatus,
      trialEndsAt: confirmedRequest.trialEndsAt,
      language: confirmedRequest.language,
      planLabel,
      renewalDate
    });
  })().catch(err => console.error(`[API] Error sending welcome email for ${requestId}:`, err));
  return confirmedRequest;
}

// ---------------------------------------------------------------------------
// Stripe checkout — reached from the "Confirm & Choose My Plan" button in the
// verification email (see sendConfirmedMatchVerificationEmail below), which
// links straight to public/payment.html?requestId=...&token=.... Clicking that
// email link both confirms the subscriber's email is real (they had to receive
// and click it) and takes them into plan selection — no separate "you're
// verified!" page first, per an explicit product decision to keep this to as
// few clicks as possible.
//
// All actual page rendering/bilingual copy lives in public/payment.html, same
// as subscribe.html/verify.html — these two routes are pure backend actions
// (create a Checkout Session; verify + activate after payment) that redirect
// back into that one static page with a `result` query param, rather than
// rendering their own HTML.
//
// Activation itself (confirmAndScheduleSubscription) only happens once Stripe
// confirms the payment — via the success_url redirect (primary path, works
// today against localhost) and, once a public URL exists (Thursday+), also via
// the /webhooks/stripe handler below as a durable backup.
// ---------------------------------------------------------------------------

app.get('/subscribe/request/:id/checkout', async (req, res) => {
  const { id } = req.params;
  const { token, plan } = req.query;
  const API_BASE_URL = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const request = storage.getSubscriptionRequest(id);
    if (!request || !token || request.accessToken !== token) {
      return res.status(404).send('Subscription request not found.');
    }
    const chosenPlan = plan === 'annual' ? 'annual' : 'monthly';
    const session = await createCheckoutSession(request, chosenPlan, {
      trialDays: trials.isEmailEligible(request.email) ? trials.TRIAL_DAYS : 0,
      successUrl: `${API_BASE_URL}/subscribe/request/${id}/checkout-success?token=${token}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${API_BASE_URL}/payment.html?requestId=${id}&token=${token}&result=cancelled`
    });
    return res.redirect(303, session.url);
  } catch (err) {
    console.error(`[API] Stripe checkout session creation failed for ${id}:`, err);
    // Send them back to the plan page rather than a dead end — they can just try again.
    return res.redirect(303, `/payment.html?requestId=${id}&token=${token || ''}`);
  }
});

app.get('/subscribe/request/:id/checkout-success', async (req, res) => {
  const { id } = req.params;
  const { token, session_id } = req.query;
  try {
    const request = storage.getSubscriptionRequest(id);
    if (!request || !token || request.accessToken !== token) {
      return res.status(404).send('Subscription request not found.');
    }
    if (request.confirmed === true) {
      return res.redirect(303, `/payment.html?requestId=${id}&token=${token}&result=success`);
    }
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const checkoutDone = session.status === 'complete' && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
    if (!checkoutDone || session.metadata?.requestId !== id) {
      // Not confirmed yet (e.g. still processing) — send them back to the plan page;
      // if the webhook or a refresh catches up, confirmed will already be true by then.
      return res.redirect(303, `/payment.html?requestId=${id}&token=${token}`);
    }
    storage.updateSubscriptionRequest(id, {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      plan: session.metadata.plan
    });
    await applyTrialRules(id, session.subscription);
    confirmAndScheduleSubscription(id);
    return res.redirect(303, `/payment.html?requestId=${id}&token=${token}&result=success`);
  } catch (err) {
    console.error(`[API] Stripe checkout-success handling failed for ${id}:`, err);
    return res.redirect(303, `/payment.html?requestId=${id}&token=${token || ''}`);
  }
});

// "Manage my subscription" link in every subscriber email: checks the per-subscription
// access token, then sends them to Stripe's hosted Customer Portal (update card, see
// invoices, cancel at period end). Cancelling there makes Stripe send
// customer.subscription.deleted when the paid period ends, which stops monitoring.
app.get('/subscribe/request/:id/manage', async (req, res) => {
  const request = storage.getSubscriptionRequest(req.params.id);
  if (!request || !request.accessToken || request.accessToken !== req.query.token) {
    return res.status(404).send('Link not found or expired. / Enlace no encontrado o vencido.');
  }
  if (!request.stripeCustomerId) {
    return res.redirect('/contact');
  }
  try {
    const url = await createManageSession(request.stripeCustomerId, request.language);
    return res.redirect(303, url);
  } catch (err) {
    console.error(`[Manage] Could not open Stripe Customer Portal for ${request.id}:`, err.message);
    await sendAdminAlertEmail({
      subject: `Manage-subscription link failed: ${request.email}`,
      context: 'GET /subscribe/request/:id/manage',
      subscription: request,
      error: err
    }).catch(() => {});
    return res.redirect('/contact');
  }
});

// Stripe webhook — durable backup activation path, primarily useful once the app is
// reachable at a public URL Stripe can deliver events to. Requires STRIPE_WEBHOOK_SECRET
// (from the Stripe Dashboard webhook endpoint config) to verify the signature; without it,
// we skip verification entirely and just log, rather than trust an unverified request.
app.post('/webhooks/stripe', async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.log('[Stripe webhook] STRIPE_WEBHOOK_SECRET not set — ignoring webhook call. Set it up once a public URL exists.');
    return res.status(200).send('webhook_secret_not_configured');
  }
  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const requestId = session.metadata?.requestId;
    if (requestId && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required')) {
      const request = storage.getSubscriptionRequest(requestId);
      if (request && request.confirmed !== true) {
        storage.updateSubscriptionRequest(requestId, {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          plan: session.metadata.plan
        });
        await applyTrialRules(requestId, session.subscription);
        confirmAndScheduleSubscription(requestId);
        console.log(`[Stripe webhook] Activated subscription ${requestId} via checkout.session.completed`);
      }
    }
  }

  // A Stripe subscription has ended — cancelled (cancellations are done by hand in the
  // Stripe Dashboard when a subscriber emails in; with "at period end" Stripe sends this
  // when the paid period runs out) or given up on after failed payments. Stop monitoring
  // so we don't keep checking and emailing for someone who's no longer paying.
  if (event.type === 'customer.subscription.deleted') {
    const stripeSub = event.data.object;
    const matches = storage.listSubscriptionRequests()
      .filter(s => s.stripeSubscriptionId === stripeSub.id && s.status !== 'cancelled');
    for (const s of matches) {
      try {
        scheduler.stopDailyJob(s.id);
      } catch (err) {
        console.error(`[Stripe webhook] Error stopping job for ${s.id}:`, err);
      }
      storage.updateSubscriptionRequest(s.id, { scheduled: false, status: 'cancelled', cancelledAt: new Date().toISOString() });
      console.log(`[Stripe webhook] Stopped monitoring ${s.id} — Stripe subscription ${stripeSub.id} ended`);
      await sendAdminAlertEmail({
        subject: `Subscription ended: ${s.email}`,
        context: 'POST /webhooks/stripe (customer.subscription.deleted)',
        subscription: s,
        error: `Stripe subscription ${stripeSub.id} ended (cancellation reason: ${stripeSub.cancellation_details?.reason || 'unknown'}). Monitoring stopped — informational, no action needed.`
      }).catch(() => {});
    }
  }

  res.status(200).send('ok');
});

// Postmark delivery webhook (Bounce/SpamComplaint) — a subscriber's email can start
// silently bouncing (bad address, mailbox full, blocked) with no other signal that
// anything's wrong; this surfaces it as an internal admin alert instead of letting
// it go unnoticed indefinitely. Configure in Postmark (My First Server > Default
// Transactional Stream > Webhooks): URL = https://<user>:<pass>@atlaspanama.com/webhooks/postmark
// (Basic Auth credentials embedded in the URL, matching POSTMARK_WEBHOOK_USER/
// POSTMARK_WEBHOOK_PASS below), Events = Bounce + SpamComplaint.
function requirePostmarkWebhookAuth(req, res, next) {
  const expectedUser = process.env.POSTMARK_WEBHOOK_USER;
  const expectedPass = process.env.POSTMARK_WEBHOOK_PASS;
  if (!expectedUser || !expectedPass) {
    // Fail closed rather than silently accept unauthenticated webhook calls.
    return res.status(503).json({ ok: false, error: 'webhook_auth_not_configured' });
  }
  const authHeader = req.headers['authorization'] || '';
  const [scheme, encoded] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Postmark Webhook"');
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }
  let decoded;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return res.status(401).json({ ok: false, error: 'invalid_auth' });
  }
  const sepIndex = decoded.indexOf(':');
  const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : decoded;
  const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';
  if (user !== expectedUser || pass !== expectedPass) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
  next();
}

app.post('/webhooks/postmark', requirePostmarkWebhookAuth, async (req, res) => {
  try {
    const event = req.body || {};
    const recordType = event.RecordType || 'Unknown';
    const email = event.Email || event.Recipient || '(unknown)';
    const bounceType = event.Type || '';
    console.log(`📬 [Postmark Webhook] ${recordType} for ${email}${bounceType ? ` (${bounceType})` : ''}`);

    if (recordType === 'Bounce' || recordType === 'SpamComplaint') {
      await sendAdminAlertEmail({
        subject: `Postmark ${recordType}: ${email}`,
        context: 'POST /webhooks/postmark',
        error: `${recordType}${bounceType ? ` (${bounceType})` : ''}: ${event.Description || event.Details || '(no description)'}`,
        extra: {
          email,
          messageId: event.MessageID || '(unknown)',
          subject: event.Subject || '(unknown)'
        }
      }).catch(() => {});
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Postmark Webhook] Error processing event:', err.message || String(err));
    res.status(200).json({ ok: true }); // Still 200 — don't make Postmark retry on our own bug.
  }
});

app.post('/subscribe/verify', async (req, res) => {
  try {
    const { requestId, email, code } = req.body;

    if (!requestId || !email || !code) {
      return res.status(400).json({ ok: false, error: 'requestId_email_and_code_required' });
    }

    if (code.length !== 8) {
      return res.status(400).json({ ok: false, error: 'code_must_be_8_characters' });
    }

    const request = storage.getSubscriptionRequest(requestId);
    if (!request) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // Verify email matches
    if (request.email !== email) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    // Verify code matches first 8 characters of accessToken
    const expectedCode = request.accessToken.substring(0, 8).toUpperCase();
    if (code.toUpperCase() !== expectedCode) {
      return res.status(400).json({ ok: false, error: 'invalid_code' });
    }

    const confirmedRequest = confirmAndScheduleSubscription(requestId);
    if (!confirmedRequest) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    return res.json({
      ok: true,
      message: 'Subscription verified and activated successfully',
      request: confirmedRequest
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// One-click activation link (from the "Verify & Activate" button in the confirmed-match
// email) — the access token alone is proof enough (it's a 64-char secret only the
// recipient's inbox would have seen), so no code needs to be typed anywhere.
app.get('/subscribe/request/:id/verify', async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  const request = storage.getSubscriptionRequest(id);
  if (!request) return res.status(404).send(renderVerifyResultPage({ ok: false, message: 'Subscription request not found.' }));
  if (!token || request.accessToken !== token) {
    return res.status(404).send(renderVerifyResultPage({ ok: false, message: 'Subscription request not found.' }));
  }
  if (request.confirmed === true) {
    return res.send(renderVerifyResultPage({ ok: true, message: 'This subscription is already active.', request }));
  }
  if (request.status !== 'completed') {
    return res.status(400).send(renderVerifyResultPage({ ok: false, message: 'This subscription isn\'t ready to activate yet (no confirmed match on file). Please use the link from a more recent email.' }));
  }

  return respondWithWaitingThenResult(res, { message: waitingMessageForTipo(request.tipo, request.language), lang: request.language }, async () => {
    const confirmedRequest = confirmAndScheduleSubscription(id);
    if (!confirmedRequest) return renderVerifyResultPage({ ok: false, message: 'Subscription request not found.' });
    return renderVerifyResultPage({ ok: true, message: 'Your subscription is now active! You\'ll receive daily updates by email.', request: confirmedRequest });
  });
});

function renderVerifyResultPage({ ok, message, request }) {
  const label = request ? matchDisplayLabel(request.tipo, request.datosDelFolio || {}) : '';
  return `
    <h2 style="color:${ok ? '#27ae60' : '#e74c3c'};">${ok ? '✓' : '⚠️'} ${ok ? 'Subscription Activated' : 'Something went wrong'}</h2>
    <p>${message}</p>
    ${label ? `<p style="color:#666;">${label}</p>` : ''}`;
}

// Public endpoint: Look up subscriptions by email (for users to find their pending subscriptions)
app.get('/subscribe/lookup', (req, res) => {
  try {
    const email = req.query.email;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'valid_email_required' });
    }
    
    // Get all subscriptions for this email, then filter client-side for unconfirmed ones
    const filter = { email: email };
    const allRequests = storage.listSubscriptionRequests(filter);
    
    // Filter to only show unconfirmed subscriptions (pending, processing, or completed but not confirmed)
    const unconfirmedRequests = allRequests.filter(r => 
      !r.confirmed && 
      (r.status === 'pending' || r.status === 'processing' || r.status === 'completed')
    );
    
    // Don't return accessToken in list - user needs to use email link or know the ID
    const sanitizedRequests = unconfirmedRequests.map(r => ({
      id: r.id,
      tipo: r.tipo,
      email: r.email,
      nameOrFolio: r.nameOrFolio,
      folio: r.folio,
      codigo: r.codigo,
      status: r.status,
      createdAt: r.createdAt,
      // Include data for display
      datosDelFolio: r.datosDelFolio,
      datosDelInmueble: r.datosDelInmueble
    }));
    
    return res.json({ ok: true, requests: sanitizedRequests, count: sanitizedRequests.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// List all subscription requests (ADMIN ONLY)
app.get('/subscribe/requests', requireAdminApiKey, (req, res) => {
  
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.email) filter.email = req.query.email;
    if (req.query.confirmed !== undefined) {
      filter.confirmed = req.query.confirmed === 'true';
    }
    if (req.query.tipo) filter.tipo = req.query.tipo;
    
    const requests = storage.listSubscriptionRequests(filter);
    return res.json({ ok: true, requests, count: requests.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Confirm subscription (GET from email link, or POST with body)
app.get('/subscribe/request/:id/confirm', async (req, res) => {
  return handleConfirm(req, res, true);
});

app.post('/subscribe/request/:id/confirm', async (req, res) => {
  return handleConfirm(req, res, false);
});

async function handleConfirm(req, res, isGet) {
  const startTime = Date.now();
  try {
    // Get token from query (GET) or body (POST)
    const token = isGet ? req.query.token : req.body.token;
    const { runTime } = isGet ? req.query : req.body;
    
    console.log(`\n📥 [Confirm] Confirmation request for subscription ${req.params.id}:`);
    
    // Require token verification (from email link)
    if (!token) {
      return res.status(400).json({ 
        ok: false, 
        error: 'token_required',
        message: 'Access token is required. Please use the link from your email.'
      });
    }
    
    const request = storage.getSubscriptionRequest(req.params.id);
    if (!request) {
      // Don't reveal if subscription exists
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    
    // Verify token matches subscription
    if (!request.accessToken || request.accessToken !== token) {
      // Don't reveal if subscription exists
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    
    // Token verified - proceed with confirmation (always confirm when clicking link)
    const confirmedRequest = storage.confirmSubscription(req.params.id, true);
    if (!confirmedRequest) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    
    // If confirmed, run job immediately and schedule daily job
    if (confirmedRequest.status === 'confirmed') {
      const scheduleTime = runTime || '19:00'; // Default to 7:00 PM (evening — RP data is most current by then)
      
      console.log(`   ✅ Subscription confirmed`);
      console.log(`   📅 Scheduling daily job at ${scheduleTime}...`);
      // Schedule daily job (non-blocking - just registers the cron task)
      scheduler.scheduleDailyJob(confirmedRequest, scheduleTime);
      storage.updateSubscriptionRequest(confirmedRequest.id, { scheduled: true });
      console.log(`   ✅ Daily job scheduled (non-blocking)`);
      
      // Run job immediately in background (don't wait for completion)
      // Use setImmediate to ensure it doesn't block the API response
      console.log(`   🚀 Starting immediate job execution (non-blocking)...`);
      setImmediate(() => {
        runImmediateJob(confirmedRequest).catch(err => {
          console.error(`   ❌ Immediate job failed:`, err.message || String(err));
        });
      });
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Confirmation processed in ${elapsed}ms\n`);
    
    // For GET requests, redirect to a success page or return HTML
    if (isGet) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Subscription Confirmed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #4CAF50; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Subscription Confirmed!</h1>
            <p>Your subscription has been activated. You will receive daily emails with property updates.</p>
            <p>To cancel your subscription, use the cancel link in any daily email.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    return res.json({ ok: true, request: confirmedRequest });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`   ❌ Error after ${elapsed}ms:`, err.message || String(err));
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

// Run job immediately when subscription is confirmed
async function runImmediateJob(subscription) {
  // In serial mode, do NOT run immediately in the background (would bypass the queue).
  // Instead enqueue a subscription daily-run job.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type: 'subscription',
    status: 'queued',
    payload: { subscriptionId: subscription.id },
    enqueuedAt: new Date().toISOString(),
    logs: []
  };
  jobs.set(id, job);
  queue.push(id);
  maybeStartNext();
  console.log(`   📥 [Immediate Job ${subscription.id}] Enqueued daily run as job ${id}`);
}

// Process subscription pipeline (async)
// Sends the "here's your confirmed match, enter this code on the website" email.
// Used both for an immediate exact match (classification 'A') and after a subscriber
// picks their entity from a short list (see /subscribe/request/:id/select below).
async function sendConfirmedMatchVerificationEmail(request, propertyData) {
  const API_BASE_URL = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const lang = request.language === 'en' ? 'en' : 'es';
  // One click: confirms the subscriber's email (they had to receive and click this link)
  // and takes them straight to plan selection + Stripe checkout — no separate
  // "you're verified, now click again to subscribe" page in between.
  const activateLink = `${API_BASE_URL}/payment.html?requestId=${request.id}&token=${request.accessToken}`;

  const buttonLabel = tEmail(lang, 'verify.buttonLabel');
  const buttonSub = tEmail(lang, 'verify.buttonSub', { monthly: PRICING.monthly.label, annual: PRICING.annual.label });
  const linkTextPrefix = tEmail(lang, 'verify.linkTextPrefix', { monthly: PRICING.monthly.label, annual: PRICING.annual.label });

  const activateButtonHtml = `
    <div style="text-align:center; margin: 24px 0;">
      <a href="${activateLink}" style="display:inline-block; background:#27ae60; color:white; text-decoration:none; font-weight:bold; font-size:17px; padding:16px 32px; border-radius:8px;">${buttonLabel}</a>
    </div>
    <p style="text-align:center; color:#999; font-size:13px;">${buttonSub}<br><a href="${activateLink}">${activateLink}</a></p>
  `;
  const activateLinkText = `${linkTextPrefix} ${activateLink}`;
  const dataFallback = tEmail(lang, 'verify.dataFallback');

  let emailSubject, emailText, emailHtml;

  if (request.tipo === 'inmueble') {
    const propertyLabel = `Folio ${request.folio}${request.codigo ? `, ${lang === 'es' ? 'Código' : 'Location Code'} ${request.codigo}` : ''}`;
    emailSubject = tEmail(lang, 'verify.subjectInmueble', { label: propertyLabel });
    emailText =
      `${lang === 'es' ? 'Hola' : 'Hello'},\n\n` +
      `${tEmail(lang, 'verify.introInmueble', { label: propertyLabel })}\n\n` +
      `${propertyData?.text || dataFallback}\n\n` +
      `${activateLinkText}`;
    emailHtml = `
      <h2>${emailSubject}</h2>
      <p>${tEmail(lang, 'verify.introInmueble', { label: propertyLabel })}</p>
      ${propertyData?.html || `<p>${dataFallback}</p>`}
      <hr style="margin: 30px 0;">
      ${activateButtonHtml}
    `;
  } else {
    const displayName = scheduler.displayNameFor(request);
    emailSubject = tEmail(lang, 'verify.subjectEntity', { label: displayName });
    emailText =
      `${lang === 'es' ? 'Hola' : 'Hello'},\n\n` +
      `${tEmail(lang, 'verify.introEntity', { label: displayName })}\n\n` +
      `${propertyData?.text || dataFallback}\n\n` +
      `${activateLinkText}`;
    emailHtml = `
      <h2>${emailSubject}</h2>
      <p>${tEmail(lang, 'verify.introEntity', { label: displayName })}</p>
      ${propertyData?.html || `<p>${dataFallback}</p>`}
      <hr style="margin: 30px 0;">
      ${activateButtonHtml}
    `;
  }

  const emailSent = await sendEmail({ to: request.email, subject: emailSubject, text: emailText, html: emailHtml });
  console.log(`   📧 [Pipeline ${request.id}] Debug: sendEmail(to=${request.email}, subject="${emailSubject}") -> ${emailSent ? 'ok' : 'failed'}`);
  if (!emailSent) console.log(`   ⚠️  Failed to send verification email to ${request.email}`);
  return emailSent;
}

// Renders an entitySearch match row (e.g. {FOLIO, MODULO, NOMBRE, RUC, ESTATUS, "FORMA JURÍDICA"})
// into the {text, html} shape sendConfirmedMatchVerificationEmail expects.
function renderMatchAsPropertyData(match) {
  const entries = Object.entries(match || {}).filter(([, v]) => v);
  return {
    text: entries.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<table style="border-collapse:collapse">${entries.map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:bold;border:1px solid #ddd;">${k}</td><td style="padding:4px 8px;border:1px solid #ddd;">${v}</td></tr>`).join('')}</table>`
  };
}

// A match row's columns differ by tipo: property search returns FOLIO/CODIGO
// UBICACIÓN/MUNICIPIO/PROPIETARIOS/..., entity search returns FOLIO/NOMBRE/RUC/....
// These two helpers translate either shape into what the request record should store,
// and into a short human-readable label for disambiguation emails.
function matchIdentityFields(tipo, match) {
  if (tipo === 'inmueble') {
    return {
      folio: match['FOLIO'] || match['Folio'] || '',
      codigo: match['CODIGO UBICACIÓN'] || match['Código de Ubicación'] || '',
      ownerName: match['PROPIETARIOS'] || match['Propietarios'] || ''
    };
  }
  return {
    name: match['NOMBRE'] || match['Nombre'] || '',
    ruc: match['RUC'] || '',
    folio: match['FOLIO'] || match['Folio'] || ''
  };
}

function matchDisplayLabel(tipo, match) {
  if (tipo === 'inmueble') {
    const folio = match['FOLIO'] || '';
    const codigo = match['CODIGO UBICACIÓN'] || '';
    const municipio = match['MUNICIPIO'] || '';
    const propietario = match['PROPIETARIOS'] || '';
    return `Folio ${folio}${codigo ? `, Código ${codigo}` : ''}${municipio ? ` (${municipio})` : ''}${propietario ? ` — ${propietario}` : ''}`;
  }
  const nombre = match['NOMBRE'] || Object.values(match)[0] || '';
  const ruc = match['RUC'] || '';
  return `${nombre}${ruc ? ` — RUC ${ruc}` : ''}`;
}

async function processSubscriptionPipeline(requestId) {
  const startTime = Date.now();
  rpAccounts.assertLoginsNotPaused();
  const request = storage.getSubscriptionRequest(requestId);
  if (!request) {
    console.error(`   ❌ [Pipeline ${requestId}] Request not found`);
    throw new Error('Request not found');
  }

  // Debug: confirm token/code exist (do NOT log full token)
  const tokenPrefix = (request.accessToken || '').slice(0, 8).toUpperCase();
  console.log(`   🧾 [Pipeline ${requestId}] Debug: accessTokenPrefix=${tokenPrefix || '(missing)'} email=${request.email} tipo=${request.tipo}`);

  // Safety: if accessToken is missing for any reason, regenerate it so the email can include a code
  if (!request.accessToken) {
    const crypto = require('crypto');
    const newAccessToken = crypto.randomBytes(32).toString('hex');
    storage.updateSubscriptionRequest(requestId, { accessToken: newAccessToken });
    request.accessToken = newAccessToken;
    console.log(`   🧾 [Pipeline ${requestId}] Debug: regenerated missing accessTokenPrefix=${newAccessToken.slice(0, 8).toUpperCase()}`);
  }
  
  console.log(`   🔄 [Pipeline ${requestId}] Starting processing (tipo: ${request.tipo})...`);
  storage.updateSubscriptionRequest(requestId, { status: 'processing' });
  
  try {
    // All three tipos now search with the same A/B/C classification instead of
    // blindly taking a single "best guess" match — that ambiguity (a Finca number or
    // company name not being unique) is exactly what the subscriber journey spec is
    // designed to handle.
    const tipoLabel = request.tipo === 'inmueble' ? 'Inmueble' : (request.tipo === 'fundacion' ? 'Fundación' : 'Mercantil');
    const searchLabel = request.tipo === 'inmueble'
      ? (request.folio ? `Folio ${request.folio}` : `owner "${request.ownerName}"`)
      : ([request.name || request.nameOrFolio, request.ruc ? `RUC ${request.ruc}` : null].filter(Boolean).join(', ') || '—');
    console.log(`   🔍 [Pipeline ${requestId}] Searching Registro Público (${tipoLabel}) — ${searchLabel}...`);

    const puppeteerLib = await getPuppeteerLib();
    const browser = await puppeteerLib.launch({
      headless: process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let searchResult;
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await auth.restoreSessionCookies(page);
      let loggedIn = await auth.isLoggedIn(page);
      if (!loggedIn) {
        // Retry across every configured RP account (see lib/rpAccounts.js) instead of
        // failing outright on the first account's login failure — this is the same
        // failover the daily monitoring scheduler already uses, and this is the very
        // first thing every new subscriber hits, so it needs it at least as much.
        const maxLoginAttempts = Math.max(1, rpAccounts.accountCount());
        let lastAccount = null;
        for (let attempt = 1; attempt <= maxLoginAttempts && !loggedIn; attempt++) {
          const account = rpAccounts.getCurrentAccount();
          lastAccount = account;
          console.log(`   🔐 [Pipeline ${requestId}] Login attempt ${attempt}/${maxLoginAttempts} (account: ${account.username})...`);
          loggedIn = await auth.performLogin(page, { username: account.username, password: account.password });
          if (!loggedIn && attempt < maxLoginAttempts) {
            rpAccounts.advanceToNextAccount();
          }
        }
        if (!loggedIn) {
          // Surface WHY the login failed (no CAPTCHA solver plugin loaded, solver
          // errored, or it solved fine and login still failed) — this is visible via
          // the subscription's `error` field on /subscribe/request/:id, no Railway
          // log access needed. See lib/auth.js getLastLoginDiagnostics().
          const diag = auth.getLastLoginDiagnostics ? auth.getLastLoginDiagnostics() : null;
          const diagStr = diag
            ? ` [captcha plugin: ${diag.pluginLoaded === null ? 'unknown' : (diag.pluginLoaded ? 'loaded' : 'NOT LOADED')}, checkbox auto-verified: ${diag.verifiedViaCheckbox}, solve attempts: ${JSON.stringify(diag.solveAttempts)}]`
            : '';
          throw new Error(`Registro Público login failed (tried ${maxLoginAttempts} account${maxLoginAttempts === 1 ? '' : 's'}, last: ${lastAccount ? lastAccount.username : 'unknown'})${diagStr}`);
        }
        await auth.saveSessionCookies(page);
      }

      const entityName = request.name || request.nameOrFolio;
      searchResult = request.tipo === 'inmueble'
        ? await searchPropertyMatches(page, { folio: request.folio, codigo: request.codigo, ownerName: request.ownerName })
        : await searchEntityMatches(page, { entityType: request.tipo, name: entityName, idNumber: request.ruc });

      // Foundations live in a separate RP section (Personas) from companies (Mercantil),
      // and every foundation's name contains "Fundación"/"Foundation". If someone picked
      // Mercantil but typed a foundation's name and nothing was found, retry once as a
      // foundation — and save it as one, so daily monitoring searches the right section.
      if (request.tipo === 'mercantil' && searchResult.classification === 'none'
          && /fundaci[oó]n|foundation/i.test(entityName || '')) {
        console.log(`   🔁 [Pipeline ${requestId}] No Mercantil match for a foundation-like name — retrying as Fundación...`);
        const retry = await searchEntityMatches(page, { entityType: 'fundacion', name: entityName, idNumber: request.ruc });
        if (retry.classification !== 'none') {
          searchResult = retry;
          storage.updateSubscriptionRequest(requestId, { tipo: 'fundacion' });
          request.tipo = 'fundacion';
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }

    console.log(`   📊 [Pipeline ${requestId}] Classification: ${searchResult.classification} (${searchResult.count} match${searchResult.count === 1 ? '' : 'es'})`);

    const lang = request.language === 'en' ? 'en' : 'es';

    if (searchResult.classification === 'none') {
      // Matches the promise on the Q&A page: after 2 failed search attempts, point the
      // subscriber at operations@atlaspanama.com for free manual help instead of just
      // asking them to keep guessing. Count prior no_match requests from this same
      // email (across any property/entity) before this one is saved as the latest.
      const priorNoMatchCount = storage.listSubscriptionRequests({ email: request.email, status: 'no_match' }).length;
      const isRepeat = priorNoMatchCount >= 1;
      const noMatchKeyPrefix = isRepeat ? 'noMatchRepeat' : 'noMatch';

      storage.updateSubscriptionRequest(requestId, { status: 'no_match' });
      await sendEmail({
        to: request.email,
        subject: tEmail(lang, `${noMatchKeyPrefix}.subject`, { searchLabel }),
        text: tEmail(lang, `${noMatchKeyPrefix}.text`, { searchLabel }),
        html: tEmail(lang, `${noMatchKeyPrefix}.html`, { searchLabel })
      });
      console.log(`   ✅ [Pipeline ${requestId}] No match (attempt #${priorNoMatchCount + 1} for this email) — notified subscriber${isRepeat ? ' with operations@ help offer' : ''}.`);
      return;
    }

    if (searchResult.classification === 'C') {
      storage.updateSubscriptionRequest(requestId, { status: 'needs_refinement', matches: null, matchCount: searchResult.count });
      const refineHint = tEmail(lang, request.tipo === 'inmueble' ? 'refine.hintInmueble' : 'refine.hintEntity');
      await sendEmail({
        to: request.email,
        subject: tEmail(lang, 'refine.subject', { searchLabel }),
        text: tEmail(lang, 'refine.text', { searchLabel, refineHint }),
        html: tEmail(lang, 'refine.html', { searchLabel, refineHint })
      });
      console.log(`   ✅ [Pipeline ${requestId}] Too many matches — asked subscriber to refine.`);
      return;
    }

    if (searchResult.classification === 'B') {
      const candidateList = searchResult.matches.slice(0, 15);
      storage.updateSubscriptionRequest(requestId, { status: 'needs_disambiguation', matches: candidateList, matchCount: searchResult.count });

      const API_BASE_URL = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const pickThisOne = tEmail(lang, 'disambig.pickThisOne');
      const listHtml = candidateList.map((m, i) => {
        const link = `${API_BASE_URL}/subscribe/request/${requestId}/select?index=${i}&token=${request.accessToken}`;
        return `<li><strong>${matchDisplayLabel(request.tipo, m)}</strong> — <a href="${link}">${pickThisOne}</a></li>`;
      }).join('\n');
      const listText = candidateList.map((m, i) => `${i + 1}. ${matchDisplayLabel(request.tipo, m)}`).join('\n');

      await sendEmail({
        to: request.email,
        subject: tEmail(lang, 'disambig.subject', { count: candidateList.length, searchLabel }),
        text: tEmail(lang, 'disambig.text', { count: candidateList.length, searchLabel, list: listText }),
        html: tEmail(lang, 'disambig.html', { count: candidateList.length, searchLabel, list: listHtml })
      });
      console.log(`   ✅ [Pipeline ${requestId}] ${candidateList.length} matches — asked subscriber to pick one.`);
      return;
    }

    // classification === 'A': exactly one match.
    const match = searchResult.matches[0];
    const identity = matchIdentityFields(request.tipo, match);
    const storedMatchData = { ...match, ...renderMatchAsPropertyData(match) };

    storage.updateSubscriptionRequest(requestId, {
      status: 'completed',
      ...identity,
      datosDelFolio: storedMatchData,
      datosDelInmueble: request.tipo === 'inmueble' ? storedMatchData : null
    });

    const verificationEmailSent = await sendConfirmedMatchVerificationEmail({ ...request, ...identity }, renderMatchAsPropertyData(match));
    const elapsed = Date.now() - startTime;
    if (verificationEmailSent) {
      console.log(`   ✅ [Pipeline ${requestId}] Completed in ${elapsed}ms - Verification email sent to ${request.email}`);
    } else {
      // Don't claim success when the send actually failed — this subscriber matched
      // fine but will never get the confirmation/checkout link, so it's worth an
      // internal alert, not just a quiet log line (this exact gap let a real Postmark
      // SMTP outage go unnoticed — see CLAUDE.md, Oct 2026).
      console.error(`   ❌ [Pipeline ${requestId}] Completed search in ${elapsed}ms but FAILED to send verification email to ${request.email}`);
      storage.updateSubscriptionRequest(requestId, { emailSendFailed: true });
      await sendAdminAlertEmail({
        subject: 'Verification email failed to send',
        context: 'processSubscriptionPipeline (classification A, single confirmed match)',
        subscription: request,
        error: 'sendConfirmedMatchVerificationEmail() returned false — the subscriber matched successfully but will never receive their confirmation/checkout link unless this is caught manually.'
      }).catch(() => {});
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`   ❌ [Pipeline ${requestId}] Failed after ${elapsed}ms:`, err.message || String(err));
    storage.updateSubscriptionRequest(requestId, {
      status: 'error',
      error: err.message || String(err)
    });
    try {
      await sendAdminAlertEmail({
        subject: `Signup pipeline failed — ${request.email}`,
        context: 'api.js processSubscriptionPipeline',
        subscription: request,
        error: err,
        extra: { elapsedMs: elapsed }
      });
    } catch (alertErr) {
      console.error(`   ⚠️  [Pipeline ${requestId}] Failed to send internal admin alert:`, alertErr?.message);
    }
    throw err;
  }
}

// ===== Admin API Key Middleware =====
function requireAdminApiKey(req, res, next) {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) {
    // If no API key is configured, allow access (for development)
    return next();
  }
  
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.apiKey;
  if (!providedKey || providedKey !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'api_key_required' });
  }
  next();
}

// ===== Scheduler Management API (ADMIN ONLY) =====
// Schedule a test run (one-time, runs after specified delay)
app.post('/scheduler/test', requireAdminApiKey, async (req, res) => {
  try {
    const { subscriptionId, delaySeconds } = req.body;
    
    if (!subscriptionId) {
      return res.status(400).json({ ok: false, error: 'subscriptionId_required' });
    }
    
    const subscription = storage.getSubscriptionRequest(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ ok: false, error: 'subscription_not_found' });
    }
    
    const delay = delaySeconds || 20; // Default to 20 seconds
    if (delay < 1 || delay > 3600) {
      return res.status(400).json({ ok: false, error: 'delay_must_be_between_1_and_3600_seconds' });
    }
    
    const result = scheduler.scheduleTestJob(subscription, delay);
    
    console.log(`[API] Test job scheduled: ${result.jobId} for subscription ${subscriptionId} in ${delay} seconds`);
    
    return res.json({ 
      ok: true, 
      jobId: result.jobId,
      subscriptionId,
      delaySeconds: delay,
      scheduledAt: result.scheduledAt,
      willRunAt: result.willRunAt
    });
  } catch (err) {
    console.error('[API] Error scheduling test job:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// List all scheduled jobs (ADMIN ONLY)
app.get('/scheduler/list', requireAdminApiKey, (_req, res) => {
  try {
    const jobs = scheduler.listScheduledJobs();
    return res.json({ ok: true, jobs, count: jobs.length });
  } catch (err) {
    console.error('[API] Error listing scheduled jobs:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Remove a scheduled job (ADMIN ONLY)
app.delete('/scheduler/:id', requireAdminApiKey, (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Try to stop the job
    scheduler.stopDailyJob(jobId);
    
    // Also try by subscription ID (in case jobId format is different)
    const jobs = scheduler.listScheduledJobs();
    const job = jobs.find(j => j.jobId === jobId || j.subscriptionId === jobId);
    
    if (job && job.jobId !== jobId) {
      scheduler.stopDailyJob(job.jobId);
    }
    
    console.log(`[API] Removed scheduled job: ${jobId}`);
    
    return res.json({ ok: true, message: 'Job removed', jobId });
  } catch (err) {
    console.error('[API] Error removing scheduled job:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Load and schedule all confirmed subscriptions on startup
function initializeScheduler() {
  console.log('\n[API] Initializing scheduler...');
  try {
    // In serial mode, ensure scheduled jobs enqueue work into the API queue
    // instead of running pipelines directly in the scheduler module.
    try {
      scheduler.setEnqueueRunHandler(async (subscription, meta = {}) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const job = {
          id,
          type: 'subscription',
          status: 'queued',
          payload: { subscriptionId: subscription.id, meta },
          enqueuedAt: new Date().toISOString(),
          logs: []
        };
        jobs.set(id, job);
        queue.push(id);
        maybeStartNext();
        console.log(`[API][Scheduler->Queue] Enqueued subscription daily run ${subscription.id} as job ${id}`);
      });
    } catch (e) {
      console.error('[API] Warning: could not set scheduler enqueue handler:', e?.message || String(e));
    }

    // Get all subscriptions for debugging
    const allSubscriptions = storage.listSubscriptionRequests();
    const confirmedSubscriptions = storage.listSubscriptionRequests({ confirmed: true, status: 'confirmed' });
    
    console.log(`[API] Total subscriptions: ${allSubscriptions.length}`);
    console.log(`[API] Confirmed subscriptions (confirmed=true AND status='confirmed'): ${confirmedSubscriptions.length}`);
    
    // Debug: Show which subscriptions match the filter
    if (confirmedSubscriptions.length > 0) {
      console.log(`[API] Confirmed subscription IDs: ${confirmedSubscriptions.map(s => s.id).join(', ')}`);
    }
    
    // Debug: Show subscriptions that have confirmed=true but wrong status
    const confirmedButWrongStatus = allSubscriptions.filter(s => s.confirmed === true && s.status !== 'confirmed');
    if (confirmedButWrongStatus.length > 0) {
      console.log(`[API] Warning: ${confirmedButWrongStatus.length} subscriptions have confirmed=true but status != 'confirmed':`);
      confirmedButWrongStatus.forEach(s => {
        console.log(`[API]   - ${s.id}: confirmed=${s.confirmed}, status=${s.status}`);
      });
    }
    
    if (confirmedSubscriptions.length > 0) {
      const runTime = process.env.DAILY_RUN_TIME || '19:00';
      scheduler.loadAndScheduleAll(confirmedSubscriptions, runTime);
      console.log(`[API] Loaded ${confirmedSubscriptions.length} confirmed subscriptions for daily scheduling`);
    } else {
      console.log('[API] No confirmed subscriptions to schedule');
    }
    console.log('[API] Scheduler initialization complete\n');
  } catch (err) {
    console.error('[API] Error initializing scheduler:', err);
  }
}

// Prevent process from exiting
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  if (err.stack) {
    console.error(err.stack);
  }
  // Don't exit, keep the server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('   Reason:', reason);
  if (reason && reason.stack) {
    console.error('   Stack:', reason.stack);
  }
  // Don't exit, keep the server running
});

// ---------------------------------------------------------------------------
// Redeploy safety. A redeploy (or any restart) replaces this process; signup searches
// in progress or waiting in the in-memory queue would otherwise be lost silently, with
// the subscriber never getting their email.
// ---------------------------------------------------------------------------

// Signups interrupted more than this long ago are not restarted (the person has likely
// moved on; emailing them hours later would be confusing) — they get an admin alert.
const RECOVERY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** On startup: re-run signup searches a previous process didn't finish. */
async function recoverInterruptedSignups() {
  const interrupted = storage.listSubscriptionRequests()
    .filter(r => (r.status === 'pending' || r.status === 'processing') && r.confirmed !== true && !r.deferred)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // oldest first
  if (interrupted.length === 0) return;

  const now = Date.now();
  for (const r of interrupted) {
    const lastActivity = new Date(r.updatedAt || r.createdAt).getTime();
    if (now - lastActivity > RECOVERY_MAX_AGE_MS) {
      storage.updateSubscriptionRequest(r.id, { status: 'error', error: 'Interrupted by a server restart and too old to restart automatically.' });
      console.log(`[Recovery] Not restarting stale signup ${r.id} (${r.email}) — last activity ${r.updatedAt || r.createdAt}.`);
      await sendAdminAlertEmail({
        subject: `Signup interrupted and not restarted: ${r.email}`,
        context: 'recoverInterruptedSignups (startup)',
        subscription: r,
        error: 'A signup search was cut off by a server restart more than 6 hours ago, so it was not re-run automatically. The subscriber may need a nudge to sign up again.'
      }).catch(() => {});
      continue;
    }
    storage.updateSubscriptionRequest(r.id, { status: 'pending' });
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, {
      id: jobId,
      type: 'subscriptionPipeline',
      status: 'queued',
      payload: { requestId: r.id, recovered: true },
      enqueuedAt: new Date().toISOString(),
      logs: []
    });
    queue.push(jobId);
    console.log(`[Recovery] Restarting interrupted signup ${r.id} (${r.email}) as job ${jobId}.`);
  }
  maybeStartNext();
}

// Railway sends SIGTERM before replacing this process. Stop starting new work, let the
// running job finish (up to SHUTDOWN_GRACE_MS — Railway's own draining time,
// RAILWAY_DEPLOYMENT_DRAINING_SECONDS, caps how long it actually waits), then exit.
// If the process is killed before the job finishes, recoverInterruptedSignups() in the
// next process re-runs it, and the scheduler's catch-up checker re-runs daily checks.
const SHUTDOWN_GRACE_MS = 150 * 1000;

function handleShutdownSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Shutdown] ${signal} received — no new jobs will start; waiting for ${runningCount} running job(s) to finish.`);
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (runningCount === 0 || Date.now() - startedAt > SHUTDOWN_GRACE_MS) {
      clearInterval(timer);
      console.log(`[Shutdown] Exiting (${runningCount === 0 ? 'all jobs finished' : 'grace period over'}).`);
      process.exit(0);
    }
  }, 1000);
}
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGINT', () => handleShutdownSignal('SIGINT'));

const port = process.env.PORT || 3000;
try {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n✅ API listening on 0.0.0.0:${port} (concurrency=${MAX_CONCURRENCY})\n`);
    // Initialize scheduler after server starts (non-blocking)
    // This ensures scheduled jobs don't block API requests
    setImmediate(() => {
      initializeScheduler();
      startDailyReport();
      try {
        const seeded = trials.seedFromExistingSubscriptions(storage.listSubscriptionRequests());
        if (seeded > 0) console.log(`[Trial] Marked ${seeded} existing subscriber email(s) as already subscribed (no free trial on their next signup).`);
      } catch (err) {
        console.error('[Trial] Could not seed trial registry:', err.message);
      }
      recoverInterruptedSignups().catch(err => console.error('[Recovery] Failed:', err));
    });
    console.log('📡 Server is running. Press Ctrl+C to stop.\n');
  });

  // Keep the process alive
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  
  // Log connection events for debugging
  server.on('connection', (socket) => {
    const clientIp = socket.remoteAddress;
    console.log(`🔌 [CONNECTION] New connection from ${clientIp}:${socket.remotePort}`);
    
    socket.on('close', () => {
      console.log(`🔌 [CONNECTION] Connection closed from ${clientIp}:${socket.remotePort}`);
    });
    
    socket.on('error', (err) => {
      console.error(`🔌 [CONNECTION] Socket error from ${clientIp}:`, err.message);
    });
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error('❌ Server error:', err);
  });
} catch (err) {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
}