import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPuppeteerLib } from './puppet.js';
import * as auth from './auth.js';
import { sendEmail } from './email.js';
import * as pdfjsLib from './pdfjs-dist-pdf.mjs';

// Load env
try { dotenv.config(); } catch {}

// Set up pdf.js worker (similar to scraper.js)
try {
  const pdfWorkerSrc = new URL('./pdfjs-dist-worker.mjs', import.meta.url).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
} catch (e) {
  // Fallback if worker path fails
  console.log('⚠️  Could not set pdf.js worker path, PDF validation may not work');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Debug functions
const DEBUG_DIR = './debug-output';
function ensureDebugDir() { try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {} }
async function saveDebugScreenshot(page, baseName) {
  try {
    ensureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `${DEBUG_DIR}/${baseName || 'intro_propertyintel'}_${ts}.png`, fullPage: true }).catch(() => {});
    console.log(`📸 Debug screenshot saved: ${baseName || 'intro_propertyintel'}_${ts}.png`);
  } catch (e) {
    console.log(`⚠️  Could not save screenshot: ${e.message}`);
  }
}
async function saveHTML(page, baseName) {
  try {
    ensureDebugDir();
    const html = await page.content();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${DEBUG_DIR}/${baseName || 'intro_propertyintel'}_${ts}.html`;
    fs.writeFileSync(filePath, html || '');
    console.log(`💾 Debug HTML saved: ${filePath}`);
  } catch (e) {
    console.log(`⚠️  Could not save HTML: ${e.message}`);
  }
}
async function saveModalHTML(page, baseName) {
  try {
    ensureDebugDir();
    const modalHTML = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const visible = modals.filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      const active = visible.length > 0 ? visible[visible.length - 1] : null;
      return active ? active.innerHTML : '';
    });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${DEBUG_DIR}/${baseName || 'modal'}_${ts}.html`;
    fs.writeFileSync(filePath, modalHTML || '');
    console.log(`💾 Modal HTML saved: ${filePath}`);
  } catch (e) {
    console.log(`⚠️  Could not save modal HTML: ${e.message}`);
  }
}

