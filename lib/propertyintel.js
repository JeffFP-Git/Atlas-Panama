import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { getPuppeteerLib } from './puppet.js';
import * as auth from './auth.js';
import { sendFincaCompletionEmail } from './email.js';

// Load env (parity with other scripts)
try { dotenv.config(); } catch {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEBUG_DIR = './debug-output';
function ensureDebugDir() { try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {} }
let DEBUG_ON = false;
export function setPropertyIntelDebug(flag) { DEBUG_ON = !!flag; }
async function saveDebugScreenshot(page, baseName) {
  if (!DEBUG_ON) return;
  try {
    ensureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `${DEBUG_DIR}/${baseName || 'propertyintel_debug'}_${ts}.png`, fullPage: true }).catch(() => {});
  } catch {}
}
async function saveHTML(page, baseName) {
  if (!DEBUG_ON) return;
  try {
    ensureDebugDir();
    const html = await page.content();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`${DEBUG_DIR}/${baseName || 'propertyintel_dom'}_${ts}.html`, html || '');
  } catch {}
}

// --- modal readiness / debug ---
async function waitForModalReady(page, label = 'propertyintel_modal_ready') {
  // Wait until a modal is visible and obvious spinners are gone
  const appeared = await page.waitForFunction(() => {
    const modal = document.querySelector('.blazored-modal-container');
    if (!modal) return false;
    const s = window.getComputedStyle(modal);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!appeared) {
    await sleep(800);
  } else {
    await page.waitForFunction(() => {
      const modal = document.querySelector('.blazored-modal-container');
      if (!modal) return false;
      const spinners = Array.from(modal.querySelectorAll('.fa-spinner, .fa.fa-spinner, i.fa-pulse, .spinner-border, .loading'));
      const visibleSpin = spinners.some(s => {
        const cs = window.getComputedStyle(s);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
      return !visibleSpin;
    }, { timeout: 10000 }).catch(() => {});
  }
  await saveDebugScreenshot(page, `${label}_shot`);
  await saveHTML(page, `${label}_html`);
}

// ---------- Auth / helpers ----------
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
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const ch of String(value)) {
      await page.type(selector, ch, { delay: 90 + Math.floor(Math.random() * 60) });
      if (Math.random() < 0.15) await sleep(100 + Math.floor(Math.random() * 120));
    }
    const read = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
    if (read === value) return true;
    console.log(`⚠️  Mismatch after typing ${label} (len ${read.length}/${String(value).length}). Retrying...`);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el && 'value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, selector);
  }
  await page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (el && 'value' in el) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, selector, value);
  const back = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  if (back !== value) console.log(`⚠️  Unable to fully set ${label}.`);
  return back === value;
}

async function isLoggedIn(page) { return auth.isLoggedIn(page); }
async function tryClickRecaptchaCheckbox(page) { return auth.tryClickRecaptchaCheckbox(page); }
export async function performLogin(page, overrides = {}) { return auth.performLogin(page, overrides); }

async function ensureOnBusquedaFolios(page) {
  try {
    if (!/BusquedaFolios/i.test(await page.evaluate(() => location.href))) {
      await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
  } catch {}
}

export async function navigateToInmuebles(page) {
  await ensureOnBusquedaFolios(page);
  
  // Step 1: Click Folios
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    return els.some(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    const folios = els.find(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
    if (folios && typeof folios.click === 'function') folios.click();
  });
  await sleep(600);
  
  // Step 2: Select Inmuebles
  await page.waitForSelector('select', { timeout: 15000 });
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => {
      const n = (s.getAttribute('name') || s.id || '').toLowerCase();
      return n.includes('tipobusqueda') || n.includes('tipo');
    });
    if (tipo) {
      tipo.value = 'Inmuebles';
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(800);
  
  // Step 3: Ensure we're on "Datos del folio" tab (don't click "Datos del Inmueble")
  // The default tab should be "Datos del folio" (btn-primary), but we'll verify it's active
  await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const btns = Array.from(document.querySelectorAll('button'));
    // Find "Datos del folio" button and ensure it's active (click if not)
    const datosFolioBtn = btns.find(b => {
      const text = norm(b.textContent || '');
      return text.includes('datos del folio');
    });
    // If the button exists and doesn't have btn-primary class, click it to activate
    if (datosFolioBtn && !datosFolioBtn.classList.contains('btn-primary')) {
      datosFolioBtn.click();
    }
  });
  await sleep(1200);
}

