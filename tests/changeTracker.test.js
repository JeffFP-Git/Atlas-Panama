import fs from 'fs';
import path from 'path';
import os from 'os';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadPreviousRunData,
  computePropertyChanges,
  exportChangesWorkbook
} from '../lib/changeTracker.js';

const BASELINE_PROPERTY = {
  'Property #': 99,
  'Folio Number': '999',
  'PROPIETARIO': 'Baseline Owner',
  'VALOR': '80000'
};

const SAMPLE_PREVIOUS = [
  BASELINE_PROPERTY,
  {
    'Property #': 1,
    'Folio Number': '123',
    'PROPIETARIO': 'Alice Corp',
    'VALOR': '100000'
  },
  {
    'Property #': 2,
    'Folio Number': '456',
    'PROPIETARIO': 'Bob LLC',
    'VALOR': '200000'
  }
];

const SAMPLE_CURRENT = [
  BASELINE_PROPERTY,
  {
    'Property #': 1,
    'Folio Number': '123',
    'PROPIETARIO': 'Alice Corp',
    'VALOR': '150000'
  },
  {
    'Property #': 3,
    'Folio Number': '789',
    'PROPIETARIO': 'Charlie SA',
    'VALOR': '300000'
  }
];

const SHOWCASE_OUTPUT_DIR = path.resolve(process.cwd(), 'tests', '__outputs__');
const SHOWCASE_OUTPUT_FILE = path.join(SHOWCASE_OUTPUT_DIR, 'demo-change-report.xlsx');

describe('computePropertyChanges', () => {
  it('detects added properties', () => {
    const previous = [BASELINE_PROPERTY];
    const current = [
      BASELINE_PROPERTY,
      {
        'Property #': 1,
        'Folio Number': '001',
        'PROPIETARIO': 'New Owner',
        'VALOR': '50000'
      }
    ];

    const changes = computePropertyChanges(current, previous);
    expect(changes).toEqual([
      {
        'Change Type': 'Added',
        'Folio Number': '001',
        'Propietario': 'New Owner',
        'Field': 'ALL',
        'Previous Value': '',
        'Current Value': 'Property added'
      }
    ]);
  });

  it('detects updated field values', () => {
    const previous = [
      {
        'Property #': 1,
        'Folio Number': '001',
        'PROPIETARIO': 'Owner',
        'VALOR': '50000'
      }
    ];
    const current = [
      {
        'Property #': 1,
        'Folio Number': '001',
        'PROPIETARIO': 'Owner',
        'VALOR': '75000'
      }
    ];

    const changes = computePropertyChanges(current, previous);
    expect(changes).toEqual([
      {
        'Change Type': 'Updated',
        'Folio Number': '001',
        'Propietario': 'Owner',
        'Field': 'VALOR',
        'Previous Value': '50000',
        'Current Value': '75000'
      }
    ]);
  });

  it('detects removed properties', () => {
    const previous = [
      BASELINE_PROPERTY,
      {
        'Property #': 1,
        'Folio Number': '001',
        'PROPIETARIO': 'Owner',
        'VALOR': '50000'
      }
    ];
    const current = [BASELINE_PROPERTY];

    const changes = computePropertyChanges(current, previous);
    expect(changes).toEqual([
      {
        'Change Type': 'Removed',
        'Folio Number': '001',
        'Propietario': 'Owner',
        'Field': 'ALL',
        'Previous Value': 'Property removed',
        'Current Value': ''
      }
    ]);
  });

  it('handles mix of added, updated and removed properties', () => {
    const changes = computePropertyChanges(SAMPLE_CURRENT, SAMPLE_PREVIOUS);
    expect(changes).toEqual([
      {
        'Change Type': 'Updated',
        'Folio Number': '123',
        'Propietario': 'Alice Corp',
        'Field': 'VALOR',
        'Previous Value': '100000',
        'Current Value': '150000'
      },
      {
        'Change Type': 'Added',
        'Folio Number': '789',
        'Propietario': 'Charlie SA',
        'Field': 'ALL',
        'Previous Value': '',
        'Current Value': 'Property added'
      },
      {
        'Change Type': 'Removed',
        'Folio Number': '456',
        'Propietario': 'Bob LLC',
        'Field': 'ALL',
        'Previous Value': 'Property removed',
        'Current Value': ''
      }
    ]);
  });
});

describe('loadPreviousRunData', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-tracker-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when file is missing', () => {
    const result = loadPreviousRunData(path.join(tempDir, 'missing.xlsx'));
    expect(result).toBeNull();
  });

  it('loads data when workbook and sheet exist', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(SAMPLE_PREVIOUS);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Properties');
    const filePath = path.join(tempDir, 'existing.xlsx');
    XLSX.writeFile(workbook, filePath);

    const result = loadPreviousRunData(filePath);
    expect(result).not.toBeNull();
    expect(result?.filename).toBe(filePath);
    expect(result?.data).toEqual(expect.arrayContaining(SAMPLE_PREVIOUS));
  });
});

describe('exportChangesWorkbook', () => {
  let tempDir;
  let outputFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-tracker-'));
    outputFile = path.join(tempDir, 'changes.xlsx');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes highlighted change rows to the workbook', async () => {
    const changes = computePropertyChanges(SAMPLE_CURRENT, SAMPLE_PREVIOUS);
    const written = await exportChangesWorkbook(changes, outputFile);

    expect(written).toBe(changes.length);
    expect(fs.existsSync(outputFile)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputFile);
    const sheet = workbook.getWorksheet('Changes');
    expect(sheet).toBeDefined();

    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe(changes[0]['Change Type']);
    expect(row.getCell(1).fill?.fgColor?.argb).toBe('FFFFFF00');
    expect(row.getCell(6).value).toBe(changes[0]['Current Value']);
    expect(row.getCell(6).fill?.fgColor?.argb).toBe('FFFFFF00');
  });

  it('returns zero and writes nothing when there are no changes', async () => {
    const written = await exportChangesWorkbook([], outputFile);
    expect(written).toBe(0);
    expect(fs.existsSync(outputFile)).toBe(false);
  });

  it('produces a showcase workbook for manual review', async () => {
    fs.mkdirSync(SHOWCASE_OUTPUT_DIR, { recursive: true });
    if (fs.existsSync(SHOWCASE_OUTPUT_FILE)) {
      fs.unlinkSync(SHOWCASE_OUTPUT_FILE);
    }

    const changes = computePropertyChanges(SAMPLE_CURRENT, SAMPLE_PREVIOUS);
    const written = await exportChangesWorkbook(changes, SHOWCASE_OUTPUT_FILE);

    expect(written).toBe(changes.length);
    expect(fs.existsSync(SHOWCASE_OUTPUT_FILE)).toBe(true);
  });
});
