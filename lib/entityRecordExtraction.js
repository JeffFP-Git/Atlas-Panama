/**
 * Full-record extraction for a CONFIRMED Mercantil/Fundación subscription (used by
 * the daily monitoring job, not the signup-time search). Given an entity's RUC
 * (already confirmed via lib/entitySearch.js during signup), this opens that exact
 * record and pulls the two tabs we need for change detection:
 *   - Prelación (pending registration entries — the core "what changed" signal)
 *   - Miembros Relacionados (board members / Agente Residente / dignatarios)
 *
 * This is new code — lib/entitySearch.js only finds/confirms *which* entity a
 * subscriber means, it doesn't pull this level of detail.
 */
import { searchEntityMatches } from './entitySearch.js';
import { openFirstMercantilResult, extractMercantilMembers } from './mercantil.js';
import { clickPrelacionTabAndExtract } from './finca.js';

/**
 * @param {import('puppeteer').Page} page - already logged in
 * @param {{ entityType: 'mercantil'|'fundacion', ruc: string }} opts
 * @returns {Promise<{ folio: string, summary: object, prelacion: {headers:string[], rows:object[], folio:string}, miembros: {mercantilFolio:string, rows:{cargo:string, miembro:string}[]} }>}
 */
export async function extractEntityFullRecord(page, { entityType, ruc }) {
  if (!ruc) throw new Error('extractEntityFullRecord requires a RUC (the confirmed entity identifier).');

  const searchResult = await searchEntityMatches(page, { entityType, idNumber: ruc });
  if (searchResult.classification !== 'A') {
    throw new Error(`Expected exactly one match for RUC ${ruc} but got classification ${searchResult.classification} (${searchResult.count} matches) — the entity may no longer be findable by this RUC.`);
  }
  const summary = searchResult.matches[0];

  const opened = await openFirstMercantilResult(page);
  if (!opened) throw new Error(`Could not open the record modal for RUC ${ruc}.`);

  const prelacion = await clickPrelacionTabAndExtract(page);
  const miembros = await extractMercantilMembers(page);

  await page.keyboard.press('Escape').catch(() => {});

  return {
    folio: summary['FOLIO'] || prelacion.folio || miembros.mercantilFolio || '',
    summary,
    prelacion,
    miembros
  };
}

export default { extractEntityFullRecord };