export async function queryByFolioAndLocationCode(page, folioNumber, locationCode) {
  const folio = String(folioNumber || '').trim();
  const codigo = String(locationCode || '').trim();
  if (!folio && !codigo) return false;
  
  // Wait for the form fields to be available
  await page.waitForFunction(() => {
    const numeroFolio = document.querySelector('#numeroFolio');
    const codigoUbicacion = document.querySelector('#codigoUbicacion');
    return numeroFolio || codigoUbicacion;
  }, { timeout: 7000 }).catch(() => {});
  
  // STRICT: do not click Buscar unless we can prove the input values are correct and still present at click time.
  const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');

  if (folio) {
    await auth.strictFillInput(page, '#numeroFolio', folio, 'Número de Folio', { normalize: digitsOnly, maxAttempts: 8 });
    await sleep(300);
  }

  if (codigo) {
    await auth.strictFillInput(page, '#codigoUbicacion', codigo, 'Código de Ubicación', { normalize: digitsOnly, maxAttempts: 8 });
    await sleep(300);
  }
  
  // Lock values briefly so they don't clear on blur/change before clicking Buscar
  await page.evaluate((folioVal, codigoVal) => {
    const locks = [];
    const lock = (sel, expected) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const exp = String(expected ?? '');
      const handler = () => {
        if (String(el.value ?? '') !== exp) {
          el.value = exp;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      el.addEventListener('input', handler, true);
      el.addEventListener('change', handler, true);
      el.addEventListener('blur', handler, true);
      locks.push({ el, handler });
    };
    if (folioVal) lock('#numeroFolio', folioVal);
    if (codigoVal) lock('#codigoUbicacion', codigoVal);
    setTimeout(() => {
      for (const { el, handler } of locks) {
        try {
          el.removeEventListener('input', handler, true);
          el.removeEventListener('change', handler, true);
          el.removeEventListener('blur', handler, true);
        } catch {}
      }
    }, 2000);
  }, folio, codigo);

  // Force-set again right before clicking
  await page.evaluate((folioVal, codigoVal) => {
    const setVal = (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.value = String(v ?? '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (folioVal) setVal('#numeroFolio', folioVal);
    if (codigoVal) setVal('#codigoUbicacion', codigoVal);
  }, folio, codigo);

  // Final gate: abort BEFORE clicking Buscar if field changed/cleared
  if (folio) {
    const read = await page.$eval('#numeroFolio', el => (el && 'value' in el) ? el.value : '');
    if (digitsOnly(read) !== digitsOnly(folio)) {
      throw new Error(`Folio field was cleared/changed before submit (expected ${folio}, got ${read}). Aborting before Buscar.`);
    }
  }
  if (codigo) {
    const read = await page.$eval('#codigoUbicacion', el => (el && 'value' in el) ? el.value : '');
    if (digitsOnly(read) !== digitsOnly(codigo)) {
      throw new Error(`Código field was cleared/changed before submit (expected ${codigo}, got ${read}). Aborting before Buscar.`);
    }
  }

  // Click Buscar button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const buscar = buttons.find(btn => {
      const text = (btn.textContent || btn.value || '').toLowerCase().trim();
      return text.includes('buscar') && !text.includes('limpiar');
    });
    if (buscar && typeof buscar.click === 'function') buscar.click();
  });
  
  // Wait for results: table or modal
  const got = await page.waitForFunction(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const ths = Array.from(document.querySelectorAll('table thead th')).map(th => (th.innerText || '').toLowerCase());
    const modal = document.querySelector('.blazored-modal-container');
    return rows.length > 0 || ths.some(t => t.includes('folio') || t.includes('ubicacion')) || !!modal;
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  return !!got;
}

export async function openFirstResultModal(page) {
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    for (const tr of rows) {
      const last = tr.querySelector('td:last-child');
      const btn = last && (last.querySelector('button, a') || last);
      if (btn && typeof btn.click === 'function') { btn.click(); return true; }
    }
    return false;
  });
  if (!clicked) return false;
  // wait modal visible
  const ok = await page.waitForFunction(() => {
    const m = document.querySelector('.blazored-modal-container');
    if (!m) return false; const s = window.getComputedStyle(m);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!ok) await sleep(800);
  return true;
}

