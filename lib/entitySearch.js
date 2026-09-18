/**
 * Multi-field entity search & matching for Mercantil (S.A., S.R.L., Corp., Inc.) and
 * Personas/Fundaciones, for the subscription signup flow — the Phase 2 counterpart to
 * lib/propertySearch.js's property (Finca) search. Same idea: search by Name and/or
 * Nº de Identificación (the entity's registration/ficha number), and classify however
 * many results come back so the caller can decide what to show the subscriber:
 *   - 'none' : nothing found
 *   - 'A'    : exactly one match (exact match)
 *   - 'B'    : 2..MAX_LIST_RESULTS matches (show a short list to pick from)
 *   - 'C'    : more than MAX_LIST_RESULTS matches (ask the subscriber to refine)
 *
 * Both fields (Nombre, Nº de Identificación) already exist on the "Datos de la
 * Persona Jurídica" tab but lib/mercantil.js / lib/finca.js only ever use Nombre —
 * this file is the first to use Nº de Identificación.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPuppeteerLib } from './puppet.js';
import * as auth from './auth.js';

try { dotenv.config(); } catch {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEBUG_DIR = './debug-output';
function ensureDebugDir() { try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {} }
let DEBUG_ON = false;
export function setEntitySearchDebug(flag) { DEBUG_ON = !!flag; }
async function saveDebugHTML(page, baseName) {
  if (!DEBUG_ON) return;
  try {
    ensureDebugDir();
    const html = await page.content();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`${DEBUG_DIR}/${baseName}_${ts}.html`, html || '');
  } catch {}
}

const MAX_LIST_RESULTS = 15;

// tipoBusqueda value: 'Mercantil' for corporations (S.A., S.R.L., Corp., Inc.),
// 'Personas' for foundations (Fundaciones). Both land on the same search tab/fields.
async function navigateToEntitySearch(page, tipoBusqueda) {
  await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    return els.some(el => (el.textContent || '').trim().toLowerCase() === 'folios');
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    const folios = els.find(el => (el.textContent || '').trim().toLowerCase() === 'folios');
    if (folios) folios.click();
  });
  await sleep(800);

  await page.waitForSelector('select', { timeout: 15000 });
  await page.evaluate((type) => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => (s.getAttribute('name') || s.id || '').toLowerCase().includes('tipo'));
    if (tipo) { tipo.value = type; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
  }, tipoBusqueda);
  await sleep(800);

  await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const btns = Array.from(document.querySelectorAll('button'));
    const datosBtn = btns.find(b => norm(b.textContent).includes('datos de la persona juridica'));
    if (datosBtn) datosBtn.click();
  });
  await sleep(1200);
}

async function setFieldValue(page, id, value, label) {
  await auth.strictFillInput(page, `#${id}`, value, label || id, { maxAttempts: 8 });
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) el.blur();
  }, id);
  await sleep(400);
}

async function clickBuscar(page) {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const buscar = buttons.find(b => {
      const t = (b.textContent || b.value || '').toLowerCase();
      return t.includes('buscar') && !t.includes('limpiar');
    });
    if (buscar) buscar.click();
  });
}

/** Reads results whether this tab renders a DevExpress grid (dxbs-data-row) or a plain table. */
async function readResultsGrid(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const readHeaderCells = (headerRoot) => {
      const ths = Array.from(headerRoot.querySelectorAll('th, td'));
      return ths.map(th => {
        const a = th.querySelector('a');
        const span = th.querySelector('span');
        const text = a ? (a.innerText || a.textContent || '').trim()
          : span ? (span.innerText || span.textContent || '').trim()
          : (th.innerText || th.textContent || '').trim();
        return text || '';
      }).filter(Boolean);
    };

    let dataRows = Array.from(document.querySelectorAll('tr.dxbs-data-row'));
    let headers = [];
    if (dataRows.length > 0) {
      const headerContainer = document.querySelector('.dxbs-grid-header-container');
      if (headerContainer) headers = readHeaderCells(headerContainer);
      if (!headers.length) {
        const grid = dataRows[0].closest('table');
        const headerRow = grid && (grid.querySelector('tr.dxbs-header-row') || grid.querySelector('thead tr'));
        if (headerRow) headers = readHeaderCells(headerRow);
      }
    } else {
      // Plain table fallback (no DevExpress classes)
      const tables = Array.from(document.querySelectorAll('table'));
      let best = null, bestCount = 0;
      for (const t of tables) {
        const trs = t.querySelectorAll('tbody tr');
        if (trs.length > bestCount) { best = t; bestCount = trs.length; }
      }
      if (best) {
        dataRows = Array.from(best.querySelectorAll('tbody tr'));
        const headerRow = best.querySelector('thead tr');
        if (headerRow) headers = readHeaderCells(headerRow);
      }
    }

    const rows = dataRows.map(tr => Array.from(tr.querySelectorAll('td')).map(td => norm(td.innerText || td.textContent || '')));

    const pagerCandidates = Array.from(document.querySelectorAll('.dxbs-pager, .pagination, [class*="pager"]'));
    const pagerText = pagerCandidates.map(el => norm(el.innerText || el.textContent || '')).filter(Boolean).join(' | ');

    return { headers, rows, pagerText };
  });
}

