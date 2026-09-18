/**
 * Daily Scheduler - Non-blocking scheduled job system
 *
 * This module handles scheduling and running daily jobs for subscriptions.
 * All jobs run asynchronously and do NOT block the API or event loop:
 * - Scheduled jobs (cron) use setImmediate() to run in background
 * - Immediate jobs are fire-and-forget with error handling
 * - All operations are async and non-blocking
 *
 * The API remains fully responsive while jobs run in the background.
 *
 * Each run pulls a full record (see lib/entityRecordExtraction.js /
 * lib/propertyRecordExtraction.js), compares it against the subscription's
 * most recent saved snapshot (lib/snapshotStore.js, keyed by subscription ID),
 * renders today's PDF with any changed Prelación rows highlighted
 * (lib/pdfReport.js), saves today's snapshot, and emails the subscriber either
 * a "no changes" or "something changed" update (lib/email.js).
 */

import cron from 'node-cron';
import { getPuppeteerLib } from './puppet.js';
import * as auth from './auth.js';
import { extractEntityFullRecord } from './entityRecordExtraction.js';
import { extractPropertyFullRecord } from './propertyRecordExtraction.js';
import { renderRecordToPdf } from './pdfReport.js';
import { compareRecords, describeChangesPlainLanguage, highlightedPrelacionRowIndexes } from './changeDetection.js';
import * as snapshots from './snapshotStore.js';
import { sendMonitoringUpdateEmail } from './email.js';
import { sendAdminAlertEmail } from './adminAlerts.js';

// Store active cron jobs
const activeJobs = new Map(); // requestId -> cronTask
// Store job metadata for listing
const jobMetadata = new Map(); // requestId -> { subscription, runTime, isTest, scheduledAt }

// Optional hook: when set, scheduled jobs will enqueue work elsewhere (e.g. API job queue)
// so that all jobs can be serialized.
let enqueueRunHandler = null; // async (subscription, meta) => void

export function setEnqueueRunHandler(fn) {
  enqueueRunHandler = typeof fn === 'function' ? fn : null;
}

// ---------------------------------------------------------------------------
// Self-healing catch-up checker.
//
// node-cron cannot be fully trusted as the only trigger: on 2026-09-15, a real
// subscription's 19:00 job was registered at boot (confirmed in the log), the
// server ran continuously through and well past 19:00, and the job simply never
// fired — no error, nothing in the logs, node-cron itself tested fine in
// isolation immediately afterward. This is a documented class of node-cron
// failure (see CLAUDE.md) — an in-memory scheduler with no built-in monitoring
// can silently miss a fire.
//
// Rather than trust a timer callback fired, this checker periodically looks at
// real state — "does today's snapshot already exist for this subscription?" —
// and runs the job itself if it's overdue. This self-corrects a missed cron
// fire within CHECK_INTERVAL_MS, and also covers the separate case of the
// server being down at the scheduled time entirely. node-cron is kept as the
// first-attempt, near-exact-time trigger since it's cheap and usually fine;
// this is the safety net that makes correctness not depend on it working.
// ---------------------------------------------------------------------------
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const runningIds = new Set(); // subscription ids currently mid-run, from either trigger path
let selfHealingHandle = null;

function currentPanamaTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Panama', hour12: false, hour: '2-digit', minute: '2-digit'
  }).formatToParts(now);
  return {
    hour: Number(parts.find(p => p.type === 'hour').value),
    minute: Number(parts.find(p => p.type === 'minute').value)
  };
}

function isPastRunTime(runTime) {
  const [h, m] = runTime.split(':').map(Number);
  const { hour, minute } = currentPanamaTimeParts();
  return hour > h || (hour === h && minute >= m);
}

/** Shared execution path for both the cron trigger and the catch-up checker, guarded against double-running. */
async function runSubscriptionNow(subscription, meta) {
  if (runningIds.has(subscription.id)) {
    console.log(`[Scheduler] Skipping trigger for ${subscription.id} — a run is already in progress.`);
    return;
  }
  runningIds.add(subscription.id);
  const jobStartTime = Date.now();
  try {
    console.log(`[Scheduler] Starting job for subscription ${subscription.id} (source: ${meta.source})...`);
    if (enqueueRunHandler) {
      await enqueueRunHandler(subscription, meta);
    } else if (subscription.tipo === 'inmueble') {
      await runPropertyIntelDaily(subscription);
    } else {
      await runFincaDaily(subscription);
    }
    const elapsed = Date.now() - jobStartTime;
    console.log(`[Scheduler] ✅ Completed job for subscription ${subscription.id} in ${elapsed}ms (source: ${meta.source})`);
  } catch (error) {
    const elapsed = Date.now() - jobStartTime;
    console.error(`[Scheduler] ❌ Job failed for subscription ${subscription.id} after ${elapsed}ms (source: ${meta.source}):`, error);
  } finally {
    runningIds.delete(subscription.id);
  }
}

