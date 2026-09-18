import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getPuppeteerLib } from './puppet.js';
import * as auth from './auth.js';
import { sendEmail } from './email.js';

// Load env
try { dotenv.config(); } catch {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Reuse functions from finca.js
async function ensureOnBusquedaFolios(page) {
  try {
    if (!/BusquedaFolios/i.test(await page.evaluate(() => location.href))) {
      await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
  } catch {}
}

function isFoundation(name) {
  const t = String(name || '').toLowerCase();
  return /\b(fundacion|fundación|foundation|fund|funda)\b/.test(t);
}

async function navigateToMercantil(page, opts = {}) {
  const searchType = opts?.isFoundation ? 'Personas' : 'Mercantil';
  
  await ensureOnBusquedaFolios(page);
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    return els.some(el => (el.textContent || '').trim() === 'Folios');
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a,button,div'));
    const folios = els.find(el => (el.textContent || '').trim() === 'Folios');
    if (folios && typeof folios.click === 'function') folios.click();
  });
  await sleep(600);
  await page.waitForSelector('select', { timeout: 15000 });
  await page.evaluate((type) => {
    const selects = Array.from(document.querySelectorAll('select'));
    const tipo = selects.find(s => {
      const n = (s.getAttribute('name') || s.id || '').toLowerCase();
      return n.includes('tipobusqueda') || n.includes('tipo');
    });
    if (tipo) {
      tipo.value = type;
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, searchType);
  await sleep(800);
  await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const btns = Array.from(document.querySelectorAll('button'));
    const datosBtn = btns.find(b => norm(b.textContent).includes('datos de la persona juridica'));
    if (datosBtn && typeof datosBtn.click === 'function') datosBtn.click();
  });
  await sleep(1200);
}

async function queryByCorporateName(page, nameRaw) {
  const name = String(nameRaw || '').trim();
  if (!name) return false;
  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    return labels.some(l => /^(nombre:?|nombre)$/i.test((l.textContent || '').trim()));
  }, { timeout: 7000 }).catch(() => {});
  // Find the correct input and return a selector we can reliably type into (with validation)
  const inputSelector = await page.evaluate(() => {
    const norm = (s) => (s || '').toLowerCase().trim();
    const labels = Array.from(document.querySelectorAll('label'));
    let targetInput = null;

    for (const l of labels) {
      const t = norm(l.textContent || '');
      if (t === 'nombre:' || t === 'nombre') {
        const forAttr = (l.getAttribute('for') || '').trim();
        if (forAttr) {
          const byFor = document.getElementById(forAttr);
          if (byFor) { targetInput = byFor; break; }
        }
        const row = l.closest('tr, .row, div');
        if (row) {
          const candidate = row.querySelector('input[type="text"], input');
          if (candidate) { targetInput = candidate; break; }
        }
      }
    }

    if (!targetInput) targetInput = document.querySelector('input[type="text"], input');
    if (!targetInput) return null;

    // Prefer id-based selector when possible
    if (targetInput.id) return `#${targetInput.id}`;
    targetInput.setAttribute('data-ps-input', 'corporateName');
    return 'input[data-ps-input="corporateName"]';
  });

  if (!inputSelector) return false;

  const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  await auth.strictFillInput(page, inputSelector, name, 'Nombre', { normalize: normName, maxAttempts: 8 });
  await auth.lockInputValue(page, inputSelector, name, { normalize: (v) => String(v ?? '') });
  await auth.assertInputValue(page, inputSelector, name, 'Nombre', { normalize: normName });
  await sleep(400);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    const buscar = buttons.find(btn => (btn.textContent || btn.value || '').toLowerCase().includes('buscar'));
    buscar && typeof buscar.click === 'function' && buscar.click();
  });
  const got = await page.waitForFunction(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const ths = Array.from(document.querySelectorAll('table thead th')).map(th => (th.innerText || '').toLowerCase());
    const modal = document.querySelector('.blazored-modal-container');
    return rows.length > 0 || ths.some(t => t.includes('nombre')) || !!modal;
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

// Debug helper
const DEBUG_DIR = './debug-output';
function ensureDebugDir() { try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {} }
async function saveDebugScreenshot(page, baseName) {
  try {
    ensureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `${DEBUG_DIR}/${baseName}_${ts}.png`, fullPage: true }).catch(() => {});
    console.log(`📸 Debug screenshot saved: ${baseName}_${ts}.png`);
  } catch (e) {
    console.log(`⚠️  Could not save screenshot: ${e.message}`);
  }
}
async function saveHTML(page, baseName) {
  try {
    ensureDebugDir();
    const html = await page.content();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`${DEBUG_DIR}/${baseName}_${ts}.html`, html || '');
    console.log(`💾 Debug HTML saved: ${baseName}_${ts}.html`);
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
    const filePath = `${DEBUG_DIR}/${baseName}_${ts}.html`;
    fs.writeFileSync(filePath, modalHTML || '');
    console.log(`💾 Modal HTML saved: ${filePath}`);
  } catch (e) {
    console.log(`⚠️  Could not save modal HTML: ${e.message}`);
  }
}

