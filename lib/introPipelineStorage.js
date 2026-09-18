import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_DIR = path.join(process.cwd(), 'data');
const REQUESTS_FILE = path.join(STORAGE_DIR, 'intro-requests.json');

function ensureStorageDir() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
  } catch {}
}

function loadRequests() {
  ensureStorageDir();
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const data = fs.readFileSync(REQUESTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Ensure subscriptions array exists for backward compatibility
      if (!parsed.subscriptions) parsed.subscriptions = [];
      return parsed;
    }
  } catch (err) {
    console.error('Error loading requests:', err);
  }
  return { requests: [], subscriptions: [] };
}

function saveRequests(data) {
  ensureStorageDir();
  try {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving requests:', err);
    return false;
  }
}

/**
 * Create a new intro pipeline request
 */
export function createRequest({ type, businessName, propertyName, email }) {
  const data = loadRequests();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const request = {
    id,
    type, // 'business' or 'property'
    businessName: businessName || null,
    propertyName: propertyName || null,
    email,
    status: 'pending', // pending, processing, completed, confirmed, rejected
    createdAt: new Date().toISOString(),
    confirmed: null, // null, true, false
    pdfPath: null,
    folio: null,
    scheduled: false, // whether daily runs are scheduled
    error: null
  };
  data.requests.push(request);
  saveRequests(data);
  return request;
}

/**
 * Create a new subscription request
 */
export function createSubscriptionRequest({ tipo, email, nameOrFolio, name, ruc, folio, codigo, ownerName, whatsappOptIn, whatsappPhone, language }) {
  const data = loadRequests();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Generate secure access token for email verification (64 character hex string)
  const accessToken = crypto.randomBytes(32).toString('hex');

  const request = {
    id,
    tipo, // 'mercantil', 'fundacion', or 'inmueble'
    email,
    // For mercantil/fundacion: `name` and `ruc` are the real search fields (RUC is
    // optional — most subscribers will only know the entity's name). `nameOrFolio` is
    // kept for backward compatibility with older callers and is used as a fallback
    // for `name` when `name` isn't given separately.
    nameOrFolio: nameOrFolio || name || null,
    name: name || nameOrFolio || null,
    ruc: ruc || null,
    folio: folio || null,
    codigo: codigo || null,
    // For inmueble: at least one of folio/ownerName is required, codigo is always optional.
    ownerName: ownerName || null,
    // Notification preferences. whatsappPhone is only meaningful when whatsappOptIn
    // is true. WhatsApp delivery itself isn't built yet — this just captures the
    // subscriber's preference for when that's ready. `language` ('es' or 'en') is
    // likewise stored for future use in bilingual email templates; the emails sent
    // today don't yet honor it.
    whatsappOptIn: !!whatsappOptIn,
    whatsappPhone: whatsappOptIn ? (whatsappPhone || null) : null,
    language: (language === 'en' ? 'en' : 'es'),
    status: 'pending', // pending, processing, completed, needs_disambiguation, needs_refinement, no_match, confirmed, rejected
    createdAt: new Date().toISOString(),
    confirmed: null, // null, true, false
    datosDelInmueble: null,
    datosDelFolio: null,
    matches: null, // populated when classification is 'B' (a short list to pick from)
    matchCount: null,
    scheduled: false,
    error: null,
    accessToken // Secure token for email verification
  };
  if (!data.subscriptions) data.subscriptions = [];
  data.subscriptions.push(request);
  saveRequests(data);
  return request;
}

/**
 * Get a subscription request by ID
 */
export function getSubscriptionRequest(id) {
  const data = loadRequests();
  if (!data.subscriptions) return null;
  return data.subscriptions.find(r => r.id === id) || null;
}

/**
 * Update a subscription request
 */
export function updateSubscriptionRequest(id, updates) {
  const data = loadRequests();
  if (!data.subscriptions) return null;
  const index = data.subscriptions.findIndex(r => r.id === id);
  if (index === -1) return null;
  
  data.subscriptions[index] = {
    ...data.subscriptions[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  saveRequests(data);
  return data.subscriptions[index];
}

/**
 * Confirm or reject a subscription
 */
export function confirmSubscription(id, isCorrect) {
  return updateSubscriptionRequest(id, {
    confirmed: isCorrect,
    status: isCorrect ? 'confirmed' : 'rejected'
  });
}

/**
 * Delete a subscription request
 */
export function deleteSubscriptionRequest(id) {
  const data = loadRequests();
  if (!data.subscriptions) return null;
  const index = data.subscriptions.findIndex(r => r.id === id);
  if (index === -1) return null;
  
  const deleted = data.subscriptions[index];
  data.subscriptions.splice(index, 1);
  saveRequests(data);
  return deleted;
}

/**
 * List all subscription requests
 */
export function listSubscriptionRequests(filter = {}) {
  const data = loadRequests();
  if (!data.subscriptions) return [];
  
  let subscriptions = data.subscriptions;
  
  if (filter.status) {
    subscriptions = subscriptions.filter(s => s.status === filter.status);
  }
  if (filter.email) {
    subscriptions = subscriptions.filter(s => s.email === filter.email);
  }
  if (filter.confirmed !== undefined) {
    subscriptions = subscriptions.filter(s => s.confirmed === filter.confirmed);
  }
  if (filter.tipo) {
    subscriptions = subscriptions.filter(s => s.tipo === filter.tipo);
  }
  
  return subscriptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Get a request by ID
 */
export function getRequest(id) {
  const data = loadRequests();
  return data.requests.find(r => r.id === id) || null;
}

/**
 * Update a request
 */
export function updateRequest(id, updates) {
  const data = loadRequests();
  const index = data.requests.findIndex(r => r.id === id);
  if (index === -1) return null;
  
  data.requests[index] = {
    ...data.requests[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  saveRequests(data);
  return data.requests[index];
}

/**
 * List all requests
 */
export function listRequests(filter = {}) {
  const data = loadRequests();
  let requests = data.requests;
  
  if (filter.status) {
    requests = requests.filter(r => r.status === filter.status);
  }
  if (filter.email) {
    requests = requests.filter(r => r.email === filter.email);
  }
  if (filter.confirmed !== undefined) {
    requests = requests.filter(r => r.confirmed === filter.confirmed);
  }
  
  return requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Confirm or reject a property
 */
export function confirmProperty(id, isCorrect) {
  return updateRequest(id, {
    confirmed: isCorrect,
    status: isCorrect ? 'confirmed' : 'rejected'
  });
}

/**
 * Schedule daily runs for a confirmed request
 */
export function scheduleDailyRuns(id) {
  return updateRequest(id, {
    scheduled: true
  });
}

export default {
  createRequest,
  getRequest,
  updateRequest,
  listRequests,
  confirmProperty,
  scheduleDailyRuns,
  createSubscriptionRequest,
  getSubscriptionRequest,
  updateSubscriptionRequest,
  confirmSubscription,
  listSubscriptionRequests
};