// Robust Prelación click & extract (same as finca.js)
export async function clickPrelacionTabAndExtract(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await waitForModalReady(page, `propertyintel_modal_ready_try${attempt + 1}`);
    // Try clicking the Prelación tab/button inside the active modal
    const clicked = await page.evaluate(() => {
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
      const controls = active.querySelector('.ventana-con-tab-control') || active.querySelector('.btn-group[role="group"]') || active;
      const candidates = Array.from(controls.querySelectorAll('button, a, .btn'));
      const match = candidates.find(b => {
        const t = norm(b.textContent || b.innerText || '');
        return t.includes('prelacion'); // covers "prelación" without accent too
      });
      if (match) {
        try { match.scrollIntoView({ block: 'center' }); } catch {}
        try {
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch {
          try { match.click(); } catch {}
        }
        return true;
      }
      return false;
    });
    await saveDebugScreenshot(page, `propertyintel_prelacion_click_try${attempt + 1}`);
    await saveHTML(page, `propertyintel_prelacion_click_try${attempt + 1}`);
    await sleep(1200 + attempt * 500);
    // Wait for tab content readiness: table visible or headers present; spinners gone
    const ready = await page.waitForFunction(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length ? visible[visible.length - 1] : document.body;
      const spinners = Array.from(active.querySelectorAll('.fa-spinner, .fa.fa-spinner, i.fa-pulse, .spinner-border, .loading'));
      const anyVisibleSpinner = spinners.some(s => {
        const cs = window.getComputedStyle(s);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
      if (anyVisibleSpinner) return false;
      const tbl = active.querySelector('table');
      if (!tbl) return false;
      const ths = Array.from(tbl.querySelectorAll('thead th')).map(th => (th.innerText || th.textContent || '').trim().toLowerCase());
      const hasPrelacionHeaders = ths.some(t => t.includes('entrada')) || ths.some(t => t.includes('trámite')) || ths.some(t => t.includes('estado'));
      const rows = tbl.querySelectorAll('tbody tr').length;
      return hasPrelacionHeaders || rows > 0;
    }, { timeout: 12000 }).then(() => true).catch(() => false);
    await saveDebugScreenshot(page, `propertyintel_prelacion_ready_try${attempt + 1}`);
    await saveHTML(page, `propertyintel_prelacion_ready_try${attempt + 1}`);
    if (ready) {
      // Extract table under active modal (robust DevExpress header/body pairing + pagination)
      const data = await page.evaluate(async () => {
        const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
        const visible = modals.filter(m => {
          const s = window.getComputedStyle(m);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        });
        const active = visible.length ? visible[visible.length - 1] : document.body;

        // Prefer DevExpress grid pattern: header container followed by body table container
        const headerContainers = Array.from(active.querySelectorAll('.dxbs-grid-header-container'));
        let bodyTable = null;
        let headerTable = null;
        for (const hc of headerContainers) {
          headerTable = hc.querySelector('table');
          let bodyWrap = hc.nextElementSibling;
          while (bodyWrap && !(bodyWrap instanceof HTMLElement)) bodyWrap = bodyWrap.nextElementSibling;
          if (bodyWrap) {
            const candidate = bodyWrap.querySelector('table');
            if (candidate) { bodyTable = candidate; break; }
          }
        }
        // Fallbacks
        if (!bodyTable) bodyTable = active.querySelector('.Prelacion.tabestado table');
        if (!bodyTable) {
          const tables = Array.from(active.querySelectorAll('table'));
          // pick table with most data rows
          let max = 0;
          for (const t of tables) {
            const cnt = t.querySelectorAll('tbody tr').length;
            if (cnt > max) { max = cnt; bodyTable = t; }
          }
        }
        if (!bodyTable) return { headers: [], rows: [], folio: '' };

        // Build headers (prefer headerTable if available)
        // DevExpress grid: headers are in <th> elements, text might be in nested <a> or <span>
        const readHeaders = (table) => {
          const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
          return ths.map(th => {
            // Try nested <a> first (sortable columns), then <span>, then direct text
            const a = th.querySelector('a');
            const span = th.querySelector('span');
            const text = a ? (a.innerText || a.textContent || '').trim() :
                        span ? (span.innerText || span.textContent || '').trim() :
                        (th.innerText || th.textContent || '').trim();
            return text || '';
          }).filter(Boolean);
        };
        let headers = [];
        if (headerTable) headers = readHeaders(headerTable);
        if (!headers.length) headers = readHeaders(bodyTable);

        const mapRowFrom = (tr) => {
          const cells = Array.from(tr.querySelectorAll('td,th'));
          const values = cells.map(td => (td.innerText || td.textContent || '').trim());
          const obj = {};
          
          // Map data columns (skip command columns if header count differs)
          if (headers.length > 0) {
            // If we have headers, map them to values
            // Command columns (like "Documentos") might not have headers, so handle mismatch
            const dataCellCount = Math.min(headers.length, values.length);
            for (let i = 0; i < dataCellCount; i++) {
              const header = headers[i] || `Col${i + 1}`;
              obj[header] = values[i] || '';
            }
            // If there are extra cells (command columns), check for PDF
            if (values.length > headers.length) {
              const extraCells = cells.slice(headers.length);
              const hasPdf = extraCells.some(td => 
                !!td.querySelector('.fa-file-pdf-o, .fa.fa-file-pdf-o, [href$=".pdf"], button .fa-file-pdf-o')
              );
              if (hasPdf && !('Documentos' in obj)) {
                obj['Documentos'] = 'PDF';
              }
            }
          } else {
            // Fallback: no headers, use positional
            values.forEach((v, i) => { obj[`Col${i + 1}`] = v; });
          }
          
          // Also check all cells for PDF icon (in case it's in a data column)
          const hasPdfAnywhere = cells.some(td => 
            !!td.querySelector('.fa-file-pdf-o, .fa.fa-file-pdf-o, [href$=".pdf"], button .fa-file-pdf-o')
          );
          if (hasPdfAnywhere && !('Documentos' in obj)) {
            obj['Documentos'] = 'PDF';
          }
          
          return obj;
        };

        const rows = [];
        const collectPage = () => {
          const trs = Array.from(bodyTable.querySelectorAll('tbody tr'));
          trs.forEach(tr => rows.push(mapRowFrom(tr)));
        };

        // Collect current page
        collectPage();

        // Handle pagination (DevExpress pager)
        const pager = active.querySelector('.pagination, .dxbs-pager, ul.pagination');
        let guard = 0;
        while (pager && guard++ < 50) {
          const nextLi = Array.from(pager.querySelectorAll('li')).find(li => {
            const a = li.querySelector('a,button,span');
            if (!a) return false;
            const t = (a.innerText || a.textContent || '').trim().toLowerCase();
            const disabled = li.classList.contains('disabled') || li.classList.contains('dxbs-disabled') || a.getAttribute('aria-disabled') === 'true';
            return !disabled && (t === 'siguiente' || t === 'next' || t === '›' || t === '»' || t.includes('sig'));
          });
          if (!nextLi) break;
          const before = rows.length;
          const a = nextLi.querySelector('a,button,span');
          try { a && a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch {}
          // naive wait for page repaint
          const start = Date.now();
          while (Date.now() - start < 900) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 200));
          }
          collectPage();
          if (rows.length === before) break;
        }

        // Extract folio from title; support both Real and Mercantil styles
        const title = active.querySelector('.blazored-modal-title')?.textContent || '';
        const folio =
          (title.match(/Folio\s+Real\s+N[°º]?\s*(\d+)/i) || [,''])[1] ||
          (title.match(/Folio\s*N[º°]?\s*(\d+)/i) || [,''])[1] || '';

        return { headers, rows, folio };
      });
      await saveDebugScreenshot(page, 'propertyintel_prelacion_extracted');
      await saveHTML(page, 'propertyintel_prelacion_extracted');
      return data || { headers: [], rows: [], folio: '' };
    }
  }
  console.log('⚠️  Failed to activate Prelación tab after multiple attempts.');
  await saveDebugScreenshot(page, 'propertyintel_prelacion_failed');
  await saveHTML(page, 'propertyintel_prelacion_failed');
  return { headers: [], rows: [], folio: '' };
}

