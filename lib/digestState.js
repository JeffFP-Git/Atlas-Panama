/**
 * Tracks the last date a routine (no-change) digest email was actually sent to
 * each recipient — separate from snapshotStore, which tracks per-subscription
 * check history. Keyed by recipient email (lowercased), since the digest groups
 * all of a subscriber's properties/entities into one email regardless of which
 * individual subscriptions they came from.
 *
 * Changes-detected and first-run items always send immediately (see
 * dailyScheduler.js's runDailyDigestDispatch) — this state only gates the
 * "nothing changed, just a routine check-in" case.
 */
import fs from 'fs';
import path from 'path';

const FILE = path.join('data', 'digest-state.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

function keyFor(email) {
  return String(email || '').trim().toLowerCase();
}

export function getLastSentDate(email) {
  const state = load();
  return state[keyFor(email)]?.lastSentDate || null;
}

export function setLastSentDate(email, dateStr) {
  const state = load();
  const key = keyFor(email);
  state[key] = { ...(state[key] || {}), lastSentDate: dateStr };
  save(state);
}

export default { getLastSentDate, setLastSentDate };
