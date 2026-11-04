/**
 * "Choose which ones to keep" (Nov 2026): a subscriber with several free trials gets ONE
 * trial-ending email with a link to /keep, where they tick the properties/entities to keep
 * (or Select all) and pay once for them (one Stripe subscription, quantity = number ticked).
 *
 * The link carries the email plus a code derived from it with the server's secret, so only
 * someone who received the email can open that subscriber's list. Each checkout stores
 * which subscriptions were ticked here (Stripe metadata is too small for 50 ids).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './dataPaths.js';

const FILE = path.join(DATA_DIR, 'keep-selections.json');
const KEEP_FOR_DAYS = 30;

function secret() {
  return process.env.KEEP_LINK_SECRET || process.env.API_KEY || '';
}

export function keepToken(email) {
  const s = secret();
  if (!s) return null;
  return crypto.createHmac('sha256', s).update(`keep:${String(email || '').trim().toLowerCase()}`).digest('hex').slice(0, 32);
}

export function isValidKeepToken(email, token) {
  const expected = keepToken(email);
  if (!expected || typeof token !== 'string' || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function keepUrlFor(email) {
  const baseUrl = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const token = keepToken(email);
  if (!token) return null;
  return `${baseUrl}/keep?e=${encodeURIComponent(email)}&t=${token}`;
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function save(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function createSelection({ email, ids, plan }) {
  const state = load();
  const cutoff = Date.now() - KEEP_FOR_DAYS * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(state)) if (Date.parse(v.createdAt) < cutoff) delete state[k];
  const id = `sel-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  state[id] = { email, ids, plan, createdAt: new Date().toISOString(), activatedAt: null };
  save(state);
  return id;
}

export function getSelection(id) {
  return load()[id] || null;
}

export function markActivated(id) {
  const state = load();
  if (state[id]) { state[id].activatedAt = new Date().toISOString(); save(state); }
}

export default { keepToken, isValidKeepToken, keepUrlFor, createSelection, getSelection, markActivated };
