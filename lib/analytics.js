/**
 * Simple, privacy-friendly website visit counter for the daily activity report — no
 * cookies, no third-party analytics.
 *
 * For each human page view of a public page we count: total page views, unique
 * visitors (an IP + browser code, hashed with a salt that changes every day, so the
 * same person can't be followed from one day to the next and the raw IP is never
 * stored), views per page, and where each visitor came from (a ?src= tag on the link,
 * e.g. atlaspanama.com/?src=wa-es, otherwise the referring site, otherwise "direct").
 * Link-preview fetchers (WhatsApp, Facebook, etc.), search-engine bots and scripts are
 * not counted. Once a day has been reported, its visitor codes and salt are discarded
 * and only the totals are kept (compactDay).
 *
 * One file per Panama calendar day: $DATA_DIR/analytics/YYYY-MM-DD.json
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './dataPaths.js';

const DIR = path.join(DATA_DIR, 'analytics');

// Public pages worth counting (clean URLs and their .html forms)
const PAGE_NAMES = {
  '/': 'Home', '/about.html': 'Home',
  '/subscribe': 'Subscribe', '/subscribe.html': 'Subscribe',
  '/qa': 'Q&A', '/qa.html': 'Q&A',
  '/contact': 'Contact', '/contact.html': 'Contact',
  '/terms': 'Terms', '/terminos': 'Terms', '/terms.html': 'Terms', '/terminos.html': 'Terms',
  '/privacy': 'Privacy', '/privacidad': 'Privacy', '/privacy.html': 'Privacy', '/privacidad.html': 'Privacy',
  '/payment.html': 'Plan / payment', '/verify.html': 'Verify'
};

const NON_HUMAN = /bot|crawl|spider|slurp|preview|whatsapp|facebookexternalhit|facebot|telegram|twitterbot|linkedin|skype|discord|embedly|curl|wget|python|node-fetch|axios|go-http|java\/|okhttp|headless|lighthouse|monitor|uptime|pingdom|railway/i;

export function panamaDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Panama' });
}

function fileFor(dateStr) {
  return path.join(DIR, `${dateStr}.json`);
}

export function loadDay(dateStr) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(dateStr), 'utf8'));
  } catch {
    return null;
  }
}

function saveDay(dateStr, day) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(dateStr), JSON.stringify(day));
}

function sourceOf(req) {
  const tag = String(req.query?.src || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (tag) return tag;
  const referer = req.get('referer') || '';
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '');
    if (host && !host.endsWith('atlaspanama.com')) return host;
  } catch { /* no or bad referer */ }
  return 'direct';
}

/** Express middleware: counts human GET page views of public pages. Never throws. */
export function trackPageView(req, _res, next) {
  try {
    const page = PAGE_NAMES[req.path];
    const ua = req.get('user-agent') || '';
    if (req.method === 'GET' && page && ua && !NON_HUMAN.test(ua)) {
      const dateStr = panamaDateString();
      const day = loadDay(dateStr) || { date: dateStr, salt: crypto.randomBytes(16).toString('hex'), pageViews: 0, visitors: {}, pages: {}, sources: {} };
      if (day.compacted) return next(); // shouldn't happen for today; be safe
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
      const visitor = crypto.createHash('sha256').update(`${day.salt}|${ip}|${ua}`).digest('hex').slice(0, 20);
      day.pageViews++;
      day.pages[page] = (day.pages[page] || 0) + 1;
      if (!day.visitors[visitor]) {
        day.visitors[visitor] = 1;
        const src = sourceOf(req);
        day.sources[src] = (day.sources[src] || 0) + 1;
      }
      saveDay(dateStr, day);
    }
  } catch (err) {
    console.error('[Analytics] Could not record page view:', err.message);
  }
  next();
}

/**
 * Counts an anonymous signup-form event for today (no visitor identity): e.g.
 * 'submit_click', 'error: <message shown>', 'js_error: …', 'server_202', 'server_400'.
 */
export function recordEvent(name) {
  try {
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!clean) return;
    const dateStr = panamaDateString();
    const day = loadDay(dateStr) || { date: dateStr, salt: crypto.randomBytes(16).toString('hex'), pageViews: 0, visitors: {}, pages: {}, sources: {} };
    day.events = day.events || {};
    day.events[clean] = (day.events[clean] || 0) + 1;
    saveDay(dateStr, day);
  } catch (err) {
    console.error('[Analytics] Could not record event:', err.message);
  }
}

/** Totals for one day (works before or after compaction). */
export function daySummary(dateStr) {
  const day = loadDay(dateStr);
  if (!day) return { date: dateStr, pageViews: 0, uniqueVisitors: 0, pages: {}, sources: {}, events: {} };
  return {
    date: dateStr,
    pageViews: day.pageViews || 0,
    uniqueVisitors: day.compacted ? day.uniqueVisitors : Object.keys(day.visitors || {}).length,
    pages: day.pages || {},
    sources: day.sources || {},
    events: day.events || {}
  };
}

/** After a day is over and reported: keep totals only, discard visitor codes and salt. */
export function compactDay(dateStr) {
  const day = loadDay(dateStr);
  if (!day || day.compacted || dateStr >= panamaDateString()) return;
  const { salt, visitors, ...rest } = day;
  saveDay(dateStr, { ...rest, uniqueVisitors: Object.keys(visitors || {}).length, compacted: true });
}

export default { trackPageView, recordEvent, daySummary, compactDay, panamaDateString };
