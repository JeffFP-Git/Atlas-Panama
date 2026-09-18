import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import * as auth from './auth.js';
import { getPuppeteerLib } from './puppet.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load environment variables (parity with scraper.js)
try { dotenv.config(); } catch {}

// Parity with scraper.js
const FULL_AUTO_MODE = false;

const DEBUG_DIR = './debug-output';
function ensureDebugDir() {
  try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {}
}
let DEBUG_ON = false;
export function setMercantilDebug(flag) { DEBUG_ON = !!flag; }
async function saveDebugScreenshot(page, baseName = 'mercantil_debug') {
  try {
    if (!DEBUG_ON) return null;
    ensureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${DEBUG_DIR}/${baseName}_${ts}.png`;
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    return file;
  } catch {
    return null;
  }
}
async function saveModalHTML(page, baseName = 'mercantil_modal') {
  try {
    ensureDebugDir();
    const html = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      return active.outerHTML || document.documentElement.outerHTML;
    });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${DEBUG_DIR}/${baseName}_${ts}.html`;
    fs.writeFileSync(file, html, 'utf8');
    return file;
  } catch {
    return null;
  }
}

// --- Begin auth helpers copied to match scraper.js exactly ---
async function humanType(page, selector, text, minDelay = 80, maxDelay = 140) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const delay = minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay));
    await page.type(selector, ch, { delay });
    if (i > 0 && i % 5 === 0) {
      await sleep(120 + Math.floor(Math.random() * 180));
    }
  }
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

async function humanMouseMove(page, x1, y1, x2, y2, steps = 20) {
  try {
    await page.mouse.move(x1, y1, { steps: 2 });
  } catch {}
  const dx = (x2 - x1) / steps;
  const dy = (y2 - y1) / steps;
  for (let i = 1; i <= steps; i++) {
    const nx = x1 + dx * i + (Math.random() - 0.5) * 1.5;
    const ny = y1 + dy * i + (Math.random() - 0.5) * 1.5;
    try {
      await page.mouse.move(nx, ny, { steps: 1 });
    } catch {}
    await sleep(randomInt(8, 18));
  }
}

async function clearAndTypeWithVerification(page, selector, value, label = 'field') {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
  await page.click(selector, { clickCount: 3 }).catch(() => {});
  await humanType(page, selector, value, 90, 140);
  const readBack = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  if (readBack === value) return true;
  console.log(`⚠️  Mismatch after typing ${label} (len ${readBack.length}/${value.length}). Retrying...`);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
  await humanType(page, selector, value, 120, 180);
  const readBack2 = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  if (readBack2 === value) return true;
  console.log(`⚠️  Second mismatch on ${label}. Forcing value via DOM.`);
  await page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, selector, value);
  const readBack3 = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  const ok = readBack3 === value;
  if (!ok) {
    console.log(`⚠️  Unable to fully set ${label}. Proceeding, but login may fail.`);
  }
  return ok;
}

async function isLoggedIn(page) { return auth.isLoggedIn(page); }

async function tryClickRecaptchaCheckbox(page) { return auth.tryClickRecaptchaCheckbox(page); }

async function tryClickRecaptchaCheckboxSlow(page) { return auth.tryClickRecaptchaCheckboxSlow(page); }

async function performLogin(page, overrides = {}) { return auth.performLogin(page, overrides); }
// --- End auth helpers ---

