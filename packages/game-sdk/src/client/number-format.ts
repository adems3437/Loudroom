const grouped = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
const plain = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3, useGrouping: false });

/**
 * A number the Turkish way: dot as the thousands separator, comma for decimals
 * (1.234.567,5). Years are written without separators (1923).
 */
export function formatNumber(value: number, options: { grouping?: boolean } = {}): string {
  return (options.grouping === false ? plain : grouped).format(value);
}
