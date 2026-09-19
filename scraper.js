#!/usr/bin/env node

import puppeteer from 'puppeteer';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  loadPreviousRunData,
  computePropertyChanges,
  exportChangesWorkbook
} from './lib/changeTracker.js';
import * as pdfjsLib from './lib/pdfjs-dist-pdf.mjs';
import * as auth from './lib/auth.js';
import { runContactSearchForProperties } from './lib/contactSearch.js';
import { enrichPropertiesWithMercantil, buildMercantilSheetRows } from './lib/mercantil.js';
import { sendMainScraperCompletionEmail } from './lib/email.js';

dotenv.config();

const COMPRAVENTA_KEYWORDS = [
  'compraventa',
  'compra venta',
  'compra-venta',
  'compra/venta',
  'compraventa de bien inmueble'
];
const HIPOTECA_KEYWORDS = [
  'hipoteca',
  'hipoteca a favor de',
  'constitucion de hipoteca',
  'constitución de hipoteca',
  'constitucion de hipoteca de bien inmueble',
  'constitución de hipoteca de bien inmueble'
];
const VALOR_OPERACION_LABEL = 'VALOR DE LA OPERACIÓN';
const MONTO_HIPOTECA_LABEL = 'MONTO DE HIPOTECA';
const TRASPASO_LABEL = 'VALOR DEL TRASPASO';
const PLAZO_LABEL = 'PLAZO';
const TASA_INTERES_LABEL = 'TASA DE INTERES';
const PDF_DEBUG_MODE = false;
const PDF_FETCH_TIMEOUT_MS = 20000;
// Feature default: Contact Search Mode (can be overridden by CLI/env)
const CONTACT_MODE = false;

const pdfWorkerSrc = new URL('./lib/pdfjs-dist-worker.mjs', import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ===== CONFIGURATION =====
const BUILDING_NAME = 'Ocean Waves';
const SEARCH_PARAMETER = 'Ocean Waves';
// Feature toggles
const ENABLE_HIPOTECA_EXTRACTION = false; // When false, skip hipoteca PDFs and columns
const FULL_AUTO_MODE =
  (String(process.env.FULL_AUTO_MODE || '').trim().toLowerCase() === '1') ||
  (String(process.env.FULL_AUTO_MODE || '').trim().toLowerCase() === 'true') ||
  (!!process.env.CAPTCHA_PROVIDER && !!process.env.CAPTCHA_API_KEY); // auto-enable when solver configured
// Force headless/headful from code:
// - null: auto (Lambda/headless when on Lambda or HEADLESS env set)
// - true: force headless
// - false: force headful
const FORCE_HEADLESS = null;
const BUILDING_SLUG = BUILDING_NAME
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'building';
const OUTPUT_DIR = 'BuildingData';
const OUTPUT_FILE = `${OUTPUT_DIR}/${BUILDING_SLUG}.xlsx`;
const CHANGES_FILE = `${OUTPUT_DIR}/${BUILDING_SLUG}_changes.xlsx`;

// Max number of properties to process in a single run
const MAX_PROPERTIES_TO_PROCESS = 1000;

// Toggle verbose debugging (screenshots, DOM dumps, etc.)
const DEBUG_MODE = false;

// Create debug output folder only when debugging is enabled
const DEBUG_DIR = './debug-output';
if (DEBUG_MODE && !fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Verbose diagnostics for CAPTCHA solving
const CAPTCHA_DEBUG = (() => {
  const raw = String(process.env.CAPTCHA_DEBUG || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

// Skip any pre-click or early-solve; only solve after a failed submit
const CAPTCHA_SKIP_CHECKBOX = (() => {
  const raw = String(process.env.CAPTCHA_SKIP_CHECKBOX || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

// Special debug mode: force testing 2Captcha only, without session restore or auto actions
const TWO_CAPTCHA_TEST_MODE = (() => {
  const raw =
    String(process.env['TWOCAPTCHA_TEST_MODE'] ||
      process.env.TWOCAPTCHA_TEST_MODE ||
      process.env.CAPTCHA_TEST_MODE ||
      '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

// Global safety net: never crash the process; log and continue
function writeFatalLog(prefix, msg) {
  try {
    const dir = './debug-output';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`${dir}/${prefix}_${ts}.log`, String(msg || ''), 'utf8');
    fs.writeFileSync(`${dir}/last_fatal_error.log`, String(msg || ''), 'utf8');
  } catch {}
}
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  writeFatalLog('unhandled_rejection', reason?.stack || reason?.message || String(reason));
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  writeFatalLog('uncaught_exception', err?.stack || err?.message || String(err));
  // Do not exit; allow caller to continue and export partial data
});

let debugCounter = 0;

// ===== SESSION / AUTH HELPERS =====
async function getPuppeteerLib() {
  // Try to use puppeteer-extra + stealth if available, fall back to vanilla puppeteer
  try {
    // Dynamic import so the code works even if extra isn't installed
    const puppeteerExtraMod = await import('puppeteer-extra').catch(() => null);
    if (puppeteerExtraMod && puppeteerExtraMod.default) {
      const stealthMod = await import('puppeteer-extra-plugin-stealth').catch(() => null);
      if (stealthMod && stealthMod.default) {
        puppeteerExtraMod.default.use(stealthMod.default());
      }
      // Optionally add reCAPTCHA solver if configured and enabled by mode
      try {
        if (String(process.env.CAPTCHA_PLUGIN || '') !== '1') {
          return puppeteerExtraMod.default;
        }
        const rawProvider = String(process.env.CAPTCHA_PROVIDER || '').trim().toLowerCase();
        const provider = rawProvider || (process.env.CAPTCHA_API_KEY ? '2captcha' : '');
        const token = String(process.env.CAPTCHA_API_KEY || '').trim();
        if (provider && token) {
          const recaptchaMod = await import('puppeteer-extra-plugin-recaptcha').catch(() => null);
          if (recaptchaMod && recaptchaMod.default) {
            puppeteerExtraMod.default.use(
              recaptchaMod.default({
                provider: { id: provider, token },
                visualFeedback: true
              })
            );
            if (CAPTCHA_DEBUG) {
              const masked = token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '[set]';
              console.log(`🔧 CAPTCHA solver enabled (${provider}), key=${masked}`);
            } else {
              console.log(`🔧 CAPTCHA solver enabled (${provider}).`);
            }
          }
        }
      } catch {
        // If the plugin isn't installed or misconfigured, continue without it
      }
      return puppeteerExtraMod.default;
    }
  } catch {
    // ignore and use base puppeteer
  }
  return puppeteer;
}

async function launchBrowserHeadful() {
  const puppeteerLib = await getPuppeteerLib();
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const userDataDir = process.env.USER_DATA_DIR || process.env.PUPPETEER_USER_DATA_DIR || '';
  return await puppeteerLib.launch({
    headless: false,
    executablePath,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    ...(userDataDir ? { userDataDir } : {})
  });
}

async function launchBrowserLambdaHeadless() {
  // Use chrome-aws-lambda + puppeteer-core if available
  try {
    const chromiumMod = await import('chrome-aws-lambda').catch(() => null);
    const puppeteerCoreMod = await import('puppeteer-core').catch(() => null);
    const chromium = chromiumMod?.default || chromiumMod;
    const pcore = puppeteerCoreMod?.default || puppeteerCoreMod;
    if (chromium && pcore) {
      const executablePath = await chromium.executablePath;
      return await pcore.launch({
        args: chromium.args,
        executablePath,
        headless: true,
        defaultViewport: { width: 1280, height: 800 }
      });
    }
  } catch {
    // fall back to standard
  }
  // Fallback to standard puppeteer in headless mode (for local testing of "lambda-like" flow)
  const puppeteerLib = await getPuppeteerLib();
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const userDataDir = process.env.USER_DATA_DIR || process.env.PUPPETEER_USER_DATA_DIR || '';
  return await puppeteerLib.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(userDataDir ? { userDataDir } : {})
  });
}

const SESSION_DIR = './session';
const SESSION_COOKIES_PATH = `${SESSION_DIR}/session-cookies.json`;

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

async function saveSessionCookies(page, url = 'https://www.rp.gob.pa/') {
  try {
    ensureSessionDir();
    // Prefer CDP to grab HttpOnly and cross-domain cookies as well
    let cookies = [];
    try {
      const client = await page.target().createCDPSession();
      const all = await client.send('Network.getAllCookies');
      if (all && Array.isArray(all.cookies)) cookies = all.cookies;
    } catch {
      cookies = await page.cookies(url);
    }
    fs.writeFileSync(SESSION_COOKIES_PATH, JSON.stringify({ cookies }, null, 2));
    console.log('🔐 Session cookies saved.');
  } catch (e) {
    console.warn(`⚠️  Could not save session cookies: ${e.message}`);
  }
}

async function restoreSessionCookies(page, url = 'https://www.rp.gob.pa/') {
  try {
    if (!fs.existsSync(SESSION_COOKIES_PATH)) return false;
    const data = JSON.parse(fs.readFileSync(SESSION_COOKIES_PATH, 'utf8'));
    if (!data || !Array.isArray(data.cookies)) return false;
    // Set cookies requires a domain context
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    // Use page.setCookie for each cookie to ensure proper fields are accepted
    const setParams = data.cookies.map(c => {
      const out = {
        name: c.name,
        value: c.value,
        path: c.path || '/',
        domain: c.domain || undefined,
        expires: typeof c.expires === 'number' ? c.expires : undefined,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite && typeof c.sameSite === 'string'
          ? (c.sameSite.toLowerCase() === 'no_restriction' ? 'None'
            : c.sameSite.toLowerCase() === 'lax' ? 'Lax'
            : c.sameSite.toLowerCase() === 'strict' ? 'Strict'
            : undefined)
          : undefined
      };
      // page.setCookie prefers url for non-hostOnly cookies when domain is missing
      if (!out.domain) out.url = url;
      return out;
    });
    for (const chunk of setParams) {
      try { await page.setCookie(chunk); } catch {}
    }
    console.log('🔐 Session cookies restored.');
    return true;
  } catch (e) {
    console.warn(`⚠️  Could not restore session cookies: ${e.message}`);
    return false;
  }
}

async function debugCaptchaSnapshot(page, label = 'captcha') {
  if (!CAPTCHA_DEBUG) return;
  try {
    const info = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]'));
      const sitekeyFromIframe = (() => {
        for (const f of frames) {
          try {
            const u = new URL(f.src, location.href);
            const k = u.searchParams.get('k') || u.searchParams.get('sitekey');
            if (k) return k;
          } catch {}
        }
        return null;
      })();
      const sitekeyFromDiv = document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') || null;
      const sitekey = sitekeyFromIframe || sitekeyFromDiv || null;
      const anchorExists = !!document.querySelector('#recaptcha-anchor, .recaptcha-checkbox-border');
      const responseAreas = document.querySelectorAll('textarea[name="g-recaptcha-response"], #g-recaptcha-response').length;
      return {
        url: location.href,
        framesCount: frames.length,
        sitekey: sitekey || '',
        anchorExists,
        responseAreas
      };
    });
    console.log(`🔎 [${label}] URL: ${info.url}`);
    console.log(`🔎 [${label}] frames=${info.framesCount} sitekey=${info.sitekey ? info.sitekey.slice(0, 8) + '…' : '(none)'} anchor=${info.anchorExists} areas=${info.responseAreas}`);
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const ts = Date.now();
    try { await page.screenshot({ path: `${DEBUG_DIR}/captcha_${label}_${ts}.png` }); } catch {}
    try {
      const html = await page.content();
      fs.writeFileSync(`${DEBUG_DIR}/captcha_${label}_${ts}.html`, html || '');
    } catch {}
  } catch (e) {
    console.log(`⚠️  [${label}] captcha snapshot error: ${e?.message || String(e)}`);
  }
}

async function isRecaptchaChallengeOpen(page) {
  try {
    const handle = await page.$('iframe[title*="recaptcha challenge"], iframe[title*="Verificación"], iframe[title*="verify"], iframe[src*="bframe"]');
    return !!handle;
  } catch { return false; }
}

async function waitForRecaptchaVerification(page, timeout = 10000) {
  // Wait for reCAPTCHA to be verified (response token generated)
  // This happens when the checkbox is checked and auto-passes
  try {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const verified = await page.evaluate(() => {
        // Method 1: Check if reCAPTCHA response token exists in textarea
        const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (textarea && textarea.value && textarea.value.length > 50) {
          return true;
        }
        
        // Method 2: Check iframe for verified state
        const iframe = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
        if (iframe) {
          try {
            // Try to access iframe content (may fail due to cross-origin)
            const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (frameDoc) {
              const anchor = frameDoc.querySelector('#recaptcha-anchor');
              if (anchor) {
                const checked = anchor.getAttribute('aria-checked') === 'true';
                const className = anchor.className || '';
                // Verified when checked and has checked class (not just checked attribute)
                if (checked && (className.includes('recaptcha-checkbox-checked') || 
                               className.includes('recaptcha-checkbox-checkmark'))) {
                  return true;
                }
              }
            }
          } catch (e) {
            // Cross-origin error - use alternative method
          }
          
          // Method 3: Check iframe title changes to indicate verification
          const iframeTitle = iframe.getAttribute('title') || '';
          if (iframeTitle.includes('verified') || iframeTitle.includes('verificado')) {
            return true;
          }
        }
        
        // Method 4: Check for grecaptcha callback execution
        if (window.grecaptcha && typeof window.grecaptcha.getResponse === 'function') {
          try {
            const response = window.grecaptcha.getResponse();
            if (response && response.length > 0) {
              return true;
            }
          } catch (e) {
            // grecaptcha not ready or error
          }
        }
        
        return false;
      }).catch(() => false);
      
      if (verified) {
        console.log('✅ reCAPTCHA verified (auto-passed)');
        return true;
      }
      
      await sleep(200);
    }
    // If we get here, verification didn't complete in time
    // But if checkbox is checked, it might still be processing
    const stillChecked = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
      if (iframe) {
        try {
          const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (frameDoc) {
            const anchor = frameDoc.querySelector('#recaptcha-anchor');
            return anchor && anchor.getAttribute('aria-checked') === 'true';
          }
        } catch {}
      }
      return false;
    }).catch(() => false);
    
    if (stillChecked) {
      console.log('⚠️  reCAPTCHA checkbox checked but verification timeout - proceeding anyway');
      return true; // Proceed if checkbox is at least checked
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

async function closeRecaptchaChallengeIfOpen(page) {
  try {
    const frameHandle = await page.$('iframe[title*="recaptcha challenge"], iframe[title*="Verificación"], iframe[title*="verify"], iframe[src*="bframe"]');
    if (!frameHandle) return false;
    const challengeFrame = await frameHandle.contentFrame();
    if (!challengeFrame) return false;
    // Try common close selectors
    const selectors = [
      'button[aria-label*="Cerrar"]',
      'button[title*="Cerrar"]',
      '.rc-button-default.goog-inline-block', // may be "OMITIR"/"SALTAR"
      '.help-button-holder button',           // side buttons incl. reload/close
      '.rc-dialog-close'                      // generic dialog close
    ];
    for (const sel of selectors) {
      const el = await challengeFrame.$(sel).catch(() => null);
      if (el) { await el.click().catch(() => {}); await sleep(300); }
      // If frame disappeared, we closed it
      const stillOpen = await isRecaptchaChallengeOpen(page);
      if (!stillOpen) return true;
    }
    return false;
  } catch { return false; }
}

async function solveRecaptchasWithDebug(page, label = 'solve') {
  const hasPlugin = typeof page.solveRecaptchas === 'function';
  console.log(`🔧 [${label}] plugin: ${hasPlugin ? 'yes' : 'no'}`);
  if (!hasPlugin) return { ok: false, reason: 'no-plugin' };
  const start = Date.now();
  try {
    if (CAPTCHA_DEBUG) await debugCaptchaSnapshot(page, `${label}_before`);
    const result = await page.solveRecaptchas();
    const ms = Date.now() - start;
    let solutionsCount = 0;
    try {
      solutionsCount = (result && Array.isArray(result.solutions)) ? result.solutions.length
        : (Array.isArray(result) ? result.length : 0);
    } catch {}
    console.log(`✅ [${label}] solveRecaptchas completed in ${ms}ms, solutions=${solutionsCount}`);
    if (CAPTCHA_DEBUG) await debugCaptchaSnapshot(page, `${label}_after`);
    return { ok: true, solutionsCount };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`❌ [${label}] solveRecaptchas error after ${ms}ms: ${e?.message || String(e)}`);
    return { ok: false, error: e?.message || String(e) };
  }
}

async function humanType(page, selector, text, minDelay = 80, maxDelay = 140) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const delay = minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay));
    await page.type(selector, ch, { delay });
    if (i > 0 && i % 5 === 0) {
      await sleep(120 + Math.floor(Math.random() * 180));
    }
  }
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * Math.max(1, max - min));
}

async function humanMouseMove(page, x1, y1, x2, y2, steps = 20) {
  try {
    await page.mouse.move(x1, y1, { steps: 2 });
  } catch {}
  const dx = (x2 - x1) / steps;
  const dy = (y2 - y1) / steps;
  for (let i = 1; i <= steps; i++) {
    const nx = x1 + dx * i + (Math.random() - 0.5) * 1.5;
    const ny = y1 + dy * i + (Math.random() - 0.5) * 1.5;
    try {
      await page.mouse.move(nx, ny, { steps: 1 });
    } catch {}
    await sleep(randomInt(8, 18));
  }
}

async function clearAndTypeWithVerification(page, selector, value, label = 'field') {
  // Clear via JS and events to avoid masked characters lingering
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
  await page.click(selector, { clickCount: 3 }).catch(() => {});
  await humanType(page, selector, value, 90, 140);
  const readBack = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  if (readBack === value) return true;
  console.log(`⚠️  Mismatch after typing ${label} (len ${readBack.length}/${value.length}). Retrying...`);
  // Retry 1: re-clear and type again a bit slower
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
  await humanType(page, selector, value, 120, 180);
  const readBack2 = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  if (readBack2 === value) return true;
  console.log(`⚠️  Second mismatch on ${label}. Forcing value via DOM.`);
  // Final fallback: set value directly and fire events
  await page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, selector, value);
  const readBack3 = await page.$eval(selector, el => (el && 'value' in el) ? el.value : '');
  const ok = readBack3 === value;
  if (!ok) {
    console.log(`⚠️  Unable to fully set ${label}. Proceeding, but login may fail.`);
  }
  return ok;
}

