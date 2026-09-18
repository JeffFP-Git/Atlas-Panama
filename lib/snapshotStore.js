/**
 * Per-subscription day-over-day snapshot storage for the daily monitoring job.
 * Each confirmed subscription gets its own folder under MonitoringData/<subscriptionId>/,
 * containing one {YYYY-MM-DD}.json (the extracted record, see lib/entityRecordExtraction.js
 * / lib/propertyRecordExtraction.js) and one {YYYY-MM-DD}.pdf (the rendered report) per day
 * it has been checked. Keyed by subscription ID (not name/folio) so a re-subscription or a
 * renamed entity doesn't collide with or lose another subscriber's history.
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'MonitoringData';

export function subscriptionDir(subscriptionId) {
  return path.join(ROOT, String(subscriptionId));
}

export function todayDateString(tz = 'America/Panama') {
  // en-CA locale formats as YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

export function snapshotJsonPath(subscriptionId, dateStr) {
  return path.join(subscriptionDir(subscriptionId), `${dateStr}.json`);
}

export function snapshotPdfPath(subscriptionId, dateStr) {
  return path.join(subscriptionDir(subscriptionId), `${dateStr}.pdf`);
}

/** Returns { dateStr, record } for the most recent saved snapshot, or null if none exists yet. */
export function getLatestSnapshot(subscriptionId) {
  const dir = subscriptionDir(subscriptionId);
  if (!fs.existsSync(dir)) return null;
  const dateStrs = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dateStrs.length === 0) return null;
  const latestDate = dateStrs[dateStrs.length - 1];
  try {
    const record = JSON.parse(fs.readFileSync(snapshotJsonPath(subscriptionId, latestDate), 'utf8'));
    return { dateStr: latestDate, record };
  } catch {
    return null;
  }
}

export function saveSnapshot(subscriptionId, dateStr, record) {
  const dir = subscriptionDir(subscriptionId);
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = snapshotJsonPath(subscriptionId, dateStr);
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));
  return jsonPath;
}

export default { subscriptionDir, todayDateString, snapshotJsonPath, snapshotPdfPath, getLatestSnapshot, saveSnapshot };
