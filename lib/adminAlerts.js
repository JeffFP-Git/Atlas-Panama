/**
 * Internal error alerting — separate from the subscriber-facing error emails.
 *
 * The subscriber-facing "we couldn't check today" email (see lib/email.js
 * sendMonitoringUpdateEmail) is deliberately vague/reassuring. This module sends a
 * SEPARATE, detailed alert to the Atlas Panama team (ADMIN_ALERT_EMAIL) whenever a
 * real operation fails — a timeout, a Registro Público connection problem, a login
 * failure, anything — with the subscriber identified and as much diagnostic detail
 * as possible, so problems can be tracked down and fixed quickly. Built per an
 * explicit request ahead of launch: "over the first few weeks and the first few
 * dozen subscriptions I am sure we will find more things like this... We want to
 * fix problems very quickly, especially at the beginning."
 */
import { sendEmail } from './email.js';

function adminAlertRecipient() {
  return process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER || '';
}

/**
 * @param {object} opts
 * @param {string} opts.subject - short description of what failed, e.g. "Daily monitoring failed"
 * @param {string} [opts.context] - which code path this came from, for faster debugging
 * @param {object} [opts.subscription] - the subscription request involved, if any
 * @param {Error|string} opts.error
 * @param {object} [opts.extra] - any other key/value details worth including (attempt counts, etc.)
 */
const PROJECT_FOLDER = '/home/admin2/atlaspanama-jon/Daily Property Subscription Search';

/**
 * Plain-English reading of an error, for Jeff (Nov 2026: "just enough so that if you ask
 * me for it you can know what happened"). The raw detail goes only into the paste-ready
 * prompt for Claude Code, shortened to its first line (no stack traces).
 */
export function plainReason(error) {
  const e = String(error?.message || error || '');
  if (/fork|Resource temporarily unavailable|Failed to launch the browser|ENOMEM|out of memory|Target closed|Protocol error/i.test(e)) {
    return 'Our server could not open the web browser it uses to read the Registro Público (it ran out of room to start more programs). This is a problem on our side, not at the Registro.';
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|net::ERR/i.test(e)) {
    return 'The Registro Público website was too slow or did not answer.';
  }
  if (/login|captcha|credential|auth/i.test(e)) {
    return 'We could not log in to the Registro Público.';
  }
  if (/no longer findable|not found|0 match|no match/i.test(e)) {
    return 'The property or entity could not be found at the Registro Público (its number or código may have changed).';
  }
  if (/postmark|email|smtp/i.test(e)) {
    return 'An email could not be sent.';
  }
  if (/stripe/i.test(e)) {
    return 'Stripe (payments) returned an error.';
  }
  return 'Something unexpected went wrong.';
}

/** First line of an error, trimmed, for the Claude Code prompt. */
export function shortError(error) {
  const first = String(error?.message || error || 'unknown error').split('\n').map(l => l.trim()).find(Boolean) || 'unknown error';
  return first.length > 200 ? `${first.slice(0, 200)}…` : first;
}

const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PROMPT_BOX = 'white-space:pre-wrap;font-size:13px;background:#f3f3f3;border:1px solid #ccc;padding:12px;';

/**
 * @param {object} opts
 * @param {string} opts.subject - short description of what failed, e.g. "Daily monitoring failed"
 * @param {string} [opts.context] - which code path this came from, for faster debugging
 * @param {object} [opts.subscription] - the subscription request involved, if any
 * @param {Error|string} opts.error
 * @param {object} [opts.extra] - any other key/value details worth including (attempt counts, etc.)
 */