async function checkAndRunDueJobs() {
  const today = snapshots.todayDateString();
  for (const meta of jobMetadata.values()) {
    if (meta.isTest) continue;
    const subscription = meta.subscription;
    if (runningIds.has(subscription.id)) continue;
    const latest = snapshots.getLatestSnapshot(subscription.id);
    if (latest && latest.dateStr === today) continue; // already ran today
    if (!isPastRunTime(meta.runTime)) continue; // not due yet
    console.log(`[Scheduler] Catch-up: subscription ${subscription.id} hasn't run today and its time (${meta.runTime}) has passed — running now.`);
    // Fire and forget — runSubscriptionNow handles its own errors/logging.
    runSubscriptionNow(subscription, { source: 'catchup', runTime: meta.runTime });
  }
}

/** Starts the periodic self-healing check. Safe to call multiple times — only sets up once. */
export function startSelfHealingChecker() {
  if (selfHealingHandle) return;
  selfHealingHandle = setInterval(() => {
    checkAndRunDueJobs().catch(err => console.error('[Scheduler] Catch-up check failed:', err));
  }, CHECK_INTERVAL_MS);
  // Also check shortly after startup, in case the server started after today's runTime already passed
  // (e.g. a restart at 20:00 for a subscription scheduled at 19:00).
  setTimeout(() => {
    checkAndRunDueJobs().catch(err => console.error('[Scheduler] Initial catch-up check failed:', err));
  }, 30 * 1000);
  console.log(`[Scheduler] Self-healing catch-up checker started (every ${CHECK_INTERVAL_MS / 60000} min).`);
}

async function loginAndGetPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await auth.restoreSessionCookies(page);
  let loggedIn = await auth.isLoggedIn(page);
  if (!loggedIn) {
    loggedIn = await auth.performLogin(page, { username: process.env.RP_USERNAME, password: process.env.RP_PASSWORD });
    if (!loggedIn) throw new Error('Registro Público login failed');
    await auth.saveSessionCookies(page);
  }
  return page;
}

