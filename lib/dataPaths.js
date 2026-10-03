/**
 * Where the app keeps files that must survive a redeploy: the subscriber list
 * (data/intro-requests.json), digest/Q&A logs, and per-subscription monitoring
 * snapshots (MonitoringData/).
 *
 * Locally these stay in the project folder, as before. On Railway each deploy
 * starts from a fresh container, so set DATA_DIR to the mount path of the
 * service's persistent volume (e.g. /app/data) — snapshots then live in
 * $DATA_DIR/MonitoringData on that same volume.
 */
import path from 'path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const MONITORING_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'MonitoringData')
  : path.join(process.cwd(), 'MonitoringData');