// ---------- Public API ----------
export async function scrapePropertyIntelPrelacion(page, folioNumber, locationCode, opts = {}) {
  await ensureOnBusquedaFolios(page);
  const okLogin = await isLoggedIn(page);
  if (!okLogin) {
    const ok = await performLogin(page, { username: opts.username, password: opts.password });
    if (!ok) throw new Error('Login failed');
  }
  await navigateToInmuebles(page);
  const q = await queryByFolioAndLocationCode(page, folioNumber, locationCode);
  if (!q) return { folioNumber, locationCode, notFound: true, rows: [] };
  const opened = await openFirstResultModal(page);
  if (!opened) return { folioNumber, locationCode, notFound: true, rows: [] };
  const { folio, rows } = await clickPrelacionTabAndExtract(page);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  return { folioNumber, locationCode, folio, rows, notFound: rows.length === 0 };
}

function readPrelacionRowsByProperty(filePath) {
  try {
    if (!fs.existsSync(filePath)) return new Map();
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Prelación'] || wb.Sheets['Prelacion'];
    if (!ws) return new Map();
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const map = new Map();
    for (const r of rows) {
      const key = `${String(r['Folio Número'] || r['Folio'] || '').trim()}_${String(r['Código Ubicación'] || r['Codigo Ubicacion'] || '').trim()}`;
      if (!key || key === '_') continue;
      if (!map.has(key)) map.set(key, []);
      const { 'Folio Número': folioNum, Folio, 'Código Ubicación': codigoUbic, 'Codigo Ubicacion': codigoUbicAlt, ...rest } = r;
      map.get(key).push(rest);
    }
    return map;
  } catch { return new Map(); }
}

