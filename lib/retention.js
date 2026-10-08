/**
 * Data retention — carries out Privacy Policy §5 (attorney's wording, Oct 2026):
 * once a subscription has ended and isn't renewed, the subscriber's information is
 * deleted from our files after two (2) months.
 *
 * Runs once a day. Deletes, for each expired record: the subscription request
 * (email, property/entity identifiers, language, phone) and its monitoring
 * snapshots/PDFs. Also clears the recipient's weekly-email state once they have no
 * records left. Records that never became a paid subscription (no match, never
 * picked, never paid) are personal data too and follow the same 2-month clock from
 * their last activity.
 *
 * Not touched: Stripe's own customer/invoice records (Stripe keeps those under its
 * own policy — they're also our billing/accounting record) and the anonymous Q&A
 * search log (no personal data).
 */
import fs from 'fs';
import cron from 'node-cron';
import * as storage from './introPipelineStorage.js';
import * as snapshots from './snapshotStore.js';
import * as digestState from './digestState.js';
import { sendAdminAlertEmail } from './adminAlerts.js';
import * as leads from './leads.js';

export const RETENTION_DAYS = 60; // "dos (2) meses"
const RETENTION_RUN_TIME = '03:15'; // America/Panama — far from the 19:00 checks and 23:30 emails

const DAY_MS = 24 * 60 * 60 * 1000;

/** When did this record stop being active? null = still active (never purge). */
function endedAt(record) {
  // A paid/confirmed subscription is only ever eligible once it is explicitly cancelled
  // (Stripe subscription ended, or cancelled via the old email link / admin).
  if ((record.confirmed === true || record.stripeSubscriptionId) && record.status !== 'cancelled') return null;
  const ts = record.cancelledAt || record.updatedAt || record.createdAt;
  return ts ? new Date(ts) : null;
}

/**
 * Deletes every record whose subscription ended (or that went inactive without ever
 * becoming a subscription) more than RETENTION_DAYS ago.
 * @param {{ now?: Date, dryRun?: boolean }} [opts]
 * @returns {{ deleted: Array<{id: string, email: string, status: string, endedAt: string}> }}
 */
export function purgeExpiredRecords({ now = new Date(), dryRun = false } = {}) {
  const all = storage.listSubscriptionRequests();
  const deleted = [];
  for (const record of all) {
    const ended = endedAt(record);
    if (!ended || now - ended < RETENTION_DAYS * DAY_MS) continue;
    deleted.push({ id: record.id, email: record.email, status: record.status, endedAt: ended.toISOString() });
    if (dryRun) continue;
    try {
      fs.rmSync(snapshots.subscriptionDir(record.id), { recursive: true, force: true });
    } catch (err) {
      console.error(`[Retention] Could not delete snapshots for ${record.id}:`, err.message);
    }
    storage.deleteSubscriptionRequest(record.id);
  }

  if (!dryRun) {
    // Forget the weekly-email state for addresses with no records left.
    const remainingEmails = new Set(storage.listSubscriptionRequests().map(r => String(r.email || '').toLowerCase()));
    for (const email of new Set(deleted.map(d => String(d.email || '').toLowerCase()))) {
      if (!remainingEmails.has(email)) digestState.forget(email);
    }
  }
  return { deleted };
}

let retentionHandle = null;

/** Starts the once-daily retention purge. Safe to call multiple times. */
export function startRetentionPurge() {
  if (retentionHandle) return;
  const [hour, minute] = RETENTION_RUN_TIME.split(':').map(Number);
  retentionHandle = cron.schedule(`${minute} ${hour} * * *`, async () => {
    try {
      const leadsRemoved = leads.purgeOld();
      if (leadsRemoved) console.log(`[Retention] Deleted ${leadsRemoved} "send me the link" email(s) older than 2 months.`);
      const { deleted } = purgeExpiredRecords();
      if (deleted.length === 0) return;
      console.log(`[Retention] Deleted ${deleted.length} expired record(s).`);
      // Internal audit trail of what was deleted and when (no subscriber is emailed).
      await sendAdminAlertEmail({
        subject: `Data retention: deleted ${deleted.length} expired record(s)`,
        context: 'lib/retention.js daily purge (Privacy Policy §5, 2 months after expiry)',
        error: 'Informational — no action needed.',
        extra: Object.fromEntries(deleted.map(d => [d.id, `${d.email} (${d.status}, ended ${d.endedAt.slice(0, 10)})`]))
      }).catch(() => {});
    } catch (err) {
      console.error('[Retention] Purge failed:', err);
    }
  }, { scheduled: true, timezone: 'America/Panama' });
  console.log(`[Retention] Daily purge scheduled for ${RETENTION_RUN_TIME} America/Panama (records deleted ${RETENTION_DAYS} days after a subscription ends).`);
}

export default { purgeExpiredRecords, startRetentionPurge, RETENTION_DAYS };