async function waitForModalReady(page, label = 'mercantil_modal_ready') {
  // Wait until the spinner inside modal disappears and the tab control shows
  try {
    await page.waitForFunction(() => {
      const modal = document.querySelector('.blazored-modal-container');
      if (!modal) return false;
      const style = window.getComputedStyle(modal);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      // Be generous with spinner selectors — site changes these occasionally
      const spinners = Array.from(modal.querySelectorAll('.fa-spinner, .fa.fa-spinner, i.fa-pulse, .spinner-border, .loading, .fa.fa-spinner.fa-pulse'));
      const anyVisibleSpinner = spinners.some(s => {
        const cs = window.getComputedStyle(s);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
      const tabs =
        modal.querySelector('.ventana-con-tab-control .btn-group[role="group"]') ||
        modal.querySelector('.btn-group[role="group"]') ||
        modal.querySelector('.ventana-con-tab-control') ||
        modal.querySelector('.blazored-modal-content');
      // Consider ready if tabs exist and no visible spinner is present
      return !!tabs && !anyVisibleSpinner;
    }, { timeout: 35000 }).catch(() => {});
    // Small settle time after spinner disappears
    await sleep(400);
  } catch {}
  await saveModalHTML(page, label);
  await saveDebugScreenshot(page, label);
}

async function installPopupGuards(page) {
  try {
    await page.evaluateOnNewDocument(() => {
      try {
        // Prevent new tabs/windows
        window.open = function () { return null; };
      } catch {}
    });
  } catch {}
  try {
    page.removeAllListeners('popup');
    page.on('popup', async (popup) => {
      try { await popup.close(); } catch {}
    });
  } catch {}
}

async function ensureOnBusquedaFolios(page) {
  try {
    const href = await page.evaluate(() => location.href).catch(() => '');
    if (!/BusquedaFolios/i.test(href || '')) {
      await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
  } catch {}
}

async function closeAllMercantilModals(page) {
  try {
    for (let i = 0; i < 5; i++) {
      const hadModal = await page.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
        const visible = modals.filter(m => {
          const s = window.getComputedStyle(m);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        });
        if (visible.length === 0) return false;
        // Click the close button on the most recent
        const active = visible[visible.length - 1];
        const btn = active.querySelector('.blazored-modal-close, button.blazored-modal-close, button[aria-label="Close"]');
        if (btn) {
          try { btn.click(); return true; } catch {}
        }
        // Last resort: hide it
        try { active.style.display = 'none'; } catch {}
        return true;
      });
      if (!hadModal) break;
      await sleep(300);
    }
    // Extra guard: press ESC
    await page.keyboard.press('Escape').catch(() => {});
  } catch {}
}

function normalizeCorporateName(rawName) {
  const text = String(rawName || '').trim();
  if (!text) return '';
  return text.replace(/\(\s*Propiedad\s*\)/i, '').replace(/\s+/g, ' ').trim();
}

function isLikelyCorporation(name) {
  const t = String(name || '').toLowerCase();
  return /\b(corporacion|corporación|sociedad|an[oó]nima|s\.?a\.?|s\.?r\.?l\.?|fundacion|fundación|foundation)\b/.test(t);
}

function isFoundation(name) {
  const t = String(name || '').toLowerCase();
  // Check for foundation-related keywords
  return /\b(fundacion|fundación|foundation|fund|funda)\b/.test(t);
}

async function navigateToMercantil(page, opts = {}) {
  // Determine search type: 'Personas' for foundations, 'Mercantil' for corporations
  const searchType = opts?.isFoundation ? 'Personas' : 'Mercantil';
  
  if (opts?.testing) {
    try {
      await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch {}
    try {
      await page.waitForSelector('select', { timeout: 5000 });
      await page.evaluate((type) => {
        const selects = Array.from(document.querySelectorAll('select'));
        const tipo = selects.find(s => {
          const n = (s.getAttribute('name') || s.id || '').toLowerCase();
          return n.includes('tipobusqueda') || n.includes('tipo');
        });
        if (tipo) {
          tipo.value = type;
          tipo.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, searchType);
    } catch {}
    try {
      await page.evaluate(() => {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const btns = Array.from(document.querySelectorAll('button'));
        const datosBtn = btns.find(b => norm(b.textContent).includes('datos de la persona juridica'));
        datosBtn && datosBtn.click();
      });
    } catch {}
    await sleep(600);
    return;
  }
  await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    return els.some(el => (el.textContent || '').trim() === 'Folios');
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    const folios = els.find(el => (el.textContent || '').trim() === 'Folios');
    folios && folios.click();
  });
  await sleep(600);
  await page.waitForSelector('select', { timeout: 15000 });
  await page.evaluate((type) => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => {
      const n = (s.getAttribute('name') || s.id || '').toLowerCase();
      return n.includes('tipobusqueda') || n.includes('tipo');
    });
    if (tipo) {
      tipo.value = type;
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, searchType);
  await sleep(600);
  await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const btns = Array.from(document.querySelectorAll('button'));
    const datosBtn = btns.find(b => norm(b.textContent).includes('datos de la persona juridica'));
    datosBtn && datosBtn.click();
  });
  await sleep(1200);
}

