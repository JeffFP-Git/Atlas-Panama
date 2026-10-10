/**
 * Daily activity report for Jeff: emailed at 00:01 Panama time covering the previous
 * day — website visits, signups and what happened to them, new subscriptions (trial or
 * paid), cancellations, running totals and estimated monthly revenue, whether every
 * daily Registro Público check ran, and Q&A searches. Internal only (English).
 *
 * Recipient: DAILY_REPORT_EMAIL (Railway variable) or operations@atlaspanama.com.
 * Preview any day without sending: GET /admin/daily-report?date=YYYY-MM-DD (admin key).
 */
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import * as storage from './introPipelineStorage.js';
import * as snapshots from './snapshotStore.js';
import * as analytics from './analytics.js';
import { PRICING } from './stripe.js';
import { DATA_DIR } from './dataPaths.js';
import { sendEmail } from './email.js';
import * as leads from './leads.js';
import { campaignResultsHtml } from './campaigns.js';

const REPORT_TIME = '00:01'; // America/Panama
const DEFAULT_RECIPIENT = 'operations@atlaspanama.com';

const panamaDate = ts => (ts ? analytics.panamaDateString(new Date(ts)) : null);
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function previousPanamaDate() {
  return analytics.panamaDateString(new Date(Date.now() - 12 * 60 * 60 * 1000)); // run just after midnight → yesterday
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function label(r) {
  if (r.tipo === 'inmueble') return `Folio ${r.folio || '?'}${r.codigo ? ` / Código ${r.codigo}` : ''}`;
  return r.name || r.nameOrFolio || (r.ruc ? `RUC ${r.ruc}` : '—');
}

const TIPO = { inmueble: 'property', mercantil: 'company', fundacion: 'foundation' };
const STATUS_TEXT = {
  confirmed: 'subscribed',
  completed: 'found 1 match — waiting for them to confirm email / choose plan',
  needs_disambiguation: 'found several — waiting for them to pick one',
  needs_refinement: 'too many matches — asked to refine',
  no_match: 'no match found',
  error: 'error during search',
  processing: 'still searching',
  pending: 'waiting to search',
  cancelled: 'cancelled',
  rejected: 'rejected'
};

function qaSearchesOn(dateStr) {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'qa-search-log.json'), 'utf8'));
    return entries.filter(e => panamaDate(e.timestamp) === dateStr);
  } catch {
    return [];
  }
}

function countBy(items, keyFn) {
  const out = {};
  for (const i of items) { const k = keyFn(i); out[k] = (out[k] || 0) + 1; }
  return out;
}

function table(rows) {
  if (!rows.length) return '<p style="color:#888;">None.</p>';
  return `<table style="border-collapse:collapse;font-size:14px;">${rows.map(([a, b]) =>
    `<tr><td style="padding:3px 16px 3px 0;color:#555;">${esc(a)}</td><td style="padding:3px 0;"><strong>${esc(b)}</strong></td></tr>`).join('')}</table>`;
}

const sortedEntries = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);

