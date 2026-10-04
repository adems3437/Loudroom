'use client';

import type { RendererPlayer } from '@loudroom/game-sdk/client';
import { SPACING } from './board.js';
import { GOAL_SIZE, type KizmaHostView } from './schema.js';

type Board = Extract<KizmaHostView, { board: unknown }>['board'];
type Point = [number, number];

/**
 * The classic cross board (SPEC §7.15) on an 11×11 grid: the 40 track squares clockwise from
 * the left arm, so slot k starts at square k×10 — left, top, right, bottom.
 */
const CROSS_TRACK: Point[] = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 3],
  [4, 2],
  [4, 1],
  [4, 0],
  [5, 0],
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [7, 4],
  [8, 4],
  [9, 4],
  [10, 4],
  [10, 5],
  [10, 6],
  [9, 6],
  [8, 6],
  [7, 6],
  [6, 6],
  [6, 7],
  [6, 8],
  [6, 9],
  [6, 10],
  [5, 10],
  [4, 10],
  [4, 9],
  [4, 8],
  [4, 7],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 5],
];

/** Each slot's goal lane into the middle, and its yard in the corner beside its start. */
const CROSS_GOALS: Point[][] = [
  [
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5],
  ],
  [
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 4],
  ],
  [
    [9, 5],
    [8, 5],
    [7, 5],
    [6, 5],
  ],
  [
    [5, 9],
    [5, 8],
    [5, 7],
    [5, 6],
  ],
];
const CROSS_YARDS: Point[][] = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  [
    [9, 0],
    [10, 0],
    [9, 1],
    [10, 1],
  ],
  [
    [9, 9],
    [10, 9],
    [9, 10],
    [10, 10],
  ],
  [
    [0, 9],
    [1, 9],
    [0, 10],
    [1, 10],
  ],
];

const CELL = 100;
const center = ([x, y]: Point): Point => [x * CELL + CELL / 2, y * CELL + CELL / 2];

/** The 6-seat variant keeps a round track: 48 squares around, lanes inward, yards outside. */
function roundLayout(board: Board) {
  const middle = 550;
  const angle = (square: number) => -Math.PI / 2 + (2 * Math.PI * square) / board.track;
  const at = (a: number, r: number): Point => [middle + r * Math.cos(a), middle + r * Math.sin(a)];
  const spacing = SPACING[board.slots];
  return {
    track: Array.from({ length: board.track }, (_, i) => at(angle(i), 420)),
    goal: (slot: number) =>
      Array.from({ length: GOAL_SIZE }, (_, lane) =>
        at(angle(slot * spacing - 1), 350 - lane * 55),
      ),
    yard: (slot: number) => {
      const [x, y] = at(angle(slot * spacing + spacing / 2), 505);
      return [
        [x - 22, y - 22],
        [x + 22, y - 22],
        [x - 22, y + 22],
        [x + 22, y + 22],
      ] as Point[];
    },
    radius: 22,
  };
}

function crossLayout() {
  return {
    track: CROSS_TRACK.map(center),
    goal: (slot: number) => (CROSS_GOALS[slot] ?? []).map(center),
    yard: (slot: number) => (CROSS_YARDS[slot] ?? []).map(center),
    radius: 38,
  };
}

/** A Kızma Birader board: the classic cross for four, a round track for the six-seat variant. */
export function BoardView({
  board,
  players,
  movable,
  turn,
  onPawn,
}: {
  board: Board;
  players: readonly RendererPlayer[];
  /** The current player's pawns that may move (highlighted). */
  movable: readonly number[];
  turn: string | null;
  onPawn?: ((pawn: number) => void) | undefined;
}) {
  const colorOf = (id: string) => players.find((player) => player.id === id)?.color ?? '#888';
  const spacing = SPACING[board.slots];
  const layout = board.slots === 4 ? crossLayout() : roundLayout(board);
  const r = layout.radius;
  const seated = new Map(board.players.map((p) => [p.slot, p.playerId]));

  const pawnAt = (slot: number, progress: number, pawn: number): Point => {
    if (progress < 0) return layout.yard(slot)[pawn] ?? [0, 0];
    if (progress < board.track) {
      return layout.track[(slot * spacing + progress) % board.track] ?? [0, 0];
    }
    return layout.goal(slot)[progress - board.track] ?? [0, 0];
  };

  return (
    <svg viewBox="0 0 1100 1100" className="h-full w-full" data-testid="kizma-board" role="img">
      <rect x={0} y={0} width={1100} height={1100} rx={60} className="fill-surface" />
      {layout.track.map(([x, y], square) => {
        const owner = seated.get(square / spacing);
        return (
          <circle
            key={`t${square}`}
            cx={x}
            cy={y}
            r={r}
            className="fill-card-face stroke-line"
            strokeWidth={4}
            style={owner ? { fill: colorOf(owner) } : undefined}
          />
        );
      })}
      {Array.from({ length: board.slots }, (_, slot) => {
        const owner = seated.get(slot);
        const fill = owner ? { fill: colorOf(owner), opacity: 0.45 } : undefined;
        return [
          ...layout
            .goal(slot)
            .map(([x, y], lane) => (
              <circle
                key={`g${slot}-${lane}`}
                cx={x}
                cy={y}
                r={r}
                className="fill-surface-raised stroke-line"
                strokeWidth={4}
                style={fill}
              />
            )),
          ...layout
            .yard(slot)
            .map(([x, y], spot) => (
              <circle
                key={`y${slot}-${spot}`}
                cx={x}
                cy={y}
                r={r * 0.85}
                className="fill-surface-raised stroke-line"
                strokeWidth={4}
                style={fill}
              />
            )),
        ];
      })}
      {board.players.flatMap((player) =>
        player.pawns.map((progress, pawn) => {
          const [x, y] = pawnAt(player.slot, progress, pawn);
          const canMove = player.playerId === turn && movable.includes(pawn);
          return (
            <g
              key={`${player.playerId}-${pawn}`}
              data-testid="kizma-board-pawn"
              data-player-id={player.playerId}
              data-pawn={pawn}
              data-progress={progress}
              onClick={
                canMove && onPawn
                  ? () => {
                      onPawn(pawn);
                    }
                  : undefined
              }
              className={canMove && onPawn ? 'cursor-pointer' : undefined}
            >
              {canMove && (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 10}
                  className="stroke-accent fill-none"
                  strokeWidth={8}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={r * 0.7}
                className="stroke-card-ink"
                strokeWidth={5}
                style={{ fill: colorOf(player.playerId) }}
              />
              <text
                x={x}
                y={y + r * 0.28}
                textAnchor="middle"
                className="fill-card-ink font-extrabold"
                style={{ fontSize: r * 0.8 }}
              >
                {pawn + 1}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 25],
    [75, 25],
    [25, 50],
    [75, 50],
    [25, 75],
    [75, 75],
  ],
};

/** A die face; blank before the roll. */
export function Die({ value, size }: { value: number | null; size: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      data-testid="kizma-die"
      data-value={value ?? ''}
      role="img"
      aria-label={value === null ? '' : String(value)}
    >
      <rect
        x={4}
        y={4}
        width={92}
        height={92}
        rx={18}
        className="fill-card-face stroke-line"
        strokeWidth={4}
      />
      {(value === null ? [] : (PIPS[value] ?? [])).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={8} className="fill-card-ink" />
      ))}
    </svg>
  );
}