async function queryMercantilByName(page, corporateName) {
  const name = normalizeCorporateName(corporateName);
  if (!name) return false;
  // Ensure correct tab is active
  try {
    await page.evaluate(() => {
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const btns = Array.from(document.querySelectorAll('button'));
      const datosBtn = btns.find(b => norm(b.textContent).includes('datos de la persona juridica'));
      datosBtn && datosBtn.click();
    });
  } catch {}
  await sleep(200);
  // Try to locate the "Nombre:" input in the Persona Jurídica tab robustly
  try {
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      return labels.some(l => {
        const t = (l.textContent || '').trim().toLowerCase();
        return t === 'nombre:' || t === 'nombre';
      });
    }, { timeout: 5000 });
  } catch {}
  // Use auth.js robust typing+verification for the search input.
  const inputSelector = await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().trim();
    // Prefer the singular "Nombre:" field, not "Nombre del Representante"/"Apoderado"
    const labels = Array.from(document.querySelectorAll('label'));
    let targetInput = null;
    for (const l of labels) {
      const t = norm(l.textContent || '');
      if (t === 'nombre:' || t === 'nombre') {
        const forAttr = (l.getAttribute('for') || '').trim();
        if (forAttr) {
          const byFor = document.getElementById(forAttr);
          if (byFor) { targetInput = byFor; break; }
        }
        const row = l.closest('tr, .row, div');
        if (row) {
          const candidate = row.querySelector('input[type="text"], input');
          if (candidate) { targetInput = candidate; break; }
        }
      }
    }
    if (!targetInput) targetInput = document.querySelector('input[type="text"], input');
    if (!targetInput) return null;
    if (targetInput.id) return `#${targetInput.id}`;
    targetInput.setAttribute('data-ps-input', 'mercantilName');
    return 'input[data-ps-input="mercantilName"]';
  });
  if (!inputSelector) return false;
  const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  await auth.strictFillInput(page, inputSelector, name, 'Nombre', { normalize: normName, maxAttempts: 8 });
  await auth.lockInputValue(page, inputSelector, name, { normalize: (v) => String(v ?? '') });
  await auth.assertInputValue(page, inputSelector, name, 'Nombre', { normalize: normName });
  await sleep(500);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const buscar = buttons.find(btn => (btn.textContent || btn.value || '').toLowerCase().includes('buscar'));
    buscar && buscar.click();
  });
  // Early exit: if the page shows the "no folios" alert, skip immediately
  const earlyNoResults = await page.waitForFunction(() => {
    const alert = document.querySelector('.alert-info, .alert-warning, .alert');
    const txt = alert ? ((alert.innerText || alert.textContent || '').trim().toLowerCase()) : '';
    return txt.includes('no hay folios para las condiciones de búsqueda especificadas');
  }, { timeout: 1500 }).then(() => true).catch(() => false);
  if (earlyNoResults) {
    await saveModalHTML(page, 'mercantil_search_no_results_alert_early');
    await saveDebugScreenshot(page, 'mercantil_search_no_results_alert_early');
    return false;
  }
  // Wait for results table to render (rows with action button) or for a modal to open
  let gotResults = await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const hasRows = rows.length > 0;
    const modal = document.querySelector('.blazored-modal-container');
    // Also consider presence of grid header (columns like NOMBRE)
    const ths = Array.from(document.querySelectorAll('table thead th'));
    const hasHeader = ths.some(th => /nombre/i.test(th.innerText || th.textContent || ''));
    return hasRows || hasHeader || !!modal;
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  // Fallback: filter inside the grid's "NOMBRE" filter row if no rows yet
  if (!gotResults) {
    await page.evaluate((targetName) => {
      // Locate filter row inputs under the header; fill NOMBRE input if present
      const headerThs = Array.from(document.querySelectorAll('table thead th'));
      let nameIdx = -1;
      headerThs.forEach((th, i) => {
        const t = (th.innerText || th.textContent || '').trim().toLowerCase();
        if (t.includes('nombre')) nameIdx = i;
      });
      const filterRow = document.querySelector('table thead tr.dxbs-filter-row') || document.querySelector('table thead tr');
      if (filterRow && nameIdx >= 0) {
        const cells = Array.from(filterRow.querySelectorAll('td, th'));
        const cell = cells[nameIdx];
        if (cell) {
          const input = cell.querySelector('input, textarea');
          if (input) {
            input.focus();
            input.value = targetName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
          }
        }
      }
    }, name);
    await sleep(800);
    // Quick check again for the no-results alert
    const quickNoResults = await page.waitForFunction(() => {
      const alert = document.querySelector('.alert-info, .alert-warning, .alert');
      const txt = alert ? ((alert.innerText || alert.textContent || '').trim().toLowerCase()) : '';
      return txt.includes('no hay folios para las condiciones de búsqueda especificadas');
    }, { timeout: 1200 }).then(() => true).catch(() => false);
    if (quickNoResults) {
      await saveModalHTML(page, 'mercantil_search_no_results_alert_after_filter');
      await saveDebugScreenshot(page, 'mercantil_search_no_results_alert_after_filter');
      return false;
    }
    gotResults = await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.length > 0;
    }, { timeout: 5000 }).then(() => true).catch(() => false);
  }
  if (!gotResults) {
    await saveModalHTML(page, 'mercantil_search_no_results');
    await saveDebugScreenshot(page, 'mercantil_search_no_results');
    return false;
  }
  // Pick the best matching row by "NOMBRE" similarity and click its "VER" button
  let clickedBest = await page.evaluate((targetName) => {
    const normalize = (s) => {
      return (s || '')
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\(PROPIEDAD\)/gi, '')
        .replace(/[,./\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const tokenize = (s) => {
      const STOP = new Set(['SA','S.A','S.A.','SRL','S DE RL','SOCIEDAD','ANONIMA','ANÓNIMA','DE','LA','EL','Y']);
      return normalize(s).split(' ').filter(w => w && !STOP.has(w));
    };
    const score = (a, b) => {
      const ta = tokenize(a);
      const tb = tokenize(b);
      if (ta.length === 0 || tb.length === 0) return 0;
      const setA = new Set(ta);
      let inter = 0;
      for (const w of tb) if (setA.has(w)) inter++;
      const ratio = inter / Math.max(ta.length, tb.length);
      const inc = normalize(b).includes(normalize(a)) ? 0.15 : 0; // small boost
      return ratio + inc;
    };
    // Determine column index for NOMBRE
    let nameIdx = -1;
    const ths = Array.from(document.querySelectorAll('table thead th'));
    if (ths.length) {
      ths.forEach((th, i) => {
        const t = (th.innerText || th.textContent || '').toLowerCase();
        if (t.includes('nombre')) nameIdx = i;
      });
    }
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    if (rows.length === 0) return false;
    let best = { idx: -1, s: -1 };
    rows.forEach((tr, i) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      let candidateName = '';
      if (nameIdx >= 0 && nameIdx < cells.length) {
        candidateName = cells[nameIdx].innerText || cells[nameIdx].textContent || '';
      } else {
        candidateName = tr.innerText || tr.textContent || '';
      }
      const sc = score(targetName, candidateName);
      if (sc > best.s) best = { idx: i, s: sc };
    });
    if (best.idx === -1) return false;
    const targetRow = rows[best.idx];
    const lastCell = targetRow.querySelector('td:last-child');
    const btn = lastCell ? (lastCell.querySelector('button, a') || lastCell) : null;
    if (btn) { (btn instanceof HTMLAnchorElement || btn instanceof HTMLButtonElement) ? btn.click() : lastCell.click(); return true; }
    return false;
  }, name).catch(() => false);
  // Fallback: click the first visible "VER" eye button
  if (!clickedBest) {
    clickedBest = await page.evaluate(() => {
      const eye = Array.from(document.querySelectorAll('button, a')).find(el => {
        const hasIcon = el.querySelector('.fa-eye');
        const txt = (el.textContent || '').toLowerCase();
        return hasIcon || /ver/.test(txt);
      });
      if (eye) {
        try { eye.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; } catch {}
        try { eye.click(); return true; } catch {}
      }
      return false;
    }).catch(() => false);
  }
  if (!clickedBest) return false;
  return true;
}

