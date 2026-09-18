import fs from 'fs';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import path from 'path';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

try { dotenv.config(); } catch {}

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

export function loadPreviousRunData(outputFile) {
  if (!outputFile || !fs.existsSync(outputFile)) {
    return null;
  }

  try {
    const workbook = XLSX.readFile(outputFile);
    const sheet = workbook.Sheets['Properties'];
    if (!sheet) {
      return null;
    }
    const data = XLSX.utils.sheet_to_json(sheet);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    return { filename: outputFile, data };
  } catch (error) {
    console.warn(`⚠️  Unable to read existing workbook ${outputFile}: ${error.message}`);
    return null;
  }
}

export function computePropertyChanges(currentRows, previousRows) {
  if (!previousRows || previousRows.length === 0) {
    return [];
  }

  const previousMap = new Map();
  previousRows.forEach(row => {
    const folio = normalizeValue(row['Folio Number']);
    if (folio) {
      previousMap.set(folio, row);
    }
  });

  const currentMap = new Map();
  currentRows.forEach(row => {
    const folio = normalizeValue(row['Folio Number']);
    if (folio) {
      currentMap.set(folio, row);
    }
  });

  const changes = [];

  currentRows.forEach(row => {
    const folio = normalizeValue(row['Folio Number']);
    if (!folio) return;
    const previous = previousMap.get(folio);
    if (!previous) {
      changes.push({
        'Change Type': 'Added',
        'Folio Number': folio,
        'Propietario': row['PROPIETARIO'] || row['Propietario'] || '',
        'Field': 'ALL',
        'Previous Value': '',
        'Current Value': 'Property added'
      });
      return;
    }

    Object.keys(row).forEach(key => {
      if (key === 'Property #' || key === 'Folio Number') {
        return;
      }
      const currentVal = normalizeValue(row[key]);
      const previousVal = normalizeValue(previous[key]);
      if (currentVal !== previousVal) {
        changes.push({
          'Change Type': 'Updated',
          'Folio Number': folio,
          'Propietario': row['PROPIETARIO'] || row['Propietario'] || '',
          'Field': key,
          'Previous Value': previousVal,
          'Current Value': currentVal
        });
      }
    });
  });

  previousRows.forEach(row => {
    const folio = normalizeValue(row['Folio Number']);
    if (!folio) return;
    if (!currentMap.has(folio)) {
      changes.push({
        'Change Type': 'Removed',
        'Folio Number': folio,
        'Propietario': row['PROPIETARIO'] || row['Propietario'] || '',
        'Field': 'ALL',
        'Previous Value': 'Property removed',
        'Current Value': ''
      });
    }
  });

  return changes;
}

export async function exportChangesWorkbook(changesData, outputFile) {
  if (!changesData || changesData.length === 0 || !outputFile) {
    return 0;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Changes');

  const headers = [
    'Change Type',
    'Folio Number',
    'Propietario',
    'Field',
    'Previous Value',
    'Current Value'
  ];

  sheet.addRow(headers);
  changesData.forEach(change => {
    const rowValues = headers.map(header => change[header] ?? '');
    const row = sheet.addRow(rowValues);
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' }
      };
    });
  });

  await workbook.xlsx.writeFile(outputFile);
  return changesData.length;
}

// ===== Daily change tracker (independent pipeline) =====

