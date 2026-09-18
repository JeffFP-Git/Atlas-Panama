import fs from 'fs';
import path from 'path';

function determineOwnerType(ownerName) {
  const text = String(ownerName || '').trim();
  if (!text) return 'unknown';
  const corpRegex = /\b(S\.?A\.?|S\.?R\.?L\.?|INC\.?|CORP\.?|CORPORACI[ÓO]N|SOCIEDAD\s+AN[ÓO]NIMA|S DE RL|COMP[ÁA]N[ÍI]A|LIMITED)\b/i;
  return corpRegex.test(text) ? 'corporation' : 'person';
}

function extractEmailsAndPhonesFromText(text) {
  const emails = new Set();
  const phones = new Set();
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRegex = /\+?507[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}[\s.-]?\d{4}\b/g;
  let m;
  while ((m = emailRegex.exec(text))) emails.add(m[0]);
  while ((m = phoneRegex.exec(text))) phones.add(m[0]);
  return { emails: Array.from(emails), phones: Array.from(phones) };
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function detectCaptcha(page) {
  try {
    const txt = await page.evaluate(() => (document.body && document.body.innerText) || '');
    return /are you a robot|unusual traffic|captcha|verifica que no eres un robot/i.test(txt);
  } catch {
    return false;
  }
}

async function collectLinksFromCurrentPage(limit) {
  const links = await this.evaluate((max) => {
    const anchors = Array.from(document.querySelectorAll('a'));
    const results = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const text = a.textContent || '';
      if (!href.startsWith('http')) continue;
      if (text.trim().length === 0) continue;
      results.push({ href, text });
      if (results.length >= max) break;
    }
    return results;
  }, limit);
  return links;
}

async function searchWeb(page, query, limit = 5) {
  const engine = (process.env.CONTACT_SEARCH_ENGINE || 'ddg').toLowerCase();
  const navOpts = { waitUntil: 'domcontentloaded', timeout: 60000 };
  try {
    if (engine === 'ddg' || engine === 'duckduckgo') {
      await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, navOpts);
      await page.waitForSelector('a', { timeout: 10000 }).catch(() => {});
      const results = await page.evaluate((max) => {
        const pick = [];
        const resultAnchors = document.querySelectorAll('a.result__a, a[href]');
        for (const a of Array.from(resultAnchors)) {
          const href = a.getAttribute('href') || '';
          const text = a.textContent || '';
          if (!href.startsWith('http')) continue;
          if (/duckduckgo\.com\/l\/\?kh=/.test(href)) continue;
          if (text.trim().length === 0) continue;
          pick.push({ href, text });
          if (pick.length >= max) break;
        }
        return pick;
      }, limit);
      if (await detectCaptcha(page)) throw new Error('captcha-detected:ddg');
      return results;
    }
    if (engine === 'bing') {
      await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, navOpts);
      await page.waitForSelector('li.b_algo h2 a, a', { timeout: 10000 }).catch(() => {});
      const results = await page.evaluate((max) => {
        const sel = document.querySelectorAll('li.b_algo h2 a, a[href]');
        const out = [];
        for (const a of Array.from(sel)) {
          const href = a.getAttribute('href') || '';
          const text = a.textContent || '';
          if (!href.startsWith('http')) continue;
          if (/bing\.com\/(images|news|videos|aclk)/.test(href)) continue;
          if (text.trim().length === 0) continue;
          out.push({ href, text });
          if (out.length >= max) break;
        }
        return out;
      }, limit);
      if (await detectCaptcha(page)) throw new Error('captcha-detected:bing');
      return results;
    }
    // Fallback to Google only if explicitly requested
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, navOpts);
    await page.waitForSelector('a', { timeout: 10000 }).catch(() => {});
    const links = await page.evaluate((max) => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const results = [];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent || '';
        if (!href.startsWith('http')) continue;
        if (/^https?:\/\/(www\.)?google\./i.test(href)) continue;
        if (text.trim().length === 0) continue;
        results.push({ href, text });
        if (results.length >= max) break;
      }
      return results;
    }, limit);
    if (await detectCaptcha(page)) throw new Error('captcha-detected:google');
    return links;
  } finally {
    // small human-like pause
    await sleep(500 + Math.floor(Math.random() * 800));
  }
}

async function tryFindContactOnSite(page, baseUrl) {
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    return { sourceUrl: baseUrl, emails: [], phones: [] };
  }
  const fromHome = await page.evaluate(() => document.body?.innerText || '');
  let { emails, phones } = extractEmailsAndPhonesFromText(fromHome);

  const candidateHrefs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links
      .map(a => a.getAttribute('href'))
      .filter(h => !!h)
      .map(h => h.startsWith('http') ? h : new URL(h, location.href).toString())
      .filter(u => /contact|contacto|contac|about|acerca/i.test(u));
  });
  for (const contactUrl of candidateHrefs.slice(0, 3)) {
    try {
      await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const text = await page.evaluate(() => document.body?.innerText || '');
      const extracted = extractEmailsAndPhonesFromText(text);
      emails = Array.from(new Set(emails.concat(extracted.emails)));
      phones = Array.from(new Set(phones.concat(extracted.phones)));
      if (emails.length || phones.length) {
        return { sourceUrl: contactUrl, emails, phones };
      }
    } catch {
      // continue
    }
  }
  return { sourceUrl: baseUrl, emails, phones };
}

