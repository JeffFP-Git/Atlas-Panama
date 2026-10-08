/**
 * Compares two full-record snapshots (see lib/entityRecordExtraction.js and
 * lib/propertyRecordExtraction.js) and describes what changed, in plain language.
 * Deliberately generic across both record shapes (entity: summary+miembros;
 * property: datosGenerales, no miembros) and does NOT hardcode a fixed list of
 * Prelación status meanings to watch for — any diff between the two snapshots'
 * Prelación tables is reported, per the original spec ("this is intentionally
 * broad so it catches status types we haven't seen yet").
 */

function canonicalizeRow(row) {
  const keys = Object.keys(row || {}).sort();
  return keys.map(k => `${k}=${String(row[k] ?? '').trim()}`).join('|');
}

// "No data to display" placeholder rows (grid empty or still loading) are never entries.
const PLACEHOLDER = /^(no data to display|no hay datos( para mostrar)?|sin datos|cargando\.*|loading\.*)$/i;
function isPlaceholderRow(row) {
  const values = Object.values(row || {}).map(v => String(v ?? '').trim()).filter(Boolean);
  return values.length === 0 || values.every(v => PLACEHOLDER.test(v));
}

/** Multiset diff: rows present in `curr` but not (or fewer times) in `prev` are "added", and vice versa for "removed". */
function diffRowArrays(prevRowsRaw, currRowsRaw) {
  const prevRows = (prevRowsRaw || []).filter(r => !isPlaceholderRow(r));
  const currRows = (currRowsRaw || []).filter(r => !isPlaceholderRow(r));
  const countBy = (arr) => {
    const m = new Map();
    for (const r of arr || []) {
      const key = canonicalizeRow(r);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  };
  const prevMap = countBy(prevRows);
  const currMap = countBy(currRows);
  const added = [];
  const removed = [];
  for (const [key, count] of currMap) {
    const prevCount = prevMap.get(key) || 0;
    if (count > prevCount) {
      const row = (currRows || []).find(r => canonicalizeRow(r) === key);
      for (let i = 0; i < count - prevCount; i++) added.push(row);
    }
  }
  for (const [key, count] of prevMap) {
    const currCount = currMap.get(key) || 0;
    if (count > currCount) {
      const row = (prevRows || []).find(r => canonicalizeRow(r) === key);
      for (let i = 0; i < count - currCount; i++) removed.push(row);
    }
  }
  return { added, removed };
}

function diffTopFields(prevFields, currFields) {
  const changes = [];
  const keys = new Set([...Object.keys(prevFields || {}), ...Object.keys(currFields || {})]);
  for (const k of keys) {
    const pv = String((prevFields || {})[k] ?? '').trim();
    const cv = String((currFields || {})[k] ?? '').trim();
    if (pv !== cv) changes.push({ field: k, from: pv, to: cv });
  }
  return changes;
}

/**
 * @param {object|null} prevRecord - yesterday's (or most recent previous) snapshot, or null if there is none yet
 * @param {object} currRecord - today's snapshot
 */
export function compareRecords(prevRecord, currRecord) {
  const prelacionDiff = diffRowArrays(prevRecord?.prelacion?.rows, currRecord?.prelacion?.rows);

  // Datos Generales: from Oct 2026 records carry the full section-by-section Datos
  // Generales (datosGeneralesV2). Compare like with like: both new → full comparison;
  // previous snapshot still in the old format → skip this one comparison (it would
  // report every field as "changed" when only our extraction format changed).
  let topFieldChanges;
  if (currRecord?.datosGeneralesV2 && prevRecord?.datosGeneralesV2) {
    topFieldChanges = diffTopFields(prevRecord.datosGenerales, currRecord.datosGenerales);
  } else if (currRecord?.datosGeneralesV2 && prevRecord) {
    topFieldChanges = [];
  } else {
    const topPrev = prevRecord?.summary || prevRecord?.datosGenerales || {};
    const topCurr = currRecord?.summary || currRecord?.datosGenerales || {};
    topFieldChanges = diffTopFields(topPrev, topCurr);
  }

  const hasMiembros = !!(prevRecord?.miembros || currRecord?.miembros);
  const miembrosDiff = hasMiembros ? diffRowArrays(prevRecord?.miembros?.rows, currRecord?.miembros?.rows) : null;

  // Every other discovered tab (Apoderados, Registro Electrónico Vigentes/No Vigentes,
  // Folios Madre, etc. — see lib/fullRecordExtraction.js) diffed the same generic way.
  const tabNames = new Set([...Object.keys(prevRecord?.tabs || {}), ...Object.keys(currRecord?.tabs || {})]);
  const otherTabsDiff = {};
  for (const tabName of tabNames) {
    otherTabsDiff[tabName] = diffRowArrays(prevRecord?.tabs?.[tabName], currRecord?.tabs?.[tabName]);
  }
  const otherTabsHaveChanges = Object.values(otherTabsDiff).some(d => d.added.length > 0 || d.removed.length > 0);

  const hasChanges =
    prelacionDiff.added.length > 0 ||
    prelacionDiff.removed.length > 0 ||
    topFieldChanges.length > 0 ||
    (miembrosDiff && (miembrosDiff.added.length > 0 || miembrosDiff.removed.length > 0)) ||
    otherTabsHaveChanges;

  return { hasChanges, isFirstRun: !prevRecord, prelacionDiff, topFieldChanges, miembrosDiff, otherTabsDiff };
}

/**
 * Plain-language bullet points describing a comparison, for the email body.
 * @param {object} comparison
 * @param {'es'|'en'} [lang] - the underlying RP field values (Estado, Trámite, etc.)
 *   are already in Spanish either way since they come straight from the registry;
 *   this only affects the surrounding sentence structure.
 */
export function describeChangesPlainLanguage(comparison, lang = 'en') {
  const lines = [];
  const blank = lang === 'es' ? '(vacío)' : '(blank)';
  for (const f of comparison.topFieldChanges) {
    const template = lang === 'es' ? '{field} cambió de "{from}" a "{to}".' : '{field} changed from "{from}" to "{to}".';
    lines.push(template.replace('{field}', f.field).replace('{from}', f.from || blank).replace('{to}', f.to || blank));
  }
  for (const row of comparison.prelacionDiff.added) {
    const entrada = row['Nº de Entrada'] || Object.values(row)[0] || (lang === 'es' ? '(entrada)' : '(entry)');
    const estado = row['Estado'] || '';
    const tramite = row['Trámite'] || '';
    const tramitePart = tramite ? ` (${tramite})` : '';
    const statusPart = lang === 'es'
      ? (estado ? `ahora muestra el estado "${estado}".` : 'es nueva.')
      : (estado ? `now shows status "${estado}".` : 'is new.');
    const prefix = lang === 'es' ? `Prelación: la entrada ${entrada}${tramitePart}` : `Prelación: entry ${entrada}${tramitePart}`;
    lines.push(`${prefix} ${statusPart}`);
  }
  if (comparison.miembrosDiff) {
    for (const row of comparison.miembrosDiff.added) {
      lines.push(lang === 'es'
        ? `Miembros Relacionados: se agregó ${row.cargo} — ${row.miembro}.`
        : `Miembros Relacionados: added ${row.cargo} — ${row.miembro}.`);
    }
    for (const row of comparison.miembrosDiff.removed) {
      lines.push(lang === 'es'
        ? `Miembros Relacionados: se eliminó ${row.cargo} — ${row.miembro}.`
        : `Miembros Relacionados: removed ${row.cargo} — ${row.miembro}.`);
    }
  }
  for (const [tabName, diff] of Object.entries(comparison.otherTabsDiff || {})) {
    for (const row of diff.added) {
      const summary = Object.values(row).filter(v => v && String(v).trim()).join(' — ');
      lines.push(lang === 'es' ? `${tabName}: nueva entrada — ${summary}.` : `${tabName}: new entry — ${summary}.`);
    }
    for (const row of diff.removed) {
      const summary = Object.values(row).filter(v => v && String(v).trim()).join(' — ');
      lines.push(lang === 'es' ? `${tabName}: entrada eliminada — ${summary}.` : `${tabName}: entry removed — ${summary}.`);
    }
  }
  return lines;
}

/** Row indexes (into currRecord.prelacion.rows) that should be highlighted in the PDF. */
export function highlightedPrelacionRowIndexes(comparison, currRecord) {
  const addedKeys = new Set(comparison.prelacionDiff.added.map(canonicalizeRow));
  return (currRecord?.prelacion?.rows || [])
    .map((row, i) => (addedKeys.has(canonicalizeRow(row)) ? i : -1))
    .filter(i => i >= 0);
}

/**
 * Yesterday's record may have a section that was read as empty by mistake (page not
 * loaded). If a section is empty in `prevRecord` but had entries in an older snapshot,
 * use the most recent older version, so a reading glitch yesterday doesn't make today
 * look like everything was "added". `olderRecords` is newest first.
 * Returns a shallow-copied record (the stored snapshot is not modified).
 */
export function healEmptySections(prevRecord, olderRecords = []) {
  if (!prevRecord) return prevRecord;
  const nonEmpty = rows => (rows || []).filter(r => !isPlaceholderRow(r)).length > 0;
  const healed = { ...prevRecord, tabs: { ...(prevRecord.tabs || {}) } };
  const fixes = [];
  for (const tabName of Object.keys(healed.tabs)) {
    if (nonEmpty(healed.tabs[tabName])) continue;
    const older = olderRecords.find(r => nonEmpty(r?.tabs?.[tabName]));
    if (older) { healed.tabs[tabName] = older.tabs[tabName]; fixes.push(tabName); }
  }
  if (healed.prelacion && !nonEmpty(healed.prelacion.rows)) {
    const older = olderRecords.find(r => nonEmpty(r?.prelacion?.rows));
    if (older) { healed.prelacion = older.prelacion; fixes.push('Prelación'); }
  }
  if (healed.miembros && !nonEmpty(healed.miembros.rows)) {
    const older = olderRecords.find(r => nonEmpty(r?.miembros?.rows));
    if (older) { healed.miembros = older.miembros; fixes.push('Miembros Relacionados'); }
  }
  healed._healedSections = fixes;
  return healed;
}

/**
 * Everything to highlight in the PDF for a real change (never for a first check):
 * changed Datos Generales fields, and added rows in Prelación, Miembros Relacionados
 * and every other tab.
 * @returns {{ datosGeneralesKeys: Set<string>, prelacionRows: number[], miembrosRows: number[], tabRows: Object<string, number[]> }}
 */
export function highlightsFor(comparison, currRecord) {
  const none = { datosGeneralesKeys: new Set(), prelacionRows: [], miembrosRows: [], tabRows: {}, removedRows: {} };
  if (!comparison || comparison.isFirstRun || !comparison.hasChanges) return none;
  const indexesOf = (addedRows, rows) => {
    const keys = new Set((addedRows || []).map(canonicalizeRow));
    return (rows || []).map((r, i) => (keys.has(canonicalizeRow(r)) ? i : -1)).filter(i => i >= 0);
  };
  const tabRows = {};
  for (const [tabName, diff] of Object.entries(comparison.otherTabsDiff || {})) {
    const idx = indexesOf(diff.added, currRecord?.tabs?.[tabName]);
    if (idx.length) tabRows[tabName] = idx;
  }
  const removed = {};
  if (comparison.prelacionDiff.removed.length) removed['Prelación'] = comparison.prelacionDiff.removed;
  if (comparison.miembrosDiff?.removed?.length) removed['Miembros Relacionados'] = comparison.miembrosDiff.removed.map(r => ({ Cargo: r.cargo, Miembro: r.miembro }));
  for (const [tabName, diff] of Object.entries(comparison.otherTabsDiff || {})) {
    if (diff.removed.length) removed[tabName] = diff.removed;
  }
  return {
    removedRows: removed,
    datosGeneralesKeys: new Set(comparison.topFieldChanges.map(f => f.field)),
    prelacionRows: indexesOf(comparison.prelacionDiff.added, currRecord?.prelacion?.rows),
    miembrosRows: comparison.miembrosDiff ? indexesOf(comparison.miembrosDiff.added, currRecord?.miembros?.rows) : [],
    tabRows
  };
}

export default { compareRecords, describeChangesPlainLanguage, highlightedPrelacionRowIndexes, highlightsFor, healEmptySections };
