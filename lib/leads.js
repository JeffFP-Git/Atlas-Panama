/**
 * "Send me the link to finish later": visitors who don't have their property/company
 * details at hand leave just their email on the signup page. We email them the signup
 * link right away and, if they haven't started a signup by the next day, one friendly
 * reminder. Nothing else is sent. Records are deleted after RETENTION_DAYS (same 2-month
 * rule as everything else; see lib/retention.js) and are disclosed in the Privacy Notice.
 *
 * Stored in $DATA_DIR/leads.json: [{ email, language, createdAt, reminderSentAt }]
 */
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { DATA_DIR } from './dataPaths.js';
import * as storage from './introPipelineStorage.js';
import { sendEmail } from './email.js';

const FILE = path.join(DATA_DIR, 'leads.json');
export const RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_TIME = '10:00'; // America/Panama

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}
const norm = e => String(e || '').trim().toLowerCase();

function signupUrl(tag) {
  const base = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'https://atlaspanama.com';
  return `${base}/subscribe?src=${tag}`;
}

/** True if this email has started any signup (so it no longer needs reminding). */
function hasSignedUp(email) {
  return storage.listSubscriptionRequests().some(r => norm(r.email) === norm(email));
}

/**
 * Saves the email and sends the link now. Returns 'sent', 'duplicate' (already sent
 * in the last 24h) or 'error'.
 */
export async function requestLink(email, language) {
  const lang = language === 'en' ? 'en' : 'es';
  const list = load();
  const existing = list.find(l => norm(l.email) === norm(email));
  if (existing && Date.now() - new Date(existing.createdAt).getTime() < DAY_MS) return 'duplicate';
  const entry = { email: norm(email), language: lang, createdAt: new Date().toISOString(), reminderSentAt: null };
  save([...list.filter(l => norm(l.email) !== norm(email)), entry]);
  const { t } = await import('./emailTranslations.js');
  const vars = { url: signupUrl('link-email') };
  const ok = await sendEmail({ to: entry.email, subject: t(lang, 'lead.subject', vars), text: t(lang, 'lead.text', vars), html: t(lang, 'lead.html', vars) });
  if (!ok) {
    // Not sent: don't keep it (a retry must try again, and we never remind someone who got nothing).
    save(load().filter(l => norm(l.email) !== norm(email)));
    return 'error';
  }
  return 'sent';
}

/** Once a day: one reminder, the day after, to anyone who hasn't started a signup. */
export async function runLeadReminders() {
  const { t } = await import('./emailTranslations.js');
  const list = load();
  let changed = false;
  for (const l of list) {
    if (l.reminderSentAt) continue;
    if (Date.now() - new Date(l.createdAt).getTime() < 20 * 60 * 60 * 1000) continue; // give them until "tomorrow"
    if (hasSignedUp(l.email)) { l.reminderSentAt = 'not-needed'; changed = true; continue; }
    const vars = { url: signupUrl('reminder-email') };
    await sendEmail({ to: l.email, subject: t(l.language, 'lead.reminderSubject', vars), text: t(l.language, 'lead.reminderText', vars), html: t(l.language, 'lead.reminderHtml', vars) }).catch(() => {});
    l.reminderSentAt = new Date().toISOString();
    changed = true;
  }
  if (changed) save(list);
}

/** Deletes entries older than RETENTION_DAYS. Returns how many were removed. */
export function purgeOld(now = new Date()) {
  const list = load();
  const keep = list.filter(l => now - new Date(l.createdAt) < RETENTION_DAYS * DAY_MS);
  if (keep.length !== list.length) save(keep);
  return list.length - keep.length;
}

/** For the daily report: links requested on a Panama date, and how many later signed up. */
export function statsFor(dateStr, panamaDate) {
  const day = load().filter(l => panamaDate(l.createdAt) === dateStr);
  return { requested: day.length, signedUpSince: day.filter(l => hasSignedUp(l.email)).length };
}

let handle = null;
export function startLeadReminders() {
  if (handle) return;
  const [h, m] = REMINDER_TIME.split(':').map(Number);
  handle = cron.schedule(`${m} ${h} * * *`, () => {
    runLeadReminders().catch(err => console.error('[Leads] Reminder pass failed:', err));
  }, { scheduled: true, timezone: 'America/Panama' });
  console.log(`[Leads] "Send me the link" reminders scheduled for ${REMINDER_TIME} America/Panama.`);
}

export default { requestLink, runLeadReminders, purgeOld, statsFor, startLeadReminders };