export async function openFirstMercantilResult(page) {
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) continue;
      const last = cells[cells.length - 1];
      const btn = last.querySelector('button, a');
      if (btn) {
        try {
          if (btn.tagName === 'A') {
            btn.setAttribute('target', '_self');
            btn.setAttribute('rel', 'noopener');
          }
          const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
          btn.dispatchEvent(ev);
          if (!ev.defaultPrevented && btn.tagName === 'A' && btn.href) {
            // Force same-tab behavior if needed
            location.href = btn.href;
          }
        } catch {
          try { btn.click(); } catch {}
        }
        return true;
      }
    }
    return false;
  });
  if (clicked) {
    // Wait for modal to appear
    const appeared = await page.waitForFunction(() => {
      const modal = document.querySelector('.blazored-modal-container');
      if (!modal) return false;
      const s = window.getComputedStyle(modal);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }, { timeout: 6000 }).then(() => true).catch(() => false);
    if (!appeared) {
      await sleep(800);
    } else {
      await saveModalHTML(page, 'mercantil_modal_opened');
      await waitForModalReady(page, 'mercantil_modal_ready');
    }
  }
  return clicked;
}

export async function extractMercantilMembers(page, opts = {}) {
  const debug = !!opts.debug || DEBUG_ON;
  // Click Miembros Relacionados tab (robust, retry) within the most recent visible modal
  for (let attempt = 0; attempt < 6; attempt++) {
    // Ensure modal is loaded and spinners are gone
    await waitForModalReady(page, `mercantil_modal_ready_before_miembros_try${attempt + 1}`);
    await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // Prefer buttons within tab control
      const controls =
        active.querySelector('.ventana-con-tab-control') ||
        active.querySelector('.btn-group[role="group"]') ||
        active;
      const candidates = Array.from(controls.querySelectorAll('button, a, .btn'));
      const match = candidates.find(b => {
        const t = norm(b.textContent || b.innerText || '');
        return t.includes('miembros relacionados') || (t.includes('miembros') && t.includes('relacion'));
      });
      if (match) {
        try { match.scrollIntoView({ block: 'center' }); } catch {}
        // Fire a more realistic click sequence
        try {
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch {
          try { match.click(); } catch {}
        }
      }
    });
    // Give time for tab switch and data load; progressive backoff
    await sleep(1500 + attempt * 600);
    // Wait for Miembros tab active OR table headers to appear, with a larger timeout
    await page.waitForFunction(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      // Spinner must not be visible
      const spinners = Array.from(active.querySelectorAll('.fa-spinner, .fa.fa-spinner, i.fa-pulse, .spinner-border, .loading'));
      const anyVisibleSpinner = spinners.some(s => {
        const cs = window.getComputedStyle(s);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
      if (anyVisibleSpinner) return false;
      // Either Miembros tab content marked active or a table with Cargo/Miembro headers
      const tab = active.querySelector('.MiembrosRelacionados.tabestado');
      if (tab) {
        const tbl = tab.querySelector('table');
        if (tbl) {
          const rows = tbl.querySelectorAll('tbody tr');
          if (rows.length > 0) return true;
        }
        // Even if no rows yet, consider active indicator good enough
        return true;
      }
      const ths = Array.from(active.querySelectorAll('table thead th'));
      const headerText = ths.map(th => (th.innerText || th.textContent || '').trim().toLowerCase());
      return headerText.includes('cargo') && headerText.includes('miembro');
    }, { timeout: 40000 }).catch(() => {});
    await waitForModalReady(page, `mercantil_miembros_wait_ready_try${attempt + 1}`);
    const hasContent = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      const tab = active.querySelector('.MiembrosRelacionados.tabestado') || active.querySelector('.MiembrosRelacionados');
      const tbl = tab ? tab.querySelector('table') : active.querySelector('table');
      const rowCount = tbl ? tbl.querySelectorAll('tbody tr').length : 0;
      if (rowCount > 0) return true;
      const ths = Array.from(active.querySelectorAll('table thead th'));
      const headerText = ths.map(th => (th.innerText || th.textContent || '').trim().toLowerCase());
      return headerText.includes('cargo') && headerText.includes('miembro');
    }).catch(() => false);
    await saveModalHTML(page, `mercantil_miembros_dom_try${attempt + 1}`);
    await saveDebugScreenshot(page, `mercantil_miembros_try${attempt + 1}`);
    if (hasContent) break;
  }
  // Grab mercantil folio from title
  const meta = await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
    const visible = modals.filter(m => {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    });
    const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
    const title = active.querySelector('.blazored-modal-title')?.textContent || '';
    const m = title.match(/Folio\s*N[º°]?\s*(\d+)/i);
    return { title, folio: m ? m[1] : '' };
  });
  // Extract table rows with Cargo / Miembro, including pagination
  const rows = await page.evaluate(async () => {
    try {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      const out = [];
      const headerTextFor = (table) => {
        const ths = Array.from(table.querySelectorAll('thead th, thead a, thead span'));
        return ths.map(th => (th.innerText || th.textContent || '').trim().toLowerCase());
      };
      const collectFromTable = (table) => {
        const headers = headerTextFor(table);
        const idxCargo = headers.findIndex(h => h.includes('cargo'));
        const idxMiembro = headers.findIndex(h => h.includes('miembro'));
        const trs = Array.from(table.querySelectorAll('tbody tr'));
        trs.forEach(tr => {
          const tds = Array.from(tr.querySelectorAll('td,th')).map(td => (td.innerText || td.textContent || '').trim());
          if (tds.length === 0) return;
          if (idxCargo >= 0 && idxMiembro >= 0 && Math.max(idxCargo, idxMiembro) < tds.length) {
            out.push({ cargo: tds[idxCargo], miembro: tds[idxMiembro] });
          } else if (tds.length >= 2) {
            out.push({ cargo: tds[0], miembro: tds[1] });
          }
        });
      };
      // Find the best table (DevExpress pattern first)
      const headerContainers = Array.from(active.querySelectorAll('.dxbs-grid-header-container'));
      let bodyTable = null;
      for (const hc of headerContainers) {
        let bodyWrap = hc.nextElementSibling;
        while (bodyWrap && !(bodyWrap instanceof HTMLElement)) bodyWrap = bodyWrap.nextElementSibling;
        if (bodyWrap) {
          const candidate = bodyWrap.querySelector('table');
          if (candidate) { bodyTable = candidate; break; }
        }
      }
      if (!bodyTable) bodyTable = active.querySelector('.MiembrosRelacionados.tabestado table');
      if (!bodyTable) {
        const tables = Array.from(active.querySelectorAll('table'));
        let max = 0;
        for (const t of tables) {
          const cnt = t.querySelectorAll('tbody tr').length;
          if (cnt > max) { max = cnt; bodyTable = t; }
        }
      }
      if (!bodyTable) return out;
      // Collect current page
      collectFromTable(bodyTable);
      // Handle pagination (if any)
      const pager = active.querySelector('.pagination, .dxbs-pager, ul.pagination');
      let pageGuard = 0;
      while (pager && pageGuard++ < 50) {
        const nextLi = Array.from(pager.querySelectorAll('li')).find(li => {
          const a = li.querySelector('a,button,span');
          if (!a) return false;
          const t = (a.innerText || a.textContent || '').trim().toLowerCase();
          const disabled = li.classList.contains('disabled') || li.classList.contains('dxbs-disabled') || a.getAttribute('aria-disabled') === 'true';
          return !disabled && (t === 'siguiente' || t === 'next' || t === '›' || t === '»' || t.includes('sig'));
        });
        if (!nextLi) break;
        const before = out.length;
        const a = nextLi.querySelector('a,button,span');
        a && a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        // simple wait
        const start = Date.now();
        while (Date.now() - start < 800) {
          await new Promise(r => setTimeout(r, 200));
        }
        collectFromTable(bodyTable);
        if (out.length === before) break;
      }
      return out;
    } catch {
      return [];
    }
  });
  if (debug) {
    console.log(`ℹ️  Miembros: extracted ${Array.isArray(rows) ? rows.length : 0} row(s) for folio ${meta.folio || ''}`);
    await saveModalHTML(page, `mercantil_miembros_after_extract`);
    await saveDebugScreenshot(page, `mercantil_miembros_after_extract`);
  }
  return { mercantilFolio: meta.folio || '', rows };
}

