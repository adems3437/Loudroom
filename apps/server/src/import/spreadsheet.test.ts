import writeXlsxFile from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';
import { readSpreadsheet, SpreadsheetError } from './spreadsheet.js';

const csv = (text: string) => Buffer.from(text, 'utf8');

describe('readSpreadsheet', () => {
  it('reads comma, semicolon and tab separated files, with or without a BOM', async () => {
    const expected = [
      ['soru', 'a', 'b'],
      ['Başkent?', 'İstanbul', 'Ankara'],
    ];
    expect(await readSpreadsheet(csv('soru,a,b\nBaşkent?,İstanbul,Ankara\n'))).toEqual(expected);
    expect(await readSpreadsheet(csv('\uFEFFsoru;a;b\r\nBaşkent?;İstanbul;Ankara'))).toEqual(
      expected,
    );
    expect(await readSpreadsheet(csv('soru\ta\tb\nBaşkent?\tİstanbul\tAnkara'))).toEqual(expected);
  });

  it('keeps quoted separators and drops empty rows', async () => {
    expect(await readSpreadsheet(csv('soru;cevap\n"Kaç; tane?";"1.234,5"\n;\n'))).toEqual([
      ['soru', 'cevap'],
      ['Kaç; tane?', '1.234,5'],
    ]);
  });

  it('refuses files that are not UTF-8, and empty ones', async () => {
    const windows1254 = Buffer.from([0x73, 0x6f, 0x72, 0x75, 0x0a, 0xfe, 0x65, 0x6b, 0x65, 0x72]);
    await expect(readSpreadsheet(windows1254)).rejects.toEqual(new SpreadsheetError('NOT_UTF8'));
    await expect(readSpreadsheet(csv('\n;;\n'))).rejects.toEqual(new SpreadsheetError('EMPTY'));
  });

  it('reads the first sheet of an XLSX file, numbers the Turkish way', async () => {
    const buffer = await writeXlsxFile([
      [{ value: 'soru' }, { value: 'cevap' }],
      [{ value: 'Kaç?' }, { value: 8849.5 }],
    ]).toBuffer();
    expect(await readSpreadsheet(buffer)).toEqual([
      ['soru', 'cevap'],
      ['Kaç?', '8849,5'],
    ]);
  });

  it('reports a broken XLSX file as unreadable', async () => {
    const broken = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]);
    await expect(readSpreadsheet(broken)).rejects.toEqual(new SpreadsheetError('UNREADABLE'));
  });
});