async function getPageNumberLinks(page) {
  return page.evaluate(() => {
    const pagers = Array.from(document.querySelectorAll('.dxbs-pager, .pagination, [class*="pager"]'));
    const nums = new Set();
    for (const p of pagers) {
      Array.from(p.querySelectorAll('a, span, button')).forEach(el => {
        const t = (el.textContent || '').trim();
        if (/^\d+$/.test(t)) nums.add(Number(t));
      });
    }
    return Array.from(nums).sort((a, b) => a - b);
  });
}

async function clickPageNumber(page, n) {
  return page.evaluate((n) => {
    const pagers = Array.from(document.querySelectorAll('.dxbs-pager, .pagination, [class*="pager"]'));
    for (const p of pagers) {
      const el = Array.from(p.querySelectorAll('a, span, button')).find(e => (e.textContent || '').trim() === String(n));
      if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
    }
    return false;
  }, n);
}

function mapRows(headers, rows) {
  return rows.map(cells => {
    const obj = {};
    if (headers.length) {
      headers.forEach((h, i) => { if (h) obj[h] = cells[i] ?? ''; });
    } else {
      cells.forEach((c, i) => { obj[`Col${i + 1}`] = c; });
    }
    return obj;
  });
}

/**
 * Search Mercantil (S.A., S.R.L., Corp., Inc.) or Personas/Fundaciones by Name and/or
 * Nº de Identificación (registration/ficha number). `entityType` is 'mercantil' or
 * 'fundacion'; at least one of name/idNumber is required.
 */
