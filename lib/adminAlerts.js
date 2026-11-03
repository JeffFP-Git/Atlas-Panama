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
export async function sendAdminAlertEmail({ subject, context, subscription, error, extra }) {
  const to = adminAlertRecipient();
  if (!to) {
    console.log('ℹ️  No ADMIN_ALERT_EMAIL/SMTP_USER configured; skipping internal alert email.');
    return false;
  }

  const lines = [];
  lines.push(`Time: ${new Date().toISOString()}`);
  if (context) lines.push(`Where: ${context}`);

  if (subscription) {
    lines.push('');
    lines.push('Subscriber:');
    lines.push(`  Subscription ID: ${subscription.id || '(unknown)'}`);
    lines.push(`  Email: ${subscription.email || '(unknown)'}`);
    lines.push(`  Tipo: ${subscription.tipo || '(unknown)'}`);
    const name = subscription.name || subscription.nameOrFolio;
    if (name) lines.push(`  Name: ${name}`);
    if (subscription.folio) lines.push(`  Folio: ${subscription.folio}`);
    if (subscription.codigo) lines.push(`  Código: ${subscription.codigo}`);
    if (subscription.ruc) lines.push(`  RUC: ${subscription.ruc}`);
    if (subscription.ownerName) lines.push(`  Owner name: ${subscription.ownerName}`);
    if (subscription.language) lines.push(`  Language: ${subscription.language}`);
  }

  if (extra && typeof extra === 'object') {
    lines.push('');
    lines.push('Details:');
    for (const [k, v] of Object.entries(extra)) lines.push(`  ${k}: ${v}`);
  }

  lines.push('');
  lines.push('Error:');
  lines.push(error?.stack || error?.message || String(error));

  const text = lines.join('\n');
  const html = `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:13px;">${lines
    .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('\n')}</pre>`;

  return sendEmail({ to, subject: `⚠️ Atlas Panama Internal Alert: ${subject}`, text, html });
}

const PROJECT_FOLDER = '/home/admin2/atlaspanama-jon/Daily Property Subscription Search';

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
    const key = f.lastError || 'unknown error';
    if (!byError.has(key)) byError.set(key, []);
    byError.get(key).push(f);
  }

  const problemLines = [];
  for (const [err, list] of byError) {
    problemLines.push(`${list.length} of ${failures.length} failed with: ${err}`);
    for (const f of list) problemLines.push(`   - ${f.displayName} (${f.email}), ${f.failedRuns} failed run(s) since ${f.firstFailedAt}`);
  }

  const prompt = [
    `Atlas Panama daily checks are failing (alert sent ${new Date().toISOString()}, Panama date ${dateStr}).`,
    `${failures.length} subscription(s) affected. Error(s):`,
    ...[...byError].map(([err, list]) => `- "${err}" on: ${list.map(f => `${f.displayName} [${f.subscriptionId}]`).join(', ')}`),
    'Please find the root cause (check /admin/daily-report?date=today, /queue and /admin/storage-check on the live site), explain it to me in plain language, propose a permanent fix, and once I approve, publish it and make sure the missed checks run and the owed reports go out.'
  ].join('\n');

  const intro = 'Here is the problem. Subscribers were told once that their check is delayed (no technical details). The app keeps retrying every hour and will send each subscriber their report as soon as a check succeeds.';
  const howTo = `Copy and paste the following into the terminal prompt for Atlas Panama at ${PROJECT_FOLDER}:`;

  const text = [intro, '', ...problemLines, '', howTo, '', prompt].join('\n');
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<p>${esc(intro)}</p><pre style="white-space:pre-wrap;font-size:13px;">${esc(problemLines.join('\n'))}</pre>`
    + `<p><strong>${esc(howTo)}</strong></p>`
    + `<pre style="white-space:pre-wrap;font-size:13px;background:#f3f3f3;border:1px solid #ccc;padding:12px;">${esc(prompt)}</pre>`;

  return sendEmail({ to, subject, text, html });
}

export default { sendAdminAlertEmail, sendCheckFailuresAlert };
