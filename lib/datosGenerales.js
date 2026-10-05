/**
 * Reads the "Datos Generales" tab of an open Registro Público record exactly as the
 * site shows it: a series of sections (an <h5> heading such as "DATOS DEL FOLIO",
 * "DATOS DEL SISTEMA REGISTRAL ANTERIOR", "DATOS DEL INMUEBLE" or "DATOS DE LA
 * PERSONA JURÍDICA"), each followed by label/value pairs (<dl><dt>/<dd>), in on-page
 * order, empty values included.
 *
 * The record modal renders one ".tabestado" panel per tab and only the active one is
 * visible — reading the first panel (as scraper.js's older extractDatosGenerales did)
 * returned nothing for most records. This clicks the "Datos Generales" tab and reads
 * the visible panel.
 */

/**
 * @param {import('puppeteer').Page} page - a record modal must be open
 * @returns {Promise<{ title: string, sections: { title: string, fields: { label: string, value: string }[] }[] }>}
 */
export async function extractDatosGeneralesSections(page) {
  // The record's tab panels load a moment after the modal opens — wait for them.
  const panelLoaded = () => page.waitForFunction(() => {
    const modal = [...document.querySelectorAll('.blazored-modal-container')].pop();
    return !!modal && [...modal.querySelectorAll('.tabestado')].some(p => p.offsetParent !== null && p.querySelector('dl'));
  }, { timeout: 15000 }).catch(() => null);
  await page.waitForFunction(() => {
    const modal = [...document.querySelectorAll('.blazored-modal-container')].pop();
    return !!modal && [...modal.querySelectorAll('button')].some(b => b.textContent.trim() === 'Datos Generales');
  }, { timeout: 15000 }).catch(() => null);
  await page.evaluate(() => {
    const modal = [...document.querySelectorAll('.blazored-modal-container')].pop();
    const btn = modal && [...modal.querySelectorAll('button')].find(b => b.textContent.trim() === 'Datos Generales');
    if (btn) btn.click();
  });
  await panelLoaded();
  await new Promise(r => setTimeout(r, 300));

  return page.evaluate(() => {
    const modal = [...document.querySelectorAll('.blazored-modal-container')].pop();
    if (!modal) return { title: '', sections: [] };
    const title = (modal.querySelector('.blazored-modal-title')?.textContent || '').trim();
    const panels = [...modal.querySelectorAll('.tabestado')];
    const panel = panels.find(p => p.offsetParent !== null && p.querySelector('dl')) || panels.find(p => p.querySelector('dl'));
    if (!panel) return { title, sections: [] };

    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const sections = [];
    let current = null;
    const walk = el => {
      for (const child of el.children) {
        const tag = child.tagName;
        if (/^H[1-6]$/.test(tag)) {
          current = { title: clean(child.textContent), fields: [] };
          sections.push(current);
        } else if (tag === 'DL') {
          if (!current) { current = { title: '', fields: [] }; sections.push(current); }
          const dts = child.querySelectorAll('dt');
          const dds = child.querySelectorAll('dd');
          for (let i = 0; i < dts.length; i++) {
            current.fields.push({ label: clean(dts[i].textContent).replace(/:$/, ''), value: clean(dds[i]?.textContent) });
          }
        } else if (child.children.length) {
          walk(child);
        }
      }
    };
    walk(panel);
    return { title, sections: sections.filter(s => s.fields.length) };
  });
}

/** Flattens sections into { "SECTION › LABEL": value } for day-over-day comparison. */
export function flattenDatosGenerales(sections) {
  const flat = {};
  for (const s of sections || []) {
    for (const f of s.fields) flat[s.title ? `${s.title} › ${f.label}` : f.label] = f.value;
  }
  return flat;
}

export default { extractDatosGeneralesSections, flattenDatosGenerales };
