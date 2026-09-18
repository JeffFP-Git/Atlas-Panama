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

export default { sendAdminAlertEmail };
