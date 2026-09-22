/**
 * Anonymous log of what subscribers search for on the Q&A page — no identity attached,
 * just the query text, language, and timestamp. Purpose (per the user, Sept 2026):
 * (1) find real gaps in the Q&A content, (2) general insight into what the customer
 * base actually cares about. Same lightweight file-store pattern as digestState.js —
 * no real database needed at this scale.
 */
import fs from 'fs';
import path from 'path';

const FILE = path.join('data', 'qa-search-log.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(entries) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2));
}

export function logSearch(query, language) {
  const entries = load();
  entries.push({ query: String(query).slice(0, 200), language: language === 'en' ? 'en' : 'es', timestamp: new Date().toISOString() });
  save(entries);
}

export default { logSearch };
