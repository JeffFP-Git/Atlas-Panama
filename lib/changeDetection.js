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

/** Multiset diff: rows present in `curr` but not (or fewer times) in `prev` are "added", and vice versa for "removed". */
function diffRowArrays(prevRows, currRows) {
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

  const topPrev = prevRecord?.summary || prevRecord?.datosGenerales || {};
  const topCurr = currRecord?.summary || currRecord?.datosGenerales || {};
  const topFieldChanges = diffTopFields(topPrev, topCurr);

  const hasMiembros = !!(prevRecord?.miembros || currRecord?.miembros);
  const miembrosDiff = hasMiembros ? diffRowArrays(prevRecord?.miembros?.rows, currRecord?.miembros?.rows) : null;

  const hasChanges =
    prelacionDiff.added.length > 0 ||
    prelacionDiff.removed.length > 0 ||
    topFieldChanges.length > 0 ||
    (miembrosDiff && (miembrosDiff.added.length > 0 || miembrosDiff.removed.length > 0));

  return { hasChanges, isFirstRun: !prevRecord, prelacionDiff, topFieldChanges, miembrosDiff };
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
  return lines;
}

/** Row indexes (into currRecord.prelacion.rows) that should be highlighted in the PDF. */
export function highlightedPrelacionRowIndexes(comparison, currRecord) {
  const addedKeys = new Set(comparison.prelacionDiff.added.map(canonicalizeRow));
  return (currRecord?.prelacion?.rows || [])
    .map((row, i) => (addedKeys.has(canonicalizeRow(row)) ? i : -1))
    .filter(i => i >= 0);
}

export default { compareRecords, describeChangesPlainLanguage, highlightedPrelacionRowIndexes };