async function isLoggedIn(page) {
  // Pure check, no navigation. Consider logged-in if login form is absent and app navbar/user menu exists.
  try {
    const state = await page.evaluate(() => {
      const bodyText = (document.body && document.body.innerText) || '';
      const hasLoginInputs =
        !!document.querySelector('#itNombreUsuario') ||
        !!document.querySelector('input[type="password"]');
      const hasLogout =
        !!document.querySelector('a[href*="LogoutUsuario"]') ||
        bodyText.includes('Cerrar Sesión');
      const hasAppNav =
        bodyText.includes('CONSULTAS WEB') || bodyText.includes('Registro Público de Panamá');
      const onLoginUrl = window.location.href.includes('LoginUsuario');
      return { hasLoginInputs, hasLogout, hasAppNav, onLoginUrl, bodyTextSample: bodyText.slice(0, 200) };
    });
    // Logged-in if not on login page and we see app nav or logout control
    return !state.hasLoginInputs && !state.onLoginUrl && (state.hasLogout || state.hasAppNav);
  } catch {
    return false;
  }
}

async function isOnFoliosPage(page) {
  try {
    return await page.evaluate(() => {
      const bodyText = (document.body && document.body.innerText) || '';
      const hasTitle = /Búsqueda de Folios|Folios\s*\/\s*Fincas\s*\/\s*Fichas/i.test(bodyText);
      const hasGrid = !!document.querySelector('.dxbs-gridview, table.dxbs-table');
      return hasTitle && hasGrid;
    });
  } catch {
    return false;
  }
}

async function openFoliosPage(page) {
  // If already on Folios, nothing to do
  if (await isOnFoliosPage(page)) return true;
  // Try UI path first: click a control labeled "Folios"
  try {
    await page.waitForFunction(() => {
      const els = Array.from(document.querySelectorAll('a,button,div,span'));
      return els.some(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
    }, { timeout: 12000 });
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a,button,div,span'));
      // Prefer <a> or <button>
      const findClickable = () => {
        const candidates = els.filter(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
        // prioritize anchors and buttons
        let target = candidates.find(e => e.tagName === 'A' || e.tagName === 'BUTTON');
        if (!target && candidates.length) {
          // climb to closest clickable ancestor
          const el = candidates[0];
          let p = el;
          while (p && p !== document.body) {
            if (p.tagName === 'A' || p.tagName === 'BUTTON' || p.getAttribute('role') === 'button') return p;
            p = p.parentElement;
          }
          target = el;
        }
        return target || null;
      };
      const tgt = findClickable();
      if (tgt) tgt.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.waitForFunction(() => {
      const bodyText = (document.body && document.body.innerText) || '';
      return /Búsqueda de Folios|Folios\s*\/\s*Fincas\s*\/\s*Fichas/i.test(bodyText) || window.location.href.includes('BusquedaFolios');
    }, { timeout: 15000 }).catch(() => {});
  } catch {}
  // Evaluate state in Node context
  if (await isOnFoliosPage(page)) return true;
  // Fallback: direct navigation
  try {
    await page.goto('https://www.rp.gob.pa/BusquedaFolios', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {}
  return await isOnFoliosPage(page);
}

async function tryClickRecaptchaCheckbox(page) {
  try {
    // Look for reCAPTCHA iframe and click the checkbox inside
    for (let attempt = 0; attempt < 4; attempt++) {
      const iframeHandle = await page.$('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
      if (!iframeHandle) {
        await sleep(500);
        continue;
      }
      const frame = await iframeHandle.contentFrame();
      if (!frame) {
        await sleep(500);
        continue;
      }
      try {
        await frame.waitForSelector('#recaptcha-anchor, .recaptcha-checkbox-border', { timeout: 5000 });
        const already = await frame.evaluate(() => {
          const a = document.querySelector('#recaptcha-anchor');
          return a && a.getAttribute('aria-checked') === 'true';
        }).catch(() => false);
        if (already) {
          console.log('✅ reCAPTCHA already checked.');
          return true;
        }
        const clicked = await frame.evaluate(() => {
          const a = document.querySelector('#recaptcha-anchor');
          if (a) {
            a.click();
            return true;
          }
          const b = document.querySelector('.recaptcha-checkbox-border');
          if (b) {
            b.click();
            return true;
          }
          return false;
        });
        if (!clicked) {
          await sleep(500);
          continue;
        }
        // Wait until checked or challenge appears
        const ok = await frame.waitForFunction(() => {
          const a = document.querySelector('#recaptcha-anchor');
          return !!a && a.getAttribute('aria-checked') === 'true';
        }, { timeout: 6000 }).then(() => true).catch(() => false);
        if (ok) {
          console.log('✅ reCAPTCHA checkbox clicked.');
          return true;
        }
        // If a challenge frame appeared, we cannot solve it automatically
        const challenge = await page.$('iframe[title*="challenge"], iframe[src*="bframe"]');
        if (challenge) {
          console.log('⚠️  reCAPTCHA challenge appeared. Manual solve required once.');
          return false;
        }
      } catch {
        // retry
      }
      await sleep(500);
    }
  } catch (e) {
    console.warn(`⚠️  Could not interact with reCAPTCHA: ${e.message}`);
  }
  return false;
}

async function tryClickRecaptchaCheckboxSlow(page) {
  try {
    const iframeHandle = await page.waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]', { timeout: 8000 });
    if (!iframeHandle) return false;
    try { await iframeHandle.scrollIntoViewIfNeeded?.(); } catch {}
    const box = await iframeHandle.boundingBox();
    if (!box) return false;
    const startX = 20 + Math.random() * 40;
    const startY = 20 + Math.random() * 40;
    const targetX = box.x + box.width * (0.50 + (Math.random() - 0.5) * 0.08);
    const targetY = box.y + box.height * (0.50 + (Math.random() - 0.5) * 0.08);
    await humanMouseMove(page, startX, startY, targetX, targetY, randomInt(18, 28));
    await sleep(randomInt(140, 260));
    try {
      await page.mouse.down();
      await sleep(randomInt(60, 120));
      await page.mouse.up();
    } catch {}
    await sleep(randomInt(350, 650));
    const frame = await iframeHandle.contentFrame();
    if (frame) {
      const ok = await frame.evaluate(() => {
        const a = document.querySelector('#recaptcha-anchor');
        return !!a && a.getAttribute('aria-checked') === 'true';
      }).catch(() => false);
      if (ok) return true;
      // Fallback: slow DOM click inside frame
      try {
        await frame.waitForSelector('#recaptcha-anchor', { timeout: 3000 });
        const anchor = await frame.$('#recaptcha-anchor');
        if (anchor) {
          const abox = await anchor.boundingBox();
          if (abox) {
            const innerX = box.x + abox.x + abox.width / 2;
            const innerY = box.y + abox.y + abox.height / 2;
            await humanMouseMove(page, targetX, targetY, innerX, innerY, randomInt(10, 16));
            await sleep(randomInt(100, 180));
            await page.mouse.click(innerX, innerY);
            await sleep(randomInt(400, 800));
          } else {
            await frame.click('#recaptcha-anchor', { delay: randomInt(60, 120) }).catch(() => {});
          }
        }
        const verified = await frame.evaluate(() => {
          const a = document.querySelector('#recaptcha-anchor');
          return !!a && a.getAttribute('aria-checked') === 'true';
        }).catch(() => false);
        if (verified) return true;
      } catch {}
    }
  } catch (e) {
    // ignore
  }
  return false;
}

async function performLogin(page) {
  const username = process.env.RP_USERNAME || process.env.USERNAME || '';
  const password = process.env.RP_PASSWORD || process.env.PASSWORD || '';
  if (!username || !password) {
    if (!FULL_AUTO_MODE) {
      console.log('⚠️  RP_USERNAME/RP_PASSWORD not set in environment. Falling back to manual login.');
      await page.goto('https://www.rp.gob.pa/LoginUsuario', { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('\n⏸️  PLEASE LOGIN MANUALLY (captcha likely present). Press ENTER in terminal when done...\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      return isLoggedIn(page);
    }
    console.log('❌ FULL_AUTO_MODE on and credentials are missing. Set RP_USERNAME and RP_PASSWORD in .env.');
    return false;
  }

  console.log('🔐 Attempting automated login...');
  await page.goto('https://www.rp.gob.pa/LoginUsuario', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  // Strategy (honoring CAPTCHA_SKIP_CHECKBOX):
  // - If CAPTCHA_SKIP_CHECKBOX=1: do nothing here; only solve after a failed submit.
  // - Else:
  //    * CAPTCHA_MODE=always -> solve up-front.
  //    * CAPTCHA_MODE=backup & !CAPTCHA_DEBUG -> try quick checkbox click; if challenge pops, close and solve.
  //    * CAPTCHA_DEBUG=1 -> solve up-front (diagnostics).
  try {
    if (!CAPTCHA_SKIP_CHECKBOX) {
      const mode = (process.env.CAPTCHA_MODE || 'backup').toString().trim().toLowerCase();
      if (mode === 'always') {
        await solveRecaptchasWithDebug(page, 'login_early');
      } else if (!CAPTCHA_DEBUG) {
        try {
          await sleep(800);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 4));
        } catch {}
        let clicked = await tryClickRecaptchaCheckboxSlow(page);
        if (!clicked) clicked = await tryClickRecaptchaCheckbox(page);
        const challengeOpen = await isRecaptchaChallengeOpen(page);
        if (challengeOpen) {
          await closeRecaptchaChallengeIfOpen(page);
          await solveRecaptchasWithDebug(page, 'login_after_checkbox_challenge');
        } else if (clicked) {
          // Checkbox was clicked and no challenge appeared - wait for auto-verification
          console.log('⏳ Waiting for reCAPTCHA auto-verification...');
          const verified = await waitForRecaptchaVerification(page, 8000);
          if (!verified) {
            console.log('⚠️  reCAPTCHA auto-verification timeout, proceeding anyway...');
          }
        }
      } else {
        await solveRecaptchasWithDebug(page, 'login_early');
      }
    }
  } catch {}

  // Set a common UA and language to reduce bot signals
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' });
  } catch {}

  // Rely exclusively on solver; do not attempt UI-based checkbox clicking

  // After CAPTCHA is solved, ensure we're still on login page and form is ready
  // Wait a moment for page to stabilize after CAPTCHA solving
  await sleep(1500);
  
  // Verify we're still on the login page (not redirected)
  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('LoginUsuario')) {
      console.log('⚠️  Page navigated away after CAPTCHA, returning to login page...');
      await page.goto('https://www.rp.gob.pa/LoginUsuario', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await sleep(1000);
    }
  } catch {}

  // Wait for login form to be ready before filling credentials
  try {
    await page.waitForFunction(() => {
      const usernameField = document.querySelector('#itNombreUsuario') || 
                           document.querySelector('input[type="email"]') ||
                           document.querySelector('input[name="username"]') ||
                           document.querySelector('input[autocomplete="username"]');
      const passwordField = document.querySelector('input[type="password"]');
      return usernameField && passwordField && 
             !usernameField.disabled && !passwordField.disabled;
    }, { timeout: 10000 });
    console.log('✅ Login form is ready');
  } catch (e) {
    console.warn('⚠️  Login form fields not ready, proceeding anyway...');
  }

  // Fill username and password using direct typing to ensure frameworks detect changes
  try {
    await page.waitForSelector('#itNombreUsuario', { timeout: 10000 });
    await clearAndTypeWithVerification(page, '#itNombreUsuario', username, 'username');
  } catch {
    // Fallback to any email/username field
    const altUserSel = 'input[type="email"], input[name="username"], input[autocomplete="username"]';
    await page.waitForSelector(altUserSel, { timeout: 10000 });
    await clearAndTypeWithVerification(page, altUserSel, username, 'username');
  }
  const passSel = 'input[type="password"]';
  await page.waitForSelector(passSel, { timeout: 10000 });
  await clearAndTypeWithVerification(page, passSel, password, 'password');

  // If CAPTCHA_DEBUG is ON we already avoided UI clicking; otherwise we already tried checkbox above

  // Submit reliably
  await submitLoginFormReliable(page);

  // Wait for either dashboard or captcha/login to persist
  await sleep(5000);
  // Second chance solve if still not logged in
  try {
    if (!(await isLoggedIn(page))) {
      await solveRecaptchasWithDebug(page, 'login_second_chance');
      await sleep(1500);
      // Re-submit after solving
      await submitLoginFormReliable(page);
      await sleep(3500);
    }
  } catch {}
  let ok = await isLoggedIn(page);
  if (!ok) {
    // No manual prompt; always attempt automated retries when solver configured
    await tryClickRecaptchaCheckbox(page);
    await sleep(1200);
    await solveRecaptchasWithDebug(page, 'login_retry');
    await sleep(1200);
    await submitLoginFormReliable(page);
    await sleep(4000);
    return isLoggedIn(page);
  }
  return true;
}

// ===== DEBUG HELPERS =====
async function saveDebugScreenshot(page, name) {
  if (!DEBUG_MODE) return;
  const filename = `${DEBUG_DIR}/${String(debugCounter).padStart(3, '0')}_${name}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`    📸 Screenshot: ${filename}`);
  debugCounter++;
}

async function saveDebugHTML(page, name) {
  if (!DEBUG_MODE) return;
  const html = await page.content();
  const filename = `${DEBUG_DIR}/${String(debugCounter).padStart(3, '0')}_${name}.html`;
  fs.writeFileSync(filename, html);
  console.log(`    💾 HTML saved: ${filename}`);
  debugCounter++;
}

async function saveModalHTML(page, label) {
    if (!DEBUG_MODE) return;
    const { fullHTML, modalHTML, hasModal } = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      const activeModal = modals.find(modal => {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
      return {
        hasModal: !!activeModal,
        modalHTML: activeModal ? activeModal.outerHTML : '',
        fullHTML: document.documentElement.outerHTML
      };
    });
  
    const base = `${DEBUG_DIR}/${String(debugCounter).padStart(3, '0')}_${label}`;
    fs.writeFileSync(`${base}_fullpage.html`, fullHTML);
    if (hasModal) {
      fs.writeFileSync(`${base}_modal.html`, modalHTML);
    }
    console.log(`    💾 Saved DOM snapshot: ${base}_*.html`);
    debugCounter++;
  }
  
async function submitLoginFormReliable(page) {
  // Prefer the exact "Ingresar" primary button within the login form
  let clicked = false;
  try {
    // First try: the primary block button (Ingresar)
    const btnBlock = await page.$('form button.btn.btn-primary.btn-block');
    if (btnBlock) { await btnBlock.click().catch(() => {}); clicked = true; }
  } catch {}
  if (!clicked) {
    // Second try: any button whose text is "Ingresar"
    clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const byText = buttons.find(b => (b.textContent || '').trim().toLowerCase() === 'ingresar');
      if (byText) { byText.click(); return true; }
      return false;
    }).catch(() => false);
  }
  if (!clicked) {
    // Third try: generic submit in form
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
        else form.submit();
      }
    }).catch(() => {});
  }
  // Give Blazor/server time to process; prefer navigation or state change
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
    (async () => {
      for (let i = 0; i < 10; i++) {
        if (await isLoggedIn(page)) return;
        await sleep(800);
      }
    })()
  ]);
}


async function debugModalState(page, label) {
  if (!DEBUG_MODE) return;
  console.log(`\n🔍 DEBUG: ${label}`);
  
  const modalInfo = await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
    
    return {
      totalModals: modals.length,
      modals: modals.map((modal, idx) => {
        const style = window.getComputedStyle(modal);
        const title = modal.querySelector('.blazored-modal-title')?.textContent || 'NO TITLE';
        const tables = modal.querySelectorAll('table');
        const tableInfo = Array.from(tables).map(table => {
          const rows = table.querySelectorAll('tr');
          return {
            rows: rows.length,
            firstRowText: rows[0]?.textContent?.substring(0, 50) || ''
          };
        });
        
        return {
          index: idx,
          title: title.substring(0, 60),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          isVisible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
          tables: tableInfo,
          innerTextLength: modal.innerText?.length || 0
        };
      })
    };
  });
  
  console.log(`    Total modals in DOM: ${modalInfo.totalModals}`);
  modalInfo.modals.forEach(m => {
    console.log(`    Modal ${m.index}:`);
    console.log(`      Title: ${m.title}`);
    console.log(`      Visible: ${m.isVisible} (display:${m.display}, opacity:${m.opacity})`);
    console.log(`      Tables: ${m.tables.length}`);
    if (m.tables.length > 0) {
      m.tables.forEach((t, i) => console.log(`        Table ${i}: ${t.rows} rows`));
    }
    console.log(`      Text length: ${m.innerTextLength} chars`);
  });
}

async function capturePdfDebugArtifacts(page, label) {
  if (!PDF_DEBUG_MODE) return;
  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }

    const baseLabel = `${String(debugCounter).padStart(3, '0')}_${label}`;
    const screenshotPath = `${DEBUG_DIR}/${baseLabel}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`    📸 PDF debug screenshot: ${screenshotPath}`);

    const htmlData = await page.evaluate(() => {
      const getVisibleModal = () => {
        const selectors = ['.blazored-modal', '.modal.show'];
        const candidates = selectors
          .map(selector => Array.from(document.querySelectorAll(selector)))
          .flat()
          .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });
        if (candidates.length === 0) return null;
        return candidates[candidates.length - 1];
      };

      const modal = getVisibleModal();
      const iframe = modal?.querySelector?.('iframe');
      const iframeDoc = iframe ? (iframe.contentDocument || iframe.contentWindow?.document) : null;

      return {
        pageHtml: document.documentElement.outerHTML,
        modalHtml: modal ? modal.outerHTML : '',
        iframeHtml: iframeDoc ? iframeDoc.documentElement?.outerHTML || '' : '',
        iframeSrc: iframe?.getAttribute('src') || ''
      };
    });

    fs.writeFileSync(`${DEBUG_DIR}/${baseLabel}_page.html`, htmlData.pageHtml || '');
    if (htmlData.modalHtml) {
      fs.writeFileSync(`${DEBUG_DIR}/${baseLabel}_modal.html`, htmlData.modalHtml);
    }
    if (htmlData.iframeHtml) {
      fs.writeFileSync(`${DEBUG_DIR}/${baseLabel}_iframe.html`, htmlData.iframeHtml);
    }
    if (htmlData.iframeSrc) {
      fs.writeFileSync(`${DEBUG_DIR}/${baseLabel}_iframe.txt`, htmlData.iframeSrc);
    }
    debugCounter++;
    console.log(`    💾 PDF debug HTML saved with base ${baseLabel}`);
  } catch (error) {
    console.warn(`    ⚠️  Unable to capture PDF debug artifacts: ${error.message}`);
  }
}