function toDynamicRoleColumns(rows) {
  const byRole = new Map();
  for (const r of rows) {
    const role = (r.cargo || '').trim() || 'Cargo';
    const person = (r.miembro || '').trim();
    if (!byRole.has(role)) byRole.set(role, []);
    if (person) byRole.get(role).push(person);
  }
  const out = {};
  byRole.forEach((list, role) => {
    list.forEach((name, idx) => {
      out[`${role} ${idx + 1}`] = name;
    });
  });
  return out;
}

export async function scrapeMercantilForOwner(page, ownerName, opts = {}) {
  if (!isLikelyCorporation(ownerName)) return null;
  await installPopupGuards(page);
  await ensureOnBusquedaFolios(page);
  // Check if this is a foundation and pass that info to navigation
  const isFoundationType = isFoundation(ownerName);
  await navigateToMercantil(page, { ...opts, isFoundation: isFoundationType });
  const ok = await queryMercantilByName(page, ownerName);
  if (!ok) {
    await closeAllMercantilModals(page);
    await ensureOnBusquedaFolios(page);
    return { ownerName, notFound: true, rows: [] };
  }
  const opened = await openFirstMercantilResult(page);
  if (!opened) {
    await closeAllMercantilModals(page);
    await ensureOnBusquedaFolios(page);
    return { ownerName, notFound: true, rows: [] };
  }
  const { mercantilFolio, rows } = await extractMercantilMembers(page, opts);
  await closeAllMercantilModals(page);
  await ensureOnBusquedaFolios(page);
  return { ownerName: normalizeCorporateName(ownerName), mercantilFolio, rows, notFound: rows.length === 0 };
}

