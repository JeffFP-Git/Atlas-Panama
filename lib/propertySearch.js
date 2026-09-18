/**
 * Multi-field property (Finca) search & matching, for the subscription signup flow.
 * Returns however many properties match, so the caller can classify the result count
 * (A = exact match, B = a short list to disambiguate, C = too many, ask the subscriber
 * to refine).
 *
 * Two different tabs are used depending on what's supplied:
 *  - Owner name given: the "Datos del Inmueble" tab's "Titularidad" section — the
 *    only place with an owner-name field (Titulares Registrales).
 *  - Folio/Código: the "Datos del folio" tab (the top/default tab — the same one
 *    lib/propertyintel.js already uses reliably).
 *
 * IMPORTANT — do not use the "Datos del Inmueble" tab's "Matriz" section / its
 * numeroFolioInmueble field, ever. It looks like an exact-Folio filter but it is
 * actually a "Finca Madre" (parent parcel) lookup: given a Folio, it returns every
 * child parcel subdivided from that parent, not the one property matching that Folio.
 * This was originally misdiagnosed as a field-reliability bug (a search for Finca
 * 24112 alone returned 17 unrelated-looking rows instead of the real 9) — it wasn't a
 * bug, it was 24112's own child subdivisions plus itself, correctly returned by a
 * search feature we don't need. Per project decision (2026-09), this app has no use
 * for parent/child parcel lookups, so this field is intentionally never used — see
 * the `owner` branch below for how a supplied Folio is ignored when combined with an
 * owner-name search, rather than routed to Matriz.
 *
 * Separately (non-blocking, not investigated): Finca 97213 (the Biltmore condo from
 * earlier building-scraper testing) returns zero matches on the "Datos del folio" tab
 * search alone despite being a real, valid folio (confirmed reachable there via
 * lib/propertyintel.js with Folio+Código together). Folio 26129 works fine folio-alone
 * on that same tab, so this looks specific to 97213 — maybe a legacy "Duplicado ..."
 * Módulo categorization — rather than a bug in this file.
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
export function setPropertySearchDebug(flag) { DEBUG_ON = !!flag; }
async function saveDebugHTML(page, baseName) {
  if (!DEBUG_ON) return;
  try {
    ensureDebugDir();
    const html = await page.content();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`${DEBUG_DIR}/${baseName}_${ts}.html`, html || '');
  } catch {}
}

// Threshold above which we tell the subscriber to refine their search instead of picking from a list.
const MAX_LIST_RESULTS = 15;

async function navigateToDatosDelInmueble(page) {
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
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => (s.getAttribute('name') || s.id || '').toLowerCase().includes('tipo'));
    if (tipo) { tipo.value = 'Inmuebles'; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(800);

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const datosBtn = buttons.find(btn => btn.textContent?.trim() === 'Datos del Inmueble');
    if (datosBtn) datosBtn.click();
  });
  await sleep(1200);
}

// The "Datos del folio" tab is the default/simpler tab (no owner-name field, but a
// proven-reliable numeroFolio/codigoUbicacion pair — used by lib/propertyintel.js
// for weeks without the field-reverting problem seen on "Datos del Inmueble").
async function navigateToDatosDelFolio(page) {
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
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => (s.getAttribute('name') || s.id || '').toLowerCase().includes('tipo'));
    if (tipo) { tipo.value = 'Inmuebles'; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(800);

  // Make sure we're on "Datos del folio" (the default), not "Datos del Inmueble".
  await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const btns = Array.from(document.querySelectorAll('button'));
    const datosFolioBtn = btns.find(b => norm(b.textContent).includes('datos del folio'));
    if (datosFolioBtn && !datosFolioBtn.classList.contains('btn-primary')) datosFolioBtn.click();
  });
  await sleep(1000);
}

async function expandSection(page, sectionName) {
  await page.evaluate((name) => {
    const h5s = Array.from(document.querySelectorAll('h5[style*="cursor:pointer"]'));
    const sec = h5s.find(h5 => (h5.textContent || '').trim() === name);
    if (sec) sec.click();
  }, sectionName);
  await sleep(500);
}

async function setFieldValue(page, id, value, label) {
  // Blazor Server round-trips each keystroke over SignalR; a plain `.value =` assignment
  // doesn't reliably reach the server-side model on this site. Use the same
  // type-and-verify approach the rest of the codebase relies on (auth.strictFillInput).
  await auth.strictFillInput(page, `#${id}`, value, label || id, { maxAttempts: 8 });

  // A bare Número de Folio search (this field is type="number") can pass our own
  // readback check right after typing and then silently revert to empty moments
  // later — neither a JS-dispatched blur() nor a real Tab keypress stopped this.
  // The actual fix: lib/propertyintel.js's queryByFolioAndLocationCode has always
  // used auth.lockInputValue for exactly this class of field ("flaky fields like
  // Folio/Código where dropped characters break the search" per its own doc
  // comment) — it installs listeners that immediately re-correct the value in real
  // time if anything clears it, rather than checking after the fact like our old
  // approach did. That's the piece this file was missing.
  await auth.lockInputValue(page, `#${id}`, value, { durationMs: 5000 });
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

/** Reads the DevExpress results grid: headers + every visible data row on the current page. */
async function readResultsGrid(page) {
  return page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const dataRows = Array.from(document.querySelectorAll('tr.dxbs-data-row'));
    if (dataRows.length === 0) return { headers: [], rows: [], pagerText: '' };

    // DevExpress grids on this site render the header row in a separate sticky
    // container (.dxbs-grid-header-container) that precedes the scrollable body
    // table holding the data rows — the header is NOT inside the same <table> as
    // the data rows. (Same pattern already relied on in lib/propertyintel.js for
    // the Prelación grid.)
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

    let headers = [];
    const grid = dataRows[0].closest('table');
    // The header container is a preceding SIBLING of the body table's wrapper, not an
    // ancestor of it, so a narrow closest()-based search misses it — just query the
    // page for it directly (there's only one results grid visible at a time here).
    const headerContainer = document.querySelector('.dxbs-grid-header-container');
    if (headerContainer) {
      headers = readHeaderCells(headerContainer);
    }
    if (!headers.length && grid) {
      const headerRow = grid.querySelector('tr.dxbs-header-row') || grid.querySelector('thead tr');
      if (headerRow) headers = readHeaderCells(headerRow);
    }

    const rows = dataRows.map(tr => Array.from(tr.querySelectorAll('td')).map(td => norm(td.innerText || td.textContent || '')));

    // DevExpress pagers commonly render a "Página X de Y" or a summary like "1-10 de 47" somewhere near the grid.
    const pagerCandidates = Array.from(document.querySelectorAll('.dxbs-pager, .pagination, .dxbs-pageSizeItem, [class*="pager"]'));
    const pagerText = pagerCandidates.map(el => norm(el.innerText || el.textContent || '')).filter(Boolean).join(' | ');

    return { headers, rows, pagerText };
  });
}

