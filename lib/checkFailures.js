/**
 * Remembers daily checks that failed, so a failure produces ONE notice instead of
 * one per retry (Nov 2026: a failing check was retried every 15 minutes and each
 * retry emailed the subscriber and the admin, ~20 emails per property per day).
 *
 * One "episode" per subscription = from its first failure until its next success.
 * - The subscriber is told once per episode (no technical detail) and is owed the
 *   report, which the digest dispatcher sends as soon as a check succeeds.
 * - The admin gets one combined email per day for all failing subscriptions.
 * - Retries wait RETRY_BACKOFF_MS after a failed run, and continue past midnight
 *   until the check succeeds ("we will run it as soon as possible").
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './dataPaths.js';

const FILE = path.join(DATA_DIR, 'check-failures.json');
export const RETRY_BACKOFF_MS = 60 * 60 * 1000; // 1 hour between failed runs

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { failures: s.failures || {}, owed: s.owed || {}, lastDigestDispatchDate: s.lastDigestDispatchDate || null };
  } catch {
    return { failures: {}, owed: {}, lastDigestDispatchDate: null };
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

/** Records a failed run (after all of its attempts). */
export function recordFailure(subscription, error, dateStr) {
  const state = load();
  const now = new Date().toISOString();
  const prev = state.failures[subscription.id];
  state.failures[subscription.id] = {
    subscriptionId: subscription.id,
    email: subscription.email,
    language: subscription.language === 'en' ? 'en' : 'es',
    firstFailedAt: prev?.firstFailedAt || now,
    firstFailedDate: prev?.firstFailedDate || dateStr,
    lastFailedAt: now,
    lastError: String(error?.message || error || 'unknown error').slice(0, 1000),
    failedRuns: (prev?.failedRuns || 0) + 1,
    subscriberNotified: prev?.subscriberNotified || false,
    adminReportedDate: prev?.adminReportedDate || null
  };
  save(state);
}

/**
 * Records a successful run. Returns true if the subscriber was told about a failure
 * in this episode (so they're owed the report now).
 */
export function recordSuccess(subscriptionId) {
  const state = load();
  const f = state.failures[subscriptionId];
  if (!f) return false;
  delete state.failures[subscriptionId];
  if (f.subscriberNotified) state.owed[subscriptionId] = new Date().toISOString();
  save(state);
  return !!f.subscriberNotified;
}

export function getFailure(subscriptionId) {
  return load().failures[subscriptionId] || null;
}

export function listFailures() {
  return Object.values(load().failures);
}

/** True if the last failed run was recent enough that we should wait before retrying. */
export function inBackoff(subscriptionId, now = Date.now()) {
  const f = load().failures[subscriptionId];
  return !!f && now - new Date(f.lastFailedAt).getTime() < RETRY_BACKOFF_MS;
}

export function markSubscriberNotified(ids) {
  const state = load();
  for (const id of ids) if (state.failures[id]) state.failures[id].subscriberNotified = true;
  save(state);
}

export function markAdminReported(ids, dateStr) {
  const state = load();
  for (const id of ids) if (state.failures[id]) state.failures[id].adminReportedDate = dateStr;
  save(state);
}

export function isOwed(subscriptionId) {
  return !!load().owed[subscriptionId];
}

export function clearOwed(ids) {
  const state = load();
  for (const id of ids) delete state.owed[id];
  save(state);
}

export function getLastDigestDispatchDate() {
  return load().lastDigestDispatchDate;
}

export function setLastDigestDispatchDate(dateStr) {
  const state = load();
  state.lastDigestDispatchDate = dateStr;
  save(state);
}

/** Drops all state for a subscription (used when it is cancelled/deleted). */
export function forget(subscriptionId) {
  const state = load();
  delete state.failures[subscriptionId];
  delete state.owed[subscriptionId];
  save(state);
}

export default {
  recordFailure, recordSuccess, getFailure, listFailures, inBackoff, markSubscriberNotified,
  markAdminReported, isOwed, clearOwed, getLastDigestDispatchDate, setLastDigestDispatchDate, forget
};