function canonicalizeRow(rowObj) {
  const keys = Object.keys(rowObj).sort();
  return keys.map(k => `${k}=${String(rowObj[k] ?? '').trim()}`).join('|');
}

function computePrelacionChanges(results, prevByProperty = new Map()) {
  try {
    const changes = [];
    for (const r of results || []) {
      const key = `${String(r.folioNumber || '').trim()}_${String(r.locationCode || '').trim()}`;
      const prevRows = prevByProperty.get(key) || [];
      const curRows = Array.isArray(r.rows) ? r.rows : [];
      
      // Skip if no current rows and no previous rows (nothing to compare)
      if (curRows.length === 0 && prevRows.length === 0) {
        continue;
      }
      
      const countBy = (arr) => {
        const m = new Map();
        for (const it of arr) {
          // Skip entries that are just "Sin filas" or empty
          const key = canonicalizeRow(it);
          if (key && !key.includes('Sin filas') && !key.includes('Sin datos')) {
            m.set(key, (m.get(key) || 0) + 1);
          }
        }
        return m;
      };
      const curMap = countBy(curRows);
      const prevMap = countBy(prevRows);
      for (const [k, c] of curMap) {
        const p = prevMap.get(k) || 0;
        if (c > p) for (let i = 0; i < c - p; i++) changes.push({ 'Folio Número': r.folioNumber, 'Código Ubicación': r.locationCode, Tipo: 'Añadido', Entrada: k });
      }
      for (const [k, p] of prevMap) {
        const c = curMap.get(k) || 0;
        if (p > c) for (let i = 0; i < p - c; i++) changes.push({ 'Folio Número': r.folioNumber, 'Código Ubicación': r.locationCode, Tipo: 'Eliminado', Entrada: k });
      }
    }
    return changes;
  } catch {
    return [];
  }
}

