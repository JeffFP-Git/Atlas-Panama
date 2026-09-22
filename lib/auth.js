import fs from 'fs';
import path from 'path';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEBUG_DIR = './debug-output';
function ensureDebugDir() { try { if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {} }

const CAPTCHA_DEBUG = (() => {
  const raw = String(process.env.CAPTCHA_DEBUG || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();
const CAPTCHA_SKIP_CHECKBOX = (() => {
  const raw = String(process.env.CAPTCHA_SKIP_CHECKBOX || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
})();
const FULL_AUTO_MODE = (() => {
  const r = String(process.env.FULL_AUTO_MODE || '').trim().toLowerCase();
  if (r === '1' || r === 'true') return true;
  return !!(process.env.CAPTCHA_PROVIDER && process.env.CAPTCHA_API_KEY);
})();

export async function isLoggedIn(page) {
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
      return { hasLoginInputs, hasLogout, hasAppNav, onLoginUrl };
    });
    return !state.hasLoginInputs && !state.onLoginUrl && (state.hasLogout || state.hasAppNav);
  } catch {
    return false;
  }
}

export async function saveSessionCookies(page, url = 'https://www.rp.gob.pa/') {
  try {
    const SESSION_DIR = path.join(process.cwd(), 'session');
    const SESSION_COOKIES_PATH = path.join(SESSION_DIR, 'session-cookies.json');
    try { if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch {}
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

export async function restoreSessionCookies(page, url = 'https://www.rp.gob.pa/') {
  try {
    const SESSION_DIR = path.join(process.cwd(), 'session');
    const SESSION_COOKIES_PATH = path.join(SESSION_DIR, 'session-cookies.json');
    if (!fs.existsSync(SESSION_COOKIES_PATH)) return false;
    const data = JSON.parse(fs.readFileSync(SESSION_COOKIES_PATH, 'utf8'));
    if (!data || !Array.isArray(data.cookies)) return false;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    for (const c of data.cookies) {
      try {
        const out = {
          name: c.name, value: c.value, path: c.path || '/',
          domain: c.domain || undefined, expires: typeof c.expires === 'number' ? c.expires : undefined,
          httpOnly: !!c.httpOnly, secure: !!c.secure,
          sameSite: c.sameSite && typeof c.sameSite === 'string'
            ? (c.sameSite.toLowerCase() === 'no_restriction' ? 'None'
              : c.sameSite.toLowerCase() === 'lax' ? 'Lax'
              : c.sameSite.toLowerCase() === 'strict' ? 'Strict'
              : undefined)
            : undefined
        };
        if (!out.domain) out.url = url;
        await page.setCookie(out);
      } catch {}
    }
    console.log('🔐 Session cookies restored.');
    return true;
  } catch (e) {
    console.warn(`⚠️  Could not restore session cookies: ${e.message}`);
    return false;
  }
}

export async function tryClickRecaptchaCheckbox(page) {
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const iframeHandle = await page.$('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
      if (!iframeHandle) { await sleep(500); continue; }
      const frame = await iframeHandle.contentFrame();
      if (!frame) { await sleep(500); continue; }
      try {
        await frame.waitForSelector('#recaptcha-anchor, .recaptcha-checkbox-border', { timeout: 5000 });
        const already = await frame.evaluate(() => {
          const a = document.querySelector('#recaptcha-anchor');
          return a && a.getAttribute('aria-checked') === 'true';
        }).catch(() => false);
        if (already) { console.log('✅ reCAPTCHA already checked.'); return true; }
        const clicked = await frame.evaluate(() => {
          const a = document.querySelector('#recaptcha-anchor');
          if (a) { a.click(); return true; }
          const b = document.querySelector('.recaptcha-checkbox-border');
          if (b) { (b instanceof HTMLElement) && b.click(); return true; }
          return false;
        });
        if (!clicked) { await sleep(500); continue; }
        const ok = await frame.waitForFunction(() => {
          const a = document.querySelector('#recaptcha-anchor');
          return !!a && a.getAttribute('aria-checked') === 'true';
        }, { timeout: 6000 }).then(() => true).catch(() => false);
        if (ok) { console.log('✅ reCAPTCHA checkbox clicked.'); return true; }
        const challenge = await page.$('iframe[title*="challenge"], iframe[src*="bframe"]');
        if (challenge) { console.log('⚠️  reCAPTCHA challenge appeared.'); return false; }
      } catch {}
      await sleep(500);
    }
  } catch (e) { console.warn(`⚠️  Could not interact with reCAPTCHA: ${e.message}`); }
  return false;
}

export async function isRecaptchaVerified(page) {
  try {
    const iframeHandle = await page.$('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]');
    if (!iframeHandle) return false;
    const frame = await iframeHandle.contentFrame();
    if (!frame) return false;
    const verified = await frame.evaluate(() => {
      const a = document.querySelector('#recaptcha-anchor');
      return !!a && a.getAttribute('aria-checked') === 'true';
    }).catch(() => false);
    return verified;
  } catch {
    return false;
  }
}

export async function tryClickRecaptchaCheckboxSlow(page) {
  try {
    const iframeHandle = await page.waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha"]', { timeout: 8000 });
    if (!iframeHandle) return false;
    
    // Check if already verified before clicking
    if (await isRecaptchaVerified(page)) {
      console.log('✅ reCAPTCHA already verified.');
      return true;
    }
    
    try { await iframeHandle.scrollIntoViewIfNeeded?.(); } catch {}
    const box = await iframeHandle.boundingBox();
    if (!box) return false;
    const startX = 20 + Math.random() * 40;
    const startY = 20 + Math.random() * 40;
    const targetX = box.x + box.width * (0.50 + (Math.random() - 0.5) * 0.08);
    const targetY = box.y + box.height * (0.50 + (Math.random() - 0.5) * 0.08);
    try { await page.mouse.move(startX, startY, { steps: 2 }); } catch {}
    await sleep(150);
    try { await page.mouse.move(targetX, targetY, { steps: 20 }); } catch {}
    await sleep(160);
    try { await page.mouse.down(); await sleep(80); await page.mouse.up(); } catch {}
    
    // After clicking, poll for auto-verification with short intervals
    // If CAPTCHA auto-passes, it should verify quickly (within 1-2 seconds)
    const frame = await iframeHandle.contentFrame();
    if (frame) {
      // Check immediately after click
      if (await isRecaptchaVerified(page)) {
        console.log('✅ reCAPTCHA auto-verified after click.');
        return true;
      }
      
      // Poll for verification with short intervals (check every 200ms for up to 2 seconds)
      for (let i = 0; i < 10; i++) {
        await sleep(200);
        if (await isRecaptchaVerified(page)) {
          console.log('✅ reCAPTCHA auto-verified (polled).');
          return true;
        }
        // If challenge appears, stop polling
        if (await isRecaptchaChallengeOpen(page)) {
          break;
        }
      }
      
      // If not auto-verified, try clicking directly in frame
      try {
        await frame.click('#recaptcha-anchor', { delay: 80 }).catch(() => {});
        // Check again after direct click
        for (let i = 0; i < 5; i++) {
          await sleep(200);
          if (await isRecaptchaVerified(page)) {
            console.log('✅ reCAPTCHA verified after direct click.');
            return true;
          }
          if (await isRecaptchaChallengeOpen(page)) {
            break;
          }
        }
      } catch {}
    }
  } catch {}
  return false;
}

export async function isRecaptchaChallengeOpen(page) {
  try {
    const h = await page.$('iframe[title*="recaptcha challenge"], iframe[title*="Verificación"], iframe[title*="verify"], iframe[src*="bframe"]');
    return !!h;
  } catch { return false; }
}

export async function closeRecaptchaChallengeIfOpen(page) {
  try {
    const frameHandle = await page.$('iframe[title*="recaptcha challenge"], iframe[title*="Verificación"], iframe[title*="verify"], iframe[src*="bframe"]');
    if (!frameHandle) return false;
    const f = await frameHandle.contentFrame();
    if (!f) return false;
    const selectors = [
      'button[aria-label*="Cerrar"]', 'button[title*="Cerrar"]',
      '.rc-button-default.goog-inline-block', '.help-button-holder button', '.rc-dialog-close'
    ];
    for (const sel of selectors) {
      const el = await f.$(sel).catch(() => null);
      if (el) { await el.click().catch(() => {}); await sleep(250); }
      const still = await isRecaptchaChallengeOpen(page);
      if (!still) return true;
    }
    return false;
  } catch { return false; }
}

export async function debugCaptchaSnapshot(page, label = 'captcha') {
  if (!CAPTCHA_DEBUG) return;
  try {
    const info = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]'));
      const s1 = (() => {
        for (const f of frames) {
          try {
            const u = new URL(f.src, location.href);
            const k = u.searchParams.get('k') || u.searchParams.get('sitekey');
            if (k) return k;
          } catch {}
        }
        return null;
      })();
      const s2 = document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') || null;
      const sitekey = s1 || s2 || '';
      const anchorExists = !!document.querySelector('#recaptcha-anchor, .recaptcha-checkbox-border');
      const responseAreas = document.querySelectorAll('textarea[name="g-recaptcha-response"], #g-recaptcha-response').length;
      return { url: location.href, frames: frames.length, sitekey, anchorExists, responseAreas };
    });
    console.log(`🔎 [${label}] URL: ${info.url} frames=${info.frames} sitekey=${info.sitekey ? info.sitekey.slice(0,8)+'…':''} anchor=${info.anchorExists} areas=${info.responseAreas}`);
    ensureDebugDir();
    const ts = Date.now();
    await page.screenshot({ path: `${DEBUG_DIR}/captcha_${label}_${ts}.png` }).catch(() => {});
    const html = await page.content().catch(() => '');
    try { fs.writeFileSync(`${DEBUG_DIR}/captcha_${label}_${ts}.html`, html || ''); } catch {}
  } catch {}
}

// Collects what actually happened during the most recent performLogin() call's
// CAPTCHA handling, so a caller can surface WHY a login failed (no solver plugin
// loaded, solver errored, or it solved fine and login failed for some other
// reason) without needing direct Railway log access — see getLastLoginDiagnostics().
let lastLoginDiagnostics = null;
export function getLastLoginDiagnostics() { return lastLoginDiagnostics; }
function resetLoginDiagnostics() { lastLoginDiagnostics = { pluginLoaded: null, verifiedViaCheckbox: false, solveAttempts: [], finalVerified: null }; }

export async function solveRecaptchasWithDebug(page, label = 'solve') {
  const hasPlugin = typeof page.solveRecaptchas === 'function';
  console.log(`🔧 [${label}] plugin: ${hasPlugin ? 'yes' : 'no'}`);
  if (lastLoginDiagnostics) lastLoginDiagnostics.pluginLoaded = hasPlugin;
  if (!hasPlugin) {
    if (lastLoginDiagnostics) lastLoginDiagnostics.solveAttempts.push({ label, ok: false, reason: 'no-plugin' });
    return { ok: false, reason: 'no-plugin' };
  }
  const start = Date.now();
  try {
    if (CAPTCHA_DEBUG) await debugCaptchaSnapshot(page, `${label}_before`);
    const result = await page.solveRecaptchas();
    const ms = Date.now() - start;
    let count = 0;
    try {
      count = (result && Array.isArray(result.solutions)) ? result.solutions.length
        : (Array.isArray(result) ? result.length : 0);
    } catch {}
    console.log(`✅ [${label}] solveRecaptchas completed in ${ms}ms, solutions=${count}`);
    if (CAPTCHA_DEBUG) await debugCaptchaSnapshot(page, `${label}_after`);
    if (lastLoginDiagnostics) lastLoginDiagnostics.solveAttempts.push({ label, ok: true, solutionsCount: count, ms });
    return { ok: true, solutionsCount: count };
  } catch (e) {
    const ms = Date.now() - start;
    const errMsg = e?.message || String(e);
    console.log(`❌ [${label}] solveRecaptchas error after ${ms}ms: ${errMsg}`);
    if (lastLoginDiagnostics) lastLoginDiagnostics.solveAttempts.push({ label, ok: false, error: errMsg, ms });
    return { ok: false, error: errMsg };
  }
}

export async function submitLoginFormReliable(page) {
  let clicked = false;
  try {
    const btnBlock = await page.$('form button.btn.btn-primary.btn-block');
    if (btnBlock) { await btnBlock.click().catch(() => {}); clicked = true; }
  } catch {}
  if (!clicked) {
    clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const byText = buttons.find(b => (b.textContent || '').trim().toLowerCase() === 'ingresar');
      if (byText) { byText.click(); return true; }
      return false;
    }).catch(() => false);
  }
  if (!clicked) {
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn && typeof submitBtn.click === 'function') {
          submitBtn.click();
        } else if (typeof form.submit === 'function') {
          form.submit();
        }
      }
    }).catch(() => {});
  }
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
    (async () => {
      for (let i = 0; i < 10; i++) { if (await isLoggedIn(page)) return; await sleep(800); }
    })()
  ]);
}