/** Distinct page numbers currently shown by the pager (e.g. [1, 2, 3]). */
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
 * Search the "Datos del Inmueble" tab by any combination of folio, código de ubicación,
 * and/or owner name. Returns a classification so the caller can decide what to show
 * the subscriber:
 *   - 'none' : nothing found
 *   - 'A'    : exactly one match (exact match)
 *   - 'B'    : 2..MAX_LIST_RESULTS matches (show a short list to pick from)
 *   - 'C'    : more than MAX_LIST_RESULTS matches (ask the subscriber to refine)
 */
export async function searchPropertyMatches(page, { folio, codigo, ownerName } = {}) {
  const f = String(folio || '').trim();
  const c = String(codigo || '').trim();
  const owner = String(ownerName || '').trim();
  if (!f && !owner) throw new Error('At least one of folio or ownerName is required');

  if (owner) {
    // Owner name only exists on the "Datos del Inmueble" tab, in the "Titularidad"
    // section. We deliberately do NOT also fill Folio/Código here even if supplied:
    // the only Folio field on this tab lives in the "Matriz" section, and that field
    // is a "Finca Madre" (parent parcel) lookup — given a Folio, it returns every
    // child parcel subdivided from that parent, not an exact-match filter. Combining
    // it with an owner name would silently corrate to unrelated properties. Per
    // project decision, the Matriz tab/field is not used anywhere in this app; if a
    // subscriber gives both Folio and Owner name, only Owner name is used here.
    if (f || c) {
      console.log('⚠️  [propertySearch] Folio/Código supplied alongside an owner name — ignored (Matriz tab is intentionally unused; see comment above).');
    }
    await navigateToDatosDelInmueble(page);
    await expandSection(page, 'Titularidad');
    const fieldsToFill = [['titularesRegistrales', owner, 'Titulares Registrales']];
    return fillFieldsAndClassify(page, fieldsToFill);
  }

  // Folio/Código only, no owner name: use the simpler "Datos del folio" tab instead —
  // its numeroFolio/codigoUbicacion fields have been reliable in every test this
  // session, unlike the equivalent fields on "Datos del Inmueble" (see known-issue
  // note below fillFieldsAndClassify's caller for details of that bug).
  await navigateToDatosDelFolio(page);
  const fieldsToFill = [];
  fieldsToFill.push(['numeroFolio', f, 'Número de Folio']);
  if (c) fieldsToFill.push(['codigoUbicacion', c, 'Código de Ubicación']);
  return fillFieldsAndClassify(page, fieldsToFill);
}

