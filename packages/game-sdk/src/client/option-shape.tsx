/**
 * Answer options are told apart by color *and* shape (color-blind friendly, SPEC §7.1).
 * The slot is the option's display position.
 */
export const OPTION_STYLES = [
  { color: '#ef4565', shape: 'triangle' },
  { color: '#3a86ff', shape: 'diamond' },
  { color: '#f5b700', shape: 'circle' },
  { color: '#2bb673', shape: 'square' },
  { color: '#9b5de5', shape: 'star' },
  { color: '#ff7a1a', shape: 'hexagon' },
] as const;

export function optionStyle(slot: number): (typeof OPTION_STYLES)[number] {
  return OPTION_STYLES[slot % OPTION_STYLES.length] ?? OPTION_STYLES[0];
}

const PATHS: Record<(typeof OPTION_STYLES)[number]['shape'], string> = {
  triangle: 'M12 3 L22 20 H2 Z',
  diamond: 'M12 2 L22 12 L12 22 L2 12 Z',
  circle: 'M12 2 A10 10 0 1 1 11.99 2 Z',
  square: 'M3 3 H21 V21 H3 Z',
  star: 'M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z',
  hexagon: 'M12 2 L21 7 V17 L12 22 L3 17 V7 Z',
};

/** The option's shape, drawn in white for use on its colored background. */
export function OptionShape({ slot, size }: { slot: number; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path d={PATHS[optionStyle(slot).shape]} fill="#fff" strokeLinejoin="round" />
    </svg>
  );
}
