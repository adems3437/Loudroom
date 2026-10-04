'use client';

import { tileOf, type OkeyColor } from './tiles.js';

const INK: Record<OkeyColor, string> = {
  red: 'text-okey-red',
  yellow: 'text-okey-yellow',
  blue: 'text-okey-blue',
  black: 'text-okey-black',
};

/** Fixed sizes for the TV; `fill` takes its slot's width (the phone's rack). */
const SIZE = {
  sm: 'h-[60px] w-[44px] rounded-md border-2',
  md: 'h-[84px] w-[62px] rounded-lg border-[3px]',
  lg: 'h-[128px] w-[94px] rounded-xl border-4',
  fill: 'aspect-[3/4] w-full rounded-md border-2',
} as const;

const NUMBER_PX = { sm: 30, md: 42, lg: 64 } as const;

export type TileSize = keyof typeof SIZE;

/**
 * An original tile face: the number in its colour on cream, a small mark under it; the fake
 * okey shows a star. `wild` marks the okey itself (a corner star) on the owner's rack.
 */
export function TileFace({
  id,
  size,
  wild = false,
  selected = false,
}: {
  id: number;
  size: TileSize;
  wild?: boolean;
  selected?: boolean;
}) {
  const tile = tileOf(id);
  const font = size === 'fill' ? { fontSize: '58cqw' } : { fontSize: NUMBER_PX[size] };
  return (
    <span
      className={`bg-card-face relative flex shrink-0 flex-col items-center justify-center overflow-hidden leading-none font-extrabold shadow-md select-none ${SIZE[size]} ${
        selected ? 'border-accent -translate-y-[12%]' : 'border-card-face'
      } ${tile.fake ? 'text-success' : INK[tile.color]}`}
      style={{ containerType: 'inline-size' }}
      data-testid="okey-tile"
      data-tile={id}
      data-wild={wild}
    >
      <span style={font}>{tile.fake ? '★' : tile.number}</span>
      {!tile.fake && (
        <span className="mt-[8%] aspect-square w-[22%] rounded-full border-2 border-current" />
      )}
      {wild && (
        <span className="text-okey-yellow absolute top-[2%] right-[6%] text-[28cqw] leading-none">
          ★
        </span>
      )}
    </span>
  );
}

/** A face-down tile (the middle). */
export function TileBack({ size }: { size: Exclude<TileSize, 'fill'> }) {
  return <span className={`bg-rack border-card-face shadow-md ${SIZE[size]}`} />;
}
