/**
 * 30-day free trial rules (Jeff's decision, Oct 2026): card required at signup, no
 * charge for the first 30 days, and at most ONE free trial per email address and ONE
 * per card. A subscriber's first property/entity gets the trial; anything they add
 * later under the same email is billed from day one.
 *
 * - Email rule: checked BEFORE checkout, so an ineligible subscriber simply sees the
 *   normal (no-trial) price on Stripe's page.
 * - Card rule: the card is only known after checkout, so it's checked at activation.
 *   If that card (Stripe's card "fingerprint") already had a free trial, the trial is
 *   ended right away and billing starts that day — the Terms and the plan page say so.
 *
 * The registry keeps only non-reversible codes (SHA-256 of the lowercased email, and
 * Stripe's card fingerprint) plus a date. It is deliberately NOT deleted by the
 * 2-month retention purge (lib/retention.js) — otherwise a trial could be repeated
 * after the original record was purged. The Privacy Policy mentions this.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './dataPaths.js';

export const TRIAL_DAYS = 30;
const FILE = path.join(DATA_DIR, 'trial-registry.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { emails: data.emails || {}, cards: data.cards || {} };
  } catch {
    return { emails: {}, cards: {} };
  }
}

function save(registry) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(registry, null, 2));
}

function emailKey(email) {
  return crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}

/** True if this email address has never had a subscription (trial or paid). */
export function isEmailEligible(email) {
  if (!email) return false;
  return !load().emails[emailKey(email)];
}

/** Record that this email has had a subscription, so it never gets another trial. */
export function recordEmail(email) {
  if (!email) return;
  const registry = load();
  const key = emailKey(email);
  if (!registry.emails[key]) {
    registry.emails[key] = new Date().toISOString().slice(0, 10);
    save(registry);
  }
}

/** True if this card fingerprint already had a free trial. */
export function cardAlreadyUsed(fingerprint) {
  return !!(fingerprint && load().cards[fingerprint]);
}

export function recordCard(fingerprint) {
  if (!fingerprint) return;
  const registry = load();
  if (!registry.cards[fingerprint]) {
    registry.cards[fingerprint] = new Date().toISOString().slice(0, 10);
    save(registry);
  }
}

/**
 * One-time backfill: subscribers from before trials existed (paid from day one) count as
 * having had their subscription, so they don't get a trial on their next signup.
 */
export function seedFromExistingSubscriptions(records) {
  const registry = load();
  let added = 0;
  for (const r of records) {
    if (!r.email || !r.stripeSubscriptionId) continue;
    const key = emailKey(r.email);
    if (!registry.emails[key]) {
      registry.emails[key] = (r.createdAt || new Date().toISOString()).slice(0, 10);
      added++;
    }
  }
  if (added > 0) save(registry);
  return added;
}

export default { TRIAL_DAYS, isEmailEligible, recordEmail, cardAlreadyUsed, recordCard, seedFromExistingSubscriptions };