// ===== DOWNLOAD HELPERS =====
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeForMatch(text) {
  return (text || '')
    .normalize('NFD') // split accents
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/\u00A0/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // collapse punctuation/hyphens/etc to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRowSignature(row, index) {
  const values = Object.values(row || {})
    .map(value => (value ?? '').toString().trim())
    .filter(Boolean);

  const displayText = values.join(' | ');
  const primaryValue = values.length > 0 ? values[0] : '';

  return {
    index,
    displayText,
    normalized: normalizeForMatch(displayText),
    primaryNormalized: normalizeForMatch(primaryValue)
  };
}

function collectTargets(rows, keywords, type) {
  const normalizedKeywords = (Array.isArray(keywords) ? keywords : [keywords]).map(k => normalizeForMatch(k));
  const targets = new Map();

  rows.forEach((row, index) => {
    const info = buildRowSignature(row, index);
    if (!info.displayText) return;
    const text = info.normalized;
    const hasKeyword = normalizedKeywords.some(kw => kw && text.includes(kw));
    if (!hasKeyword) return;

    if (targets.has(index)) {
      targets.get(index).types.add(type);
    } else {
      targets.set(index, { ...info, types: new Set([type]) });
    }
  });

  return targets;
}

async function extractPdfTextFromBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return { text: '', error: 'empty-buffer' };
  }

  try {
    let uint8Array;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
      uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else if (buffer instanceof Uint8Array) {
      uint8Array = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(buffer);
    } else {
      uint8Array = Uint8Array.from(buffer);
    }

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    let aggregatedText = '';
    const pageCount = pdfDocument.numPages;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => (item.str || '').replace(/\u00A0/g, ' '))
          .filter(Boolean)
          .join(' ');
        aggregatedText += `${pageText} `;
      } catch (pageError) {
        console.warn(`PDF text extraction failed on page ${pageNum}: ${pageError.message}`);
      }
    }

    await pdfDocument.destroy();
    return { text: aggregatedText.trim(), error: null };
  } catch (error) {
    return { text: '', error: error.message || String(error) };
  }
}

