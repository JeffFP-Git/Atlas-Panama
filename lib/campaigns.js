/**
 * Campaign results: for each tracking tag (?src=… on our links, e.g. fb-boquete-adB),
 * how many visitors it brought, how many signups started, and how many became free
 * trials or paying subscriptions — plus the same rolled up by Facebook group and by ad
 * version for tags shaped like fb-<group>-<ad> (see docs/marketing/).
 *
 * Visits come from lib/analytics.js (unique visitors per day, by source); signups from
 * the `source` saved on each subscription request (remembered by the site for 30 days).
 */
import * as analytics from './analytics.js';
import * as storage from './introPipelineStorage.js';

// Tag formats:
//   current: <group>-<message letter>, e.g. "canadians-s" (s = story message, q = question
//            message; new messages get new letters). Deliberately doesn't say "ad".
//   older:   fb-<group>-ad<X>, e.g. "fb-boquete-adb" (still understood)
const OLD_FB_TAG = /^fb-(.+)-(ad[a-z0-9]+)$/;
const TAG = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([a-z])$/;
// Our own non-campaign tags (emails we send, untagged posts)
const OWN_TAGS = new Set(['link-email', 'reminder-email', 'fb', 'wa', 'wa-es', 'wa-en']);

export function parseTag(src) {
  const s = src || '';
  let m = OLD_FB_TAG.exec(s);
  if (m) return { channel: 'facebook', group: m[1], ad: m[2].replace(/^ad/, '') };
  if (!OWN_TAGS.has(s) && (m = TAG.exec(s))) {
    return { channel: m[1].startsWith('wa') ? 'whatsapp' : 'facebook', group: m[1], ad: m[2] };
  }
  if (/^wa-[a-z0-9-]+$/.test(s)) return { channel: 'whatsapp', group: s, ad: null }; // e.g. wa-es-2 (a WhatsApp round)
  return { channel: 'other', group: null, ad: null };
}

/** @returns {{ bySource: object[], byGroup: object[], byAd: object[] }} rows sorted by visitors */
export function campaignResults({ sinceDate } = {}) {
  const rows = new Map();
  const row = src => {
    if (!rows.has(src)) rows.set(src, { src, visitors: 0, signups: 0, trials: 0, paid: 0, cancelled: 0 });
    return rows.get(src);
  };
  for (const day of analytics.allDaySummaries()) {
    if (sinceDate && day.date < sinceDate) continue;
    for (const [src, n] of Object.entries(day.sources || {})) {
      // Only our own tags (no referrer hosts like google.com or spam sites, no "direct")
      if (src === 'direct' || src.includes('.')) continue;
      row(src).visitors += n;
    }
  }
  for (const r of storage.listSubscriptionRequests()) {
    if (!r.source) continue;
    if (sinceDate && (r.createdAt || '').slice(0, 10) < sinceDate) continue;
    const x = row(r.source);
    x.signups++;
    if (r.trialStatus === 'trialing_nocard' && r.status === 'confirmed') x.trials++;
    else if (r.trialStatus === 'expired') x.cancelled++;
    else if (r.stripeSubscriptionId) {
      if (r.status === 'cancelled') x.cancelled++;
      else if (r.trialStatus === 'trialing') x.trials++;
      else x.paid++;
    }
  }
  const bySource = [...rows.values()].sort((a, b) => b.visitors - a.visitors || b.signups - a.signups);
  const rollup = key => {
    const m = new Map();
    for (const r of bySource) {
      const k = parseTag(r.src)[key];
      if (!k) continue;
      if (!m.has(k)) m.set(k, { [key]: k, visitors: 0, signups: 0, trials: 0, paid: 0, cancelled: 0 });
      const t = m.get(k);
      for (const f of ['visitors', 'signups', 'trials', 'paid', 'cancelled']) t[f] += r[f];
    }
    return [...m.values()].sort((a, b) => b.visitors - a.visitors);
  };
  return { bySource, byGroup: rollup('group'), byAd: rollup('ad') };
}

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function htmlTable(rows, firstCol, label) {
  if (!rows.length) return '<p style="color:#888;">No tagged visits yet.</p>';
  const head = `<tr><th style="text-align:left;padding:4px 10px 4px 0;">${label}</th><th>Visitors</th><th>Signups</th><th>Trials</th><th>Paid</th><th>Cancelled</th></tr>`;
  return `<table style="border-collapse:collapse;font-size:14px;">${head}${rows.map(r =>
    `<tr><td style="padding:3px 10px 3px 0;">${esc(r[firstCol])}</td>${['visitors', 'signups', 'trials', 'paid', 'cancelled'].map(f => `<td style="text-align:center;padding:3px 8px;">${r[f]}</td>`).join('')}</tr>`).join('')}</table>`;
}

/** HTML block for the daily report / admin page. */
export function campaignResultsHtml(opts = {}) {
  const { bySource, byGroup, byAd } = campaignResults(opts);
  const top = opts.limit ? bySource.slice(0, opts.limit) : bySource;
  return [
    htmlTable(top, 'src', 'Tracking tag'),
    byAd.length ? `<p style="margin:12px 0 4px;color:#555;">By message (s = story, q = question):</p>${htmlTable(byAd, 'ad', 'Message')}` : '',
    byGroup.length ? `<p style="margin:12px 0 4px;color:#555;">By group:</p>${htmlTable(byGroup, 'group', 'Group')}` : ''
  ].join('');
}

export default { campaignResults, campaignResultsHtml, parseTag };