function slugifyName(name) {
	return String(name || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function runScraperForBuilding(buildingName, opts = {}) {
	return new Promise((resolve) => {
		try {
			const search = opts.searchParam || buildingName;
			const headless = (typeof opts.headless === 'boolean') ? (opts.headless ? '1' : '0') : '0';
			const runArgs = [
				'scraper.js',
				'--building', buildingName,
				'--search', search,
				'--mercantil', '1',
				'--headless', headless
			];
			if (opts.maxProperties && Number(opts.maxProperties) > 0) {
				runArgs.push('--max', String(Number(opts.maxProperties)));
			}
			const child = spawn(process.execPath || 'node', runArgs, {
				cwd: process.cwd(),
				env: {
					...process.env,
					FAST_MODE: process.env.FAST_MODE || '1',
					// Ensure scraper picks headless explicitly even if CLI parsing order changes
					FORCE_HEADLESS: headless,
					HEADLESS: headless,
					API_CALL: '1'
				}
			});
			child.stdout.on('data', (d) => process.stdout.write(d));
			child.stderr.on('data', (d) => process.stderr.write(d));
			child.on('exit', (code) => resolve(code === 0));
			// Hard timeout: default 25 minutes
			const timeoutMs = Number(process.env.SCRAPER_TIMEOUT_MS || 25 * 60 * 1000);
			setTimeout(() => {
				try { child.kill('SIGKILL'); } catch {}
				resolve(false);
			}, timeoutMs).unref?.();
		} catch {
			resolve(false);
		}
	});
}

function readNamesFromWorkbook(namesXlsx) {
	try {
		const wb = XLSX.readFile(namesXlsx);
		const sheet = wb.Sheets[wb.SheetNames[0]];
		const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
		const names = [];
		for (const r of rows) {
			if (!r || r.length === 0) continue;
			const v = String(r[0] ?? '').trim();
			if (v) names.push(v);
		}
		return names;
	} catch {
		return [];
	}
}

function readSheetAsRows(filePath, sheetName) {
	try {
		const wb = XLSX.readFile(filePath);
		const ws = wb.Sheets[sheetName];
		if (!ws) return [];
		return XLSX.utils.sheet_to_json(ws, { defval: '' });
	} catch {
		return [];
	}
}

function canonicalizeRow(rowObj) {
	const keys = Object.keys(rowObj).sort();
	const parts = [];
	for (const k of keys) {
		const v = normalizeValue(rowObj[k]);
		parts.push(`${k}=${v}`);
	}
	return parts.join('|');
}

export function diffPrelacion(currentFile, previousFile) {
	const current = readSheetAsRows(currentFile, 'Prelación');
	const previous = readSheetAsRows(previousFile, 'Prelación');
	// Multiset compare
	const toCountMap = (rows) => {
		const m = new Map();
		for (const r of rows) {
			const key = canonicalizeRow(r);
			m.set(key, (m.get(key) || 0) + 1);
		}
		return m;
	};
	const mc = toCountMap(current);
	const mp = toCountMap(previous);
	const changes = [];
	// Added
	for (const [k, cnt] of mc.entries()) {
		const prev = mp.get(k) || 0;
		if (cnt > prev) {
			for (let i = 0; i < cnt - prev; i++) {
				changes.push({ type: 'Added', entry: k });
			}
		}
	}
	// Removed
	for (const [k, cnt] of mp.entries()) {
		const cur = mc.get(k) || 0;
		if (cnt > cur) {
			for (let i = 0; i < cnt - cur; i++) {
				changes.push({ type: 'Removed', entry: k });
			}
		}
	}
	return changes;
}

async function sendEmail(subject, text) {
	const recipients = (process.env.ALERT_EMAILS || '').split(/[;,]+/).map(s => s.trim()).filter(Boolean);
	if (recipients.length === 0) {
		console.log(`ℹ️  No ALERT_EMAILS configured; skipping email.\nSubject: ${subject}\n${text}`);
		return false;
	}
	let nodemailer = null;
	try {
		// Lazy import so this file works even if nodemailer isn't installed locally yet
		nodemailer = (await import('nodemailer')).default;
	} catch {
		console.log('ℹ️  nodemailer is not installed; printing message instead of sending email.\n', text);
		return false;
	}
	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
		secure: process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true',
		auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASS
		} : undefined
	});
	await transporter.sendMail({
		from: process.env.SMTP_FROM || process.env.SMTP_USER,
		to: recipients.join(','),
		subject,
		text
	});
	return true;
}