function displayNameFor(subscription) {
  if (subscription.tipo === 'inmueble') {
    return `Folio ${subscription.folio}${subscription.codigo ? ` / Código ${subscription.codigo}` : ''}`;
  }
  return subscription.name || subscription.nameOrFolio || `RUC ${subscription.ruc}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const MONITORING_MAX_ATTEMPTS = 2; // one retry — covers a brief connectivity drop (known issue, see CLAUDE.md)
const MONITORING_RETRY_DELAY_MS = 15 * 1000;

/**
 * Runs one attempt of a monitoring check: fresh browser, login, extract -> compare ->
 * render PDF -> save snapshot -> email the subscriber. Throws on any failure — the
 * caller (runMonitoringCheck) is what handles retries/alerting.
 */
async function runMonitoringCheckOnce(subscription, extractFn, displayName, dateStr) {
  const puppeteerLib = await getPuppeteerLib();
  const browser = await puppeteerLib.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await loginAndGetPage(browser);
    const record = await extractFn(page);
    record.generatedAt = new Date().toISOString();

    const previous = snapshots.getLatestSnapshot(subscription.id);
    const comparison = compareRecords(previous?.record || null, record);
    const changeLines = comparison.hasChanges ? describeChangesPlainLanguage(comparison, subscription.language) : [];
    const highlightRows = highlightedPrelacionRowIndexes(comparison, record);

    const pdfPath = snapshots.snapshotPdfPath(subscription.id, dateStr);
    await renderRecordToPdf(browser, record, pdfPath, {
      highlightPrelacionRows: highlightRows,
      highlightNote: comparison.hasChanges ? changeLines.join(' ') : undefined,
      lang: subscription.language === 'en' ? 'en' : 'es'
    });

    snapshots.saveSnapshot(subscription.id, dateStr, record);

    await sendMonitoringUpdateEmail({
      recipientEmail: subscription.email,
      displayName,
      hasChanges: comparison.hasChanges,
      isFirstRun: comparison.isFirstRun,
      changeLines,
      pdfPath,
      language: subscription.language
    });

    console.log(`[Daily Job] Monitoring check completed for ${displayName} (hasChanges=${comparison.hasChanges}, isFirstRun=${comparison.isFirstRun})`);
    return { success: true, hasChanges: comparison.hasChanges, isFirstRun: comparison.isFirstRun, pdfPath };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Runs a daily monitoring check for a subscription, retrying once on failure (covers
 * a brief internet/RP connectivity drop — see CLAUDE.md's known-issues note on this)
 * before giving up. On final failure, sends both the subscriber-facing "we couldn't
 * check today" email and a separate, detailed internal alert (lib/adminAlerts.js) with
 * the subscriber identified and full error detail, so problems can be tracked down fast.
 */
async function runMonitoringCheck(subscription, extractFn) {
  const jobId = `monitor-${subscription.id}-${Date.now()}`;
  console.log(`[Daily Job ${jobId}] Starting monitoring check for subscription ${subscription.id}`);

  const displayName = displayNameFor(subscription);
  const dateStr = snapshots.todayDateString();
  let lastError;

  for (let attempt = 1; attempt <= MONITORING_MAX_ATTEMPTS; attempt++) {
    try {
      return await runMonitoringCheckOnce(subscription, extractFn, displayName, dateStr);
    } catch (error) {
      lastError = error;
      console.error(`[Daily Job] Attempt ${attempt}/${MONITORING_MAX_ATTEMPTS} failed for subscription ${subscription.id}:`, error);
      if (attempt < MONITORING_MAX_ATTEMPTS) {
        console.log(`[Daily Job] Retrying subscription ${subscription.id} in ${MONITORING_RETRY_DELAY_MS / 1000}s...`);
        await sleep(MONITORING_RETRY_DELAY_MS);
      }
    }
  }

  // All attempts exhausted — notify the subscriber (vague/reassuring) and the team (detailed).
  try {
    await sendMonitoringUpdateEmail({
      recipientEmail: subscription.email,
      displayName,
      hasChanges: false,
      error: lastError.message || String(lastError),
      language: subscription.language
    });
  } catch (emailErr) {
    console.error(`[Daily Job] Failed to send subscriber error email:`, emailErr?.message);
  }
  try {
    await sendAdminAlertEmail({
      subject: `Daily monitoring failed — ${displayName}`,
      context: 'lib/dailyScheduler.js runMonitoringCheck',
      subscription,
      error: lastError,
      extra: { attempts: MONITORING_MAX_ATTEMPTS }
    });
  } catch (alertErr) {
    console.error(`[Daily Job] Failed to send internal admin alert:`, alertErr?.message);
  }
  throw lastError;
}

/**
 * Run the daily monitoring check for a property (Finca) subscription.
 */
export async function runPropertyIntelDaily(subscription) {
  return runMonitoringCheck(subscription, (page) =>
    extractPropertyFullRecord(page, { folio: subscription.folio, codigo: subscription.codigo })
  );
}

/**
 * Run the daily monitoring check for a Mercantil or Fundación (entity) subscription.
 */
export async function runFincaDaily(subscription) {
  return runMonitoringCheck(subscription, (page) =>
    extractEntityFullRecord(page, { entityType: subscription.tipo, ruc: subscription.ruc })
  );
}

/**
 * Schedule a daily job for a subscription
 * This is non-blocking - it only registers a cron task that will run asynchronously
 * @param {Object} subscription - The subscription request
 * @param {string} runTime - Time in format "HH:MM" (24-hour format), defaults to "19:00" (evening —
 *   Registro Público is typically updated through the business day, so an evening check catches
 *   the day's changes; it also matches the user's preference for evening PDF generation)
 */
export function scheduleDailyJob(subscription, runTime = '19:00') {
  // Stop existing job if any
  stopDailyJob(subscription.id);

  const [hour, minute] = runTime.split(':').map(Number);
  const cronExpression = `${minute} ${hour} * * *`; // Run daily at specified time

  console.log(`[Scheduler] Scheduling daily job for subscription ${subscription.id} at ${runTime} (non-blocking)`);

  const task = cron.schedule(cronExpression, () => {
    // Run job asynchronously without blocking the event loop or API requests.
    // This is the first-attempt, near-exact-time trigger — see the self-healing
    // catch-up checker above for what covers it if this never fires.
    setImmediate(() => {
      runSubscriptionNow(subscription, { source: 'cron', runTime });
    });
  }, {
    scheduled: true,
    timezone: 'America/Panama' // Panama timezone
  });

  activeJobs.set(subscription.id, task);
  jobMetadata.set(subscription.id, {
    subscription,
    runTime,
    isTest: false,
    scheduledAt: new Date().toISOString()
  });
  return task;
}

/**
 * Schedule a one-time test job that runs after a specified delay (in seconds)
 * @param {Object} subscription - The subscription request
 * @param {number} delaySeconds - Number of seconds to wait before running (default: 20)
 * @returns {Object} - Object with jobId and scheduledAt timestamp
 */
export function scheduleTestJob(subscription, delaySeconds = 20) {
  const testJobId = `test-${subscription.id}-${Date.now()}`;

  console.log(`[Scheduler] Scheduling test job ${testJobId} for subscription ${subscription.id} in ${delaySeconds} seconds`);

  // Use setTimeout for one-time execution
  const timeoutId = setTimeout(async () => {
    const jobStartTime = Date.now();
    try {
      console.log(`[Scheduler] Starting test job ${testJobId} for subscription ${subscription.id}...`);
      if (enqueueRunHandler) {
        await enqueueRunHandler(subscription, { source: 'test', delaySeconds, testJobId });
      } else {
        if (subscription.tipo === 'inmueble') {
          await runPropertyIntelDaily(subscription);
        } else {
          await runFincaDaily(subscription);
        }
      }
      const elapsed = Date.now() - jobStartTime;
      console.log(`[Scheduler] ✅ Completed test job ${testJobId} in ${elapsed}ms`);
    } catch (error) {
      const elapsed = Date.now() - jobStartTime;
      console.error(`[Scheduler] ❌ Test job ${testJobId} failed after ${elapsed}ms:`, error);
    } finally {
      // Clean up after test job completes
      activeJobs.delete(testJobId);
      jobMetadata.delete(testJobId);
    }
  }, delaySeconds * 1000);

  // Store the timeout ID so we can cancel it if needed
  activeJobs.set(testJobId, { stop: () => clearTimeout(timeoutId), isTimeout: true });
  jobMetadata.set(testJobId, {
    subscription,
    runTime: `in ${delaySeconds} seconds`,
    isTest: true,
    scheduledAt: new Date().toISOString(),
    willRunAt: new Date(Date.now() + delaySeconds * 1000).toISOString()
  });

  return { jobId: testJobId, scheduledAt: jobMetadata.get(testJobId).scheduledAt, willRunAt: jobMetadata.get(testJobId).willRunAt };
}

/**
 * Stop a daily job
 */
export function stopDailyJob(requestId) {
  const task = activeJobs.get(requestId);
  if (task) {
    if (task.isTimeout) {
      task.stop(); // clearTimeout
    } else {
      task.stop(); // cron task stop
    }
    activeJobs.delete(requestId);
    jobMetadata.delete(requestId);
    console.log(`[Scheduler] Stopped job for subscription ${requestId}`);
  }
}

/**
 * Get list of all scheduled jobs with metadata
 * @returns {Array} - Array of job metadata objects
 */
export function listScheduledJobs() {
  const jobs = [];
  for (const [jobId, metadata] of jobMetadata.entries()) {
    jobs.push({
      jobId,
      subscriptionId: metadata.subscription.id,
      tipo: metadata.subscription.tipo,
      nameOrFolio: metadata.subscription.nameOrFolio,
      folio: metadata.subscription.folio,
      codigo: metadata.subscription.codigo,
      email: metadata.subscription.email,
      runTime: metadata.runTime,
      isTest: metadata.isTest,
      scheduledAt: metadata.scheduledAt,
      willRunAt: metadata.willRunAt || null
    });
  }
  return jobs.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
}

/**
 * Load and schedule all confirmed subscriptions
 */
export function loadAndScheduleAll(subscriptions, runTime = '19:00') {
  console.log(`[Scheduler] Loading ${subscriptions.length} confirmed subscriptions...`);

  for (const subscription of subscriptions) {
    if (subscription.confirmed === true && subscription.status === 'confirmed') {
      scheduleDailyJob(subscription, runTime);
    }
  }

  console.log(`[Scheduler] Scheduled ${activeJobs.size} daily jobs`);
  startSelfHealingChecker();
}

export default {
  setEnqueueRunHandler,
  scheduleDailyJob,
  scheduleTestJob,
  stopDailyJob,
  listScheduledJobs,
  loadAndScheduleAll,
  runPropertyIntelDaily,
  runFincaDaily,
  startSelfHealingChecker
};