export async function performLogin(page, overrides = {}) {
  resetLoginDiagnostics();
  const username = overrides.username || process.env.RP_USERNAME || process.env.USERNAME || '';
  const password = overrides.password || process.env.RP_PASSWORD || process.env.PASSWORD || '';
  console.log('🔐 Attempting automated login...');
  
  // Set headers before navigation
  try { await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'); } catch {}
  try { await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' }); } catch {}
  
  // Navigate to login page with better wait conditions
  try {
    await page.goto('https://www.rp.gob.pa/LoginUsuario', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    // Additional wait to ensure page is fully ready
    await sleep(1000);
  } catch (navError) {
    console.log(`⚠️  Navigation error, retrying: ${navError.message}`);
    // Retry with domcontentloaded as fallback
    await page.goto('https://www.rp.gob.pa/LoginUsuario', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    }).catch(() => {});
    await sleep(2000);
  }
  
  // Verify we're on the login page
  const isOnLoginPage = await page.evaluate(() => {
    return window.location.href.includes('LoginUsuario') || 
           !!document.querySelector('#itNombreUsuario') ||
           !!document.querySelector('input[type="password"]');
  });
  
  if (!isOnLoginPage) {
    console.log('⚠️  Not on login page, navigating again...');
    await page.goto('https://www.rp.gob.pa/LoginUsuario', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await sleep(2000);
  }

  if (!username || !password) {
    if (!FULL_AUTO_MODE) {
      console.log('\n⏸️  PLEASE LOGIN MANUALLY (captcha likely present). Press ENTER in terminal when done...\n');
      await new Promise(r => process.stdin.once('data', r));
      return isLoggedIn(page);
    }
    console.log('❌ FULL_AUTO_MODE on and credentials are missing. Set RP_USERNAME and RP_PASSWORD in .env.');
    return false;
  }

  // Optional early/checkbox/solver step depending on mode
  try {
    if (!CAPTCHA_SKIP_CHECKBOX) {
      const mode = (process.env.CAPTCHA_MODE || 'backup').toString().trim().toLowerCase();
      if (mode === 'always') {
        await solveRecaptchasWithDebug(page, 'login_early');
      } else if (!CAPTCHA_DEBUG) {
        try { await sleep(800); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 4)); } catch {}
        
        // Check if already verified before attempting click
        if (await isRecaptchaVerified(page)) {
          console.log('✅ reCAPTCHA already verified, proceeding to credentials.');
          lastLoginDiagnostics.verifiedViaCheckbox = true;
        } else {
          let clicked = await tryClickRecaptchaCheckboxSlow(page);
          if (!clicked) clicked = await tryClickRecaptchaCheckbox(page);

          // After clicking, check if it auto-verified
          if (await isRecaptchaVerified(page)) {
            console.log('✅ reCAPTCHA auto-verified, proceeding to credentials.');
            lastLoginDiagnostics.verifiedViaCheckbox = true;
          } else {
            const challengeOpen = await isRecaptchaChallengeOpen(page);
            if (challengeOpen) {
              await closeRecaptchaChallengeIfOpen(page);
              await solveRecaptchasWithDebug(page, 'login_after_checkbox_challenge');
            }
          }
        }
      } else {
        await solveRecaptchasWithDebug(page, 'login_early');
      }
    }
  } catch {}

  // Fill creds with better error handling and retry logic
  let usernameFilled = false;
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries && !usernameFilled; attempt++) {
  try {
      // Try primary selector first
      await page.waitForSelector('#itNombreUsuario', { timeout: 15000 });
    await clearAndTypeWithVerification(page, '#itNombreUsuario', username, 'username');
      usernameFilled = true;
      console.log('✅ Username field filled using primary selector');
    } catch (primaryError) {
      console.log(`⚠️  Primary selector failed (attempt ${attempt + 1}/${maxRetries}), trying fallback...`);
      try {
        // Wait a bit for page to stabilize
        await sleep(1000);
        // Try alternative selectors
    const altUserSel = 'input[type="email"], input[name="username"], input[autocomplete="username"]';
        await page.waitForSelector(altUserSel, { timeout: 15000 });
    await clearAndTypeWithVerification(page, altUserSel, username, 'username');
        usernameFilled = true;
        console.log('✅ Username field filled using fallback selector');
      } catch (altError) {
        if (attempt === maxRetries - 1) {
          // Last attempt - log detailed error
          const currentUrl = await page.url();
          const pageTitle = await page.title();
          const hasPasswordField = await page.$('input[type="password"]').then(() => true).catch(() => false);
          console.error(`❌ Failed to find username input after ${maxRetries} attempts`);
          console.error(`   Current URL: ${currentUrl}`);
          console.error(`   Page title: ${pageTitle}`);
          console.error(`   Password field present: ${hasPasswordField}`);
          throw new Error(`Waiting for selector \`input[type="email"], input[name="username"], input[autocomplete="username"]\` failed. Page may not be fully loaded or login form structure changed.`);
        }
        // Retry navigation if not last attempt
        if (attempt < maxRetries - 1) {
          console.log(`   Retrying navigation...`);
          await page.goto('https://www.rp.gob.pa/LoginUsuario', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
          });
          await sleep(2000);
        }
      }
    }
  }
  
  if (!usernameFilled) {
    throw new Error('Failed to fill username field after all retries');
  }
  
  // Fill password field
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await clearAndTypeWithVerification(page, 'input[type="password"]', password, 'password');

  // Optional checkbox click before submit (only if not already verified)
  if (!CAPTCHA_SKIP_CHECKBOX) {
    if (await isRecaptchaVerified(page)) {
      console.log('✅ reCAPTCHA already verified, ready to submit.');
    } else {
      const recaptchaClicked = await tryClickRecaptchaCheckbox(page);
      if (!recaptchaClicked) {
        // Check again if it auto-verified
        if (await isRecaptchaVerified(page)) {
          console.log('✅ reCAPTCHA auto-verified, ready to submit.');
        } else {
          console.log('ℹ️  reCAPTCHA checkbox not clicked automatically (may not be present or challenge mode).');
        }
      }
    }
  }

  await submitLoginFormReliable(page);
  await sleep(4000);

  if (!(await isLoggedIn(page))) {
    await solveRecaptchasWithDebug(page, 'login_second_chance');
    await sleep(1200);
    await submitLoginFormReliable(page);
    await sleep(3500);
  }
  if (!(await isLoggedIn(page))) {
    // Final retry loop without prompting
    await tryClickRecaptchaCheckbox(page);
    await sleep(1000);
    await solveRecaptchasWithDebug(page, 'login_retry');
    await sleep(1000);
    await submitLoginFormReliable(page);
    await sleep(3500);
  }
  const finalResult = await isLoggedIn(page);
  if (lastLoginDiagnostics) lastLoginDiagnostics.finalVerified = finalResult;
  return finalResult;
}