export async function sendAdminAlertEmail({ subject, context, subscription, error, extra }) {
  const to = adminAlertRecipient();
  if (!to) {
    console.log('ℹ️  No ADMIN_ALERT_EMAIL/SMTP_USER configured; skipping internal alert email.');
    return false;
  }

  const who = subscription
    ? [subscription.name || subscription.nameOrFolio || (subscription.folio ? `Folio ${subscription.folio}${subscription.codigo ? ` / Código ${subscription.codigo}` : ''}` : null), subscription.email].filter(Boolean).join(', ')
    : null;

  const plain = [
    `What happened: ${plainReason(error)}`,
    ...(who ? [`Who it affects: ${who}`] : [])
  ];

  const details = [];
  if (context) details.push(`where: ${context}`);
  if (subscription?.id) details.push(`subscription id: ${subscription.id}`);
  if (subscription?.tipo) details.push(`tipo: ${subscription.tipo}`);
  if (subscription?.ruc) details.push(`ruc: ${subscription.ruc}`);
  if (extra && typeof extra === 'object') for (const [k, v] of Object.entries(extra)) details.push(`${k}: ${String(v).slice(0, 300)}`);

  // Informational notices (a data-retention audit, a subscription that ended) need no fix:
  // show them as plain lines, without the paste-ready prompt.
  if (/informational|no action needed/i.test(String(error?.message || error || ''))) {
    const lines = [String(error?.message || error), ...(who ? [`Who: ${who}`] : []), ...(extra ? Object.entries(extra).map(([k, v]) => `${k}: ${v}`) : [])];
    return sendEmail({
      to, subject: `ℹ️ Atlas Panama: ${subject}`, text: lines.join('\n'),
      html: lines.map(l => `<p>${esc(l)}</p>`).join('')
    });
  }

  const prompt = [
    `Atlas Panama alert "${subject}" at ${new Date().toISOString()}.`,
    `Error: ${shortError(error)}`,
    ...details,
    'Please find the cause on the live site, explain it to me in plain language and fix it.'
  ].join('\n');

  const howTo = `If you want this fixed, copy and paste the following into the terminal prompt for Atlas Panama at ${PROJECT_FOLDER}:`;
  const text = [...plain, '', howTo, '', prompt].join('\n');
  const html = plain.map(l => `<p>${esc(l)}</p>`).join('')
    + `<p><strong>${esc(howTo)}</strong></p><pre style="${PROMPT_BOX}">${esc(prompt)}</pre>`;

  return sendEmail({ to, subject: `⚠️ Atlas Panama alert: ${subject}`, text, html });
}


/**
 * ONE combined alert for every daily check that failed (instead of one per property).
 * Several failing → all-caps subject, Jeff's wording (Nov 2026). The body explains the
 * problem in plain language and ends with a ready-made prompt to paste into Claude Code.
 * @param {Array<{displayName:string, email:string, subscriptionId:string, lastError:string, failedRuns:number, firstFailedAt:string}>} failures
 */
export async function sendCheckFailuresAlert({ failures, dateStr }) {
  const to = adminAlertRecipient();
  if (!to || !failures?.length) return false;

  const many = failures.length > 1;
  const subject = many
    ? 'ATLAS PANAMA IS HAVING TECHNICAL DIFFICULTIES. VISIT TERMINAL TO FIX.'
    : `Atlas Panama: a daily check failed (${failures[0].displayName}). Visit Terminal to fix.`;

  // Group by error text so "the same problem on 8 properties" reads as one problem.
  const byError = new Map();
  for (const f of failures) {
    const key = shortError(f.lastError);
    if (!byError.has(key)) byError.set(key, []);
    byError.get(key).push(f);
  }

  const problemLines = [];
  for (const [err, list] of byError) {
    problemLines.push(`What happened (${list.length} of ${failures.length}): ${plainReason(err)}`);
    for (const f of list) problemLines.push(`   - ${f.displayName} (${f.email})`);
  }

  const prompt = [
    `Atlas Panama daily checks are failing (alert sent ${new Date().toISOString()}, Panama date ${dateStr}).`,
    `${failures.length} subscription(s) affected. Error(s):`,
    ...[...byError].map(([err, list]) => `- "${shortError(err)}" on: ${list.map(f => `${f.displayName} [${f.subscriptionId}, ${f.failedRuns} failed run(s) since ${f.firstFailedAt}]`).join(', ')}`),
    'Please find the root cause (check /admin/daily-report?date=today, /queue and /admin/storage-check on the live site), explain it to me in plain language, propose a permanent fix, and once I approve, publish it and make sure the missed checks run and the owed reports go out.'
  ].join('\n');

  const intro = 'Subscribers were told once that their check is delayed (no technical details). The app keeps retrying every hour and will send each subscriber their report as soon as a check succeeds.';
  const howTo = `Copy and paste the following into the terminal prompt for Atlas Panama at ${PROJECT_FOLDER}:`;

  const text = [intro, '', ...problemLines, '', howTo, '', prompt].join('\n');
  const html = `<p>${esc(intro)}</p><pre style="white-space:pre-wrap;font-size:14px;font-family:inherit;">${esc(problemLines.join('\n'))}</pre>`
    + `<p><strong>${esc(howTo)}</strong></p>`
    + `<pre style="${PROMPT_BOX}">${esc(prompt)}</pre>`;

  return sendEmail({ to, subject, text, html });
}

export default { sendAdminAlertEmail, sendCheckFailuresAlert, plainReason, shortError };