async function fetchPdfBufferWithCookies(page, pdfUrl) {
  try {
    const absoluteUrl = new URL(pdfUrl, page.url()).toString();
    const cookies = await page.cookies(absoluteUrl);
    const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

    const response = await fetch(absoluteUrl, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        Referer: page.url(),
        'User-Agent': userAgent,
        Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8'
      },
      credentials: 'include',
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { buffer: null, source: `fetch-status-${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), source: 'node-fetch' };
  } catch (error) {
    return { buffer: null, source: `fetch-error-${error.message || error}` };
  }
}

function normalizeValorOperacion(rawValor) {
  if (!rawValor) return null;
  const cleaned = rawValor.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  // Cases to handle:
  // 1) 201.426,75  -> dot thousands, comma decimal  => 201426.75
  // 2) 201,426.75  -> comma thousands, dot decimal  => 201426.75
  // 3) 201426,75   -> comma decimal only            => 201426.75
  // 4) 201426.75   -> dot decimal only              => 201426.75
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    // Determine which symbol is the decimal separator by position
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Comma is decimal, dots are thousands
      const integerPart = cleaned.slice(0, lastComma).replace(/[^\d]/g, '');
      const decimals = cleaned.slice(lastComma + 1).replace(/[^\d]/g, '');
      if (!integerPart) return null;
      return `${integerPart}.${decimals}`;
    } else {
      // Dot is decimal, commas are thousands
      const integerPart = cleaned.slice(0, lastDot).replace(/,/g, '').replace(/[^\d]/g, '');
      const decimals = cleaned.slice(lastDot + 1).replace(/[^\d]/g, '');
      if (!integerPart) return null;
      return `${integerPart}.${decimals}`;
    }
  }
  if (hasComma && !hasDot) {
    // Only comma -> treat as decimal
    return cleaned.replace(/[^\d,]/g, '').replace(',', '.');
  }
  // Only dot or plain digits
  return cleaned.replace(/,/g, '');
}

function formatCurrencyForDisplay(rawValor) {
  const normalized = normalizeValorOperacion(rawValor);
  if (!normalized) return rawValor || '';
  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return rawValor || normalized;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

async function clickAsientoPdfButton(page, { normalizedSignature, primaryNormalized, expectedFolio, keywords = [] }) {
  return page.evaluate(({ normalizedSignature, primaryNormalized, expectedFolio, keywords }) => {
    const normalize = (text) => (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u00A0/g, ' ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const getVisibleModals = () => {
      const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
      return modals.filter(modal => {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
    };

    const visibleModals = getVisibleModals();
    let activeModal = null;

    if (expectedFolio) {
      activeModal = visibleModals.find(modal => {
        const title = modal.querySelector('.blazored-modal-title')?.textContent || '';
        return title.includes(expectedFolio);
      });
    }

    if (!activeModal && visibleModals.length > 0) {
      activeModal = visibleModals[visibleModals.length - 1];
    }

    if (!activeModal) {
      return { clicked: false, reason: 'Modal not visible' };
    }

    const tabContent = activeModal.querySelector('.tabestado') || activeModal;
    const tables = Array.from(tabContent.querySelectorAll('table'));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      for (const row of rows) {
        const rowText = normalize(row.innerText || '');
        if (!rowText) continue;

        const matchesPrimary = primaryNormalized ? rowText.includes(primaryNormalized) : false;
        const matchesFull = normalizedSignature ? (rowText === normalizedSignature || rowText.includes(normalizedSignature)) : false;
        const normalizedKeywords = (Array.isArray(keywords) ? keywords : [keywords]).map(k => normalize(k));
        const matchesKeyword = normalizedKeywords.some(k => k && rowText.includes(k));

        if (matchesPrimary || matchesFull || matchesKeyword) {
          let pdfButton = row.querySelector('.dxbs-cmd-cell button');
          if (!pdfButton) {
            const icon = row.querySelector('.dxbs-cmd-cell i.fa-file-pdf-o, .dxbs-cmd-cell i.fa-eye');
            if (icon) {
              pdfButton = icon.closest('button');
            }
          }
          if (pdfButton) {
            pdfButton.click();
            return { clicked: true };
          }
          return { clicked: false, reason: 'PDF button not found' };
        }
      }
    }

    return { clicked: false, reason: 'Matching row not found' };
  }, { normalizedSignature, primaryNormalized, expectedFolio, keywords });
}

async function extractPdfDataFromRow(page, target, folioNumber) {
  const pdfResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/Cotejo/ObtenerDocumentoPorIdentificadorConMarcaAgua/') &&
      response.request().method() === 'GET',
    { timeout: PDF_FETCH_TIMEOUT_MS }
  ).catch(() => null);

  const failureDetails = [];
  // Build keyword hints based on detected types for more robust matching/clicking
  const keywordHints = [];
  if (target.types && target.types.has && target.types.has('compraventa')) {
    keywordHints.push(...COMPRAVENTA_KEYWORDS);
  }
  if (target.types && target.types.has && target.types.has('hipoteca')) {
    keywordHints.push(...HIPOTECA_KEYWORDS);
  }

  const clickResult = await clickAsientoPdfButton(page, {
    normalizedSignature: target.normalized,
    primaryNormalized: target.primaryNormalized,
    expectedFolio: folioNumber,
    keywords: keywordHints
  });

  if (!clickResult.clicked) {
    return { success: false, reason: clickResult.reason || 'Failed to click PDF button' };
  }

  await capturePdfDebugArtifacts(page, `pdf_viewer_loading_folio_${folioNumber}_row_${target.index}`);

  const pdfResponse = await pdfResponsePromise;
  let pdfBuffer = null;
  let pdfSource = null;

  if (pdfResponse) {
    try {
      const interceptedBuffer = await pdfResponse.buffer();
      const interceptedType = pdfResponse.headers().get('content-type') || '';
      if (isPdfPayload(interceptedBuffer, interceptedType)) {
        pdfBuffer = interceptedBuffer;
        pdfSource = 'intercepted-response';
      } else {
        failureDetails.push(`intercepted-non-pdf-${interceptedType || 'unknown'}`);
        failureDetails.push(`intercepted-bytes-${interceptedBuffer?.slice?.(0, 32)?.toString?.('utf8') || 'n/a'}`);
      }
    } catch (error) {
      failureDetails.push(`intercepted-error-${error.message || error}`);
    }
  }

  const waitResult = await page.waitForFunction(() => {
    const getVisibleModal = () => {
      const selectors = ['.blazored-modal', '.modal.show'];
      const candidates = selectors
        .map(selector => Array.from(document.querySelectorAll(selector)))
        .flat()
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
      if (candidates.length === 0) return null;
      return candidates[candidates.length - 1];
    };

    const modal = getVisibleModal();
    if (!modal) return false;
    const iframe = modal.querySelector('iframe');
    if (!iframe) return false;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return false;
    const textLayer = doc.querySelector('.textLayer span');
    const viewerContainer = doc.querySelector('#viewerContainer');
    const pdfCanvas = doc.querySelector('canvas');
    return !!(textLayer || viewerContainer || pdfCanvas);
  }, { timeout: 15000 }).catch(() => null);

  let iframeLoaded = true;
  if (!waitResult) {
    iframeLoaded = false;
    await capturePdfDebugArtifacts(page, `pdf_viewer_timeout_folio_${folioNumber}_row_${target.index}`);
  }

  const pdfInfo = await page.evaluate(() => {
    const getVisibleModal = () => {
      const selectors = ['.blazored-modal', '.modal.show'];
      const candidates = selectors
        .map(selector => Array.from(document.querySelectorAll(selector)))
        .flat()
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
      if (candidates.length === 0) return null;
      return candidates[candidates.length - 1];
    };

    const modal = getVisibleModal();
    const iframe = modal?.querySelector?.('iframe');
    const iframeSrc = iframe?.getAttribute('src') || iframe?.src || '';

    let domText = '';
    if (modal) {
      domText = (modal.innerText || '').replace(/\u00A0/g, ' ');
    }

    return {
      iframeSrc,
      domText
    };
  });

  if (!pdfBuffer && pdfInfo?.iframeSrc) {
    const downloadResult = await downloadPdfBufferWithVariants(page, pdfInfo.iframeSrc);
    if (downloadResult.buffer) {
      pdfBuffer = downloadResult.buffer;
      pdfSource = downloadResult.source || 'download-variant';
    } else {
      failureDetails.push(downloadResult.source || 'download-failed');
      if (downloadResult.attempts && downloadResult.attempts.length > 0) {
        failureDetails.push(...downloadResult.attempts);
      }
    }
  }

  let failureReason = null;
  const extraction = {
    valorOperacion: null,
    valorTraspaso: null,
    montoHipoteca: null,
    plazoAnos: null,
    tasaInteres: null,
    rawText: '',
    usedPdfApi: pdfSource || 'unknown'
  };

  if (pdfBuffer) {
    const pdfTextResult = await extractPdfTextFromBuffer(pdfBuffer);
    if (pdfTextResult.text) {
      const collapsedText = pdfTextResult.text.replace(/\s+/g, ' ');
      const valorRegex = new RegExp(`${VALOR_OPERACION_LABEL.replace(/\s+/g, '\\s+')}\\s*[:：]?\\s*([0-9.,-]+)`, 'i');
      const traspasoLabelRegex = new RegExp(`${TRASPASO_LABEL.replace(/\s+/g, '\\s+')}\\s*[:：]?\\s*([0-9.,-]+)`, 'i');
      const traspasoParenRegex = /VALOR\s+DEL\s+TRASPASO\s*:\s*[^()]*\(\s*(?:B\/\.\s*)?([0-9.,-]+)\s*\)/i;
      const traspasoSimpleRegex = /VALOR\s+DEL\s+TRASPASO\s*:\s*([0-9.,-]+)/i;
      // Hipoteca: support multiple forms
      const montoLabelRegex = new RegExp(`${MONTO_HIPOTECA_LABEL.replace(/\s+/g, '\\s+')}\\s*[:：]?\\s*([0-9.,-]+)`, 'i');
      // Common MONTO pattern, prioritize numeric inside parentheses (e.g., (B/. 136,342.50))
      const montoParenRegex = /MONTO\s*:\s*[^()]*\((?:B\/\.\s*)?([0-9.,-]+)\)/i;
      const montoSimpleRegex = /MONTO\s*:\s*([0-9.,-]+)/i;
      const plazoRegexA = /PLAZO\s+DE\s+([0-9.,-]+)\s+(?:AÑOS|ANOS)/i;
      const plazoRegexB = /PLAZO\s*:\s*([0-9.,-]+)\s+(?:AÑOS|ANOS)/i;
      const tasaInteresRegex = /TASA\s+DE\s+INTERES\s+DE\s+([0-9.,-]+)\s*%/i;
      const tasaEfectivaRegex = /TASA\s+EFECTIVA\s*:\s*([0-9.,-]+)\s*%/i;
      const tasaNominalRegex = /TASA\s+NOMINAL\s*:\s*([0-9.,-]+)\s*%/i;

      const valorMatch = collapsedText.match(valorRegex);
      const traspasoMatch =
        collapsedText.match(traspasoLabelRegex) ||
        collapsedText.match(traspasoParenRegex) ||
        collapsedText.match(traspasoSimpleRegex);
      // Try label-specific first, then MONTO forms
      const montoMatch =
        collapsedText.match(montoLabelRegex) ||
        collapsedText.match(montoParenRegex) ||
        collapsedText.match(montoSimpleRegex);
      const plazoMatch = collapsedText.match(plazoRegexA) || collapsedText.match(plazoRegexB);
      const tasaMatch =
        collapsedText.match(tasaNominalRegex) ||
        collapsedText.match(tasaEfectivaRegex) ||
        collapsedText.match(tasaInteresRegex);
      const tasaNominalMatch = collapsedText.match(tasaNominalRegex);
      const tasaEfectivaMatch = collapsedText.match(tasaEfectivaRegex);

      if (valorMatch) {
        extraction.valorOperacion = valorMatch[1]?.trim() || null;
      }
      if (traspasoMatch) {
        extraction.valorTraspaso = traspasoMatch[1]?.trim() || null;
      }
      if (montoMatch) {
        extraction.montoHipoteca = montoMatch[1]?.trim() || null;
      }
      if (plazoMatch) {
        extraction.plazoAnos = plazoMatch[1]?.trim() || null;
      }
      if (tasaMatch) {
        const rate = tasaMatch[1]?.trim() || null;
        extraction.tasaInteres = rate ? `${rate.replace(/%?$/, '')}%` : null;
      }
      // Store both nominal and efectiva if present
      if (tasaNominalMatch) {
        const rate = tasaNominalMatch[1]?.trim() || null;
        extraction.tasaNominal = rate ? `${rate.replace(/%?$/, '')}%` : null;
      }
      if (tasaEfectivaMatch) {
        const rate = tasaEfectivaMatch[1]?.trim() || null;
        extraction.tasaEfectiva = rate ? `${rate.replace(/%?$/, '')}%` : null;
      }

      extraction.rawText = pdfTextResult.text;
      extraction.usedPdfApi = pdfSource || 'pdf-buffer';

      console.log(`\n----- PDF TEXT (Folio ${folioNumber} Row ${target.index + 1}) [${extraction.usedPdfApi}] -----`);
      console.log(pdfTextResult.text || '[NO TEXT EXTRACTED]');
      console.log('----- END PDF TEXT -----\n');

      if (!extraction.valorOperacion && !extraction.valorTraspaso && !extraction.montoHipoteca && !extraction.plazoAnos && !extraction.tasaInteres) {
        failureReason = 'No se encontraron etiquetas relevantes en el texto del PDF';
      }
    } else if (pdfTextResult.error) {
      extraction.usedPdfApi = `${pdfSource || 'pdf-buffer'}-${pdfTextResult.error}`;
      failureReason = `Unable to parse PDF text (${pdfTextResult.error})`;
    }
  } else {
    failureReason = failureReason || (pdfSource ? `PDF download failed (${pdfSource})` : 'PDF download failed');
    if (failureDetails.length > 0) {
      failureReason += ` [${failureDetails.join(', ')}]`;
    }
  }

  if (!extraction.valorOperacion && pdfInfo?.domText) {
    const collapsedDom = pdfInfo.domText.replace(/\s+/g, ' ');
    const valorRegex = new RegExp(`${VALOR_OPERACION_LABEL.replace(/\s+/g, '\\s+')}\\s*[:：]?\\s*([0-9.,-]+)`, 'i');
    const domMatch = collapsedDom.match(valorRegex);
    if (domMatch) {
      extraction.valorOperacion = domMatch[1]?.trim() || null;
      extraction.rawText = pdfInfo.domText;
      extraction.usedPdfApi = extraction.usedPdfApi || 'dom-text';
      failureReason = null;
    }
    console.log(`\n----- DOM TEXT (Folio ${folioNumber} Row ${target.index + 1}) -----`);
    console.log(pdfInfo.domText || '[NO DOM TEXT]');
    console.log('----- END DOM TEXT -----\n');
  }

  if (!extraction.valorOperacion && !extraction.valorTraspaso && !extraction.montoHipoteca && !extraction.plazoAnos && !extraction.tasaInteres) {
    await capturePdfDebugArtifacts(page, `pdf_viewer_no_valor_folio_${folioNumber}_row_${target.index}`);
    if (!failureReason) {
      failureReason = iframeLoaded ? 'Etiquetas VALOR DE LA OPERACIÓN / HIPOTECA no encontradas' : 'PDF iframe did not load';
    }
  }
  if (extraction.usedPdfApi) {
    console.log(`        ℹ️  PDF extraction source: ${extraction.usedPdfApi}`);
  }

  const success = !!(extraction.valorOperacion || extraction.valorTraspaso || extraction.montoHipoteca || extraction.plazoAnos || extraction.tasaInteres);

  const normalizedValor = normalizeValorOperacion(extraction.valorOperacion);
  const normalizedTraspaso = normalizeValorOperacion(extraction.valorTraspaso);

  let viewerClosed = false;
  try {
    viewerClosed = await page.evaluate(() => {
    const closeSelectors = [
      '.modal.show button.close',
      '.modal.show .btn-close',
      '.modal.show [data-dismiss="modal"]',
      '.modal.show .blazored-modal-close',
      '.modal.show button[aria-label="Close"]',
      '.modal.show button[type="button"][class*="close"]'
    ];

    for (const selector of closeSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.click();
        return true;
      }
    }

    const closeWithX = Array.from(document.querySelectorAll('.modal.show button, .modal.show span'))
      .find(el => el.textContent?.trim() === '×');
    if (closeWithX) {
      closeWithX.click();
      return true;
    }
    return false;
    });
  } catch (error) {
    viewerClosed = false;
  }

  if (!viewerClosed) {
    await page.keyboard.press('Escape').catch(() => {});
  }
  
  return {
    success,
    valorOperacion: normalizedValor || extraction.valorOperacion,
    valorTraspaso: normalizedTraspaso || extraction.valorTraspaso,
    montoHipoteca: extraction.montoHipoteca,
    plazoAnos: extraction.plazoAnos,
    tasaInteres: extraction.tasaInteres,
    rawText: extraction.rawText,
    usedPdfApi: extraction.usedPdfApi,
    reason: success ? undefined : failureReason || 'Unknown PDF extraction failure'
  };
}

// ===== DATA STORAGE =====
const allProperties = [];

// Excel sheet names must be <=31 chars and cannot contain \ / ? * [ ] :
// This shortens a name to fit and avoids collisions when two long names
// would otherwise truncate to the same thing.
function getSafeSheetName(rawName, usedNames) {
  const MAX_LEN = 31;
  let name = String(rawName || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim();
  if (!name) name = 'Sheet';
  if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN).trim();

  if (usedNames.has(name)) {
    let suffix = 2;
    let candidate;
    do {
      const suffixStr = `~${suffix}`;
      candidate = name.slice(0, MAX_LEN - suffixStr.length) + suffixStr;
      suffix++;
    } while (usedNames.has(candidate));
    name = candidate;
  }

  usedNames.add(name);
  return name;
}

// ===== EXCEL EXPORT =====
async function exportToExcel(properties, outputFile, changesFile, fallbackBuildingName = BUILDING_NAME, mercantilRows = null) {
  console.log('\n📊 Creating Excel file...');
  try {
    const outDir = path.dirname(outputFile);
    if (outDir && !fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const changesDir = path.dirname(changesFile);
    if (changesDir && !fs.existsSync(changesDir)) {
      fs.mkdirSync(changesDir, { recursive: true });
    }
  } catch {}
  
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  // Helper: parse number from string with comma/dot handling
  const parseNumber = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).replace(/\s+/g, '').replace(/\u00A0/g, '').trim();
    if (!s) return null;
    // Use the robust normalizer used for PDF values to support both "201.426,75" and "201,426.75"
    const normalizedStr = normalizeValorOperacion(s);
    if (!normalizedStr) return null;
    const num = parseFloat(normalizedStr);
    return Number.isFinite(num) ? num : null;
  };

  // Helper: stable price/m2 (use integer math to avoid FP drift)
  const computePricePerM2 = (valorNumber, areaNumber) => {
    if (!Number.isFinite(valorNumber) || !Number.isFinite(areaNumber) || areaNumber <= 0) {
      return '';
    }
    // Work in cents and cm²-equivalent scaling to keep precision
    const cents = Math.round(valorNumber * 100); // valor in cents
    const areaHundred = Math.round(areaNumber * 100); // area scaled by 100
    if (areaHundred === 0) return '';
    // price per m2 in cents = (cents / area) -> (cents*100)/areaHundred
    const pricePerM2Cents = Math.round((cents * 100) / areaHundred);
    return pricePerM2Cents / 100; // back to units with 2 decimals
  };

  // Helper: extract m2 from description like "Superficie unidad departamental:174M2."
  const extractM2FromDescription = (description) => {
    if (!description) return null;
    const text = String(description).replace(/\u00A0/g, ' ');
    // Support composite format like "85 m² 25 dm²" => 85.25 m²
    const composite = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)\s*([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)/i);
    if (composite) {
      const m2 = parseNumber(composite[1]);
      const dm2 = parseNumber(composite[2]);
      if (Number.isFinite(m2) && Number.isFinite(dm2)) {
        return m2 + dm2 / 100;
      }
    }
    // If only dm² provided, convert to m²
    const justDm2 = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)\b/i);
    if (justDm2) {
      const dm2 = parseNumber(justDm2[1]);
      if (Number.isFinite(dm2)) return dm2 / 100;
    }
    const upper = text.toUpperCase();
    const unitPattern = '(?:M(?:TS|T|ETROS)?\\s*(?:2|²)|M\\s*(?:2|²))';
    // Primary pattern: exact phrase with optional spaces
    let m = upper.match(new RegExp(`SUPERFICIE\\s+UNIDAD\\s+DEPARTAMENTAL\\s*:\\\\s*([0-9]+(?:[.,][0-9]+)?)\\s*${unitPattern}\\b`));
    if (!m) {
      // Fallback: any number followed by M2/M²
      m = upper.match(new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${unitPattern}\\b`));
    }
    if (!m) return null;
    const raw = m[1];
    const num = parseNumber(raw);
    return Number.isFinite(num) ? num : null;
  };
  
  // Helper: extract m2 from "SUPERFICIE INICIAL" field (e.g., "70.00m²", "70 m2")
  const extractM2FromSuperficieInicial = (value) => {
    if (!value) return null;
    const raw = String(value).replace(/\u00A0/g, ' ').trim();
    // Composite "85 m² 25 dm²"
    const composite = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)\s*([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)/i);
    if (composite) {
      const m2 = parseNumber(composite[1]);
      const dm2 = parseNumber(composite[2]);
      if (Number.isFinite(m2) && Number.isFinite(dm2)) {
        return m2 + dm2 / 100;
      }
    }
    const justDm2 = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)\b/i);
    if (justDm2) {
      const dm2 = parseNumber(justDm2[1]);
      if (Number.isFinite(dm2)) return dm2 / 100;
    }
    // Remove unit labels like m2, m² (any case) and spaces
    const numericPart = raw
      .replace(/\s*/g, '')
      .replace(/m2|m²|mts2|mt2|metros2/gi, '');
    const num = parseNumber(numericPart);
    return Number.isFinite(num) ? num : null;
  };
  // Helper: extract Unit Number from DOMICILIO text
  const extractUiFromText = (text) => {
    if (!text) return '';
    const raw = String(text).replace(/\u00A0/g, ' ');
    const m = raw.match(/U\s*\.?\s*I\s*\.?\s*[:\-]?\s*([^\n\r;,.]+?)(?=\s*(?:,|;|\.|$))/i);
    return m && m[1] ? m[1].trim() : '';
  };
  const extractUnitFromDomicilioHeuristic = (text) => {
    if (!text) return '';
    const cleaned = String(text)
      .replace(/\u00A0/g, ' ')
      .replace(/-/g, '')
      .toUpperCase();
    const tokens = cleaned.split(/[\s,/;|]+/).filter(Boolean);
    const patternNumLet = /^[0-9]{1,3}[A-Z]{1,2}$/;
    const patternPB = /^PB[A-Z]{1,2}$/;
    for (const t of tokens) {
      if (patternPB.test(t) || patternNumLet.test(t)) return t;
    }
    const m = cleaned.match(/(?:\b|^)(PB[A-Z]{1,2}|[0-9]{1,3}[A-Z]{1,2})(?:\b|$)/);
    return (m && m[1]) ? m[1] : '';
  };
  // Helper: apartment-style patterns: APT/APTO/APARTAMENTO/DEPTO/#12A
  const extractAptPattern = (text) => {
    if (!text) return '';
    const raw = String(text).replace(/\u00A0/g, ' ');
    const m =
      raw.match(/\b(?:APTO|APT|APART(?:AMENTO)?|DEPTO|DEPTO\.?|APART\.?)\s*[:\-]?\s*([0-9]{1,3}[A-Z]?)/i) ||
      raw.match(/#\s*([0-9]{1,3}[A-Z]?)/);
    return m && m[1] ? m[1].trim().toUpperCase() : '';
  };
  
  // Create Properties sheet with all property data (including Price per m2 after Valor)
  const propertiesData = properties.map((prop, index) => {
    const desc = prop.datosGenerales?.['DESCRIPCIÓN'] || '';
    const superficieInicial = prop.datosGenerales?.['SUPERFICIE INICIAL'] || '';
    const areaFromDesc = extractM2FromDescription(desc);
    const areaFromSuperficie = extractM2FromSuperficieInicial(superficieInicial);
    // Prefer area from description first; fall back to SUPERFICIE INICIAL if missing
    const areaM2 = areaFromDesc ?? areaFromSuperficie;
    // Always use the Valor shown in Properties (Datos Generales), never PDF
    const valorBaseStr = prop.datosGenerales?.['VALOR'] ?? prop.valor ?? '';
    const valorNum = parseNumber(valorBaseStr);
    const precioPorM2 = computePricePerM2(valorNum, areaM2);
    // Unit Number from DOMICILIO (prefer explicit UI, fall back to heuristic)
    const domicilioText = prop.datosGenerales?.['DOMICILIO'] || '';
    const descripcionText = prop.datosGenerales?.['DESCRIPCIÓN'] || '';
    const unitFromUi = extractUiFromText(domicilioText);
    const unitHeuristic = extractUnitFromDomicilioHeuristic(domicilioText);
    const unitFromDescUi = extractUiFromText(descripcionText);
    const unitFromApt = extractAptPattern(descripcionText) || extractAptPattern(domicilioText);
    const unitFromLote = prop.datosGenerales?.['LOTE'] || '';
    const unitNumber =
      unitFromUi ||
      unitHeuristic ||
      unitFromDescUi ||
      unitFromApt ||
      unitFromLote ||
      '';
    
    const row = {
      'Property #': index + 1,
      'Folio Number': prop.folioNumber || '',
      'Propietario': prop.propietario || '',
      'Is Persona Juridica': prop.isPersonaJuridica ? 'Yes' : 'No',
      'Valor': prop.valor || ''
    };
    // Insert computed column immediately after 'Valor'
    row['Price per Square Meter'] = precioPorM2;
    row['Unit Number'] = unitNumber;
    // Error/missing markers
    if (prop.missingData) {
      row['Data Missing'] = 'Yes';
    }
    if (prop.extractionError) {
      row['Extraction Error'] = String(prop.extractionError);
    }
    
    // Rest of Datos Generales
    row['FOLIO / FINCA / FICHA'] = prop.datosGenerales['FOLIO / FINCA / FICHA'] || '';
    row['FECHA DE INSCRIPCIÓN'] = prop.datosGenerales['FECHA DE INSCRIPCIÓN'] || '';
    row['PROPIETARIO'] = prop.datosGenerales['PROPIETARIO'] || '';
    row['DOMICILIO'] = prop.datosGenerales['DOMICILIO'] || '';
    row['USO DEL SUELO'] = prop.datosGenerales['USO DEL SUELO'] || '';
    row['OTRO TIPO'] = prop.datosGenerales['OTRO TIPO'] || '';
    row['DESCRIPCIÓN'] = prop.datosGenerales['DESCRIPCIÓN'] || '';
    row['POR EDIFICIO'] = prop.datosGenerales['POR EDIFICIO'] || '';
    row['% DE PROINDIVISO'] = prop.datosGenerales['% DE PROINDIVISO'] || '';
    row['CÉDULA CATASTRAL'] = prop.datosGenerales['CÉDULA CATASTRAL'] || '';
    row['VALOR'] = prop.datosGenerales['VALOR'] || '';
    row['VALOR DEL TERRENO'] = prop.datosGenerales['VALOR DEL TERRENO'] || '';
    row['VALOR DE MEJORAS'] = prop.datosGenerales['VALOR DE MEJORAS'] || '';
    row['VALOR DEL TRASPASO'] = prop.datosGenerales['VALOR DEL TRASPASO'] || '';
    row['NÚMERO DE PLANO'] = prop.datosGenerales['NÚMERO DE PLANO'] || '';
    row['FECHA DE CONSTRUCCIÓN'] = prop.datosGenerales['FECHA DE CONSTRUCCIÓN'] || '';
    row['FECHA DE OCUPACIÓN'] = prop.datosGenerales['FECHA DE OCUPACIÓN'] || '';
    row['LOTE'] = prop.datosGenerales['LOTE'] || '';
    row['SUPERFICIE INICIAL'] = prop.datosGenerales['SUPERFICIE INICIAL'] || '';
    row['SUPERFICIE / RESTO LIBRE'] = prop.datosGenerales['SUPERFICIE / RESTO LIBRE'] || '';
    row['COLINDANCIAS'] = prop.datosGenerales['COLINDANCIAS'] || '';
    return row;
  });
  
  const previousRun = loadPreviousRunData(outputFile);
  let changesData = [];
  if (previousRun) {
    changesData = computePropertyChanges(propertiesData, previousRun.data);
    if (changesData.length > 0) {
      console.log(`\n🔁 Detected ${changesData.length} changes vs previous run (${previousRun.filename}).`);
    } else {
      console.log(`\n✅ No changes detected compared to previous run (${previousRun.filename}).`);
    }
  } else {
    console.log('\nℹ️  No previous run found — skipping change comparison.');
  }

  const propertiesSheet = XLSX.utils.json_to_sheet(propertiesData);
  XLSX.utils.book_append_sheet(workbook, propertiesSheet, getSafeSheetName('Properties', usedSheetNames));
  
  // Create separate sheets for each tab type
  const tabTypes = new Set();
  properties.forEach(prop => {
    Object.keys(prop.tabs || {}).forEach(tabName => tabTypes.add(tabName));
  });
  
  tabTypes.forEach(tabName => {
    const tabData = [];
    properties.forEach((prop, propIndex) => {
      const tabRows = prop.tabs?.[tabName] || [];
      if (tabRows.length > 0) {
        tabRows.forEach((row, rowIndex) => {
          tabData.push({
            'Property #': propIndex + 1,
            ...row
          });
        });
      }
    });
    
    if (tabData.length > 0) {
      const tabSheet = XLSX.utils.json_to_sheet(tabData);
      XLSX.utils.book_append_sheet(workbook, tabSheet, getSafeSheetName(tabName, usedSheetNames));
    }
  });
  
  // ===== Market Analysis sheet (one row per property) =====
  // First pass: collect structured entries with unbounded pastSales arrays
  const marketEntries = properties.map((prop, index) => {
    // Building name from Properties (POR EDIFICIO) or fallback to configured BUILDING_NAME
    const buildingName = prop.datosGenerales?.['POR EDIFICIO'] || fallbackBuildingName || '';
    // Unit number from Properties; prefer LOTE, fallback to Folio/Finca/Ficha
    const unitNumber = prop.datosGenerales?.['LOTE'] || prop.datosGenerales?.['FOLIO / FINCA / FICHA'] || '';
    // Also try to derive U.I.-based identifier from DOMICILIO or DESCRIPCIÓN
    const extractUiFromText = (text) => {
      if (!text) return '';
      const raw = String(text).replace(/\u00A0/g, ' ');
      // Accept variants: "U.I.", "U I", "UI" with optional colon/dash; capture until separator or end
      const m = raw.match(/U\s*\.?\s*I\s*\.?\s*[:\-]?\s*([^\n\r;,.]+?)(?=\s*(?:,|;|\.|$))/i);
      return m && m[1] ? m[1].trim() : '';
    };
    const unitNumberUI = extractUiFromText(
      (prop.datosGenerales?.['DOMICILIO'] || '') ||
      (prop.datosGenerales?.['DESCRIPCIÓN'] || '')
    );
    // Heuristic from DOMICILIO: strip dashes and find "<number><letter>" or "PB<letter>"
    const extractUnitFromDomicilioHeuristic = (text) => {
      if (!text) return '';
      const cleaned = String(text)
        .replace(/\u00A0/g, ' ')
        .replace(/-/g, '') // remove dashes
        .toUpperCase();
      // Split into tokens by whitespace and punctuation
      const tokens = cleaned.split(/[\s,/;|]+/).filter(Boolean);
      // Patterns: 1-3 digits followed by 1-2 letters (e.g., 3D, 12A, 120A), or PB followed by 1-2 letters (PBA, PBB)
      const patternNumLet = /^[0-9]{1,3}[A-Z]{1,2}$/;
      const patternPB = /^PB[A-Z]{1,2}$/;
      // First pass: exact token match
      for (const t of tokens) {
        if (patternPB.test(t) || patternNumLet.test(t)) return t;
      }
      // Second pass: scan the full cleaned string for embedded patterns
      const m = cleaned.match(/(?:\b|^)(PB[A-Z]{1,2}|[0-9]{1,3}[A-Z]{1,2})(?:\b|$)/);
      if (m && m[1]) return m[1];
      return '';
    };
    const unitNumberHeuristic = extractUnitFromDomicilioHeuristic(prop.datosGenerales?.['DOMICILIO'] || '');
    // Owner
    const ownerName = prop.datosGenerales?.['PROPIETARIO'] || prop.propietario || '';
    // Area m2 from description or superficie inicial (same logic used above)
    const desc = prop.datosGenerales?.['DESCRIPCIÓN'] || '';
    const superficieInicial = prop.datosGenerales?.['SUPERFICIE INICIAL'] || '';
    const areaFromDesc = extractM2FromDescription(desc);
    const areaFromSuperficie = extractM2FromSuperficieInicial(superficieInicial);
    const areaM2 = (areaFromDesc ?? areaFromSuperficie) || null;
    // Valor base from Properties (Datos Generales) as ultimate fallback
    const valorBaseStr = prop.datosGenerales?.['VALOR'] ?? prop.valor ?? '';

    // Helpers for sales extraction
    const normalizeActos = (row) => (row['Derechos / Actos / Otras Operaciones'] || row['Derechos/Actos/Otras Operaciones'] || '').toString().toUpperCase();
    const getFecha = (row) => row['Fecha'] || row['FECHA'] || '';
    const getTraspaso = (row, tabName) =>
      row[`${tabName} ${TRASPASO_LABEL}`] ||
      row['VALOR DEL TRASPASO'] ||
      row[`${tabName} ${VALOR_OPERACION_LABEL}`] ||
      row['VALOR DE LA OPERACIÓN'] ||
      '';
    const parseDate = (s) => {
      if (!s) return 0;
      // support dd/mm/yyyy and yyyy-mm-dd
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
        const [d, m, y] = s.split(/[\/ ]/);
        return new Date(+y, +m - 1, +d).getTime();
      }
      const t = Date.parse(s);
      return Number.isFinite(t) ? t : 0;
    };
    const formatDateEs = (s) => {
      const ts = parseDate(s);
      if (!ts) return s || '';
      try {
        return new Date(ts).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: '2-digit' });
      } catch {
        return s || '';
      }
    };
    const isCompraventaRow = (row) => normalizeActos(row).includes('COMPRAVENTA');

    const activosRows = (prop.tabs?.['Elementos Activos'] || []).filter(isCompraventaRow)
      .map(r => {
        const v = getTraspaso(r, 'Elementos Activos');
        const vn = parseNumber(v);
        return { dateStr: getFecha(r), date: parseDate(getFecha(r)), valor: v, valorNum: vn };
      })
      .sort((a, b) => b.date - a.date);
    const inactivosRows = (prop.tabs?.['Elementos Inactivos'] || []).filter(isCompraventaRow)
      .map(r => {
        const v = getTraspaso(r, 'Elementos Inactivos');
        const vn = parseNumber(v);
        return { dateStr: getFecha(r), date: parseDate(getFecha(r)), valor: v, valorNum: vn };
      })
      .sort((a, b) => a.date - b.date); // oldest first

    // If there are no sales in elementos inactivos, then the only activo could be the initial developer transfer: leave valor blank
    let currentSaleDate = '';
    let currentSaleValor = '';
    let pastSales = []; // array of {dateStr, valor} newest first

    if (inactivosRows.length === 0) {
      // No historical sales; if only one active compraventa, assume developer transfer → omit valor
      // If two or more active compraventas with numeric valor, take the newest as current sale
      const activosWithValor = activosRows.filter(r => Number.isFinite(r.valorNum) && r.valorNum > 0);
      if (activosWithValor.length >= 2) {
        currentSaleDate = activosWithValor[0].dateStr || '';
        currentSaleValor = activosWithValor[0].valor || '';
      } else if (activosRows.length > 0) {
        currentSaleDate = activosRows[0].dateStr || '';
        currentSaleValor = ''; // treat as developer transfer
      }
      pastSales = [];
    } else {
      // There are historical sales. Disregard the oldest (developer transfer), keep newer ones as past sales
      const historical = inactivosRows.slice(1)
        .filter(h => Number.isFinite(h.valorNum) && h.valorNum > 0)
        .sort((a, b) => b.date - a.date); // newest first
      pastSales = historical.map(h => ({ dateStr: h.dateStr || '', valor: h.valor || '' }));
      // Current sale from activos (if present)
      const activosWithValor = activosRows.filter(r => Number.isFinite(r.valorNum) && r.valorNum > 0);
      if (activosWithValor.length > 0) {
        currentSaleDate = activosWithValor[0].dateStr || '';
        currentSaleValor = activosWithValor[0].valor || '';
      }
    }

    // Decide best valor for $/m2: current sale valor if present, else Datos Generales (do NOT use developer initial transfer)
    const bestValorStr = currentSaleValor || valorBaseStr || '';
    const bestValorNum = parseNumber(bestValorStr);
    const precioPorM2 = computePricePerM2(bestValorNum, areaM2 ?? null);

    // Skip properties that have no real sale with numeric valor (currentSaleValor missing) — per requirement
    const hasNumericCurrent = Number.isFinite(parseNumber(currentSaleValor)) && parseNumber(currentSaleValor) > 0;
    if (!hasNumericCurrent) {
      return null;
    }

    return {
      buildingName,
      unitNumber,
      unitNumberUI,
      unitNumberHeuristic,
      ownerName,
      currentSaleDate,
      currentSaleValor: currentSaleValor || '',
      pastSales, // unbounded array
      areaM2: areaM2 ?? '',
      precioPorM2
    };
  });
  // Remove null entries (no valid sale)
  const filteredEntries = marketEntries.filter(e => e !== null);
  // Determine the maximum number of past sales across properties
  const maxPastSales = filteredEntries.reduce((max, e) => Math.max(max, e.pastSales.length), 0);
  // Local helpers for date formatting in this section
  const parseDateForMarket = (s) => {
    if (!s) return 0;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const [d, m, y] = s.split(/[\/ ]/);
      return new Date(+y, +m - 1, +d).getTime();
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };
  const formatDateEs = (s) => {
    const ts = parseDateForMarket(s);
    if (!ts) return s || '';
    try {
      return new Date(ts).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: '2-digit' });
    } catch {
      return s || '';
    }
  };
  // Second pass: expand into rows with dynamic columns
  const marketAnalysisData = filteredEntries.map(e => {
    const row = {
      'Building name - Properties': e.buildingName,
      'Unit Number - Properties': e.unitNumberUI || e.unitNumberHeuristic || e.unitNumber || '',
      'Owner - Properties': e.ownerName,
      'Current Sale - Date': formatDateEs(e.currentSaleDate),
      'Current Sale - Valor': e.currentSaleValor,
      'MT2 - Properties': e.areaM2,
      '$ x mt2 - Calculation': e.precioPorM2
    };
    for (let i = 0; i < maxPastSales; i++) {
      const p = e.pastSales[i];
      const pValor = p?.valor || '';
      row[`Past Sale ${i + 1} - Date`] = p ? formatDateEs(p.dateStr || '') : '';
      row[`Past Sale ${i + 1} - Valor`] = pValor;
      // Compute $/m2 for each past sale as well
      const pastM2 = computePricePerM2(parseNumber(pValor), e.areaM2 ? Number(e.areaM2) : null);
      row[`Past Sale ${i + 1} - $ x mt2`] = pastM2;
    }
    return row;
  });
  const marketSheet = XLSX.utils.json_to_sheet(marketAnalysisData);
  XLSX.utils.book_append_sheet(workbook, marketSheet, getSafeSheetName('Market Analysis', usedSheetNames));

  // Removed extra sheets; price per m2 now appears as a column on Properties sheet.

  if (Array.isArray(mercantilRows) && mercantilRows.length > 0) {
    const mercSheet = XLSX.utils.json_to_sheet(mercantilRows);
    XLSX.utils.book_append_sheet(workbook, mercSheet, getSafeSheetName('Mercantil Members', usedSheetNames));
  }
  
  if (changesData.length > 0) {
    const written = await exportChangesWorkbook(changesData, changesFile);
    console.log(`🟡 Change report written to ${changesFile} (${written} rows).`);
  } else if (fs.existsSync(changesFile)) {
    try {
      fs.unlinkSync(changesFile);
      console.log(`🗑️  No changes detected — removed previous change report (${changesFile}).`);
    } catch (error) {
      console.warn(`⚠️  Unable to remove previous change report (${changesFile}): ${error.message}`);
    }
  }

  
  // Write file
  XLSX.writeFile(workbook, outputFile);
  console.log(`✅ Excel file created: ${outputFile}`);
  console.log(`   Properties: ${properties.length}`);
  
  // Return change information for email notifications
  return {
    hasChanges: changesData.length > 0,
    changesData,
    changesFile: changesData.length > 0 ? changesFile : null
  };
}