// Reuse functions from propertyintel.js
async function ensureOnBusquedaFolios(page) {
  try {
    if (!/BusquedaFolios/i.test(await page.evaluate(() => location.href))) {
      await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
  } catch {}
}

async function navigateToInmuebles(page) {
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

// Use the exact robust typing/verification logic from auth.js for ALL inputs
const clearAndTypeWithVerification = auth.clearAndTypeWithVerification;

async function queryByFolioAndLocationCode(page, folioNumber, locationCode) {
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

  // Fill in Número de Folio if provided (strict)
  if (folio) {
    await auth.strictFillInput(page, '#numeroFolio', folio, 'Número de Folio', { normalize: digitsOnly, maxAttempts: 8 });
    await sleep(300);
  }

  // Fill in Código de Ubicación if provided (strict)
  if (codigo) {
    await auth.strictFillInput(page, '#codigoUbicacion', codigo, 'Código de Ubicación', { normalize: digitsOnly, maxAttempts: 8 });
    await sleep(300);
  }
  
  // Some RP pages clear inputs on blur/change right before clicking Buscar.
  // Install a short-lived "value lock" so if the page clears the field, it snaps back.
  await page.evaluate((folioVal, codigoVal) => {
    const locks = [];
    const lock = (sel, expected) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const exp = String(expected ?? '');
      const handler = () => {
        // If the page clears/changes it, restore immediately
        if (String(el.value ?? '') !== exp) {
          el.value = exp;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      // Capture phase to run before site handlers when possible
      el.addEventListener('input', handler, true);
      el.addEventListener('change', handler, true);
      el.addEventListener('blur', handler, true);
      locks.push({ el, handler });
    };
    if (folioVal) lock('#numeroFolio', folioVal);
    if (codigoVal) lock('#codigoUbicacion', codigoVal);
    // Remove locks after ~2s (enough to survive the click)
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

  // Immediately before clicking, force-set values again (no submit unless they read back correctly)
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

  // Final gate: if either field is present but not correct, abort BEFORE clicking Buscar
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

async function openFirstResultModal(page) {
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

async function waitForModalReady(page) {
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
}

/**
 * Extract "Datos Generales" section from the modal (same logic as introFincaPipeline.js)
 * Returns formatted text and HTML for email
 */
async function extractDatosGenerales(page) {
  console.log('📋 Extracting Datos Generales...');
  
  // Ensure we're on the "Datos Generales" tab (should be default, but verify)
  await waitForModalReady(page);
  
  // Make sure "Datos Generales" tab is active
  const tabClicked = await page.evaluate(() => {
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
      return t.includes('datos generales') && b.classList.contains('btn-primary');
    });
    // If already active, return true; otherwise try to click it
    if (match && match.classList.contains('btn-primary')) {
      return true; // Already active
    }
    // Find and click "Datos Generales" tab
    const datosGeneralesBtn = candidates.find(b => {
      const t = norm(b.textContent || b.innerText || '');
      return t.includes('datos generales');
    });
    if (datosGeneralesBtn) {
      try {
        datosGeneralesBtn.scrollIntoView({ block: 'center' });
        datosGeneralesBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        datosGeneralesBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        datosGeneralesBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      } catch {
        try { datosGeneralesBtn.click(); return true; } catch {}
      }
    }
    return false;
  });
  
  if (tabClicked) {
    await sleep(800);
  }
  
  // Wait for content to be ready (similar to introFincaPipeline.js)
  await page.waitForFunction(() => {
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
    // Check if tabestado div exists with content
    const tabestado = active.querySelector('.tabestado');
    if (!tabestado) return false;
    const h5s = tabestado.querySelectorAll('h5');
    return h5s.length > 0;
  }, { timeout: 10000 }).catch(() => {});
  
  await saveDebugScreenshot(page, 'modal_datos_generales');
  await saveModalHTML(page, 'modal_datos_generales');
  
  const datos = await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
    const visible = modals.filter(m => {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    });
    const active = visible.length > 0 ? visible[visible.length - 1] : document.body;
    if (!active) return null;
    
    // Find the tabestado div which contains "Datos Del Folio" or "Datos Generales"
    const tabestado = active.querySelector('.tabestado');
    if (!tabestado) return null;
    
    // Extract all sections
    const sections = [];
    const h5s = Array.from(tabestado.querySelectorAll('h5'));
    
    for (const h5 of h5s) {
      const sectionTitle = h5.textContent.trim();
      const section = { title: sectionTitle, fields: [] };
      
      // Get the dl (definition list) that follows this h5
      let current = h5.nextElementSibling;
      while (current && current.tagName !== 'H5') {
        if (current.tagName === 'HR') {
          current = current.nextElementSibling;
          continue;
        }
        if (current.classList.contains('dl-horizontal')) {
          const dts = Array.from(current.querySelectorAll('dt'));
          const dds = Array.from(current.querySelectorAll('dd'));
          
          for (let i = 0; i < dts.length; i++) {
            const label = dts[i].textContent.trim();
            const value = dds[i] ? dds[i].textContent.trim() : '';
            section.fields.push({ label, value });
          }
          break;
        }
        current = current.nextElementSibling;
      }
      
      if (section.fields.length > 0) {
        sections.push(section);
      }
    }
    
    return sections;
  });
  
  if (!datos || datos.length === 0) {
    // Save debug info
    await saveDebugScreenshot(page, 'modal_extraction_failed');
    await saveModalHTML(page, 'modal_extraction_failed');
    throw new Error('Could not extract Datos Generales from modal');
  }
  
  console.log(`✅ Extracted ${datos.length} sections from Datos Generales`);
  
  // Format as text
  let textContent = 'DATOS DEL INMUEBLE\n\n';
  for (const section of datos) {
    textContent += `${section.title}\n`;
    textContent += '─'.repeat(50) + '\n';
    for (const field of section.fields) {
      textContent += `${field.label}: ${field.value || '(vacío)'}\n`;
    }
    textContent += '\n';
  }
  
  // Format as HTML
  let htmlContent = '<h2>DATOS DEL INMUEBLE</h2>\n';
  for (const section of datos) {
    htmlContent += `<h3>${section.title}</h3>\n`;
    htmlContent += '<hr>\n';
    htmlContent += '<dl style="margin: 10px 0;">\n';
    for (const field of section.fields) {
      htmlContent += `  <dt style="font-weight: bold; margin-top: 8px;">${field.label}</dt>\n`;
      htmlContent += `  <dd style="margin-left: 20px; margin-bottom: 8px;">${field.value || '<em>(vacío)</em>'}</dd>\n`;
    }
    htmlContent += '</dl>\n';
  }
  
  return {
    sections: datos,
    text: textContent,
    html: htmlContent
  };
}


/**
 * Main function to run intro property intel pipeline
 * @param {Object} options
 * @param {string} options.folioNumber - Folio number to search
 * @param {string} options.locationCode - Location code to search
 * @param {string} [options.email] - Email to send data to (if not provided, uses INTRO_PROPERTY_INTEL_EMAIL_RECIPIENTS, INTRO_PROPERTY_INTEL_EMAIL, ALERT_EMAILS, or FINCA_EMAIL_RECIPIENTS from .env)
 * @param {string} [options.username] - Optional username override
 * @param {string} [options.password] - Optional password override
 * @returns {Promise<Object>} Result with success status and extracted data
 */
export async function runIntroPropertyIntelPipeline({ folioNumber, locationCode, email, username, password, headless }) {
  const puppeteerLib = await getPuppeteerLib();
  // Default to headless (true), only run headfull if explicitly set to false via --headless 0
  const headlessFlag = headless !== undefined ? headless : (process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true);
  
  const browser = await puppeteerLib.launch({
    headless: headlessFlag,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    // Login (same pattern as propertyintel.js and finca.js)
    await ensureOnBusquedaFolios(page);
    const okLogin = await auth.isLoggedIn(page);
    if (!okLogin) {
      const ok = await auth.performLogin(page, { username, password });
      if (!ok) throw new Error('Login failed');
    }
    
    // Navigate and search
    await navigateToInmuebles(page);
    const q = await queryByFolioAndLocationCode(page, folioNumber, locationCode);
    if (!q) {
      throw new Error(`No results found for Folio: ${folioNumber}, Location Code: ${locationCode}`);
    }
    
    const opened = await openFirstResultModal(page);
    if (!opened) {
      throw new Error(`Could not open modal for Folio: ${folioNumber}, Location Code: ${locationCode}`);
    }
    
    // Extract folio for reference
    const folio = await page.evaluate(() => {
      const title = document.querySelector('.blazored-modal-title')?.textContent || '';
      const match = title.match(/Folio\s*N[°º]?\s*(\d+)/i) || title.match(/Folio\s+Real\s+N[°º]?\s*(\d+)/i);
      return match ? match[1] : '';
    });
    
    // Extract Datos Generales (same as introFincaPipeline.js)
    const datosDelInmueble = await extractDatosGenerales(page);
    
    // Close modal
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
    
    // Send email with Datos Del Inmueble in body
    // If email is explicitly null, skip sending (caller will send email themselves)
    // Otherwise, use provided email, or fall back to environment variables (same as introFincaPipeline.js)
    let recipients = [];
    if (email === null) {
      console.log('ℹ️  Email sending skipped (email=null) - caller will send email');
    } else {
      const emailToUse = email || process.env.INTRO_PROPERTY_INTEL_EMAIL_RECIPIENTS || process.env.INTRO_PROPERTY_INTEL_EMAIL || process.env.ALERT_EMAILS || process.env.FINCA_EMAIL_RECIPIENTS || '';
      recipients = emailToUse
        .split(/[;,]+/)
        .map(s => s.trim())
        .filter(Boolean);
      
      if (recipients.length > 0) {
        console.log(`📧 Sending Datos Del Inmueble to ${recipients.join(', ')}...`);
        const emailSent = await sendEmail({
          to: recipients,
          subject: `Property Verification: Folio ${folioNumber}, Location Code ${locationCode}`,
          text: `Hello,\n\nPlease review the following property information for Folio ${folioNumber}, Location Code ${locationCode}:\n\n${datosDelInmueble.text}\n\nPlease confirm if this is the correct property by replying to this email.`,
          html: `
            <h2>Property Verification: Folio ${folioNumber}, Location Code ${locationCode}</h2>
            <p>Please review the following property information:</p>
            ${datosDelInmueble.html}
            <hr>
            <p><strong>Please confirm if this is the correct property by replying to this email.</strong></p>
          `
        });
        
        if (!emailSent) {
          console.log('⚠️  Email sending failed');
        }
      } else {
        console.log('ℹ️  No email provided (via --email or INTRO_PROPERTY_INTEL_EMAIL_RECIPIENTS/INTRO_PROPERTY_INTEL_EMAIL/ALERT_EMAILS/FINCA_EMAIL_RECIPIENTS), data extracted but not emailed');
      }
    }
    
    await browser.close();
    
    return {
      success: true,
      folioNumber,
      locationCode,
      folio: folio || null,
      datosDelInmueble: datosDelInmueble, // Return full object with sections, text, and html
      email: recipients.length > 0 ? recipients.join(', ') : null
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// ---------- CLI runner ----------
function parseCliArgs(argv) {
  const out = { folioNumber: '', locationCode: '', email: '', max: undefined };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i]; if (!t.startsWith('--')) continue;
    const eq = t.indexOf('='); const k = t.slice(2, eq > -1 ? eq : undefined);
    const v = eq > -1 ? t.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
    if (k === 'folio' || k === 'folioNumber') out.folioNumber = v;
    else if (k === 'codigo' || k === 'codigoUbicacion' || k === 'locationCode') out.locationCode = v;
    else if (k === 'email') out.email = v;
    else if (k === 'max') out.max = Number(v);
    else if (k === 'headless') out.headless = !(v === '0' || v === 'false');
  }
  return out;
}

const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && /introPropertyIntelPipeline\.js$/.test(process.argv[1] || '');
if (isExecutedDirectly) {
  (async () => {
    const args = parseCliArgs(process.argv);
    
    // Support environment variables as fallback
    const folioNumber = args.folioNumber || process.env.FOLIO_NUMBER || process.env.FOLIO || '';
    const locationCode = args.locationCode || process.env.LOCATION_CODE || process.env.CODIGO_UBICACION || process.env.CODIGO || '';
    const email = args.email || '';
    
    if (!folioNumber && !locationCode) {
      console.error('❌ No property specified. Use --folio=XXX --codigo=YYY or set FOLIO_NUMBER and LOCATION_CODE env vars.');
      process.exit(1);
    }
    
    // Check if email recipients are configured in .env
    const envRecipients = (process.env.INTRO_PROPERTY_INTEL_EMAIL_RECIPIENTS || process.env.INTRO_PROPERTY_INTEL_EMAIL || process.env.ALERT_EMAILS || process.env.FINCA_EMAIL_RECIPIENTS || '')
      .split(/[;,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    
    if (!email && envRecipients.length === 0) {
      console.log('⚠️  No email recipient specified. Data will be extracted but not emailed.');
      console.log('   Set INTRO_PROPERTY_INTEL_EMAIL_RECIPIENTS, INTRO_PROPERTY_INTEL_EMAIL, ALERT_EMAILS, or FINCA_EMAIL_RECIPIENTS in .env or use --email=address@example.com');
    }
    
    try {
      const result = await runIntroPropertyIntelPipeline({
        folioNumber,
        locationCode,
        email,
        username: process.env.RP_USERNAME,
        password: process.env.RP_PASSWORD,
        headless: args.headless !== undefined ? args.headless : undefined
      });
      
      console.log('\n✅ Intro Property Intel Pipeline completed successfully!');
      console.log(`   Folio Number: ${result.folioNumber}`);
      console.log(`   Location Code: ${result.locationCode}`);
      console.log(`   Extracted Folio: ${result.folio || 'N/A'}`);
      console.log(`   Sections extracted: ${result.datosDelInmueble?.length || 0}`);
      if (result.email) {
        console.log(`   Email sent to: ${result.email}`);
      }
    } catch (error) {
      console.error('\n❌ Intro Property Intel Pipeline failed:');
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
      process.exitCode = 1;
    }
  })().catch(e => { console.error(e); process.exitCode = 1; });
}

export default {
  runIntroPropertyIntelPipeline
};

