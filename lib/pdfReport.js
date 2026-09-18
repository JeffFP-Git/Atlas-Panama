/**
 * Renders an extracted entity/property record (see lib/entityRecordExtraction.js)
 * into a real PDF file. Rather than trying to intercept the Registro Público site's
 * own "Imprimir" print mechanism (investigated earlier — it's a client-side
 * window.print() on a JS-built popup, not something we can cleanly grab bytes from),
 * we build our own clean HTML report from the structured data we already extracted,
 * and use Puppeteer's own PDF rendering on that. This also gives us full control for
 * highlighting changed rows later.
 */
import fs from 'fs';
import path from 'path';
import { t } from './emailTranslations.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTable(headers, rows, opts = {}) {
  const { highlightRowIndexes = new Set(), lang = 'es' } = opts;
  if (!rows || rows.length === 0) return `<p class="muted">${esc(t(lang, 'pdf.noEntries'))}</p>`;
  const cols = headers && headers.length ? headers : Object.keys(rows[0]);
  const headHtml = cols.map(h => `<th>${esc(h)}</th>`).join('');
  const bodyHtml = rows.map((row, i) => {
    const cells = cols.map(c => `<td>${esc(row[c])}</td>`).join('');
    const cls = highlightRowIndexes.has(i) ? ' class="changed"' : '';
    return `<tr${cls}>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

const REPORT_CSS = `
  body { font-family: -apple-system, Arial, sans-serif; color: #222; padding: 24px; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin-top: 28px; margin-bottom: 8px; border-bottom: 2px solid #667eea; padding-bottom: 4px; }
  .meta { color: #666; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { background: #f0f0f8; }
  tr.changed td { background: #fff3b0; font-weight: bold; }
  .muted { color: #999; font-style: italic; }
  .disclaimer { margin-top: 32px; padding: 12px; border: 2px solid #e74c3c; background: #fdecea; font-size: 11px; color: #922; }
`;

/**
 * @param {object} record - shape returned by extractEntityFullRecord (or the property equivalent)
 * @param {{ highlightPrelacionRows?: number[], highlightNote?: string, lang?: 'es'|'en' }} [opts]
 */
function buildReportHtml(record, opts = {}) {
  // Entity records (lib/entityRecordExtraction.js) use `summary` + `miembros`;
  // property records (lib/propertyRecordExtraction.js) use `datosGenerales` and
  // have no members section. Handle both shapes.
  const lang = opts.lang === 'en' ? 'en' : 'es';
  const { prelacion, miembros, generatedAt } = record;
  const topSection = record.summary || record.datosGenerales || {};
  const highlightRowIndexes = new Set(opts.highlightPrelacionRows || []);
  const topRows = Object.entries(topSection).filter(([, v]) => v);
  const title = topSection.NOMBRE || topSection.PROPIETARIO || topSection.PROPIETARIOS || t(lang, 'pdf.defaultTitle');

  return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body>
    <h1>${esc(title)}</h1>
    <p class="meta">Folio: ${esc(record.folio)} &nbsp;|&nbsp; ${esc(t(lang, 'pdf.generatedLabel'))}: ${esc(generatedAt || new Date().toISOString())}</p>

    <h2>Datos Generales</h2>
    <table><tbody>
      ${topRows.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join('')}
    </tbody></table>

    <h2>Prelación</h2>
    ${renderTable(prelacion?.headers, prelacion?.rows, { highlightRowIndexes, lang })}

    ${miembros ? `<h2>Miembros Relacionados</h2>
    ${renderTable(['Cargo', 'Miembro'], (miembros?.rows || []).map(r => ({ Cargo: r.cargo, Miembro: r.miembro })), { lang })}` : ''}

    ${opts.highlightNote ? `<p style="margin-top:16px;"><strong>${esc(t(lang, 'pdf.whatChanged'))}</strong> ${esc(opts.highlightNote)}</p>` : ''}

    <div class="disclaimer">
      <strong>${esc(t(lang, 'pdf.disclaimerImportant'))}</strong> ${esc(t(lang, 'pdf.disclaimerBody'))}
    </div>
  </body></html>`;
}

/**
 * Renders the record to a PDF file on disk.
 * @param {import('puppeteer').Browser} browser - an already-launched Puppeteer browser
 * @param {object} record
 * @param {string} outputPath
 * @param {object} [opts]
 */
export async function renderRecordToPdf(browser, record, outputPath, opts = {}) {
  const html = buildReportHtml(record, opts);
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await page.pdf({ path: outputPath, format: 'Letter', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
  } finally {
    await page.close();
  }
  return outputPath;
}

export default { renderRecordToPdf };