// ===== EXTRACTION LOGIC =====

export async function extractDatosGenerales(page, expectedFolioNumber = null) {
  console.log('\n🔍 Extracting Datos Generales...');
  const result = await page.evaluate((expectedFolio) => {
    const data = {};
    
    // Find ALL visible modals and get the LAST one (most recently opened)
    const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
    const visibleModals = modals.filter(modal => {
      const style = window.getComputedStyle(modal);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    
    // If we have an expected folio, try to find the modal with that folio
    let activeModal = null;
    if (expectedFolio && visibleModals.length > 0) {
      activeModal = visibleModals.find(modal => {
        const title = modal.querySelector('.blazored-modal-title')?.textContent || '';
        return title.includes(expectedFolio);
      });
    }
    
    // Fallback: use the last visible modal (most recent)
    if (!activeModal && visibleModals.length > 0) {
      activeModal = visibleModals[visibleModals.length - 1];
    }
    
    // Final fallback
    if (!activeModal) {
      activeModal = modals[modals.length - 1] || document.body;
    }
    
    // Parse data using DOM structure (more reliable than innerText)
    const parseDatosGenerales = () => {
      // Find the Datos Generales section - look for the active tab content
      // The active tab has btn-primary class
      const tabContent = activeModal.querySelector('.tabestado') || 
                        activeModal.querySelector('.DatosGenerales') ||
                        activeModal;
      
      // Find all dt/dd pairs in dl-horizontal structure
      const dlElements = tabContent.querySelectorAll('dl.dl-horizontal');
      
      for (const dl of dlElements) {
        const dts = dl.querySelectorAll('dt');
        const dds = dl.querySelectorAll('dd');
        
        for (let i = 0; i < dts.length && i < dds.length; i++) {
          const label = dts[i].textContent?.trim() || '';
          const value = dds[i].textContent?.trim() || '';
          
          // Map common labels to data keys
          if (label.includes('FOLIO / FINCA / FICHA')) {
            data['FOLIO / FINCA / FICHA'] = value;
          } else if (label.includes('FECHA DE INSCRIPCIÓN')) {
            data['FECHA DE INSCRIPCIÓN'] = value;
          } else if (label.includes('PROPIETARIO') && !label.includes('DOMICILIO')) {
            data['PROPIETARIO'] = value;
          } else if (label.includes('DOMICILIO')) {
            data['DOMICILIO'] = value;
          } else if (label.includes('USO DEL SUELO')) {
            data['USO DEL SUELO'] = value;
          } else if (label.includes('OTRO TIPO')) {
            data['OTRO TIPO'] = value;
          } else if (label.includes('DESCRIPCIÓN')) {
            data['DESCRIPCIÓN'] = value;
          } else if (label.includes('POR EDIFICIO')) {
            data['POR EDIFICIO'] = value;
          } else if (label.includes('% DE PROINDIVISO') || label.includes('PROINDIVISO')) {
            data['% DE PROINDIVISO'] = value;
          } else if (label.includes('CÉDULA CATASTRAL')) {
            data['CÉDULA CATASTRAL'] = value;
          } else if (label === 'VALOR' || (label.includes('VALOR') && !label.includes('TERRENO') && !label.includes('MEJORAS') && !label.includes('TRASPASO'))) {
            data['VALOR'] = value;
          } else if (label.includes('VALOR DEL TERRENO')) {
            data['VALOR DEL TERRENO'] = value;
          } else if (label.includes('VALOR DE MEJORAS')) {
            data['VALOR DE MEJORAS'] = value;
          } else if (label.includes('VALOR DEL TRASPASO')) {
            data['VALOR DEL TRASPASO'] = value;
          } else if (label.includes('NÚMERO DE PLANO')) {
            data['NÚMERO DE PLANO'] = value;
          } else if (label.includes('FECHA DE CONSTRUCCIÓN')) {
            data['FECHA DE CONSTRUCCIÓN'] = value;
          } else if (label.includes('FECHA DE OCUPACIÓN')) {
            data['FECHA DE OCUPACIÓN'] = value;
          } else if (label.includes('LOTE')) {
            data['LOTE'] = value;
          } else if (label.includes('SUPERFICIE INICIAL')) {
            data['SUPERFICIE INICIAL'] = value;
          } else if (label.includes('SUPERFICIE / RESTO LIBRE') || label.includes('SUPERFICIE') && label.includes('RESTO')) {
            data['SUPERFICIE / RESTO LIBRE'] = value;
          } else if (label.includes('COLINDANCIAS')) {
            data['COLINDANCIAS'] = value;
          }
        }
      }
    };
    
    parseDatosGenerales();
    
    // Get modal info for debugging
    const modalTitle = activeModal.querySelector('.blazored-modal-title')?.textContent || '';
    const folioMatch = modalTitle.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
    const modalFolio = folioMatch ? folioMatch[1] : '';
    
    return {
      data,
      modalFound: !!activeModal && activeModal !== document.body,
      modalIsBody: activeModal === document.body,
      modalFolio: modalFolio,
      expectedFolio: expectedFolio || '',
      visibleModalsCount: visibleModals.length,
      modalTextSample: activeModal.innerText?.substring(0, 200)
    };
  }, expectedFolioNumber);
  
  console.log(`    Modal found: ${result.modalFound}`);
  console.log(`    Visible modals: ${result.visibleModalsCount}`);
  console.log(`    Expected folio: ${result.expectedFolio || 'N/A'}`);
  console.log(`    Modal folio: ${result.modalFolio || 'N/A'}`);
  console.log(`    Owner: ${result.data['PROPIETARIO'] || 'NONE'}`);
  console.log(`    Value: ${result.data['VALOR'] || 'NONE'}`);
  await saveModalHTML(page, 'datos_generales_dom');

  return result.data;
}

/**
 * Discovers every tab available on the currently-open record modal (property or
 * entity — both use the same .ventana-con-tab-control UI), by reading the tab
 * button group's text at runtime rather than assuming a fixed list. Used by
 * lib/fullRecordExtraction.js for the "pull every tab, every run" daily monitoring
 * path (see CLAUDE.md, Sept 2026 decision) — this is what makes that generic
 * across whatever tabs a given record type actually has, present or future.
 * @param {import('puppeteer').Page} page
 * @param {string} [expectedFolio] - used to pick the right modal if more than one is open
 * @returns {Promise<string[]>} tab names, in on-page order, excluding "Datos Generales"
 *   (handled separately by extractDatosGenerales/the entity search summary)
 */
export async function discoverAvailableTabs(page, expectedFolio = null) {
  try {
    await page.waitForSelector('.ventana-con-tab-control .btn-group button, .btn-group[role="group"] button', { timeout: 15000 });
  } catch {
    // fall through — evaluate below will just find nothing if the control never appeared
  }
  return await page.evaluate((expected) => {
    const modals = Array.from(document.querySelectorAll('.blazored-modal-container, .blazored-modal, .modal'))
      .filter(m => { const s = getComputedStyle(m); return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; });
    let activeModal = null;
    if (expected && modals.length > 0) {
      activeModal = modals.find(m => (m.querySelector('.blazored-modal-title')?.textContent || '').includes(expected));
    }
    if (!activeModal) activeModal = modals.length > 0 ? modals[modals.length - 1] : document.body;

    const tabControl = activeModal.querySelector('.ventana-con-tab-control');
    let btnGroup = tabControl ? tabControl.querySelector('.btn-group[role="group"]') : null;
    if (!btnGroup) btnGroup = activeModal.querySelector('.btn-group[role="group"]');
    if (!btnGroup) btnGroup = activeModal.querySelector('.btn-group');
    if (!btnGroup) return [];

    return Array.from(btnGroup.querySelectorAll('button'))
      .map(btn => btn.textContent?.trim())
      .filter(text => text && text !== 'Datos Generales');
  }, expectedFolio);
}

export async function extractTabData(page, tabName, expectedFolioNumber = null) {
    try {
      const searchNames = Array.isArray(tabName) ? tabName : [tabName];
      const displayName = Array.isArray(tabName) ? tabName[0] : tabName;
      
      console.log(`\n    🔄 Extracting ${displayName} tab...`);
  
      // Click the tab button inside the correct modal
      const clicked = await page.evaluate((names, expectedFolio) => {
        // Get all visible modals
        const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
        const visibleModals = modals.filter(modal => {
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        // If we have an expected folio, try to find the modal with that folio
        let activeModal = null;
        if (expectedFolio && visibleModals.length > 0) {
          activeModal = visibleModals.find(modal => {
            const title = modal.querySelector('.blazored-modal-title')?.textContent || '';
            return title.includes(expectedFolio);
          });
        }
        
        // Fallback: use the last visible modal (most recent)
        if (!activeModal && visibleModals.length > 0) {
          activeModal = visibleModals[visibleModals.length - 1];
        }
        
        // Final fallback
        if (!activeModal) {
          activeModal = document.body;
        }

        // Find buttons within the tab control area
        const tabControl = activeModal.querySelector('.ventana-con-tab-control');
        const searchArea = tabControl || activeModal;
        const buttons = Array.from(searchArea.querySelectorAll('.btn-group button, button'));
        
        for (const name of names) {
          const btn = buttons.find(el => el.textContent?.trim().includes(name));
          if (btn) {
            btn.scrollIntoView({ block: 'center', behavior: 'instant' });
            btn.click();
            return btn.textContent?.trim() || true;
          }
        }
        return false;
      }, searchNames, expectedFolioNumber);
  
      if (clicked) {
        console.log(`    ✓ Clicked "${clicked}" tab`);
      } else {
        console.log(`    ⚠️ Could not find tab button for "${displayName}"`);
        return [];
      }
  
      // Wait for the tab content to load
      await new Promise(resolve => setTimeout(resolve, 2500));
  
      // Screenshot for debugging
      await saveDebugScreenshot(page, `tab_${displayName.replace(/\s/g, '_')}`);
      
      // Check modal state
      await debugModalState(page, `After clicking ${displayName} tab`);
      await saveModalHTML(page, `tab_${displayName.replace(/\s/g, '_')}_dom`);
  
      // Extract table data from the correct modal
      const result = await page.evaluate((expectedFolio) => {
        // Get all visible modals
        const modals = Array.from(document.querySelectorAll(".blazored-modal-container"));
        const visibleModals = modals.filter(modal => {
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        // If we have an expected folio, try to find the modal with that folio
        let activeModal = null;
        if (expectedFolio && visibleModals.length > 0) {
          activeModal = visibleModals.find(modal => {
            const title = modal.querySelector('.blazored-modal-title')?.textContent || '';
            return title.includes(expectedFolio);
          });
        }
        
        // Fallback: use the last visible modal (most recent)
        if (!activeModal && visibleModals.length > 0) {
          activeModal = visibleModals[visibleModals.length - 1];
        }
        
        // Final fallback
        if (!activeModal) {
          activeModal = document.body;
        }

        // Find tables within the active tab content area
        // First, try to find the active tab content by looking for visible tabestado
        let tabContent = null;
        
        // Look for visible tabestado elements (active tab content)
        const allTabEstados = activeModal.querySelectorAll('.tabestado');
        for (const te of allTabEstados) {
          const style = window.getComputedStyle(te);
          // Check if this tab content is visible
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            tabContent = te;
            break;
          }
        }
        
        // Fallback: look for tabestado without checking visibility
        if (!tabContent) {
          tabContent = activeModal.querySelector('.tabestado');
        }
        
        // Final fallback: use the modal itself
        if (!tabContent) {
          tabContent = activeModal;
        }
        
        // Get all tables, but filter out hidden ones
        const allTables = tabContent.querySelectorAll("table");
        const tables = Array.from(allTables).filter(table => {
          const style = window.getComputedStyle(table);
          // Skip completely hidden tables
          if (style.display === 'none' && style.visibility === 'hidden') {
            return false;
          }
          // Also check parent visibility
          let parent = table.parentElement;
          let isVisible = true;
          while (parent && parent !== activeModal) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
              isVisible = false;
              break;
            }
            parent = parent.parentElement;
          }
          return isVisible;
        });

        if (tables.length === 0) {
          return {
            data: [],
            debug: {
              modalFound: visibleModals.length > 0,
              modalIsBody: activeModal === document.body,
              tablesFound: 0,
              visibleModalsCount: visibleModals.length,
              modalTextSample: activeModal.innerText?.substring(0, 200)
            }
          };
        }

        // DevExpress grids have separate tables for header and body
        // Find the header table (has thead) and body table (has tbody with data)
        let headerTable = null;
        let bodyTable = null;
        let maxDataRows = 0;
        
        for (const table of tables) {
          const hasThead = table.querySelector('thead');
          const hasTbody = table.querySelector('tbody');
          const dataRows = Array.from(table.querySelectorAll("tr.dxbs-data-row, tbody tr"));
          
          // Check if this table has data rows
          const validRows = dataRows.filter(row => {
            const cells = row.querySelectorAll("td, th");
            const hasData = Array.from(cells).some(cell => {
              const text = cell.textContent?.trim();
              return text && text.length > 0 && !text.includes('Asiento'); // Skip action buttons
            });
            return hasData && !row.classList.contains('dxbs-filter-row');
          });
          
          if (hasThead && !headerTable) {
            headerTable = table;
          }
          
          if (validRows.length > maxDataRows) {
            maxDataRows = validRows.length;
            bodyTable = table;
          }
        }
        
        // Use bodyTable for data extraction, but extract headers from headerTable if available
        const bestTable = bodyTable || tables[tables.length - 1];
        const headerSourceTable = headerTable || bestTable;

        // Extract headers from the header table - try multiple methods
        const headers = [];
        
        // Method 1: Try thead > tr > th (DevExpress uses nested structure)
        const thead = headerSourceTable.querySelector('thead');
        if (thead) {
          const headerRows = thead.querySelectorAll('tr');
          if (headerRows.length > 0) {
            // Use the last header row (most specific)
            const headerRow = headerRows[headerRows.length - 1];
            const headerCells = headerRow.querySelectorAll('th');
            
            headerCells.forEach(cell => {
              // DevExpress headers are nested: th > div > a or th > span
              // Try to get text from the innermost element first
              const link = cell.querySelector('a');
              const span = cell.querySelector('span');
              let text = '';
              
              if (link) {
                text = link.innerText || link.textContent || '';
              } else if (span) {
                text = span.innerText || span.textContent || '';
              } else {
                // Fallback to cell's own text
                text = cell.innerText || cell.textContent || '';
              }
              
              // Clean up: remove extra whitespace, newlines, trim
              text = text.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
              
              // Skip empty headers and command/action columns (like "Asiento" button)
              if (text && text.length > 0 && !text.toLowerCase().includes('asiento')) {
                headers.push(text);
              }
            });
          }
        }
        
        // Method 2: If no headers found, check headerSourceTable for all th elements
        if (headers.length === 0 || headers.every(h => !h)) {
          const allTh = headerSourceTable.querySelectorAll('th');
          if (allTh.length > 0) {
            headers.length = 0;
            // Group by row to find the header row
            const thByRow = new Map();
            allTh.forEach(th => {
              const row = th.closest('tr');
              if (row) {
                if (!thByRow.has(row)) {
                  thByRow.set(row, []);
                }
                thByRow.get(row).push(th);
              }
            });
            
            // Use the row with the most th elements (likely the header row)
            let maxThCount = 0;
            let headerRowCells = [];
            thByRow.forEach((cells, row) => {
              if (cells.length > maxThCount) {
                maxThCount = cells.length;
                headerRowCells = cells;
              }
            });
            
            if (headerRowCells.length > 0) {
              headerRowCells.forEach(cell => {
                // Try nested elements first
                const link = cell.querySelector('a');
                const span = cell.querySelector('span');
                let text = '';
                
                if (link) {
                  text = link.innerText || link.textContent || '';
                } else if (span) {
                  text = span.innerText || span.textContent || '';
                } else {
                  text = cell.innerText || cell.textContent || '';
                }
                
                text = text.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
                
                // Skip action columns
                if (text && !text.toLowerCase().includes('asiento')) {
                  headers.push(text);
                }
              });
            }
          }
        }
        
        // Final cleanup: remove empty headers and ensure we have valid headers
        const cleanedHeaders = headers.filter(h => h && h.length > 0);
        if (cleanedHeaders.length > 0) {
          headers.length = 0;
          headers.push(...cleanedHeaders);
        }
        
        // Extract data rows
        const tbody = bestTable.querySelector('tbody');
        const dataRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
        
        // Filter out header rows and empty rows
        const allRows = dataRows
          .filter(row => {
            // Skip filter rows, header rows, and empty rows
            if (row.classList.contains('dxbs-filter-row')) return false;
            if (row.classList.contains('dxbs-th')) return false;
            
            // Skip if this row looks like a header (all th cells)
            const cells = row.querySelectorAll("td, th");
            const allTh = Array.from(cells).every(cell => cell.tagName === 'TH');
            if (allTh && headers.length > 0) return false; // Already have headers, skip this row
            
            const hasData = Array.from(cells).some(cell => cell.textContent?.trim());
            return hasData;
          })
          .map((row) => {
            // Get all cells in order (td and th, but prefer td for data rows)
            const cells = Array.from(row.querySelectorAll("td, th"));
            const rowData = {};
            
            // Skip if this row only has th elements and we already have headers (it's a header row)
            const allTh = cells.every(cell => cell.tagName === 'TH');
            if (allTh && headers.length > 0) {
              return null; // This is a header row, skip it
            }
            
            // Map each cell to its corresponding header
            // Skip command/action columns (like buttons)
            let dataColumnIndex = 0; // Track data columns separately from cell index
            
            cells.forEach((cell) => {
              // Skip command/action cells (buttons, icons, etc.)
              if (cell.classList.contains('dxbs-cmd-cell')) {
                return; // Skip this cell
              }
              
              // Check if this is a command cell by looking for buttons or icons
              const hasButton = cell.querySelector('button, .btn, .fa, i[class*="fa"]');
              if (hasButton) {
                return; // Skip action columns
              }
              
              // Get the column index for data columns
              const columnIndex = dataColumnIndex;
              dataColumnIndex++; // Increment only when we actually capture a data cell
              
              // Get header text for this column
              let headerText = '';
              if (columnIndex < headers.length && headers[columnIndex]) {
                headerText = headers[columnIndex];
              } else if (headers.length > 0 && headerSourceTable) {
                // If we have headers but this index is beyond, try to find header
                const thead = headerSourceTable.querySelector('thead');
                if (thead) {
                  const headerRow = thead.querySelector('tr');
                  if (headerRow) {
                    // Get all th elements, but skip command cells
                    const allHeaderCells = Array.from(headerRow.querySelectorAll('th'));
                    const dataHeaderCells = allHeaderCells.filter(th => {
                      return !th.classList.contains('dxbs-cmd-cell') && 
                             !th.querySelector('button, .btn');
                    });
                    if (columnIndex < dataHeaderCells.length) {
                      const headerCell = dataHeaderCells[columnIndex];
                      const link = headerCell.querySelector('a');
                      const span = headerCell.querySelector('span');
                      if (link) {
                        headerText = (link.innerText || link.textContent || '').trim();
                      } else if (span) {
                        headerText = (span.innerText || span.textContent || '').trim();
                      } else {
                        headerText = (headerCell.innerText || headerCell.textContent || '').trim();
                      }
                    }
                  }
                }
              }
              
              // Clean up header text
              headerText = headerText.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
              
              // Get cell value (use innerText first, then textContent)
              const value = (cell.innerText || cell.textContent || '').trim();
              
              // Determine the key to use
              let key = '';
              if (headerText && headerText.length > 0) {
                key = headerText;
              } else {
                // Last resort: use column index
                key = `Column${columnIndex + 1}`;
              }
              
              // Store the value (even if empty, to maintain column structure)
              // But only if we have a valid key
              if (key) {
                rowData[key] = value;
              }
            });
            
            // Only return row if it has at least one non-empty value
            const hasData = Object.values(rowData).some(v => v && v.toString().trim().length > 0);
            if (!hasData) {
              return null;
            }

            // Skip rows that just repeat header titles (e.g., "Folio / Finca / Ficha")
            const normalizedRowEntries = Object.entries(rowData).map(([key, value]) => {
              const normKey = (key || "").replace(/\s+/g, " ").trim().toLowerCase();
              const normValue = (value || "").replace(/\s+/g, " ").trim().toLowerCase();
              return { normKey, normValue };
            });

            const isHeaderDuplicateRow =
              normalizedRowEntries.length > 0 &&
              normalizedRowEntries.every(({ normKey, normValue }) => normValue && normValue === normKey);

            if (isHeaderDuplicateRow) {
              return null;
            }

            return rowData;
          })
          .filter(row => row !== null); // Remove null rows

        return {
          data: allRows,
          debug: {
            modalFound: visibleModals.length > 0,
            modalIsBody: activeModal === document.body,
            tablesFound: tables.length,
            rowsFound: dataRows.length,
            dataRowsExtracted: allRows.length,
            visibleModalsCount: visibleModals.length,
            headersFound: headers.length,
            headers: headers,
            sampleRow: allRows.length > 0 ? Object.keys(allRows[0]) : []
          }
        };
      }, expectedFolioNumber);
  
      console.log(`    Debug info:`);
      console.log(`      Modal found: ${result.debug.modalFound}`);
      console.log(`      Visible modals: ${result.debug.visibleModalsCount || 1}`);
      console.log(`      Is body: ${result.debug.modalIsBody}`);
      console.log(`      Tables: ${result.debug.tablesFound}`);
      console.log(`      Headers found: ${result.debug.headersFound || 0}`);
      if (result.debug.headers && result.debug.headers.length > 0) {
        console.log(`      Headers: ${result.debug.headers.join(' | ')}`);
      } else {
        console.log(`      ⚠️  NO HEADERS FOUND - This will cause Column1, Column2, etc.`);
      }
      if (result.debug.sampleRow && result.debug.sampleRow.length > 0) {
        console.log(`      Sample row keys: ${result.debug.sampleRow.join(', ')}`);
        if (result.debug.sampleRow.some(k => k.startsWith('Column'))) {
          console.log(`      ⚠️  WARNING: Using generic column names (Column1, Column2, etc.)`);
          console.log(`      ⚠️  This means headers were not extracted correctly`);
        }
      }
      console.log(`      Rows extracted: ${result.debug.dataRowsExtracted}`);
      
      return result.data.length > 0 ? result.data : [];
  
    } catch (error) {
      console.log(`    ❌ Error in ${tabName}: ${error.message}`);
      return [];
    }
  }
  

async function closeModal(page, closeAll = false) {
  // Attempt graceful close
  await page.evaluate((closeAllModals) => {
    const modalSelectors = ['.blazored-modal-container', '.modal.show'];
    const modals = modalSelectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
    const visibleModals = modals.filter(modal => {
      const style = window.getComputedStyle(modal);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    const modalsToClose = closeAllModals ? visibleModals : (visibleModals.length > 0 ? [visibleModals[visibleModals.length - 1]] : []);
    for (const modal of modalsToClose) {
      // Try common close controls inside this modal
      const candidates = [
        '.blazored-modal-close',
        'button.close',
        '.btn-close',
        '[data-dismiss="modal"]',
        'button[aria-label="Close"]',
        'button[type="button"][class*="close"]'
      ];
      let closed = false;
      for (const sel of candidates) {
        const btn = modal.querySelector(sel);
        if (btn && typeof btn.click === 'function') { btn.click(); closed = true; break; }
      }
      if (!closed) {
        const spanX = Array.from(modal.querySelectorAll('span')).find(s => (s.textContent || '').trim() === '×');
        const parentBtn = spanX && spanX.closest && spanX.closest('button');
        if (parentBtn && typeof parentBtn.click === 'function') { parentBtn.click(); closed = true; }
      }
    }
    // Click any visible backdrop to close
  const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
  backdrops.forEach(b => { if (typeof b.click === 'function') b.click(); });
  }, closeAll);

  // Try Escape a couple of times
  await page.keyboard.press('Escape').catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  await page.keyboard.press('Escape').catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Verify
  let stillOpen = await page.evaluate(() => {
    const modals = [
      ...Array.from(document.querySelectorAll('.blazored-modal-container')),
      ...Array.from(document.querySelectorAll('.modal.show'))
    ];
    return modals.filter(m => {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }).length;
  });
  if (stillOpen > 0 && closeAll) {
    console.log(`    ⚠️  Warning: ${stillOpen} modal(s) still open after close attempt, forcing removal`);
    // Force remove stubborn modals/backdrops
    await page.evaluate(() => {
      document.querySelectorAll('.blazored-modal-container,.modal.show,.modal-backdrop')
        .forEach(el => el.parentElement?.removeChild(el));
      // Also clear any 'modal-open' class on body that prevents scroll
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });
    await new Promise(r => setTimeout(r, 500));
    stillOpen = await page.evaluate(() => {
      return document.querySelectorAll('.blazored-modal-container,.modal.show').length;
    });
    if (stillOpen > 0) {
      console.log(`    ⚠️  Warning: ${stillOpen} modal(s) still present after force removal`);
    }
  } else if (stillOpen > 0 && !closeAll) {
    // Try one more time closing all
    await closeModal(page, true);
  }
}

// ===== MAIN SCRAPER =====

async function scrapeBuilding(options = {}) {
  const buildingNameLocal = options.buildingName || BUILDING_NAME;
  // If building name is provided but search param is not, use building name as search param
  // Explicitly check if searchParam is undefined/null/empty, then use buildingName if available
  let searchParamLocal;
  if (options.searchParam && options.searchParam.trim() !== '') {
    searchParamLocal = options.searchParam;
  } else if (options.buildingName && options.buildingName.trim() !== '') {
    searchParamLocal = options.buildingName;
    console.log(`🔍 DEBUG: searchParam not provided, using buildingName: "${options.buildingName}"`);
  } else {
    searchParamLocal = SEARCH_PARAMETER;
    console.log(`🔍 DEBUG: Neither searchParam nor buildingName provided, using default: "${SEARCH_PARAMETER}"`);
  }
  
  // Additional debug output
  console.log(`🔍 DEBUG: searchParamLocal final value: "${searchParamLocal}"`);
  console.log(`🔍 DEBUG: options.searchParam: "${options.searchParam}"`);
  console.log(`🔍 DEBUG: options.buildingName: "${options.buildingName}"`);
  console.log(`🔍 DEBUG: BUILDING_NAME constant: "${BUILDING_NAME}"`);
  console.log(`🔍 DEBUG: SEARCH_PARAMETER constant: "${SEARCH_PARAMETER}"`);
  const maxToProcess = Number.isFinite(options.maxProperties) ? options.maxProperties : MAX_PROPERTIES_TO_PROCESS;
  // Prefer CLI-provided building name for slug; otherwise fall back to search parameter, then defaults
  const hasCliBuilding = typeof options.buildingName === 'string' && options.buildingName.trim() !== '';
  const slugSource = hasCliBuilding ? buildingNameLocal : (searchParamLocal || buildingNameLocal || 'building');
  const slugLocal = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'building';
  const outputFileLocal = `${OUTPUT_DIR}/${slugLocal}.xlsx`;
  const changesFileLocal = `${OUTPUT_DIR}/${slugLocal}_changes.xlsx`;
  // Be strict about detecting real AWS Lambda to avoid accidental headless on local/Docker
  const isLambdaEnv =
    (process.env.AWS_EXECUTION_ENV && /AWS_Lambda/i.test(process.env.AWS_EXECUTION_ENV)) ||
    (!!process.env.AWS_LAMBDA_FUNCTION_NAME && !!process.env.LAMBDA_TASK_ROOT && !!process.env.AWS_REGION);
  const fromApi = process.env.API_CALL === '1';
  const envHeadless = process.env.HEADLESS === '1' || process.env.FORCE_HEADLESS === '1';
  // Default headful; only go headless if explicitly requested via env/flag, or truly in Lambda
  const runHeadless = FORCE_HEADLESS !== null ? FORCE_HEADLESS : (envHeadless || isLambdaEnv);
  const runLocalOverride = process.env.RUN_LOCAL === '1';
  const contactModeEnabled = (options.contactMode !== undefined) ? !!options.contactMode : CONTACT_MODE;
  console.log('🚀 RP.GOB.PA SCRAPER\n');
  console.log(`📋 Building: ${buildingNameLocal}`);
  console.log(`🔍 Search Parameter: ${searchParamLocal}`);
  console.log(`🔍 DEBUG: Building name source - options.buildingName: "${options.buildingName}", BUILDING_NAME env: "${process.env.BUILDING_NAME}", default: "${BUILDING_NAME}"`);
  console.log(`🔍 DEBUG: Search param source - options.searchParam: "${options.searchParam}", SEARCH_PARAMETER env: "${process.env.SEARCH_PARAMETER}", default: "${SEARCH_PARAMETER}"`);
  console.log(`🔍 Max properties: ${maxToProcess}`);
  // Show mercantil status prominently at startup
  const willRunMercantil = options.mercantil !== false && options.mercantil !== 0 && options.mercantil !== '0' && options.mercantil !== 'false';
  console.log(`\n${'='.repeat(60)}`);
  if (willRunMercantil) {
    console.log('🏛️  MERCANTIL ENRICHMENT: ENABLED (will run after scraping)');
    console.log('   Corporate owners will be enriched with Mercantil registry data');
  } else {
    console.log('🏛️  MERCANTIL ENRICHMENT: DISABLED');
    console.log('   Set --mercantil 1 to enable');
  }
  console.log('='.repeat(60));
  console.log('');
  console.log(`📁 Debug output: ${DEBUG_DIR}`);
  console.log(`📊 Output file: ${outputFileLocal}\n`);
  console.log(`🖥️  Mode: ${isLambdaEnv ? 'AWS Lambda' : (fromApi ? 'API' : 'Local')} | Headless: ${runHeadless ? 'Yes' : 'No'}`);
  if (contactModeEnabled) {
    console.log(`📫 Contact Search Mode: ON\n`);
  } else {
    console.log('');
  }
  
  // Configure 2Captcha mode
  const captchaMode = (options.captchaMode || process.env.CAPTCHA_MODE || 'backup').toString().trim().toLowerCase();
  // Enable plugin whenever mode is not 'off' so backup can be used on-demand
  process.env.CAPTCHA_PLUGIN = (captchaMode === 'off') ? '' : '1';
  console.log(`🔒 CAPTCHA mode: ${captchaMode} | Plugin: ${process.env.CAPTCHA_PLUGIN === '1' ? 'ON' : 'OFF'}`);

  // Clear previous data
  allProperties.length = 0;

  const browser = runHeadless
    ? await launchBrowserLambdaHeadless()
    : await launchBrowserHeadful();

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // 2Captcha plugin test mode: skip session restore and all auto-actions; just invoke solver
    if (TWO_CAPTCHA_TEST_MODE) {
      console.log('🧪 2Captcha Test Mode: ON (skipping session restore and auto actions)');
      await page.goto('https://www.rp.gob.pa/LoginUsuario', { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Give the page a moment to render the widget
      await sleep(1500);
      await debugCaptchaSnapshot(page, 'test_mode_before');
      await solveRecaptchasWithDebug(page, 'test_mode_solve');
      // Pause briefly to allow any UI feedback to be visible, then exit
      await sleep(2000);
      return;
    }

    console.log('🌐 Restoring session (if available)...');
    await auth.restoreSessionCookies(page);
    let loggedIn = await auth.isLoggedIn(page);
    if (!loggedIn) {
      loggedIn = await auth.performLogin(page);
      if (!loggedIn) {
        if (FULL_AUTO_MODE) {
          throw new Error('Login failed in FULL_AUTO_MODE.');
        } else {
          throw new Error('Login failed. CAPTCHA may be blocking automated access.');
        }
      }
      await auth.saveSessionCookies(page);
    }

    // Ensure we are on Folios page; prefer UI click, fallback to direct URL; no re-login loops
    const reachedFolios = await openFoliosPage(page).catch(() => false);
    if (!reachedFolios) {
      console.warn('⚠️  Folios page not detected; proceeding to attempt UI navigation in workflow.');
    }
    
    console.log('🔍 Navigating to property search...\n');
    
    // Step 1: Click Folios (EXACT COPY)
    if (!(await isOnFoliosPage(page))) {
      console.log('  ⏳ Step 1: Clicking Folios...');
      await page.waitForFunction(() => {
        const elements = Array.from(document.querySelectorAll('a, button, div, span'));
        return elements.some(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
      }, { timeout: 30000 });
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, div, span'));
        const candidates = elements.filter(el => (el.textContent || '').trim().toLowerCase().includes('folios'));
        let target = candidates.find(e => e.tagName === 'A' || e.tagName === 'BUTTON') || candidates[0];
        if (!target && candidates.length) {
          let p = candidates[0].parentElement;
          while (p && p !== document.body) {
            if (p.tagName === 'A' || p.tagName === 'BUTTON' || p.getAttribute('role') === 'button') { target = p; break; }
            p = p.parentElement;
          }
        }
        if (target) target.click();
      });
      await page.waitForFunction(() => {
        const bodyText = (document.body && document.body.innerText) || '';
        return /Búsqueda de Folios|Folios\s*\/\s*Fincas\s*\/\s*Fichas/i.test(bodyText) || window.location.href.includes('BusquedaFolios');
      }, { timeout: 15000 }).catch(() => {});
      console.log('     ✓ Clicked Folios');
    } else {
      console.log('     ✓ Already on Folios');
    }
    
    // Step 2: Select Inmuebles (EXACT COPY)
    console.log('  ⏳ Step 2: Selecting Inmuebles...');
    await page.waitForSelector('select', { timeout: 10000 });
    const selects = await page.$$('select');
    for (const select of selects) {
      const name = await select.evaluate(el => el.getAttribute('name') || el.getAttribute('id') || '');
      if (name.toLowerCase().includes('tipobusqueda') || name.toLowerCase().includes('tipo')) {
        await select.select('Inmuebles');
        break;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('     ✓ Selected Inmuebles');
    
    // Step 3: Click Datos del Inmueble tab (EXACT COPY)
    console.log('  ⏳ Step 3: Clicking Datos del Inmueble tab...');
    await page.waitForSelector('button.btn.btn-secondary', { timeout: 10000 });
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const datosBtn = buttons.find(btn => btn.textContent?.trim() === 'Datos del Inmueble');
      if (datosBtn) datosBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('     ✓ Clicked Datos del Inmueble tab');
    
    // Step 4: Expand Inmueble section (EXACT COPY)
    console.log('  ⏳ Step 4: Expanding Inmueble section...');
    await page.waitForFunction(() => {
      const h5s = Array.from(document.querySelectorAll('h5[style*="cursor:pointer"]'));
      return h5s.some(h5 => {
        const text = h5.textContent?.trim() || '';
        return text.includes('Inmueble') && !text.includes('Inmuebles') && !text.includes('Datos');
      });
    }, { timeout: 10000 });
    
    await page.evaluate(() => {
      const h5s = Array.from(document.querySelectorAll('h5[style*="cursor:pointer"]'));
      const inmuebleSection = h5s.find(h5 => {
        const text = h5.textContent?.trim() || '';
        return text.includes('Inmueble') && !text.includes('Inmuebles') && !text.includes('Datos');
      });
      if (inmuebleSection) inmuebleSection.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('     ✓ Expanded Inmueble section');
    
    // Step 5: Fill Por Edificio (EXACT COPY)
    console.log(`  ⏳ Step 5: Typing "${searchParamLocal}" in Por Edificio field...`);
    console.log(`  🔍 DEBUG: Search parameter value = "${searchParamLocal}"`);
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('label, div'));
      return labels.some(label => label.textContent?.includes('Por Edificio'));
    }, { timeout: 10000 });
    
    const porEdificioFilled = await page.evaluate((searchTerm) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      
      for (const input of inputs) {
        const container = input.closest('tr, div.row, div.form-group, div');
        if (container) {
          const text = container.textContent || '';
          if (text.includes('Por Edificio') && !text.includes('Dirección') && !text.includes('Cédula')) {
            input.value = searchTerm;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, value: input.value, method: 'container-match' };
          }
        }
      }
      
      const porEdificioInput = inputs.find(input => {
        const name = (input.getAttribute('name') || '').toLowerCase();
        const id = (input.getAttribute('id') || '').toLowerCase();
        return name.includes('edificio') || id.includes('edificio');
      });
      
      if (porEdificioInput) {
        porEdificioInput.value = searchTerm;
        porEdificioInput.dispatchEvent(new Event('input', { bubbles: true }));
        porEdificioInput.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, value: porEdificioInput.value, method: 'attribute-match' };
      }
      
      return { success: false, value: null, method: 'not-found' };
    }, searchParamLocal);
    
    if (!porEdificioFilled || !porEdificioFilled.success) {
      console.error('  ⚠️  Could not find Por Edificio input field');
    } else {
      console.log(`     ✓ Filled Por Edificio field (method: ${porEdificioFilled.method})`);
      console.log(`  🔍 DEBUG: Verified value in field = "${porEdificioFilled.value}"`);
      // Double-check by reading back the value
      const verifiedValue = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        for (const input of inputs) {
          const container = input.closest('tr, div.row, div.form-group, div');
          if (container) {
            const text = container.textContent || '';
            if (text.includes('Por Edificio') && !text.includes('Dirección') && !text.includes('Cédula')) {
              return input.value;
            }
          }
        }
        const porEdificioInput = inputs.find(input => {
          const name = (input.getAttribute('name') || '').toLowerCase();
          const id = (input.getAttribute('id') || '').toLowerCase();
          return name.includes('edificio') || id.includes('edificio');
        });
        return porEdificioInput ? porEdificioInput.value : null;
      });
      console.log(`  🔍 DEBUG: Final verification - field contains = "${verifiedValue}"`);
      if (verifiedValue !== searchParamLocal) {
        console.error(`  ❌ ERROR: Field value mismatch! Expected "${searchParamLocal}" but got "${verifiedValue}"`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 6: Click Buscar (EXACT COPY)
    console.log('  ⏳ Step 6: Clicking Buscar button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      const buscarBtn = buttons.find(btn => 
        btn.textContent?.includes('Buscar') || 
        btn.value?.includes('Buscar') ||
        btn.textContent?.includes('BUSCAR')
      );
      if (buscarBtn) buscarBtn.click();
    });
    console.log('     ✓ Clicked Buscar button');
    console.log('  ⏳ Waiting for search results...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await saveDebugScreenshot(page, 'search_results');
    
    // ===== PAGINATION-AWARE PROCESSING =====
    let processedCount = 0;
    let currentPageNumber = 1;
    while (processedCount < maxToProcess) {
      // Count rows on the current page (only data rows with a view button)
      const propertyCountOnPage = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr.dxbs-data-row'));
        return rows.filter(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length === 0) return false;
          const lastCell = cells[cells.length - 1];
          return !!lastCell.querySelector('button, a');
        }).length;
      });
      const remaining = maxToProcess - processedCount;
      const toProcessOnThisPage = Math.min(propertyCountOnPage, remaining);
      console.log(`\n📊 Page ${currentPageNumber}: ${propertyCountOnPage} properties (processing ${toProcessOnThisPage})\n`);
      if (toProcessOnThisPage <= 0) {
        console.log('⚠️  No properties to process on this page.');
      }
      
      for (let i = 0; i < toProcessOnThisPage; i++) {
      console.log(`\n${'='.repeat(60)}`);
        console.log(`PROPERTY ${processedCount + 1}/${Math.min(maxToProcess, processedCount + (propertyCountOnPage - i))}`);
      console.log('='.repeat(60));
      let property;
      let folioNumber = '';
      try {
      
      // Close any open modals before opening the next one (except for the first property)
      if (i > 0) {
        console.log('  🔒 Closing any open modals from previous property...');
        await closeModal(page, true); // Close all modals
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify modals are closed
        const stillOpen = await page.evaluate(() => {
          const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
          return modals.filter(modal => {
            const style = window.getComputedStyle(modal);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }).length;
        });
        
        if (stillOpen > 0) {
          console.log(`    ⚠️  Warning: ${stillOpen} modal(s) still open, trying again...`);
          await closeModal(page, true);
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          console.log('    ✓ All modals closed');
        }
      }
      
      // Click eye icon
      await page.evaluate((rowIndex) => {
        const rows = Array.from(document.querySelectorAll('tr'));
        let currentRow = 0;
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length > 0) {
            const verCell = cells[cells.length - 1];
            const button = verCell.querySelector('button, a');
            
            if (button && currentRow === rowIndex) {
              button.click();
              return;
            }
            if (button) currentRow++;
          }
        }
      }, i);
      
      console.log('✓ Clicked eye icon');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot immediately to see what happened
      await saveDebugScreenshot(page, `property_${i + 1}_after_click`);
      
      // Wait for modal with multiple checks (more robust)
      try {
        await page.waitForFunction(() => {
          // Check for modal container
          const modalContainer = document.querySelector('.blazored-modal-container');
          if (!modalContainer) return false;
          
          // Check if modal is visible
          const style = window.getComputedStyle(modalContainer);
          if (style.display === 'none') return false;
          
          // Check for modal content
          const hasTitle = document.body.innerText.includes('Folio Real');
          const hasDatos = document.body.innerText.includes('Datos Generales');
          
          return hasTitle || hasDatos;
        }, { timeout: 30000 });
        
        console.log('✓ Modal appeared');
      } catch (error) {
        console.log('⚠️  Modal did not appear - trying to continue anyway');
        await saveDebugScreenshot(page, `property_${i + 1}_modal_timeout`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await saveDebugScreenshot(page, `property_${i + 1}_opened`);
      await debugModalState(page, `Property ${i + 1} - Modal opened`);
      
      // Wait a bit more for modal to fully render
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Extract folio from the most recently opened modal
      const __folioRes = await page.evaluate(() => {
        // Get all visible modals and pick the last one (most recent)
        const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
        const visibleModals = modals.filter(modal => {
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        // Get the last visible modal (most recently opened)
        const lastModal = visibleModals.length > 0 ? visibleModals[visibleModals.length - 1] : null;
        if (!lastModal) {
          // Fallback: try all modals
          const allTitles = Array.from(document.querySelectorAll('.blazored-modal-title'));
          const lastTitle = allTitles[allTitles.length - 1];
          const titleText = lastTitle?.textContent || '';
          const match = titleText.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
          return { folioNumber: match ? match[1] : "" };
        }
        
        const titleEl = lastModal.querySelector('.blazored-modal-title');
        const titleText = titleEl?.textContent || '';
        const match = titleText.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
        return { folioNumber: match ? match[1] : "" };
      });
      folioNumber = __folioRes.folioNumber;
      
      console.log(`\n📄 Folio: ${folioNumber || 'NOT FOUND'}`);
      
      if (!folioNumber) {
        console.log('⚠️  Skipping - no folio');
        await closeModal(page);
          processedCount++;
          continue;
      }
      
      // Extract Datos Generales - pass folio number to ensure we get the right modal
      const datosGenerales = await extractDatosGenerales(page, folioNumber);
      const propietario = datosGenerales['PROPIETARIO'] || "";
      const valor = datosGenerales['VALOR'] || "0";
      
      await saveDebugScreenshot(page, `property_${i + 1}_datos_generales`);
      
      // Create property object
      property = {
        folioNumber,
        propietario,
        isPersonaJuridica: /\b(SRL|S\.A\.|Inc\.|Corp\.|Fundacion)\b/i.test(propietario),
        valor,
        datosGenerales,
        tabs: {},
        pdfExtraction: []
      };
      
      // Dynamically discover available tabs
      const availableTabs = await page.evaluate(() => {
        // Get all visible modals and pick the most recently added one (last in DOM order)
        const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
        const visibleModals = modals.filter(modal => {
          const style = window.getComputedStyle(modal);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        // Use the last visible modal (most recent)
        const activeModal = visibleModals.length > 0 ? visibleModals[visibleModals.length - 1] : document.body;

        // First try to find tabs within ventana-con-tab-control (most specific)
        const tabControl = activeModal.querySelector('.ventana-con-tab-control');
        let btnGroup = tabControl ? tabControl.querySelector('.btn-group[role="group"]') : null;
        
        // Fallback: look for button group directly in modal
        if (!btnGroup) {
          btnGroup = activeModal.querySelector('.btn-group[role="group"]');
        }
        
        // Final fallback: any button group
        if (!btnGroup) {
          btnGroup = activeModal.querySelector('.btn-group');
        }
        
        if (!btnGroup) {
          console.warn('No button group found for tabs');
          return [];
        }

        const buttons = Array.from(btnGroup.querySelectorAll('button'));
        const tabNames = buttons
          .map(btn => btn.textContent?.trim())
          .filter(text => text && text !== 'Datos Generales'); // Skip "Datos Generales" since we already extract it
        
        return tabNames;
      });

      console.log(`\n📑 Found ${availableTabs.length} tabs: ${availableTabs.join(', ')}`);
      
      // Process each discovered tab
      for (const tabName of availableTabs) {
        const tabData = await extractTabData(page, tabName, folioNumber);
        if (tabData && tabData.length > 0) {
          property.tabs[tabName] = tabData;
          console.log(`    ✅ ${tabName}: ${tabData.length} rows saved`);

          const targetMap = new Map();
          const addTargets = (keyword, type, label) => {
            const targets = collectTargets(tabData, keyword, type);
            if (targets.size > 0) {
              console.log(`    🔎 ${tabName}: ${targets.size} ${label} row(s) found - extracting datos del PDF...`);
            }
            targets.forEach((value, index) => {
              if (targetMap.has(index)) {
                value.types.forEach(t => targetMap.get(index).types.add(t));
              } else {
                targetMap.set(index, value);
              }
            });
          };

          addTargets(COMPRAVENTA_KEYWORDS, 'compraventa', 'Compraventa');
          if (ENABLE_HIPOTECA_EXTRACTION) {
            addTargets(HIPOTECA_KEYWORDS, 'hipoteca', 'Hipoteca');
          }

          let extractionCounter = 0;
          for (const target of targetMap.values()) {
            extractionCounter++;
            const typeLabel = Array.from(target.types).join(' & ');
            console.log(`      ⏳ Extrayendo datos (${typeLabel}) ${extractionCounter}/${targetMap.size}`);
            let pdfResult;
            try {
              pdfResult = await extractPdfDataFromRow(page, target, folioNumber);
            } catch (error) {
              const message = error?.message || String(error);
              console.log(`        ⚠️  PDF extraction threw: ${message}`);
              pdfResult = { success: false, reason: `runtime-error: ${message}` };
            }

            const rowData = property.tabs[tabName][target.index];
            if (rowData) {
              if (target.types.has('compraventa') && pdfResult.valorOperacion) {
                rowData[`${tabName} ${VALOR_OPERACION_LABEL}`] = formatCurrencyForDisplay(pdfResult.valorOperacion);
              }
              if (target.types.has('compraventa') && pdfResult.valorTraspaso) {
                // Format for display to ensure thousands and decimals appear correctly in the sheet
                rowData[`${tabName} ${TRASPASO_LABEL}`] = formatCurrencyForDisplay(pdfResult.valorTraspaso);
              }
              if (target.types.has('hipoteca')) {
                if (pdfResult.montoHipoteca) {
                  rowData[`${tabName} ${MONTO_HIPOTECA_LABEL}`] = formatCurrencyForDisplay(pdfResult.montoHipoteca);
                }
                if (pdfResult.plazoAnos) {
                  rowData[`${tabName} PLAZO (AÑOS)`] = pdfResult.plazoAnos;
                }
                if (pdfResult.tasaInteres) {
                  rowData[`${tabName} ${TASA_INTERES_LABEL}`] = pdfResult.tasaInteres;
                }
              }
            }

            property.pdfExtraction.push({
              tabName,
              rowIndex: target.index,
              types: Array.from(target.types),
              ...pdfResult
            });

            if (!pdfResult.success) {
              console.log(`        ⚠️  No se pudo extraer datos (${pdfResult.reason || 'información no encontrada'})`);
            } else {
              if (pdfResult.valorOperacion && target.types.has('compraventa')) {
                console.log(`        ✓ Valor obtenido (${pdfResult.usedPdfApi}): ${pdfResult.valorOperacion}`);
              }
              if (target.types.has('hipoteca')) {
                const hipotecaParts = [];
                if (pdfResult.montoHipoteca) hipotecaParts.push(`monto ${pdfResult.montoHipoteca}`);
                if (pdfResult.plazoAnos) hipotecaParts.push(`plazo ${pdfResult.plazoAnos} años`);
                if (pdfResult.tasaInteres) hipotecaParts.push(`tasa ${pdfResult.tasaInteres}`);
                if (hipotecaParts.length > 0) {
                  console.log(`        ✓ Hipoteca obtenida (${pdfResult.usedPdfApi}): ${hipotecaParts.join(', ')}`);
                } else {
                  console.log('        ⚠️  Datos de hipoteca no encontrados en el PDF');
                }
              }
            }

            await sleep(400);
          }
        } else {
          console.log(`    ⚠️  ${tabName}: NO DATA FOUND`);
        }
      }
      
      // Add property to collection
      allProperties.push(property);
      console.log('\n✅ Property data collected');
      
      await saveDebugScreenshot(page, `property_${i + 1}_complete`);
      
      await closeModal(page);
      console.log('✓ Modal closed\n');
        processedCount++;
      } catch (propError) {
        const message = propError?.message || String(propError);
        console.log(`\n⚠️  Property processing error: ${message}`);
        try { await saveDebugScreenshot(page, `property_${i + 1}_ERROR`); } catch {}
        try { await closeModal(page, true); } catch {}
        const placeholder = property || {
          folioNumber: folioNumber || '',
          propietario: '',
          isPersonaJuridica: false,
          valor: '',
          datosGenerales: {},
          tabs: {},
          pdfExtraction: []
        };
        placeholder.missingData = true;
        placeholder.extractionError = message;
        allProperties.push(placeholder);
        console.log('📝 Marked property as partial/missing data and continuing.');
        processedCount++;
      }
      }
      
      if (processedCount >= maxToProcess) {
        console.log(`\n⛔ Reached MAX_PROPERTIES_TO_PROCESS (${maxToProcess}). Stopping.`);
        break;
      }
      
      // Try to navigate to the next results page
      const firstRowBefore = await page.evaluate(() => {
        const firstCell = document.querySelector('tr.dxbs-data-row td');
        return firstCell ? (firstCell.textContent || '').trim() : '';
      });
      
      const clickedNext = await page.evaluate(() => {
        // DevExpress/Blazor pager: try to click the next page number after the active one
        const pager = document.querySelector('nav.dx-pager, .dx-pager');
        if (!pager) return false;
        const active = pager.querySelector('li.page-item.page-number.active');
        if (!active) return false;
        let nextLi = active.nextElementSibling;
        while (nextLi && !nextLi.classList.contains('page-number')) {
          nextLi = nextLi.nextElementSibling;
        }
        const link = nextLi?.querySelector('a.page-link');
        if (link) {
          link.click();
          return true;
        }
        return false;
      });
      
      if (!clickedNext) {
        console.log('✓ No more pages detected. Finishing.');
        break;
      }
      
      // Wait for either the first row value to change or the active page indicator to change
      const pageChanged = await page.waitForFunction((prevFirstRow) => {
        const firstCell = document.querySelector('tr.dxbs-data-row td');
        const nowFirst = firstCell ? (firstCell.textContent || '').trim() : '';
        const pager = document.querySelector('nav.dx-pager, .dx-pager');
        const active = pager ? pager.querySelector('li.page-item.page-number.active') : null;
        return (nowFirst && nowFirst !== prevFirstRow) || !!active;
      }, { timeout: 15000 }, firstRowBefore).catch(() => null);
      
      if (!pageChanged) {
        console.log('⚠️  Next page did not load as expected. Attempting to continue.');
      } else {
        console.log('➡️  Moved to next page.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      currentPageNumber++;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ SCRAPING COMPLETE');
    console.log('='.repeat(60));
    
    const extractionTotals = allProperties.reduce((acc, prop) => {
      const extractions = prop.pdfExtraction || [];
      extractions.forEach(record => {
        if (record.valorOperacion) acc.valor++;
        if (record.montoHipoteca) acc.hipoteca++;
      });
      return acc;
    }, { valor: 0, hipoteca: 0 });

    if (extractionTotals.valor > 0 || extractionTotals.hipoteca > 0) {
      console.log(`\n💰 Se habían extraído valores en ${extractionTotals.valor} asiento(s) y datos de hipoteca en ${extractionTotals.hipoteca} asiento(s) antes del fallo.`);
    }

    // Export all collected data to Excel
    let mercantilRows = null;
    // Mercantil runs by default unless explicitly disabled
    // Default to true if not set, only disable if explicitly false/0
    const shouldRunMercantil = options.mercantil !== false && options.mercantil !== 0 && options.mercantil !== '0' && options.mercantil !== 'false';
    
    // Notify user that mercantil will run
    if (allProperties.length > 0 && shouldRunMercantil) {
      console.log(`\n${'='.repeat(60)}`);
      console.log('🏛️  MERCANTIL ENRICHMENT WILL RUN NEXT');
      console.log('='.repeat(60));
      console.log(`   Properties collected: ${allProperties.length}`);
      console.log('   Enriching corporate owners with Mercantil registry data...\n');
    } else if (allProperties.length > 0 && !shouldRunMercantil) {
      console.log(`\n🏛️  Mercantil enrichment: DISABLED (skipping)`);
    }
    
    if (allProperties.length > 0 && shouldRunMercantil) {
      try {
        console.log('🏛️  Starting Mercantil enrichment process...');
        // Map owners to their properties for context columns in sheet
        const map = new Map();
        allProperties.forEach(p => {
          const owner = String(p?.propietario || '').trim();
          if (!owner) return;
          const lower = owner.toLowerCase();
          if (!/\b(corporacion|corporación|s\.?a\.?|s\.?r\.?l\.?|fundacion|fundación)\b/.test(lower)) return;
          if (!map.has(owner)) map.set(owner, []);
          map.get(owner).push(p);
        });
        // Run mercantil flow on the same page (as requested)
        const mercResults = await enrichPropertiesWithMercantil(page, allProperties, { testing: !!options.mercantilTesting });
        mercantilRows = buildMercantilSheetRows(mercResults, map);
      } catch (e) {
        console.log(`⚠️  Mercantil enrichment failed: ${e?.message || String(e)}`);
      }
    }

    let exportResult = null;
    if (allProperties.length > 0) {
      exportResult = await exportToExcel(allProperties, outputFileLocal, changesFileLocal, buildingNameLocal, mercantilRows);
    } else {
      console.log('\n⚠️  No properties collected - skipping Excel export');
    }

    if (contactModeEnabled) {
      console.log('\n🔎 Starting contact enrichment for owners...');
      try {
        const result = await runContactSearchForProperties(allProperties, browser, { slug: slugLocal });
        if (result && result.outputPath) {
          console.log(`\n📬 Contact results saved to: ${result.outputPath}`);
        }
      } catch (e) {
        console.log(`\n⚠️  Contact enrichment failed: ${e?.message || String(e)}`);
      }
    }
    
    console.log(`\n📁 Debug files: ${DEBUG_DIR}/`);
    console.log(`📊 Excel file: ${outputFileLocal}\n`);
    
    // Send completion email
    console.log('\n📧 Attempting to send completion email...');
    const emailStartTime = Date.now();
    try {
      if (exportResult) {
        await Promise.race([
          sendMainScraperCompletionEmail({
            buildingName: buildingNameLocal,
            outputPath: outputFileLocal,
            changesPath: exportResult.changesFile,
            propertiesExtracted: allProperties.length,
            hasChanges: exportResult.hasChanges
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Email sending timed out after 90 seconds'));
            }, 90000);
          })
        ]);
      } else {
        // No properties extracted, but still send email to notify
        await Promise.race([
          sendMainScraperCompletionEmail({
            buildingName: buildingNameLocal,
            outputPath: null,
            changesPath: null,
            propertiesExtracted: 0,
            hasChanges: false
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Email sending timed out after 90 seconds'));
            }, 90000);
          })
        ]);
      }
      const emailElapsed = Date.now() - emailStartTime;
      console.log(`✅ Email notification completed (took ${emailElapsed}ms)\n`);
    } catch (err) {
      const emailElapsed = Date.now() - emailStartTime;
      console.error(`\n⚠️  Failed to send completion email after ${emailElapsed}ms: ${err?.message || String(err)}`);
      if (err?.stack) {
        console.error(`   Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      console.error('   Continuing without email notification...\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await saveDebugScreenshot(page, 'ERROR');
    
    // Try to export whatever data we collected before the error
    let exportResult = null;
    if (allProperties.length > 0) {
      console.log('\n⚠️  Attempting to export partial data...');
      try {
        exportResult = await exportToExcel(allProperties, outputFileLocal, changesFileLocal, buildingNameLocal);
      } catch (exportError) {
        console.error(`⚠️  Failed to export partial data: ${exportError?.message || String(exportError)}`);
      }
    }
    
    // Send error email
    console.log('\n📧 Attempting to send error email...');
    const emailStartTime = Date.now();
    try {
      await Promise.race([
        sendMainScraperCompletionEmail({
          buildingName: buildingNameLocal,
          outputPath: exportResult ? outputFileLocal : null,
          changesPath: exportResult?.changesFile || null,
          propertiesExtracted: allProperties.length,
          hasChanges: exportResult?.hasChanges || false,
          error: error.message || String(error)
        }),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Email sending timed out after 90 seconds'));
          }, 90000);
        })
      ]);
      const emailElapsed = Date.now() - emailStartTime;
      console.log(`✅ Error email sent (took ${emailElapsed}ms)\n`);
    } catch (err) {
      const emailElapsed = Date.now() - emailStartTime;
      console.error(`⚠️  Failed to send error email after ${emailElapsed}ms: ${err?.message || String(err)}`);
    }
  } finally {
    await browser.close();
  }
}

// Export a Lambda handler; in Lambda, handler will be called and we won't auto-run the scraper here
export async function handler(event, context) {
  try {
    const payload = event || {};
    // Allow API to force headless via payload
    if (payload.headless === 1 || payload.headless === true || payload.headless === '1' || payload.headless === 'true') {
      process.env.FORCE_HEADLESS = '1';
    }
    // Note if invoked from API server so default is headful on EC2
    if (payload.apiCall === 1 || payload.apiCall === true || payload.apiCall === '1' || payload.apiCall === 'true') {
      process.env.API_CALL = '1';
    }
    const options = {
      buildingName: payload.buildingName || payload.BUILDING_NAME,
      searchParam: payload.searchParam || payload.SEARCH_PARAMETER,
      maxProperties: payload.maxProperties || payload.MAX_PROPERTIES_TO_PROCESS,
      contactMode: (typeof payload.contactMode !== 'undefined')
        ? !!payload.contactMode
        : (process.env.CONTACT_MODE === '1' ? true : CONTACT_MODE),
      captchaMode: (payload.captchaMode || process.env.CAPTCHA_MODE),
      // Mercantil defaults to true unless explicitly disabled
      mercantil: payload.mercantil === false || payload.mercantil === 0 || payload.mercantil === '0' || payload.mercantil === 'false' 
        ? false 
        : (payload.mercantil || process.env.MERCANTIL !== '0'),
      mercantilTesting: !!(payload.mercantilTesting || payload.mercantileTesting || process.env.MERCANTIL_TESTING === '1')
    };
    await scrapeBuilding(options);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) };
  }
}

// Run automatically when executed directly via `node scraper.js`
const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1] && /scraper\.js$/.test(process.argv[1]);
if (isExecutedDirectly) {
  // Allow local overrides via CLI flags and env:
  // Examples:
  //   node scraper.js --building "Biltmore" --search "Biltmore" --max 30
  //   BUILDING_NAME=Biltmore MAX_PROPERTIES_TO_PROCESS=30 node scraper.js
  const parseCliArgs = (argv) => {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
      const token = argv[i];
      if (!token.startsWith('--')) continue;
      const eq = token.indexOf('=');
      const key = token.slice(2, eq > -1 ? eq : undefined);
      let val = eq > -1 ? token.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
      if (key === 'building') out.buildingName = val;
      else if (key === 'search') out.searchParam = val;
      else if (key === 'max') out.maxProperties = Number(val);
      else if (key === 'headless') process.env.FORCE_HEADLESS = (val === '1' || val === 'true') ? '1' : '';
      else if (key === 'contact' || key === 'contactMode') out.contactMode = (val === '1' || val === 'true');
      else if (key === 'captcha-mode' || key === 'captchaMode') out.captchaMode = val;
      else if (key === 'mercantil') out.mercantil = !(val === '0' || val === 'false' || val === 'off');
      else if (key === 'mercantil-testing' || key === 'mercantile-testing' || key === 'testing') out.mercantilTesting = (val === '1' || val === 'true');
      else if (key === 'debug') process.env.DEBUG = (val === '1' || val === 'true' || val === 'yes') ? '1' : '';
    }
    return out;
  };
  const envOptions = {
    buildingName: process.env.BUILDING_NAME,
    searchParam: process.env.SEARCH_PARAMETER,
    maxProperties: Number(process.env.MAX_PROPERTIES_TO_PROCESS),
    contactMode: process.env.CONTACT_MODE === '1',
    captchaMode: process.env.CAPTCHA_MODE,
    // Mercantil defaults to true unless explicitly disabled
    // If MERCANTIL is not set (undefined/empty), default to true
    // Only disable if explicitly set to '0', 'false', or 'off'
    mercantil: !process.env.MERCANTIL || (process.env.MERCANTIL !== '0' && process.env.MERCANTIL !== 'false' && process.env.MERCANTIL !== 'off'),
    mercantilTesting: process.env.MERCANTIL_TESTING === '1'
  };
  const cliOptions = parseCliArgs(process.argv);
  
  // Show debug output IMMEDIATELY to see what's being received (ALWAYS show in headless mode)
  const isHeadlessForDebug = process.env.HEADLESS === '1' || process.env.HEADLESS === 1 || process.env.FORCE_HEADLESS === '1';
  if (isHeadlessForDebug || process.env.DEBUG || process.env.NODE_ENV !== 'production') {
    console.log('\n🔍 ========== EARLY DEBUG (BEFORE MERGE) ==========');
    console.log('🔍 DEBUG: process.argv:', process.argv);
    console.log('🔍 DEBUG: CLI Arguments received:', process.argv.slice(2));
    console.log('🔍 DEBUG: Parsed CLI options:', JSON.stringify(cliOptions, null, 2));
    console.log('🔍 DEBUG: Environment BUILDING_NAME:', process.env.BUILDING_NAME);
    console.log('🔍 DEBUG: Environment SEARCH_PARAMETER:', process.env.SEARCH_PARAMETER);
    console.log('🔍 DEBUG: Environment MERCANTIL:', process.env.MERCANTIL);
    console.log('🔍 DEBUG: Environment HEADLESS:', process.env.HEADLESS);
    console.log('🔍 DEBUG: Environment DEBUG:', process.env.DEBUG);
    console.log('🔍 DEBUG: Environment NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 ================================================\n');
  }
  
  // Merge options: CLI overrides env, but preserve mercantil default (true) if not explicitly set
  const mergedOptions = { ...envOptions, ...cliOptions };
  // Mercantil defaults to true unless explicitly disabled
  // If mercantil is not explicitly set in CLI, default to true
  if (!('mercantil' in cliOptions)) {
    // Use env value if set and not false, otherwise default to true
    mergedOptions.mercantil = (envOptions.mercantil !== false && envOptions.mercantil !== 0 && envOptions.mercantil !== '0') ? true : false;
  } else {
    // CLI explicitly set mercantil - ensure it's a boolean
    // Only false if explicitly '0', 'false', or 'off', otherwise true
    if (mergedOptions.mercantil === false || mergedOptions.mercantil === 0 || mergedOptions.mercantil === '0' || mergedOptions.mercantil === 'false' || mergedOptions.mercantil === 'off') {
      mergedOptions.mercantil = false;
    } else {
      mergedOptions.mercantil = true;
    }
  }
  // Ensure mercantil is always a boolean in final options (don't filter it out)
  const filteredOptions = Object.fromEntries(Object.entries(mergedOptions).filter(([k, v]) => {
    // Always include mercantil even if it's a boolean
    if (k === 'mercantil') return true;
    return v !== undefined && v !== '' && v !== null && !Number.isNaN(v);
  }));
  const options = filteredOptions;
  
  // Debug: Log what arguments were received (always show in headless mode for debugging)
  // Always show debug in headless mode (HEADLESS=1) or if DEBUG env var is set
  const isHeadless = process.env.HEADLESS === '1' || process.env.HEADLESS === 1 || process.env.FORCE_HEADLESS === '1';
  const shouldShowDebug = process.env.DEBUG || isHeadless || process.env.NODE_ENV !== 'production';
  
  if (shouldShowDebug) {
    console.log('\n🔍 ========== DEBUG INFORMATION (AFTER MERGE) ==========');
    console.log('🔍 DEBUG: Environment options:', JSON.stringify(envOptions, null, 2));
    console.log('🔍 DEBUG: Final merged options:', JSON.stringify(options, null, 2));
    console.log('🔍 DEBUG: Mercantil will run:', options.mercantil !== false);
    console.log('🔍 DEBUG: Building name:', options.buildingName || 'NOT SET');
    console.log('🔍 DEBUG: Search parameter:', options.searchParam || 'NOT SET');
    console.log('🔍 DEBUG: isHeadless check:', isHeadless);
    console.log('🔍 DEBUG: shouldShowDebug:', shouldShowDebug);
    console.log('🔍 ====================================================\n');
  }
  
  scrapeBuilding(options).catch(console.error);
}

function isPdfPayload(buffer, contentType = '') {
  const type = (contentType || '').toLowerCase();
  if (type.includes('application/pdf')) {
    return true;
  }
  if (!buffer || buffer.length < 4) {
    return false;
  }
  let uint8Array;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (buffer instanceof Uint8Array) {
    uint8Array = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    uint8Array = new Uint8Array(buffer);
  } else {
    return false;
  }
  return uint8Array[0] === 0x25 &&
         uint8Array[1] === 0x50 &&
         uint8Array[2] === 0x44 &&
         uint8Array[3] === 0x46;
}

async function downloadPdfBufferWithVariants(page, iframeSrc) {
  if (!iframeSrc) {
    return { buffer: null, source: 'no-iframe-src', attempts: [] };
  }

  const attempts = [];
  const variants = new Set([iframeSrc]);

  try {
    const url = new URL(iframeSrc, page.url());
    if (url.pathname.toLowerCase().endsWith('/true')) {
      const falseUrl = new URL(url.toString());
      falseUrl.pathname = falseUrl.pathname.replace(/\/true$/i, '/False');
      variants.add(falseUrl.toString());
    }
  } catch (error) {
    // Ignore malformed URL
  }

  for (const candidate of variants) {
    const result = await fetchPdfBufferWithCookies(page, candidate);
    if (result.buffer && isPdfPayload(result.buffer, result.contentType)) {
      return { buffer: result.buffer, source: result.source || 'node-fetch', attempts };
    }
    attempts.push(result.source || 'unknown');
  }

  return { buffer: null, source: 'all-variants-failed', attempts };
}