export async function searchEntityMatches(page, { entityType, name, idNumber } = {}) {
  const n = String(name || '').trim();
  const id = String(idNumber || '').trim();
  if (!n && !id) throw new Error('At least one of name or idNumber is required');

  const tipoBusqueda = entityType === 'fundacion' ? 'Personas' : 'Mercantil';
  await navigateToEntitySearch(page, tipoBusqueda);

  const fieldsToFill = [];
  if (n) fieldsToFill.push(['nombre', n, 'Nombre']);
  if (id) fieldsToFill.push(['numeroIdentificacion', id, 'Nº de Identificación']);

  let allGood = false;
  for (let attempt = 1; attempt <= 3 && !allGood; attempt++) {
    for (const [fid, value, label] of fieldsToFill) {
      await setFieldValue(page, fid, value, label);
    }
    await sleep(300);

    allGood = true;
    for (const [fid, value, label] of fieldsToFill) {
      const read = await page.$eval(`#${fid}`, el => (el && 'value' in el) ? el.value : '').catch(() => '');
      if (String(read).trim() !== String(value).trim()) {
        console.log(`⚠️  [entitySearch] ${label} reads back as "${read}" after filling all fields — retyping everything (attempt ${attempt}/3)`);
        allGood = false;
      }
    }
  }
  if (!allGood) {
    throw new Error('Search fields kept getting cleared before submit — aborting rather than searching with wrong values.');
  }

  await sleep(200);
  await clickBuscar(page);

  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('tr.dxbs-data-row, table tbody tr');
    const bodyText = (document.body.innerText || '').toLowerCase();
    const noResults = bodyText.includes('no se encontraron') || bodyText.includes('sin resultados') || bodyText.includes('no hay datos') || bodyText.includes('no existen') || bodyText.includes('no hay folios');
    return rows.length > 0 || noResults;
  }, { timeout: 15000 }).catch(() => {});
  await sleep(1000);

  await saveDebugHTML(page, 'entitySearch_results');

  let grid = await readResultsGrid(page);
  if (grid.rows.length === 0) {
    return { classification: 'none', count: 0, matches: [], pagerText: grid.pagerText };
  }

  const MAX_EXTRA_PAGES = 4;
  let allRows = grid.rows.slice();
  let cappedOut = false;
  const pageNumbers = await getPageNumberLinks(page);
  for (const pn of pageNumbers) {
    if (pn <= 1) continue;
    if (allRows.length > MAX_LIST_RESULTS) { cappedOut = true; break; }
    if (pn > MAX_EXTRA_PAGES + 1) { cappedOut = true; break; }
    const clicked = await clickPageNumber(page, pn);
    if (!clicked) break;
    await sleep(1200);
    const nextGrid = await readResultsGrid(page);
    if (nextGrid.rows.length === 0) break;
    allRows = allRows.concat(nextGrid.rows);
    if (!grid.headers.length && nextGrid.headers.length) grid = nextGrid;
  }

  const count = cappedOut ? Math.max(allRows.length, MAX_LIST_RESULTS + 1) : allRows.length;
  const matches = mapRows(grid.headers, allRows);

  let classification;
  if (count === 0) classification = 'none';
  else if (count === 1) classification = 'A';
  else if (count <= MAX_LIST_RESULTS) classification = 'B';
  else classification = 'C';

  return { classification, count, matches, pagerText: grid.pagerText };
}

export default { searchEntityMatches, setEntitySearchDebug };

// ---------- CLI runner (for manual testing) ----------
function parseCliArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i]; if (!t.startsWith('--')) continue;
    const eq = t.indexOf('='); const k = t.slice(2, eq > -1 ? eq : undefined);
    const v = eq > -1 ? t.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
    out[k] = v;
  }
  return out;
}

const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && /entitySearch\.js$/.test(process.argv[1] || '');
if (isExecutedDirectly) {
  (async () => {
    const args = parseCliArgs(process.argv);
    if (!args.name && !args.id) {
      console.error('Usage: node lib/entitySearch.js --type=mercantil|fundacion --name="..." --id=XXXXX  (name or id required)');
      process.exit(1);
    }
    if (args.debug) setEntitySearchDebug(true);

    const puppeteerLib = await getPuppeteerLib();
    const browser = await puppeteerLib.launch({
      headless: args.headless === '0' || args.headless === 'false' ? false : (args.headless === undefined ? false : true),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    await auth.restoreSessionCookies(page);
    let loggedIn = await auth.isLoggedIn(page);
    if (!loggedIn) {
      loggedIn = await auth.performLogin(page);
      if (!loggedIn) { console.error('Login failed'); process.exit(1); }
      await auth.saveSessionCookies(page);
    }
    console.log('Logged in:', loggedIn);

    const result = await searchEntityMatches(page, { entityType: args.type, name: args.name, idNumber: args.id });
    console.log('\n=== RESULT ===');
    console.log('Classification:', result.classification, `(${result.count} match${result.count === 1 ? '' : 'es'})`);
    if (result.pagerText) console.log('Pager text seen:', result.pagerText);
    console.log('Matches:');
    console.log(JSON.stringify(result.matches, null, 2));

    await sleep(1500);
    await browser.close();
  })().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
}