/** Fills the given [id, value, label] fields, submits, paginates, and classifies the result count. */
async function fillFieldsAndClassify(page, fieldsToFill) {
  // Fill every field with real simulated typing (auth.strictFillInput), then verify
  // ALL of them still hold the right value afterward — typing into one field can
  // silently clear an already-filled sibling. If anything got cleared, re-type the
  // whole set again rather than patching just the one field, since a quick raw
  // `.value =` "fix" only updates what we can see in the DOM locally and does NOT
  // reliably reach this Blazor Server app's backing model — that exact shortcut
  // previously caused Buscar to submit with an actually-empty Folio field despite
  // our own readback check reporting success, silently turning a specific-Folio
  // search into an unfiltered default listing.
  let allGood = false;
  for (let attempt = 1; attempt <= 3 && !allGood; attempt++) {
    for (const [id, value, label] of fieldsToFill) {
      await setFieldValue(page, id, value, label);
    }
    await sleep(300);

    allGood = true;
    for (const [id, value, label] of fieldsToFill) {
      const read = await page.$eval(`#${id}`, el => (el && 'value' in el) ? el.value : '').catch(() => '');
      if (String(read).trim() !== String(value).trim()) {
        console.log(`⚠️  [propertySearch] ${label} reads back as "${read}" after filling all fields — retyping everything (attempt ${attempt}/3)`);
        allGood = false;
      }
    }
  }
  if (!allGood) {
    throw new Error('Search fields kept getting cleared before submit — aborting rather than searching with wrong values.');
  }

  await sleep(200);
  await clickBuscar(page);

  // Wait for either the results grid or a "no results" state to settle.
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('tr.dxbs-data-row');
    const bodyText = (document.body.innerText || '').toLowerCase();
    const noResults = bodyText.includes('no se encontraron') || bodyText.includes('sin resultados') || bodyText.includes('no hay datos') || bodyText.includes('no existen') || bodyText.includes('no hay folios');
    return rows.length > 0 || noResults;
  }, { timeout: 15000 }).catch(() => {});
  await sleep(1000);

  await saveDebugHTML(page, 'propertySearch_results');

  let grid = await readResultsGrid(page);

  if (grid.rows.length === 0) {
    return { classification: 'none', count: 0, matches: [], pagerText: grid.pagerText };
  }

  // The pager's text isn't a reliable source of the true total: sometimes it shows
  // "X of Y" (DevExpress default, in English even on this Spanish site), sometimes
  // it's just clickable page-number buttons ("1 2") with no total anywhere. So we
  // instead paginate for real — up to a bounded number of extra pages — accumulating
  // real rows until we either run out of pages or clearly exceed the "show a list"
  // threshold, at which point we stop early (no need to enumerate a 100+ match search
  // just to tell the subscriber "too many, please refine").
  const MAX_EXTRA_PAGES = 4; // covers well past MAX_LIST_RESULTS at any plausible page size
  let allRows = grid.rows.slice();
  let cappedOut = false;
  const pageNumbers = await getPageNumberLinks(page);
  for (const n of pageNumbers) {
    if (n <= 1) continue; // already have page 1
    if (allRows.length > MAX_LIST_RESULTS) { cappedOut = true; break; }
    if (n > MAX_EXTRA_PAGES + 1) { cappedOut = true; break; }
    const clicked = await clickPageNumber(page, n);
    if (!clicked) break;
    await sleep(1200);
    const nextGrid = await readResultsGrid(page);
    if (nextGrid.rows.length === 0) break;
    allRows = allRows.concat(nextGrid.rows);
    if (!grid.headers.length && nextGrid.headers.length) grid = nextGrid; // pick up headers if page 1 missed them
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

export default { searchPropertyMatches, setPropertySearchDebug };

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

const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && /propertySearch\.js$/.test(process.argv[1] || '');
if (isExecutedDirectly) {
  (async () => {
    const args = parseCliArgs(process.argv);
    if (!args.folio && !args.owner) {
      console.error('Usage: node lib/propertySearch.js --folio=XXX [--codigo=YYY] [--owner="Name"]  (folio or owner required)');
      process.exit(1);
    }
    if (args.debug) setPropertySearchDebug(true);

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

    const result = await searchPropertyMatches(page, { folio: args.folio, codigo: args.codigo, ownerName: args.owner });
    console.log('\n=== RESULT ===');
    console.log('Classification:', result.classification, `(${result.count} match${result.count === 1 ? '' : 'es'})`);
    if (result.pagerText) console.log('Pager text seen:', result.pagerText);
    console.log('Matches:');
    console.log(JSON.stringify(result.matches, null, 2));

    await sleep(1500);
    await browser.close();
  })().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
}