export async function clearAndTypeWithVerification(page, selector, value, label = 'field') {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el && 'value' in el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
  await page.click(selector, { clickCount: 3 }).catch(() => {});
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const ch of String(value)) {
      await page.type(selector, ch, { delay: 90 + Math.floor(Math.random() * 60) });
      if (Math.random() < 0.15) await sleep(100 + Math.floor(Math.random() * 120));
    }
  const read = await page.$eval(selector, (el) => (el && 'value' in el) ? el.value : '');
    if (read === value) return true;
    console.log(`⚠️  Mismatch after typing ${label} (len ${read.length}/${String(value).length}). Retrying...`);
    await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el && 'value' in el) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    }, selector);
  }
  await page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    if (el && 'value' in el) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, selector, value);
  const back = await page.$eval(selector, (el) => (el && 'value' in el) ? el.value : '');
  if (back !== value) console.log(`⚠️  Unable to fully set ${label}.`);
  return back === value;
}

// Strict helper: will NOT return until the input reads back correctly, or throws.
// This is used for flaky fields like Folio/Código where dropped characters break the search.
export async function strictFillInput(page, selector, value, label = 'field', opts = {}) {
  const {
    maxAttempts = 6,
    // By default, compare trimmed strings. Callers can pass a normalizer (e.g. digits-only).
    normalize = (s) => String(s ?? '').trim()
  } = opts || {};

  const expected = normalize(value);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await clearAndTypeWithVerification(page, selector, String(value), label);
    const read = await page.$eval(selector, (el) => (el && 'value' in el) ? el.value : '');
    const readNorm = normalize(read);

    if (ok && readNorm === expected) return true;

    console.log(`⚠️  [strictFillInput] ${label} mismatch (attempt ${attempt}/${maxAttempts}): expected="${expected}" got="${readNorm}"`);
    // Give the site's JS time to settle before retrying
    await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
  }

  throw new Error(`Failed to reliably fill ${label}. Aborting before submit.`);
}