export async function enrichPropertiesWithMercantil(page, properties, opts = {}) {
  const results = [];
  const seen = new Set();
  for (const prop of properties || []) {
    const owner = String(prop?.propietario || prop?.datosGenerales?.['PROPIETARIO'] || '').trim();
    if (!owner) continue;
    if (!isLikelyCorporation(owner)) continue;
    if (seen.has(owner)) continue;
    seen.add(owner);
    try {
      const r = await scrapeMercantilForOwner(page, owner, opts);
      if (r) results.push({ ownerName: owner, mercantil: r });
    } catch (e) {
      results.push({ ownerName: owner, mercantil: { ownerName: owner, error: String(e?.message || e), rows: [] } });
    }
    await sleep(500);
  }
  return results;
}

export function buildMercantilSheetRows(mercantilResults, propsByOwner = new Map()) {
  const rows = [];
  const seenOwners = new Set();
  for (const entry of mercantilResults || []) {
    const owner = String(entry.ownerName || '').trim();
    if (!owner) continue;
    if (!isLikelyCorporation(owner)) continue; // ensure only companies/foundations
    if (seenOwners.has(owner)) continue; // one row per company
    seenOwners.add(owner);
    const m = entry.mercantil || {};
    const mRows = Array.isArray(m.rows) ? m.rows : [];
    // If no results found for this search, still emit a row with a note
    if (m.notFound || mRows.length === 0) {
      rows.push({
        'Owner': m.ownerName || owner,
        'Mercantil Folio': m.mercantilFolio || '',
        'Note': 'No hay folios para las condiciones de búsqueda especificadas'
      });
      continue;
    }
    const roleCols = toDynamicRoleColumns(mRows);
    // Single summary row per company (no per-property expansion)
    rows.push({
      'Owner': m.ownerName || owner,
      'Mercantil Folio': m.mercantilFolio || '',
      ...roleCols
    });
  }
  return rows;
}

export async function exportMercantilOnly(results, outputPath, propsByOwner = new Map()) {
  const wb = XLSX.utils.book_new();
  const rows = buildMercantilSheetRows(results, propsByOwner);
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, 'Mercantil Members');
  const outDir = path.dirname(outputPath);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

export default {
  normalizeCorporateName,
  isLikelyCorporation,
  isFoundation,
  scrapeMercantilForOwner,
  enrichPropertiesWithMercantil,
  buildMercantilSheetRows,
  exportMercantilOnly
};

// ===== CLI runner for standalone testing =====
const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1] && /mercantil\.js$/.test(process.argv[1]);

async function restoreSessionCookies(page, url = 'https://www.rp.gob.pa/') {
  try {
    const sessionPath = path.join(process.cwd(), 'session', 'session-cookies.json');
    if (!fs.existsSync(sessionPath)) return false;
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    if (!data || !Array.isArray(data.cookies)) return false;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.setCookie(...data.cookies);
    return true;
  } catch {
    return false;
  }
}