async function rdapFromDomain(page, url) {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '');
    await page.goto(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const json = await page.evaluate(() => {
      try {
        const pre = document.querySelector('pre');
        if (!pre) return null;
        return JSON.parse(pre.textContent || '{}');
      } catch { return null; }
    });
    const contacts = [];
    const emails = new Set();
    if (json && Array.isArray(json.entities)) {
      for (const ent of json.entities) {
        const vcard = ent?.vcardArray?.[1] || [];
        for (const entry of vcard) {
          if (Array.isArray(entry) && entry[0] === 'email' && entry[3]) emails.add(entry[3]);
        }
      }
    }
    return { domain, emails: Array.from(emails) };
  } catch {
    return null;
  }
}

async function enrichCorporation(ownerName, page) {
  const queries = [
    `site:panamaemprende.gob.pa "${ownerName}"`,
    `site:panacamara.com "${ownerName}"`,
    `${ownerName} Panamá contacto`,
    `${ownerName} Panama contact`
  ];
  const visited = new Set();
  const emails = new Set();
  const phones = new Set();
  const provenance = [];

  for (const q of queries) {
    let results = [];
    try {
      results = await searchWeb(page, q, Number(process.env.CONTACT_SEARCH_MAX_RESULTS || 5));
    } catch (e) {
      if ((e.message || '').startsWith('captcha-detected')) {
        // Back off and try with a different engine next loop if configured
        console.log(`⚠️  CAPTCHA on search engine (${e.message}); consider switching CONTACT_SEARCH_ENGINE or slowing down.`);
        break;
      }
    }
    for (const r of results) {
      if (visited.has(r.href)) continue;
      visited.add(r.href);
      const contact = await tryFindContactOnSite(page, r.href);
      provenance.push({ query: q, url: contact.sourceUrl });
      for (const e of contact.emails) emails.add(e);
      for (const p of contact.phones) phones.add(p);
      if (emails.size || phones.size) {
        // Also try RDAP for the domain we found
        const rdap = await rdapFromDomain(page, contact.sourceUrl);
        if (rdap) rdap.emails.forEach(e => emails.add(e));
        return {
          ownerName,
          type: 'corporation',
          emails: Array.from(emails),
          phones: Array.from(phones),
          sources: provenance
        };
      }
    }
  }
  return {
    ownerName,
    type: 'corporation',
    emails: Array.from(emails),
    phones: Array.from(phones),
    sources: provenance
  };
}

async function enrichPerson(ownerName, deedText, page) {
  const emails = new Set();
  const phones = new Set();
  const sources = [];

  if (deedText) {
    const extracted = extractEmailsAndPhonesFromText(deedText);
    extracted.emails.forEach(e => emails.add(e));
    extracted.phones.forEach(p => phones.add(p));
    sources.push({ hint: 'deedText' });
    if (emails.size || phones.size) {
      return { ownerName, type: 'person', emails: Array.from(emails), phones: Array.from(phones), sources };
    }
  }

  const queries = [
    `${ownerName} Panamá contacto`,
    `${ownerName} Panama contact`,
    `${ownerName} LinkedIn Panamá`,
    `${ownerName} directorio Panamá`
  ];
  for (const q of queries) {
    let results = [];
    try {
      results = await searchWeb(page, q, Number(process.env.CONTACT_SEARCH_MAX_RESULTS || 5));
    } catch (e) {
      if ((e.message || '').startsWith('captcha-detected')) {
        console.log(`⚠️  CAPTCHA on search engine (${e.message}); consider switching CONTACT_SEARCH_ENGINE or slowing down.`);
        break;
      }
    }
    for (const r of results) {
      sources.push({ query: q, url: r.href });
      const contact = await tryFindContactOnSite(page, r.href);
      contact.emails.forEach(e => emails.add(e));
      contact.phones.forEach(p => phones.add(p));
      if (emails.size || phones.size) {
        return { ownerName, type: 'person', emails: Array.from(emails), phones: Array.from(phones), sources };
      }
    }
  }
  return { ownerName, type: 'person', emails: Array.from(emails), phones: Array.from(phones), sources };
}

export async function runContactSearchForProperties(properties, browser, { slug = 'contacts' } = {}) {
  const owners = new Map();
  for (const prop of properties || []) {
    const name = String(prop?.propietario || '').trim();
    if (!name) continue;
    if (!owners.has(name)) owners.set(name, prop);
  }
  const output = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.setUserAgent(
      process.env.CONTACT_SEARCH_UA ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );
  } catch {}
  for (const [ownerName, prop] of owners) {
    const type = determineOwnerType(ownerName);
    const deedText = (prop?.pdfExtraction || [])
      .map(rec => [rec.valorOperacion, rec.montoHipoteca, rec.text].filter(Boolean).join(' '))
      .join(' ');
    try {
      const enriched = type === 'corporation'
        ? await enrichCorporation(ownerName, page)
        : await enrichPerson(ownerName, deedText, page);
      output.push(enriched);
      console.log(`📫 ${ownerName} → emails: ${enriched.emails.length}, phones: ${enriched.phones.length}`);
    } catch (e) {
      output.push({ ownerName, type, error: e?.message || String(e) });
      console.log(`⚠️  Contact search failed for ${ownerName}: ${e?.message || String(e)}`);
    }
    await sleep(400 + Math.floor(Math.random() * 700));
  }
  const outDir = path.join(process.cwd(), 'debug-output');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  const outPath = path.join(outDir, `contacts_${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results: output }, null, 2));
  return { outputPath: outPath, results: output };
}

export default runContactSearchForProperties;