/** Builds the report for one Panama calendar date. */
export function buildDailyReport(dateStr = previousPanamaDate()) {
  const all = storage.listSubscriptionRequests();
  const web = analytics.daySummary(dateStr);

  const started = all.filter(r => panamaDate(r.createdAt) === dateStr);
  // Activated that day (confirmedAt; older records without it fall back to updatedAt)
  // Paid signups and no-card free trials both count
  const newSubs = all.filter(r => (r.stripeSubscriptionId || r.trialStatus === 'trialing_nocard' || r.trialStartedAt) && (r.confirmedAt || r.confirmed === true)
    && panamaDate(r.confirmedAt || r.updatedAt) === dateStr);
  const cancelled = all.filter(r => panamaDate(r.cancelledAt) === dateStr);

  const active = all.filter(r => r.confirmed === true && r.status === 'confirmed');
  const trialing = active.filter(r => (r.trialStatus === 'trialing' || r.trialStatus === 'trialing_nocard') && r.trialEndsAt && r.trialEndsAt >= dateStr);
  const paying = active.filter(r => !trialing.includes(r));
  const monthly = paying.filter(r => r.plan !== 'annual').length;
  const annual = paying.filter(r => r.plan === 'annual').length;
  const estMonthly = monthly * (PRICING.monthly.amountCents / 100) + annual * (PRICING.annual.amountCents / 100) / 12;
  const trialsEndingSoon = trialing.filter(r => r.trialEndsAt <= addDays(dateStr, 3));
  const subscriberEmails = new Set(active.map(r => String(r.email).toLowerCase()));

  // Daily checks run at 19:00; a check "ran" if the subscription has a snapshot for that date.
  // Every subscription active by the end of that day should have a check that day (one
  // activated after 19:00 gets a same-day catch-up check).
  const checkable = active.filter(r => (panamaDate(r.confirmedAt || r.createdAt) || '') <= dateStr);
  const missedChecks = checkable.filter(r => {
    const latest = snapshots.getLatestSnapshot(r.id);
    return !latest || latest.dateStr < dateStr;
  });

  const qa = qaSearchesOn(dateStr);

  const subject = `Atlas Panama daily report — ${dateStr}: ${web.uniqueVisitors} visitor${web.uniqueVisitors === 1 ? '' : 's'}, ${newSubs.length} new subscription${newSubs.length === 1 ? '' : 's'}`;

  const html = [
    `<h2 style="margin-bottom:4px;">Atlas Panama — ${esc(dateStr)}</h2>`,
    `<p style="color:#666;margin-top:0;">Activity for the whole day (Panama time).</p>`,

    `<h3>🌐 Website</h3>`,
    table([
      ['Unique visitors', web.uniqueVisitors],
      ['  · new / returning', `${web.visitorKinds.new || 0} / ${web.visitorKinds.returning || 0}`],
      ['  · phone / computer / tablet', `${web.devices.phone || 0} / ${web.devices.computer || 0} / ${web.devices.tablet || 0}`],
      ['Page views', web.pageViews]
    ]),
    `<p style="margin:10px 0 4px;color:#555;">Pages viewed:</p>`, table(sortedEntries(web.pages)),
    `<p style="margin:10px 0 4px;color:#555;">Where visitors came from:</p>`, table(sortedEntries(web.sources)),

    `<h3>📋 Signup form funnel</h3>`,
    (() => {
      const ev = web.events || {};
      const count = re => Object.entries(ev).filter(([k]) => re.test(k)).reduce((n, [, v]) => n + v, 0);
      const rows = [
        ['Signup page views', web.pages['Subscribe'] || 0],
        ['Opened "send me the link"', ev.later_open || 0],
        ['"Send me the link" requests (signed up since)', (() => { const l = leads.statsFor(dateStr, panamaDate); return `${l.requested} (${l.signedUpSince})`; })()],
        ['Pressed the search button', ev.submit_click || 0],
        ['Error messages shown', count(/^error: /)],
        ['Submissions accepted by server', count(/^server_2/)],
        ['Submissions rejected by server', count(/^server_[45]/)],
        ['Script errors in browser', count(/^js_error: /)]
      ];
      const details = Object.entries(ev).filter(([k]) => /^(error|js_error): |^server_[45]/.test(k)).sort((a, b) => b[1] - a[1]);
      return table(rows) + (details.length ? `<p style="margin:10px 0 4px;color:#555;">Details:</p>` + table(details) : '');
    })(),

    `<h3>📝 Signups</h3>`,
    table([
      ['Signup searches started', started.length],
      ...sortedEntries(countBy(started, r => TIPO[r.tipo] || r.tipo)).map(([k, v]) => [`  · ${k}`, v]),
      ...sortedEntries(countBy(started, r => (r.language === 'en' ? 'English' : 'Spanish'))).map(([k, v]) => [`  · in ${k}`, v])
    ]),
    started.length ? `<p style="margin:10px 0 4px;color:#555;">Where each one stands now:</p>` + table(started.map(r => [`${label(r)} (${TIPO[r.tipo] || r.tipo}, ${r.language === 'en' ? 'EN' : 'ES'}, ${r.email})`, STATUS_TEXT[r.status] || r.status])) : '',

    `<h3>✅ New subscriptions: ${newSubs.length}</h3>`,
    table(newSubs.map(r => [`${label(r)} — ${r.email} (${r.language === 'en' ? 'EN' : 'ES'})`, (r.trialStatus === 'trialing_nocard' ? 'free trial (no card)' : `${r.plan === 'annual' ? 'annual' : 'monthly'}${r.trialStatus === 'trialing' ? ', free trial' : r.trialStatus === 'ended_card_reused' ? ', paid (card already had a trial)' : r.trialStatus === 'converted' ? ', paid after free trial' : ', paid'}`)])),
    `<h3>❌ Cancellations: ${cancelled.length}</h3>`,
    table(cancelled.map(r => [`${label(r)} — ${r.email}`, 'ended'])),

    `<h3>📣 Campaign results (all time, top 10 tracking tags)</h3>`,
    campaignResultsHtml({ limit: 10 }),

    `<h3>📊 Totals now</h3>`,
    table([
      ['Active subscriptions', active.length],
      ['  · on free trial', trialing.length],
      ['  · paying (monthly / annual)', `${paying.length} (${monthly} / ${annual})`],
      ['Subscribers (unique emails)', subscriberEmails.size],
      ['Estimated monthly revenue (paying only)', `$${estMonthly.toFixed(2)}`],
      ['Free trials ending in the next 3 days', trialsEndingSoon.length],
      ['Free trials ended without paying (all time)', all.filter(r => r.trialStatus === 'expired').length],
      ['Free trials that became paying (all time)', all.filter(r => r.trialStatus === 'converted' || r.trialStatus === 'converted_after_expiry').length]
    ]),

    `<h3>🔍 Daily Registro Público checks</h3>`,
    (dateStr === analytics.panamaDateString() && Number(new Date().toLocaleString('en-US', { timeZone: 'America/Panama', hour: 'numeric', hourCycle: 'h23' })) < 20)
      ? `<p>Today's checks run at 7:00 PM Panama time. Not run yet.</p>`
      : missedChecks.length === 0
      ? `<p>All ${checkable.length} scheduled check${checkable.length === 1 ? '' : 's'} ran. ✓</p>`
      : `<p style="color:#a50e0e;"><strong>${missedChecks.length} of ${checkable.length} did not run:</strong></p>` + table(missedChecks.map(r => [label(r), r.email])),

    `<h3>❓ Q&amp;A searches: ${qa.length}</h3>`,
    table(sortedEntries(countBy(qa, e => e.query.toLowerCase().trim())).slice(0, 10)),

    `<p style="color:#999;font-size:12px;margin-top:24px;">Visits are counted without cookies; link previews and bots are excluded. Tag links with ?src=… (e.g. atlaspanama.com/?src=wa-es) to see which post brought visitors.</p>`
  ].join('\n');

  return { subject, html, dateStr };
}

export async function sendDailyReport(dateStr = previousPanamaDate()) {
  const { subject, html } = buildDailyReport(dateStr);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
  const sent = await sendEmail({ to: process.env.DAILY_REPORT_EMAIL || DEFAULT_RECIPIENT, subject, html, text });
  analytics.compactDay(dateStr); // drop that day's visitor codes now that it's reported
  return sent;
}

let reportHandle = null;
export function startDailyReport() {
  if (reportHandle) return;
  const [hour, minute] = REPORT_TIME.split(':').map(Number);
  reportHandle = cron.schedule(`${minute} ${hour} * * *`, () => {
    sendDailyReport().catch(err => console.error('[Daily report] Failed:', err));
  }, { scheduled: true, timezone: 'America/Panama' });
  console.log(`[Daily report] Scheduled for ${REPORT_TIME} America/Panama → ${process.env.DAILY_REPORT_EMAIL || DEFAULT_RECIPIENT}.`);
}

export default { buildDailyReport, sendDailyReport, startDailyReport };