function parseCliArgs(argv) {
  const out = { names: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    const key = token.slice(2, eq > -1 ? eq : undefined);
    let val = eq > -1 ? token.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
    if (key === 'name') out.names.push(val);
    else if (key === 'names') {
      // Allow comma/semicolon separated list in a single argument
      const parts = String(val).split(/[;,]+/).map(s => s.trim()).filter(Boolean);
      out.names.push(...parts);
    }
    // Helpful aliases for convenience when debugging
    else if (key === 'owner' || key === 'company' || key === 'prop' || key === 'property') {
      out.names.push(val);
    }
    else if (key === 'max' || key === 'limit') out.max = Math.max(0, Number(val) || 0);
    else if (key === 'per-owner-timeout' || key === 'owner-timeout' || key === 'timeout') out.perOwnerTimeoutMs = Math.max(0, Number(val) || 0);
    else if (key === 'output') out.output = val;
    else if (key === 'headless') out.headless = (val === '1' || val === 'true');
    else if (key === 'testing' || key === 'mercantil-testing' || key === 'mercantile-testing' || key === 'skip-nav') out.testing = (val === '1' || val === 'true');
    else if (key === 'hold' || key === 'pause' || key === 'keep-open') out.hold = (val === '1' || val === 'true');
    else if (key === 'no-hold') out.hold = false;
    else if (key === 'owners' || key === 'owners-xlsx' || key === 'owners-csv') out.ownersFile = val;
    else if (key === 'user' || key === 'username') out.username = val;
    else if (key === 'pass' || key === 'password') out.password = val;
    else if (key === 'inputWorkbook' || key === 'input' || key === 'properties-xlsx') out.propertiesWorkbook = val;
    else if (key === 'debug') out.debug = (val === '1' || val === 'true');
  }
  return out;
}

function loadOwnersFromFile(filePath) {
  try {
    if (!filePath) return [];
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const out = [];
    if (json.length > 0) {
      // Try to infer a name column
      const headers = Object.keys(json[0] || {}).map(h => String(h).trim().toLowerCase());
      const idxOwner = headers.find(h => ['owner','propietario','nombre','name'].includes(h));
      if (idxOwner) {
        json.forEach(row => {
          const val = row[idxOwner] || row[idxOwner.toUpperCase()] || row[idxOwner.replace(/^\w/, c => c.toUpperCase())];
          if (val) out.push(String(val));
        });
      } else {
        // Fallback: first value in row
        json.forEach(row => {
          const vals = Object.values(row).filter(Boolean);
          if (vals.length > 0) out.push(String(vals[0]));
        });
      }
    } else {
      // AOA fallback
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
      aoa.forEach(r => { if (r && r[0]) out.push(String(r[0])); });
    }
    return out.filter(Boolean);
  } catch {
    return [];
  }
}

function loadPropsByOwnerFromWorkbook(filePath) {
  try {
    if (!filePath) return { map: new Map(), owners: [] };
    const wb = XLSX.readFile(filePath);
    let sheetName = wb.SheetNames.find(n => String(n).toLowerCase() === 'properties') || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const map = new Map();
    const owners = new Set();
    for (const row of rows) {
      const owner =
        row['Propietario'] ||
        row['PROPIETARIO'] ||
        row['Owner'] ||
        row['owner'] ||
        '';
      if (!owner) continue;
      owners.add(String(owner));
      if (!map.has(owner)) map.set(owner, []);
      map.get(owner).push(row);
    }
    return { map, owners: Array.from(owners) };
  } catch {
    return { map: new Map(), owners: [] };
  }
}

async function isLoggedInSimple(page) {
  try {
    return await page.evaluate(() => {
      const onLogin = /LoginUsuario/i.test(location.href) || !!document.querySelector('#itNombreUsuario');
      const hasLogout = !!document.querySelector('a[href*="LogoutUsuario"]') || /Cerrar Sesión/i.test(document.body.innerText || '');
      return !onLogin && hasLogout;
    });
  } catch {
    return false;
  }
}

