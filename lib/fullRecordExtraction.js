/**
 * Extracts every tab on a record beyond the ones the caller already handles
 * (Datos Generales, Prelación, Miembros Relacionados) — reusing scraper.js's
 * proven dynamic tab-discovery + generic DevExpress-grid extraction rather than
 * hardcoding a tab list, so this covers whatever tabs a record type actually has
 * (including ones like "Apoderados" that weren't part of the original narrower
 * scope — see CLAUDE.md, Sept 2026: "monitoring records only cover 2 of several
 * real RP tabs" decision). Shared by both lib/entityRecordExtraction.js and
 * lib/propertyRecordExtraction.js, since both record types use the same tab UI.
 */
import { discoverAvailableTabs, extractTabData } from '../scraper.js';

// "Descargas" is a downloads/document-links tab, not comparable tabular data —
// extracting it would just find no tables and waste an RP round-trip.
const SKIP_TABS = new Set(['Descargas']);

/**
 * @param {import('puppeteer').Page} page - a record modal must already be open
 * @param {string} expectedTitleFragment - folio number (or similar), to pick the right modal if more than one is open
 * @param {string[]} [alreadyHandledTabs] - tab names the caller extracts itself (e.g. ['Prelación', 'Miembros Relacionados'])
 * @returns {Promise<Object<string, object[]>>} { [tabName]: rows[] }
 */
export async function extractAllOtherTabs(page, expectedTitleFragment, alreadyHandledTabs = []) {
  const { tabs } = await extractAllOtherTabsWithOrder(page, expectedTitleFragment, alreadyHandledTabs);
  return tabs;
}

/**
 * Same as extractAllOtherTabs, plus the record's full tab list in the order the
 * Registro Público shows it ("Datos Generales" first, then e.g. Folios Madre,
 * Registro Previo…, Prelación, Miembros Relacionados), so reports can follow the
 * site's own order. Skipped tabs (Descargas) are left out of the order.
 * @returns {Promise<{ tabs: Object<string, object[]>, tabOrder: string[] }>}
 */
export async function extractAllOtherTabsWithOrder(page, expectedTitleFragment, alreadyHandledTabs = []) {
  const exclude = new Set([...alreadyHandledTabs, ...SKIP_TABS]);
  const allTabs = await discoverAvailableTabs(page, expectedTitleFragment);
  const tabs = {};
  for (const tabName of allTabs) {
    if (exclude.has(tabName)) continue;
    tabs[tabName] = await extractTabData(page, tabName, expectedTitleFragment);
  }
  const tabOrder = ['Datos Generales', ...allTabs.filter(t => t !== 'Datos Generales' && !SKIP_TABS.has(t))];
  return { tabs, tabOrder };
}

export default { extractAllOtherTabs, extractAllOtherTabsWithOrder };