// Lock an input's value briefly so page scripts can't clear it right before clicking Buscar.
// Returns a cleanup function (best-effort) that removes listeners.
export async function lockInputValue(page, selector, value, opts = {}) {
  const { durationMs = 2000, normalize = (s) => String(s ?? '') } = opts || {};
  const expected = normalize(value);

  await page.evaluate((sel, exp, duration) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const handler = () => {
      if (String(el.value ?? '') !== exp) {
        el.value = exp;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    // capture phase to run before site handlers when possible
    el.addEventListener('input', handler, true);
    el.addEventListener('change', handler, true);
    el.addEventListener('blur', handler, true);

    // Store handler for optional cleanup
    el.__psLockHandler = handler;

    setTimeout(() => {
      try {
        el.removeEventListener('input', handler, true);
        el.removeEventListener('change', handler, true);
        el.removeEventListener('blur', handler, true);
        delete el.__psLockHandler;
      } catch {}
    }, duration);
  }, selector, expected, durationMs);

  // Return cleanup function (best effort)
  return async () => {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const handler = el && el.__psLockHandler;
      if (el && handler) {
        try {
          el.removeEventListener('input', handler, true);
          el.removeEventListener('change', handler, true);
          el.removeEventListener('blur', handler, true);
        } catch {}
        try { delete el.__psLockHandler; } catch {}
      }
    }, selector);
  };
}

export async function assertInputValue(page, selector, value, label = 'field', opts = {}) {
  const { normalize = (s) => String(s ?? '').trim() } = opts || {};
  const expected = normalize(value);
  const read = await page.$eval(selector, (el) => (el && 'value' in el) ? el.value : '');
  const got = normalize(read);
  if (got !== expected) {
    throw new Error(`${label} field was cleared/changed before submit (expected "${expected}", got "${got}"). Aborting before submit.`);
  }
  return true;
}

export default {
  isLoggedIn,
  saveSessionCookies,
  restoreSessionCookies,
  tryClickRecaptchaCheckbox,
  tryClickRecaptchaCheckboxSlow,
  isRecaptchaVerified,
  isRecaptchaChallengeOpen,
  closeRecaptchaChallengeIfOpen,
  debugCaptchaSnapshot,
  solveRecaptchasWithDebug,
  submitLoginFormReliable,
  clearAndTypeWithVerification,
  strictFillInput,
  lockInputValue,
  assertInputValue,
  performLogin
};


