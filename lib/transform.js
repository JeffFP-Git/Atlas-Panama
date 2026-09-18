// Pure data-transformation helpers for unit tests and reuse

export function normalizeValorOperacion(rawValor) {
	if (!rawValor) return null;
	const cleaned = rawValor.replace(/[^\d.,-]/g, '');
	if (!cleaned) return null;
	const hasDot = cleaned.includes('.');
	const hasComma = cleaned.includes(',');
	if (hasDot && hasComma) {
		const lastDot = cleaned.lastIndexOf('.');
		const lastComma = cleaned.lastIndexOf(',');
		if (lastComma > lastDot) {
			const integerPart = cleaned.slice(0, lastComma).replace(/[^\d]/g, '');
			const decimals = cleaned.slice(lastComma + 1).replace(/[^\d]/g, '');
			if (!integerPart) return null;
			return `${integerPart}.${decimals}`;
		} else {
			const integerPart = cleaned.slice(0, lastDot).replace(/,/g, '').replace(/[^\d]/g, '');
			const decimals = cleaned.slice(lastDot + 1).replace(/[^\d]/g, '');
			if (!integerPart) return null;
			return `${integerPart}.${decimals}`;
		}
	}
	if (hasComma && !hasDot) {
		return cleaned.replace(/[^\d,]/g, '').replace(',', '.');
	}
	return cleaned.replace(/,/g, '');
}

export function parseNumberLocale(value) {
	if (value == null) return null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const s = String(value).replace(/\s+/g, '').replace(/\u00A0/g, '').trim();
	if (!s) return null;
	const normalizedStr = normalizeValorOperacion(s);
	if (!normalizedStr) return null;
	const num = parseFloat(normalizedStr);
	return Number.isFinite(num) ? num : null;
}

export function computePricePerM2(valorNumber, areaNumber) {
	if (!Number.isFinite(valorNumber) || !Number.isFinite(areaNumber) || areaNumber <= 0) {
		return '';
	}
	const cents = Math.round(valorNumber * 100);
	const areaHundred = Math.round(areaNumber * 100);
	if (areaHundred === 0) return '';
	const pricePerM2Cents = Math.round((cents * 100) / areaHundred);
	return pricePerM2Cents / 100;
}

export function extractM2FromDescription(description) {
	if (!description) return null;
	const text = String(description).replace(/\u00A0/g, ' ');
	const composite = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)\s*([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)/i);
	if (composite) {
		const m2 = parseNumberLocale(composite[1]);
		const dm2 = parseNumberLocale(composite[2]);
		if (Number.isFinite(m2) && Number.isFinite(dm2)) return m2 + dm2 / 100;
	}
	const justDm2 = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)\b/i);
	if (justDm2) {
		const dm2 = parseNumberLocale(justDm2[1]);
		if (Number.isFinite(dm2)) return dm2 / 100;
	}
	const upper = text.toUpperCase();
	const unitPattern = '(?:M(?:TS|T|ETROS)?\\s*(?:2|²)|M\\s*(?:2|²))';
	let m = upper.match(new RegExp(`SUPERFICIE\\s+UNIDAD\\s+DEPARTAMENTAL\\s*:\\\\s*([0-9]+(?:[.,][0-9]+)?)\\s*${unitPattern}\\b`));
	if (!m) m = upper.match(new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${unitPattern}\\b`));
	if (!m) return null;
	const num = parseNumberLocale(m[1]);
	return Number.isFinite(num) ? num : null;
}

export function extractM2FromSuperficieInicial(value) {
	if (!value) return null;
	const raw = String(value).replace(/\u00A0/g, ' ').trim();
	const composite = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*m(?:2|²)\s*([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)/i);
	if (composite) {
		const m2 = parseNumberLocale(composite[1]);
		const dm2 = parseNumberLocale(composite[2]);
		if (Number.isFinite(m2) && Number.isFinite(dm2)) return m2 + dm2 / 100;
	}
	const justDm2 = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*dm(?:2|²)\b/i);
	if (justDm2) {
		const dm2 = parseNumberLocale(justDm2[1]);
		if (Number.isFinite(dm2)) return dm2 / 100;
	}
	const stripped = raw.replace(/\s+/g, '').replace(/m(?:2|²)$/i, '').replace(/m$/i, '');
	const num = parseNumberLocale(stripped);
	return Number.isFinite(num) ? num : null;
}

export function extractUiFromText(text) {
	if (!text) return '';
	const raw = String(text).replace(/\u00A0/g, ' ');
	const m = raw.match(/U\s*\.?\s*I\s*\.?\s*[:\-]?\s*([^\n\r;,.]+?)(?=\s*(?:,|;|\.|$))/i);
	return m && m[1] ? m[1].trim() : '';
}

export function extractUnitFromDomicilioHeuristic(text) {
	if (!text) return '';
	const cleaned = String(text).replace(/\u00A0/g, ' ').replace(/-/g, '').toUpperCase();
	const tokens = cleaned.split(/[\s,/;|]+/).filter(Boolean);
	const patternNumLet = /^[0-9]{1,3}[A-Z]{1,2}$/;
	const patternPB = /^PB[A-Z]{1,2}$/;
	for (const t of tokens) {
		if (patternPB.test(t) || patternNumLet.test(t)) return t;
	}
	const m = cleaned.match(/(?:\b|^)(PB[A-Z]{1,2}|[0-9]{1,3}[A-Z]{1,2})(?:\b|$)/);
	return m && m[1] ? m[1] : '';
}