/**
 * Extract "Datos Generales" section from the modal (similar to finca.js Prelación extraction)
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
  
  // Wait for content to be ready (similar to finca.js)
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
    
    // Find the tabestado div which contains "Datos Del Folio"
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
  let textContent = 'DATOS DEL FOLIO\n\n';
  for (const section of datos) {
    textContent += `${section.title}\n`;
    textContent += '─'.repeat(50) + '\n';
    for (const field of section.fields) {
      textContent += `${field.label}: ${field.value || '(vacío)'}\n`;
    }
    textContent += '\n';
  }
  
  // Format as HTML
  let htmlContent = '<h2>DATOS DEL FOLIO</h2>\n';
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
 * Main function to run intro finca pipeline
 * @param {Object} options
 * @param {string} options.corporateName - Business name to search
 * @param {string} options.email - Email to send PDF to
 * @param {string} [options.username] - Optional username override
 * @param {string} [options.password] - Optional password override
 * @param {boolean} [options.isFoundation] - Explicitly set if this is a foundation (overrides auto-detection)
 * @returns {Promise<Object>} Result with success status and file path
 */
export async function runIntroFincaPipeline({ corporateName, email, username, password, headless, isFoundation: explicitIsFoundation }) {
  const puppeteerLib = await getPuppeteerLib();
  // Default to headless (true), only run headfull if explicitly set to false via --headless 0
  const headlessFlag = headless !== undefined ? headless : (process.env.HEADLESS === '0' || process.env.HEADLESS === 'false' ? false : true);
  
  const browser = await puppeteerLib.launch({
    headless: headlessFlag,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    // Login
    await ensureOnBusquedaFolios(page);
    const okLogin = await auth.isLoggedIn(page);
    if (!okLogin) {
      const ok = await auth.performLogin(page, { username, password });
      if (!ok) throw new Error('Login failed');
    }
    
    // Navigate and search
    const isFoundationType = explicitIsFoundation !== undefined ? explicitIsFoundation : isFoundation(corporateName);
    await navigateToMercantil(page, { isFoundation: isFoundationType });
    const q = await queryByCorporateName(page, corporateName);
    if (!q) {
      throw new Error(`No results found for: ${corporateName}`);
    }
    
    const opened = await openFirstResultModal(page);
    if (!opened) {
      throw new Error(`Could not open modal for: ${corporateName}`);
    }
    
    // Extract folio from title
    const folio = await page.evaluate(() => {
      const title = document.querySelector('.blazored-modal-title')?.textContent || '';
      const match = title.match(/Folio\s*N[°º]?\s*(\d+)/i) || title.match(/Folio\s+Real\s+N[°º]?\s*(\d+)/i);
      return match ? match[1] : '';
    });
    
    // Extract Datos Generales (similar to how finca.js extracts Prelación)
    const datosDelFolio = await extractDatosGenerales(page);
    
    // Close modal
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
    
    // Send email with Datos Del Folio in body
    // If email is explicitly null, skip sending (caller will send email themselves)
    // Otherwise, use provided email, or fall back to environment variables
    let recipients = [];
    if (email === null) {
      console.log('ℹ️  Email sending skipped (email=null) - caller will send email');
    } else {
      const emailToUse = email || process.env.FINCA_EMAIL_RECIPIENTS || process.env.ALERT_EMAILS || '';
      recipients = emailToUse
        .split(/[;,]+/)
        .map(s => s.trim())
        .filter(Boolean);
      
      if (recipients.length > 0) {
        console.log(`📧 Sending Datos Del Folio to ${recipients.join(', ')}...`);
        const emailSent = await sendEmail({
          to: recipients,
          subject: `Business Verification: ${corporateName}`,
          text: `Hello,\n\nPlease review the following business information for ${corporateName}:\n\n${datosDelFolio.text}\n\nPlease confirm if this is the correct business by replying to this email.`,
          html: `
            <h2>Business Verification: ${corporateName}</h2>
            <p>Please review the following business information:</p>
            ${datosDelFolio.html}
            <hr>
            <p><strong>Please confirm if this is the correct business by replying to this email.</strong></p>
          `
        });
        
        if (!emailSent) {
          console.log('⚠️  Email sending failed');
        }
      } else {
        console.log('ℹ️  No email provided (via --email or FINCA_EMAIL_RECIPIENTS/ALERT_EMAILS), data extracted but not emailed');
      }
    }
    
    await browser.close();
    
    return {
      success: true,
      corporateName,
      folio: folio || null,
      datosDelFolio: datosDelFolio, // Return full object with sections, text, and html
      email: recipients.length > 0 ? recipients.join(', ') : null
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// ---------- CLI runner ----------
function parseCliArgs(argv) {
  const out = { name: '', email: '', headless: undefined };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      const k = t.slice(2, eq > -1 ? eq : undefined);
      const v = eq > -1 ? t.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '');
      if (k === 'name') out.name = v;
      else if (k === 'email') out.email = v;
      else if (k === 'headless') out.headless = !(v === '0' || v === 'false');
    } else if (!out.name && !t.startsWith('--')) {
      // First non-flag argument is treated as name
      out.name = t;
    }
  }
  return out;
}

const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && /introFincaPipeline\.js$/.test(process.argv[1] || '');
if (isExecutedDirectly) {
  (async () => {
    const args = parseCliArgs(process.argv);
    const corporateName = args.name || process.env.BUILDING_NAME || process.env.SEARCH_PARAMETER || '';
    // Use provided email, or fall back to environment variables (same as propertyintel)
    const email = args.email || process.env.FINCA_EMAIL_RECIPIENTS || process.env.ALERT_EMAILS || '';
    
    if (!corporateName) {
      console.error('❌ Error: Business/Property name is required');
      console.error('   Usage: node lib/introFincaPipeline.js --name "Business Name" [--email "email@example.com"]');
      console.error('   Or set FINCA_EMAIL_RECIPIENTS or ALERT_EMAILS in .env');
      process.exitCode = 1;
      return;
    }
    
    console.log(`🔍 Searching for: ${corporateName}`);
    if (email) {
      const recipients = email.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
      console.log(`📧 Will send business data to: ${recipients.join(', ')}`);
    } else {
      console.log('ℹ️  No email provided (via --email or FINCA_EMAIL_RECIPIENTS/ALERT_EMAILS), data will be extracted but not emailed');
    }
    
    try {
      const result = await runIntroFincaPipeline({
        corporateName,
        email: email || null,
        username: process.env.RP_USERNAME,
        password: process.env.RP_PASSWORD,
        headless: args.headless !== undefined ? args.headless : undefined
      });
      
      console.log('\n✅ Intro pipeline completed successfully!');
      console.log(`   Corporate Name: ${result.corporateName}`);
      console.log(`   Folio: ${result.folio || 'N/A'}`);
      console.log(`   Sections extracted: ${result.datosDelFolio?.length || 0}`);
      if (result.email) {
        console.log(`   Email sent to: ${result.email}`);
      }
    } catch (error) {
      console.error('\n❌ Intro pipeline failed:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exitCode = 1;
    }
  })().catch(e => {
    console.error('Fatal error:', e);
    process.exitCode = 1;
  });
}

export default {
  runIntroFincaPipeline
};