export async function exportPropertyIntelPrelacionChangesOnly(results, outputPath, prevByProperty = new Map()) {
  const wb = XLSX.utils.book_new();
  const changes = computePrelacionChanges(results, prevByProperty);
  // Filter out placeholder entries to check for real changes
  const realChanges = changes.filter(c => {
    const entrada = String(c.Entrada || '').trim();
    return entrada && !entrada.includes('Sin filas') && !entrada.includes('Sin datos') && entrada !== 'Nota=Sin cambios';
  });
  // Only create changes file if there are real changes, otherwise create "no changes" entry
  const sheet = XLSX.utils.json_to_sheet(realChanges.length > 0 ? realChanges : [{ Nota: 'Sin cambios' }]);
  XLSX.utils.book_append_sheet(wb, sheet, 'Prelación Cambios');
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

export async function exportPropertyIntelPrelacionToWorkbook(results, outputPath, prevByProperty = new Map()) {
  const wb = XLSX.utils.book_new();
  const flat = [];
  for (const r of results || []) {
    const folioNum = r.folioNumber || '';
    const codigoUbic = r.locationCode || '';
    const folio = r.folio || '';
    const list = Array.isArray(r.rows) ? r.rows : [];
    if (list.length === 0) {
      flat.push({ 'Folio Número': folioNum, 'Código Ubicación': codigoUbic, Folio: folio, Nota: 'Sin filas' });
      continue;
    }
    for (const row of list) {
      const rec = { 'Folio Número': folioNum, 'Código Ubicación': codigoUbic, Folio: folio, ...row };
      flat.push(rec);
    }
  }
  const sheet = XLSX.utils.json_to_sheet(flat.length ? flat : [{ Nota: 'Sin datos' }]);
  XLSX.utils.book_append_sheet(wb, sheet, 'Prelación');

  try {
    const changes = computePrelacionChanges(results, prevByProperty);
    if (changes.length > 0) {
      const chSheet = XLSX.utils.json_to_sheet(changes);
      XLSX.utils.book_append_sheet(wb, chSheet, 'Prelación Cambios');
    }
  } catch {}

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

// ---------- CLI runner ----------
function parseCliArgs(argv) {
  const out = { properties: [], max: undefined };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i]; if (!t.startsWith('--')) continue;
    const eq = t.indexOf('='); const k = t.slice(2, eq > -1 ? eq : undefined);
    const v = eq > -1 ? t.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
    if (k === 'folio') {
      // Support --folio=123 or --folio 123
      const folio = v || (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '');
      if (folio) out.properties.push({ folio, codigo: '' });
    } else if (k === 'codigo' || k === 'codigoUbicacion' || k === 'locationCode') {
      // If we have a property without codigo, add it; otherwise update the last one
      if (out.properties.length === 0) out.properties.push({ folio: '', codigo: v });
      else out.properties[out.properties.length - 1].codigo = v;
    } else if (k === 'property' || k === 'prop') {
      // Support --property=folio:codigo or --property folio:codigo
      const parts = (v || (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '')).split(':');
      if (parts.length >= 1) {
        out.properties.push({ folio: parts[0] || '', codigo: parts[1] || '' });
      }
    } else if (k === 'properties' || k === 'props') {
      try {
        const buf = fs.readFileSync(v);
        const lines = String(buf).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/[:\t,]/).map(s => s.trim());
          if (parts.length >= 1) {
            out.properties.push({ folio: parts[0] || '', codigo: parts[1] || '' });
          }
        }
      } catch (e) { console.error('Could not read properties file:', e.message); }
    } else if (k === 'max') out.max = Number(v);
    else if (k === 'debug') DEBUG_ON = (v === '1' || v === 'true');
    else if (k === 'headless') out.headless = !(v === '0' || v === 'false');
  }
  return out;
}