async function performLoginSimple(page, username, password) {
  try {
    await page.goto('https://www.rp.gob.pa/LoginUsuario', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {}
  try {
    await page.waitForSelector('#itNombreUsuario', { timeout: 15000 });
  } catch {}
  try {
    await page.evaluate((u, p) => {
      const uel = document.querySelector('#itNombreUsuario') || document.querySelector('input[type="email"], input[name="username"]');
      const pel = document.querySelector('input[type="password"]');
      if (uel) {
        uel.focus(); uel.value = u;
        uel.dispatchEvent(new Event('input', { bubbles: true }));
        uel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (pel) {
        pel.focus(); pel.value = p;
        pel.dispatchEvent(new Event('input', { bubbles: true }));
        pel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, username || process.env.RP_USERNAME || '', password || process.env.RP_PASSWORD || '');
  } catch {}
  try {
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"], form button.btn-primary, form button');
      if (btn) btn.click();
    });
  } catch {}
  await sleep(1500);
  return isLoggedInSimple(page);
}

async function runCli() {
  const args = parseCliArgs(process.argv);
  setMercantilDebug(!!args.debug || process.env.DEBUG_MERCANTIL === '1' || process.env.DEBUG_MERCANTIL === 'true');
  const namesFromFile = args.ownersFile ? loadOwnersFromFile(args.ownersFile) : [];
  const { map: propsByOwnerFromWorkbook, owners: ownersFromWorkbook } =
    args.propertiesWorkbook ? loadPropsByOwnerFromWorkbook(args.propertiesWorkbook) : { map: new Map(), owners: [] };
  const propsByOwner = propsByOwnerFromWorkbook;
  let allNames = [...args.names, ...namesFromFile, ...ownersFromWorkbook].filter(Boolean);
  if (args.max && allNames.length > args.max) {
    allNames = allNames.slice(0, args.max);
  }
  if (allNames.length === 0) {
    console.error('Usage:');
    console.error('  node lib/mercantil.js --name "CORPORACION ..." [--name "OTHER, S.A."] [--names "A;B;C"] [--max 5] [--debug 1]');
    console.error('  node lib/mercantil.js --inputWorkbook ./BuildingData/your_building.xlsx [--max 5]');
    console.error('  node lib/mercantil.js --owners ./owners.xlsx [--output BuildingData/mercantil_only.xlsx] [--headless 1]');
    // Do not crash; just return gracefully
    return;
  }
  const results = [];
  let browser = null;
  let page = null;
  try {
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    const puppeteerLib = await getPuppeteerLib();
    browser = await puppeteerLib.launch({
      headless: !!args.headless,
      executablePath: execPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await restoreSessionCookies(page);
    // Use the exact same login routine as scraper.js
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      const ok = await performLogin(page, { username: args.username, password: args.password });
      if (!ok) console.warn('⚠️  Login may have failed; continuing anyway.');
    }
    const perOwnerTimeoutMs = args.perOwnerTimeoutMs && args.perOwnerTimeoutMs > 0 ? args.perOwnerTimeoutMs : 120000;
    for (let idx = 0; idx < allNames.length; idx++) {
      const n = allNames[idx];
      console.log(`\n[Mercantil] ${idx + 1}/${allNames.length} ${n}`);
      try {
        const r = await Promise.race([
          scrapeMercantilForOwner(page, n, { testing: !!args.testing, debug: !!args.debug }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('per-owner timeout exceeded')), perOwnerTimeoutMs))
        ]);
        results.push({ ownerName: n, mercantil: r });
      } catch (e) {
        const msg = String(e?.message || e);
        console.warn(`⚠️  Owner failed: ${n} → ${msg}`);
        results.push({ ownerName: n, mercantil: { ownerName: n, error: msg, rows: [] } });
        // Try to recover page state for next iteration
        await closeAllMercantilModals(page);
        await ensureOnBusquedaFolios(page);
      }
    }
  } catch (e) {
    // If anything fails before per-name loop, emit placeholder errors for all names
    const msg = String(e?.message || e);
    console.warn(`⚠️  Mercantil runner failed early: ${msg}`);
    for (const n of allNames) {
      results.push({ ownerName: n, mercantil: { ownerName: n, error: msg, rows: [] } });
    }
  } finally {
    let holdOpen = undefined;
    if (typeof args.hold === 'boolean') {
      holdOpen = args.hold;
    } else {
      const envHold = (process.env.MERCANTIL_HOLD === '1' || process.env.MERCANTIL_HOLD === 'true');
      const envDebug = (process.env.DEBUG_MERCANTIL === '1' || process.env.DEBUG_MERCANTIL === 'true');
      holdOpen = envHold || envDebug || !!args.debug;
    }
    if (browser && !holdOpen) {
      try { await browser.close(); } catch {}
    }
    if (holdOpen && browser) {
      console.log('Holding browser open for debugging (Ctrl+C to exit)...');
      // eslint-disable-next-line no-empty
      await new Promise(() => {});
    }
  }

  const outputPath = args.output || path.join(process.cwd(), 'BuildingData', 'mercantil_only.xlsx');
  try {
    const written = await exportMercantilOnly(results, outputPath, propsByOwner);
    console.log(`Mercantil-only sheet written: ${written}`);
  } catch (e) {
    console.log(JSON.stringify(results, null, 2));
    console.warn(`⚠️  Failed to write Excel: ${e?.message || e}`);
  }
}

if (isExecutedDirectly) {
  runCli().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    // Do not hard-fail; write a debug artifact and exit 0 so it never "crashes"
    try {
      ensureDebugDir();
      fs.writeFileSync(`${DEBUG_DIR}/mercantil_cli_error.txt`, String(err?.stack || err?.message || err));
    } catch {}
    process.exit(0);
  });
}


