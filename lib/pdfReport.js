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
import { t, formatDateForLang } from './emailTranslations.js';

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
  h3 { font-size: 12px; margin: 14px 0 4px; color: #444; letter-spacing: 0.3px; }
  table.kv td.k { width: 34%; font-weight: bold; color: #444; background: #fafafc; }
  tr.changed td { background: #fff3b0; font-weight: bold; }
  .status { margin-top: 12px; }
  .removed { margin-top: 6px; padding: 8px 12px; background: #fff3b0; border: 1px solid #e6cf6a; font-size: 12px; }
  .removed ul { margin: 4px 0 0 18px; padding: 0; }
  .muted { color: #999; font-style: italic; }
  .disclaimer { margin-top: 32px; padding: 12px; border: 2px solid #e74c3c; background: #fdecea; font-size: 11px; color: #922; }
`;

/**
 * @param {object} record - shape returned by extractEntityFullRecord / extractPropertyFullRecord
 * @param {{ highlights?: object, highlightNote?: string, lang?: 'es'|'en', hasChanges?: boolean,
 *           isFirstRun?: boolean, previousCheckDate?: string, checkDate?: string,
 *           highlightPrelacionRows?: number[] }} [opts]
 *   highlights: from changeDetection.highlightsFor() — empty for a first check.
 */
function buildReportHtml(record, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'es';
  const { prelacion, miembros, tabs = {}, generatedAt } = record;
  const hl = opts.highlights || {
    datosGeneralesKeys: new Set(),
    prelacionRows: opts.highlightPrelacionRows || [],
    miembrosRows: [],
    tabRows: {}
  };
  const dgKeys = hl.datosGeneralesKeys instanceof Set ? hl.datosGeneralesKeys : new Set(hl.datosGeneralesKeys || []);

  // Title: entity name, or "Finca <folio>" for a property; the Registro Público's own
  // record heading (e.g. "(INMUEBLE) PANAMÁ Código de Ubicación 8700, Folio Real Nº 33372 (F)") underneath.
  const isProperty = !record.summary && !miembros;
  const flatDg = record.datosGenerales || {};
  const entityName = record.summary?.NOMBRE || Object.entries(flatDg).find(([k]) => /DENOMINACI/.test(k))?.[1];
  const title = isProperty ? `Finca ${record.folio}` : (entityName || t(lang, 'pdf.defaultTitle'));
  const checkDate = opts.checkDate || (generatedAt ? new Date(generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/Panama' }) : null);

  // Datos Generales: section by section as on the site; older snapshots only have a flat list.
  let datosGeneralesHtml;
  if (Array.isArray(record.datosGeneralesSections) && record.datosGeneralesSections.length) {
    datosGeneralesHtml = record.datosGeneralesSections.map(sec => `
      ${sec.title ? `<h3>${esc(sec.title)}</h3>` : ''}
      <table class="kv"><tbody>
        ${sec.fields.map(f => {
          const key = sec.title ? `${sec.title} › ${f.label}` : f.label;
          return `<tr${dgKeys.has(key) ? ' class="changed"' : ''}><td class="k">${esc(f.label)}</td><td>${esc(f.value)}</td></tr>`;
        }).join('')}
      </tbody></table>`).join('');
  } else {
    const topRows = Object.entries(record.summary || flatDg).filter(([, v]) => v);
    datosGeneralesHtml = topRows.length
      ? `<table class="kv"><tbody>${topRows.map(([k, v]) => `<tr${dgKeys.has(k) ? ' class="changed"' : ''}><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted">${esc(t(lang, 'pdf.noEntries'))}</p>`;
  }

  // Entries that disappeared since the last check: listed under their section, crossed
  // out, so every change in the email also appears in the PDF.
  const removedHtml = name => {
    const rows = (hl.removedRows || {})[name];
    if (!rows || !rows.length) return '';
    const text = r => Object.values(r).map(v => String(v ?? '').trim()).filter(Boolean).join(' — ');
    return `<div class="removed"><strong>${esc(t(lang, 'pdf.removedEntries'))}</strong><ul>${rows.map(r => `<li><s>${esc(text(r))}</s></li>`).join('')}</ul></div>`;
  };

  const renderSection = name => sectionHtml(name) + (name === 'Datos Generales' ? '' : removedHtml(name));
  const sectionHtml = name => {
    if (name === 'Datos Generales') return `<h2>Datos Generales</h2>${datosGeneralesHtml}`;
    if (name === 'Prelación') return `<h2>Prelación</h2>${renderTable(prelacion?.headers, prelacion?.rows, { highlightRowIndexes: new Set(hl.prelacionRows || []), lang })}`;
    if (name === 'Miembros Relacionados') {
      if (!miembros) return '';
      return `<h2>Miembros Relacionados</h2>${renderTable(['Cargo', 'Miembro'], (miembros.rows || []).map(r => ({ Cargo: r.cargo, Miembro: r.miembro })), { highlightRowIndexes: new Set(hl.miembrosRows || []), lang })}`;
    }
    if (name in tabs) return `<h2>${esc(name)}</h2>${renderTable(null, tabs[name], { highlightRowIndexes: new Set((hl.tabRows || {})[name] || []), lang })}`;
    return '';
  };

  // Same order as the record's tabs on the Registro Público (record.tabOrder); older
  // snapshots without it fall back to the previous fixed order. Anything extracted
  // but missing from the order is added at the end so nothing is dropped.
  const order = Array.isArray(record.tabOrder) && record.tabOrder.length
    ? [...record.tabOrder]
    : ['Datos Generales', 'Prelación', 'Miembros Relacionados', ...Object.keys(tabs)];
  for (const name of ['Datos Generales', 'Prelación', ...(miembros ? ['Miembros Relacionados'] : []), ...Object.keys(tabs)]) {
    if (!order.includes(name)) order.push(name);
  }

  // Status line. A first check is a baseline: no "what changed", no highlights, no
  // disclaimer. The legal disclaimer appears only when something actually changed.
  let statusHtml = '';
  if (opts.isFirstRun) {
    statusHtml = `<p class="status">${esc(t(lang, 'pdf.firstCheck'))}</p>`;
  } else if (opts.hasChanges && opts.highlightNote) {
    statusHtml = `<p class="status"><strong>${esc(t(lang, 'pdf.whatChanged'))}</strong> ${esc(opts.highlightNote)}</p>
    <div class="disclaimer">
      <strong>${esc(t(lang, 'pdf.disclaimerImportant'))}</strong> ${esc(t(lang, 'pdf.disclaimerBody'))}
    </div>`;
  } else if (opts.previousCheckDate) {
    statusHtml = `<p class="status">${esc(t(lang, 'pdf.noChangesSince', { previousDate: formatDateForLang(opts.previousCheckDate, lang) }))}</p>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body>
    <h1>${esc(title)}</h1>
    ${record.title ? `<p class="meta">${esc(record.title)}</p>` : ''}
    <p class="meta">${esc(t(lang, 'pdf.reviewLabel'))}: ${esc(checkDate ? formatDateForLang(checkDate, lang) : '')}</p>
    ${statusHtml}
    ${order.map(renderSection).join('\n')}
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
