/**
 * Full-record extraction for a CONFIRMED property (Finca) subscription — the
 * property-side counterpart to lib/entityRecordExtraction.js. Given a confirmed
 * Folio + Código de Ubicación (already confirmed via lib/propertySearch.js during
 * signup), opens that exact record and pulls:
 *   - Datos Generales (owner name, address, etc. — the "who owns this" signal)
 *   - Prelación (pending registration entries — the core "what changed" signal)
 *
 * Reuses lib/propertyintel.js's proven navigation/search internals (the same ones
 * that reliably fetch Folio+Código combos) rather than lib/propertySearch.js, since
 * that file is scoped to signup-time disambiguation search, not full-detail pulls.
 */
import { extractDatosGenerales } from '../scraper.js';
import {
  navigateToInmuebles,
  queryByFolioAndLocationCode,
  openFirstResultModal,
  clickPrelacionTabAndExtract
} from './propertyintel.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * @param {import('puppeteer').Page} page - already logged in
 * @param {{ folio: string, codigo: string }} opts
 * @returns {Promise<{ folio: string, datosGenerales: object, prelacion: {headers:string[], rows:object[], folio:string} }>}
 */
export async function extractPropertyFullRecord(page, { folio, codigo }) {
  if (!folio || !codigo) throw new Error('extractPropertyFullRecord requires both folio and codigo (the confirmed property identifier).');

  await navigateToInmuebles(page);
  const found = await queryByFolioAndLocationCode(page, folio, codigo);
  if (!found) throw new Error(`Folio ${folio} / Código ${codigo} is no longer findable — it may have changed or been removed.`);

  const opened = await openFirstResultModal(page);
  if (!opened) throw new Error(`Could not open the record modal for Folio ${folio} / Código ${codigo}.`);

  // Datos Generales is the tab that's active by default when the modal first opens,
  // so grab it before clicking into Prelación.
  const datosGenerales = await extractDatosGenerales(page, folio);
  await sleep(300);
  const prelacion = await clickPrelacionTabAndExtract(page);

  await page.keyboard.press('Escape').catch(() => {});

  return { folio, datosGenerales, prelacion };
}

export default { extractPropertyFullRecord };
