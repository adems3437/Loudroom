'use client';

import { cellsOf } from './fleet.js';
import type { Placement, Shot } from './schema.js';

type CellState = 'empty' | 'ship' | 'miss' | 'hit' | 'sunk';

const CELL_CLASS: Record<CellState, string> = {
  empty: 'bg-surface-raised',
  ship: 'bg-brand/60',
  miss: 'bg-surface-raised text-muted',
  hit: 'bg-danger/70 text-ink',
  sunk: 'bg-danger text-ink',
};

const MARK: Record<CellState, string> = { empty: '', ship: '', miss: '•', hit: '✕', sunk: '✕' };

/**
 * A board: shots fired at it (hits, misses, sunk ships) and, for its own side only, the fleet.
 * Tappable cells call `onCell` (aiming, placing).
 */
export function Grid({
  size,
  shots,
  fleet = null,
  sizes = [],
  cellPx,
  onCell,
  canTap,
  testId,
  label,
}: {
  size: number;
  shots: readonly Shot[];
  fleet?: readonly (Placement | null)[] | null;
  sizes?: readonly number[];
  cellPx: number;
  onCell?: ((x: number, y: number) => void) | undefined;
  canTap?: ((x: number, y: number) => boolean) | undefined;
  testId: string;
  label: string;
}) {
  const state = new Map<string, CellState>();
  for (const [i, ship] of (fleet ?? []).entries()) {
    if (!ship) continue;
    for (const [x, y] of cellsOf(ship, sizes[i] ?? 0)) state.set(`${x},${y}`, 'ship');
  }
  for (const shot of shots) state.set(`${shot.x},${shot.y}`, shot.hit ? 'hit' : 'miss');
  for (const shot of shots) {
    if (!shot.sunk) continue;
    for (const [x, y] of cellsOf(shot.sunk, shot.sunk.size)) state.set(`${x},${y}`, 'sunk');
  }

  return (
    <div
      role="grid"
      aria-label={label}
      data-testid={testId}
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${size}, ${cellPx}px)` }}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const cell = state.get(`${x},${y}`) ?? 'empty';
        const tappable = onCell !== undefined && (canTap?.(x, y) ?? true);
        const common = {
          'data-x': x,
          'data-y': y,
          'data-state': cell,
          className: `grid place-items-center rounded-[3px] font-extrabold leading-none ${CELL_CLASS[cell]}`,
          style: { width: cellPx, height: cellPx, fontSize: Math.round(cellPx * 0.6) },
        };
        return tappable ? (
          <button
            key={i}
            type="button"
            data-testid={`${testId}-cell`}
            {...common}
            onClick={() => {
              onCell(x, y);
            }}
          >
            {MARK[cell]}
          </button>
        ) : (
          <span key={i} data-testid={`${testId}-cell`} {...common}>
            {MARK[cell]}
          </span>
        );
      })}
    </div>
  );
}
