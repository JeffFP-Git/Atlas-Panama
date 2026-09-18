import { describe, it, expect } from 'vitest';
import {
	normalizeValorOperacion,
	parseNumberLocale,
	computePricePerM2,
	extractM2FromDescription,
	extractM2FromSuperficieInicial,
	extractUiFromText,
	extractUnitFromDomicilioHeuristic
} from '../lib/transform.js';

describe('normalizeValorOperacion', () => {
	it('handles dot-thousands comma-decimal', () => {
		expect(normalizeValorOperacion('201.426,75')).toBe('201426.75');
	});
	it('handles comma-thousands dot-decimal', () => {
		expect(normalizeValorOperacion('201,426.75')).toBe('201426.75');
	});
	it('handles comma decimal only', () => {
		expect(normalizeValorOperacion('201426,75')).toBe('201426.75');
	});
	it('handles plain number', () => {
		expect(normalizeValorOperacion('201426.75')).toBe('201426.75');
	});
});

describe('parseNumberLocale', () => {
	it('parses Spanish formats', () => {
		expect(parseNumberLocale('1.234,56')).toBeCloseTo(1234.56, 6);
		expect(parseNumberLocale('1,234.56')).toBeCloseTo(1234.56, 6);
	});
});

describe('computePricePerM2', () => {
	it('is deterministic with integer math', () => {
		expect(computePricePerM2(47515, 85)).toBe(558.99); // 47515/85 rounded with integer scaling
		expect(computePricePerM2(47515, 85.0)).toBe(558.99);
	});
});

describe('area extraction', () => {
	it('extracts from description including composite dm²', () => {
		expect(extractM2FromDescription('85 m² 25 dm²')).toBeCloseTo(85.25, 6);
		expect(extractM2FromDescription('Superficie unidad departamental:85.25MTS2')).toBeCloseTo(85.25, 6);
	});
	it('extracts from SUPERFICIE INICIAL', () => {
		expect(extractM2FromSuperficieInicial('70.00 m²')).toBeCloseTo(70, 6);
		expect(extractM2FromSuperficieInicial('8525 dm²')).toBeCloseTo(85.25, 6);
	});
});

describe('unit number extraction', () => {
	it('gets U.I. from text', () => {
		expect(extractUiFromText('U.I.: 12A')).toBe('12A');
		expect(extractUiFromText('U I  3D')).toBe('3D');
	});
	it('heuristic from domicilio', () => {
		expect(extractUnitFromDomicilioHeuristic('Calle X - Torre A - 3D')).toBe('3D');
		expect(extractUnitFromDomicilioHeuristic('Calle Y PB-A')).toBe('PBA');
	});
});