function ensureDir(dir) {
	try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function listSnapshotFiles(dir) {
	try {
		const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.xlsx'));
		return files.sort(); // YYYY-MM-DD.xlsx sorts lexicographically
	} catch {
		return [];
	}
}

async function trackOneBuilding(buildingName, options = {}) {
	const slug = slugifyName(buildingName);
	const baseDir = path.join(process.cwd(), 'BuildingData');
	const currentFile = path.join(baseDir, `${slug}.xlsx`);
	// Refresh workbook first unless explicitly skipped
	if (!options.skipScrape) {
		console.log(`\n⏳ Running scraper for "${buildingName}" (mercantil=on) to refresh workbook...`);
		const ok = await runScraperForBuilding(buildingName, {
			searchParam: options.searchParam || buildingName,
			headless: options.scraperHeadless !== false, // default true
			maxProperties: options.maxProperties
		});
		if (!ok) {
			console.log('⚠️  Scraper run may have failed; continuing if a workbook exists.');
		}
	}
	if (!fs.existsSync(currentFile)) {
		console.log(`⚠️  Current file not found for "${buildingName}" (${currentFile}). Skipping.`);
		return { buildingName, slug, skipped: true };
	}
	const historyDir = path.join(baseDir, 'history', slug);
	ensureDir(historyDir);
	const today = new Date();
	const ymd = today.toISOString().slice(0, 10);
	const todaySnapshot = path.join(historyDir, `${ymd}.xlsx`);
	// Create today's snapshot if missing
	if (!fs.existsSync(todaySnapshot)) {
		try { fs.copyFileSync(currentFile, todaySnapshot); } catch {}
	}
	// Find previous snapshot (before today)
	const snapshots = listSnapshotFiles(historyDir).filter(f => f < `${ymd}.xlsx`);
	if (snapshots.length === 0) {
		console.log(`ℹ️  No previous snapshot for "${buildingName}". Created ${path.basename(todaySnapshot)}.`);
		return { buildingName, slug, createdSnapshot: true, changes: [] };
	}
	const prevFile = path.join(historyDir, snapshots[snapshots.length - 1]);
	const changes = diffPrelacion(currentFile, prevFile);
	if (changes.length > 0) {
		const lines = changes.map(c => `- ${c.type}: ${c.entry}`);
		const subject = `Prelación changes detected: ${buildingName} (${ymd})`;
		const text = `Detected ${changes.length} change(s) in Prelación for "${buildingName}".\nPrevious: ${path.basename(prevFile)}\nCurrent: ${path.basename(currentFile)}\n\n${lines.join('\n')}\n`;
		try {
			await sendEmail(subject, text);
		} catch (e) {
			console.log(`⚠️  Email send failed: ${e?.message || e}`);
		}
		// Also write a per-run text summary
		try {
			const outTxt = path.join(historyDir, `${ymd}_changes.txt`);
			fs.writeFileSync(outTxt, text, 'utf8');
		} catch {}
	}
	return { buildingName, slug, changes };
}

function parseCliArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const eq = token.indexOf('=');
		const key = token.slice(2, eq > -1 ? eq : undefined);
		let val = eq > -1 ? token.slice(eq + 1) : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1');
		if (key === 'names') out.namesFile = val;
		else if (key === 'emails') out.emails = val;
		else if (key === 'building' || key === 'b') out.building = val;
		else if (key === 'search' || key === 'searchParam') out.searchParam = val;
		else if (key === 'skip-scrape' || key === 'no-scrape') out.skipScrape = (val === '1' || val === 'true');
		else if (key === 'max' || key === 'maxProperties') out.maxProperties = Number(val);
		else if (key === 'headless') out.headless = (val === '1' || val === 'true');
	}
	return out;
}

export async function runChangeTrackerCli() {
	const args = parseCliArgs(process.argv);
	if (args.emails) process.env.ALERT_EMAILS = String(args.emails);
	// Support either a single building or a workbook of names
	let names = [];
	if (args.building) {
		names = [args.building];
	} else if (args.namesFile) {
		names = readNamesFromWorkbook(args.namesFile);
	} else {
		console.error('Usage: node lib/changeTracker.js --building "Ocean Waves" [--emails alert@example.com]');
		console.error('   or: node lib/changeTracker.js --names ./names.xlsx [--emails alert@example.com]');
		process.exit(1);
	}
	if (names.length === 0) {
		console.error('No names found in the provided workbook.');
		process.exit(1);
	}
	const results = [];
	for (const name of names) {
		// process sequentially to avoid IO stampede; cron runs daily
		// if you want parallelism later, you can Promise.all with a limiter
		// but keep email/site load gentle
		// eslint-disable-next-line no-await-in-loop
		const r = await trackOneBuilding(name, {
			searchParam: args.searchParam,
			maxProperties: args.maxProperties,
			scraperHeadless: (typeof args.headless === 'boolean') ? args.headless : true,
			skipScrape: !!args.skipScrape
		});
		results.push(r);
	}
	// Summary output
	const summary = results.map(r => {
		const c = r.changes ? r.changes.length : 0;
		return `- ${r.buildingName} (${r.slug}): ${c} change(s)`;
	}).join('\n');
	console.log(`\nDaily change tracker completed:\n${summary}\n`);
}

// When executed directly, run the CLI
const isExecutedDirectly = typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1] && /changeTracker\.js$/.test(process.argv[1]);
if (isExecutedDirectly) {
	runChangeTrackerCli().catch(err => {
		console.error(err?.stack || err?.message || String(err));
		process.exit(1);
	});
}