const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && /propertyintel\.js$/.test(process.argv[1] || '');
if (isExecutedDirectly) {
  (async () => {
    const args = parseCliArgs(process.argv);
    // Support environment variables as fallback
    const envFolio = process.env.FOLIO_NUMBER || process.env.FOLIO || '';
    const envCodigo = process.env.LOCATION_CODE || process.env.CODIGO_UBICACION || process.env.CODIGO || '';
    
    let properties = args.properties;
    if (properties.length === 0 && (envFolio || envCodigo)) {
      properties = [{ folio: envFolio, codigo: envCodigo }];
    }
    
    if (properties.length === 0) {
      console.error('❌ No properties specified. Use --folio=XXX --codigo=YYY or --property=XXX:YYY or set FOLIO_NUMBER and LOCATION_CODE env vars.');
      process.exit(1);
    }
    
    const puppeteerLib = await getPuppeteerLib();
    // Default to headless (true), only run headfull if explicitly set to false via --headless 0
    const headlessFlag = (typeof args.headless === 'boolean') ? args.headless : (process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true);
    const browser = await puppeteerLib.launch({
      headless: headlessFlag,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox','--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const results = [];
    
    // Determine output path and load previous
    const firstProp = properties[0];
    const outSlug = `${firstProp.folio || 'folio'}_${firstProp.codigo || 'codigo'}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g,'') || 'propertyintel';
    const outPath = path.join('BuildingData', `${outSlug}_propertyintel.xlsx`);
    const prevByProperty = readPrelacionRowsByProperty(outPath);
    
    let hasError = false;
    let errorMessage = null;
    for (const prop of properties) {
      if (!prop.folio && !prop.codigo) continue;
      try {
        const r = await scrapePropertyIntelPrelacion(page, prop.folio, prop.codigo, { username: process.env.RP_USERNAME, password: process.env.RP_PASSWORD });
        results.push(r);
        await saveDebugScreenshot(page, 'propertyintel_after_each');
      } catch (e) {
        const errorMsg = String(e?.message || e);
        results.push({ folioNumber: prop.folio, locationCode: prop.codigo, error: errorMsg, rows: [] });
        hasError = true;
        errorMessage = errorMsg;
        // Send error email if configured
        console.log(`\n📧 Attempting to send error email for ${prop.folio}/${prop.codigo}...`);
        try {
          await Promise.race([
            sendFincaCompletionEmail({
              buildingName: `${prop.folio}/${prop.codigo}`,
              outputPath: null,
              changesPath: null,
              rowsExtracted: 0,
              hasChanges: false,
              error: errorMsg
            }),
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('Email sending timed out after 90 seconds'));
              }, 90000);
            })
          ]);
          console.log('✅ Error email sent\n');
        } catch (emailErr) {
          console.error(`⚠️  Failed to send error email: ${emailErr?.message || String(emailErr)}\n`);
        }
      }
    }
    
    // Write full workbook (with optional "Prelación Cambios" sheet)
    const finalOutputPath = await exportPropertyIntelPrelacionToWorkbook(results, outPath, prevByProperty);
    console.log('✅ Property Intel Prelación exported to', finalOutputPath);
    // Also write a separate "changes-only" workbook beside it
    const changesOnlyPath = path.join('BuildingData', `${outSlug}_propertyintel_changes.xlsx`);
    await exportPropertyIntelPrelacionChangesOnly(results, changesOnlyPath, prevByProperty);
    console.log('✅ Cambios (solo diferencias) exportados a', changesOnlyPath);
    
    // Calculate summary for email
    const totalRows = results.reduce((sum, r) => sum + (Array.isArray(r.rows) ? r.rows.length : 0), 0);
    const changes = computePrelacionChanges(results, prevByProperty);
    // Filter out placeholder entries like "Sin filas" to determine if there are real changes
    const realChanges = changes.filter(c => {
      const entrada = String(c.Entrada || '').trim();
      const nota = String(c.Nota || '').trim();
      // Exclude placeholder entries
      if (nota === 'Sin filas' || nota === 'Sin datos' || nota === 'Sin cambios') return false;
      if (entrada.includes('Sin filas') || entrada.includes('Sin datos') || entrada === 'Nota=Sin cambios') return false;
      return entrada.length > 0; // Must have actual content
    });
    // Also check: if no rows were extracted and no previous data, there are no changes
    const hasRealData = results.some(r => Array.isArray(r.rows) && r.rows.length > 0);
    const hasPreviousData = prevByProperty.size > 0 && Array.from(prevByProperty.values()).some(rows => Array.isArray(rows) && rows.length > 0);
    const hasChanges = realChanges.length > 0 && (hasRealData || hasPreviousData);
    const propertyId = properties.length > 0 ? `${properties[0].folio}/${properties[0].codigo}` : 'Unknown';
    
    // Always send completion email if configured (even when no changes)
    console.log('\n📧 Attempting to send completion email...');
    const emailStartTime = Date.now();
    try {
      if (hasError) {
        await Promise.race([
          sendFincaCompletionEmail({
            buildingName: propertyId,
            outputPath: null,
            changesPath: null,
            rowsExtracted: totalRows,
            hasChanges: false,
            error: errorMessage
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Email sending timed out after 90 seconds'));
            }, 90000);
          })
        ]);
      } else {
        await Promise.race([
          sendFincaCompletionEmail({
            buildingName: propertyId,
            outputPath: finalOutputPath,
            changesPath: changesOnlyPath,
            rowsExtracted: totalRows,
            hasChanges
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Email sending timed out after 90 seconds'));
            }, 90000);
          })
        ]);
      }
      const emailElapsed = Date.now() - emailStartTime;
      console.log(`✅ Email notification completed (took ${emailElapsed}ms)\n`);
    } catch (emailErr) {
      const emailElapsed = Date.now() - emailStartTime;
      console.error(`\n⚠️  Failed to send completion email after ${emailElapsed}ms: ${emailErr?.message || String(emailErr)}`);
      if (emailErr?.stack) {
        console.error(`   Stack: ${emailErr.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      console.error('   Continuing without email notification...\n');
    }
    
    await browser.close();
  })().catch(e => { console.error(e); process.exitCode = 1; });
}

export default {
  scrapePropertyIntelPrelacion,
  exportPropertyIntelPrelacionToWorkbook,
  exportPropertyIntelPrelacionChangesOnly,
  setPropertyIntelDebug
};

