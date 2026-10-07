#!/usr/bin/env node
// Builds the "what an alert looks like" images shown on the signup page, from a
// FICTIONAL property (no real person or record), using the real email wording and
// the real PDF renderer so the samples match what subscribers actually receive:
//   public/images/sample-alert-email-es.png / -en.png
//   public/images/sample-alert-pdf-es.png   / -en.png
// Rerun after changing the alert email or PDF layout:  node scripts/build-sample-alert.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer';
import { renderRecordToPdf } from '../lib/pdfReport.js';
import { t } from '../lib/emailTranslations.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'images');
const TMP = fs.mkdtempSync(path.join(ROOT, 'debug-output', 'sample-'));

const NEW_ROW = { 'Nº de Entrada': '512345/2026 (0)', 'Tipo de Entrada': 'Registro', 'Trámite': 'COMPRAVENTA, Derechos de Calificación', 'Estado': 'En Calificación', 'Documentos': '' };
const record = {
  folio: '412987',
  codigo: '8708',
  title: '(INMUEBLE) PANAMÁ Código de Ubicación 8708, Folio Real Nº 412987 (F)',
  datosGeneralesV2: true,
  datosGeneralesSections: [
    { title: 'DATOS DEL FOLIO', fields: [
      { label: 'FOLIO / FINCA / FICHA', value: '(INMUEBLE) PANAMÁ Código de Ubicación 8708, Folio Real Nº 412987 (F)' },
      { label: 'FECHA DE INSCRIPCIÓN', value: '14/06/2011' }] },
    { title: 'DATOS DEL INMUEBLE', fields: [
      { label: 'PROPIETARIO', value: 'INVERSIONES EJEMPLO, S.A. (Propiedad)' },
      { label: 'DOMICILIO', value: 'PH EJEMPLO TOWER, APTO 12-B, CORREGIMIENTO SAN FRANCISCO, DISTRITO PANAMÁ, PROVINCIA PANAMÁ' },
      { label: 'VALOR', value: '185000.00' },
      { label: 'SUPERFICIE INICIAL', value: '142 m² 50 dm²' }] }
  ],
  prelacion: {
    headers: ['Nº de Entrada', 'Tipo de Entrada', 'Trámite', 'Estado', 'Documentos'],
    rows: [
      { 'Nº de Entrada': '203911/2011 (0)', 'Tipo de Entrada': 'Registro', 'Trámite': 'COMPRAVENTA, Derechos de Calificación', 'Estado': 'Listo para entrega como Trámite Agotado', 'Documentos': '' },
      { 'Nº de Entrada': '98422/2019 (0)', 'Tipo de Entrada': 'Registro', 'Trámite': 'CANCELACIÓN DE HIPOTECA, Derechos de Calificación', 'Estado': 'Listo para entrega como Trámite Agotado', 'Documentos': '' },
      NEW_ROW
    ]
  },
  tabs: {
    'Registro Electrónico Vigentes': [
      { 'Derechos / Actos / Otras Operaciones': 'Propiedad a favor de INVERSIONES EJEMPLO, S.A. Asiento Electrónico Nº 1 (Migración a Folio Electrónico)', 'Fecha': '22/03/2016' }
    ]
  },
  tabOrder: ['Datos Generales', 'Registro Electrónico Vigentes', 'Prelación']
};

const changeLine = {
  es: `Prelación: la entrada ${NEW_ROW['Nº de Entrada']} (${NEW_ROW['Trámite']}) ahora muestra el estado "${NEW_ROW['Estado']}".`,
  en: `Prelación: entry ${NEW_ROW['Nº de Entrada']} (${NEW_ROW['Trámite']}) now shows status "${NEW_ROW['Estado']}".`
};

function emailHtml(lang) {
  const displayName = 'Finca 412987';
  const subject = t(lang, 'digest.subjectOneChange', { displayName });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #eef0f5; font-family: -apple-system, Arial, sans-serif; }
    .mail { width: 560px; margin: 0 auto; background: #fff; }
    .hdr { padding: 16px 20px; border-bottom: 1px solid #e3e3e8; }
    .subj { font-size: 17px; font-weight: 700; color: #222; margin-bottom: 8px; }
    .from { font-size: 13px; color: #555; }
    .body { padding: 6px 20px 18px; font-size: 14px; color: #333; line-height: 1.5; }
    .att { display: inline-block; margin: 6px 0 4px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; color: #333; background: #fafafa; }
  </style></head><body><div class="mail">
    <div class="hdr"><div class="subj">${subject}</div>
      <div class="from"><strong>Atlas Panama</strong> &lt;monitoring@atlaspanama.com&gt;</div></div>
    <div class="body">
      <p>${t(lang, 'digest.introOneChangeOne', { displayName })}</p>
      <div style="border:2px solid #d93025;background:#fdecea;border-radius:8px;padding:12px 16px;margin:12px 0;"><p style="margin:0 0 6px 0;color:#a50e0e;"><strong>${t(lang, 'digest.itemChangeHeader', { displayName })}</strong></p><ul style="margin:0;"><li>${changeLine[lang]}</li></ul></div>
      ${t(lang, 'monitor.disclaimerHtml')}
      <div class="att">📎 Finca 412987 - Registro Publico revision 2026-10-06.pdf</div>
    </div></div></body></html>`;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const lang of ['es', 'en']) {
  // Email
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 2 });
  await page.setContent(emailHtml(lang), { waitUntil: 'domcontentloaded' });
  const mail = await page.$('.mail');
  await mail.screenshot({ path: path.join(OUT, `sample-alert-email-${lang}.png`) });
  await page.close();

  // PDF page 1 → PNG
  const pdfPath = path.join(TMP, `sample-${lang}.pdf`);
  await renderRecordToPdf(browser, record, pdfPath, {
    lang,
    hasChanges: true,
    highlightNote: changeLine[lang],
    highlights: { datosGeneralesKeys: new Set(), prelacionRows: [2], miembrosRows: [], tabRows: {} },
    checkDate: '2026-10-06',
    previousCheckDate: '2026-10-05'
  });
  execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', pdfPath, path.join(OUT, `sample-alert-pdf-${lang}`)]);
  console.log(`Wrote sample-alert-email-${lang}.png and sample-alert-pdf-${lang}.png`);
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
