import { formatNumber } from '@loudroom/game-sdk/client';
import type { DisplayFormat } from './schema.js';

/** A value as shown on screens: Turkish separators, years without grouping, unit after it. */
export function formatValue(value: number, format: DisplayFormat, unit?: string | null): string {
  const text = formatNumber(value, { grouping: format !== 'year' });
  return unit ? `${text} ${unit}` : text;
}

/**
 * Cleans what is typed into a number field and regroups it the Turkish way while typing:
 * "1234567,5" → "1.234.567,5". Years take whole numbers and no grouping.
 */
export function formatTyping(raw: string, format: DisplayFormat): string {
  const negative = raw.trimStart().startsWith('-');
  const [whole = '', ...rest] = raw.replace(/\./g, '').split(',');
  const digits = whole.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const sign = negative ? '-' : '';
  if (format === 'year') return sign + digits;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (rest.length === 0) return sign + grouped;
  return `${sign}${grouped || '0'},${rest.join('').replace(/\D/g, '').slice(0, 3)}`;
}

/** The number in a typed (Turkish formatted) text; null when there is none. */
export function parseTyped(text: string): number | null {
  const normalized = text.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d*)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
