'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Countdown, type PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState, type ReactNode } from 'react';
import {
  RACK_ROW,
  arrangePairs,
  arrangeRuns,
  type OkeyInput,
  type OkeyPlayerView,
} from './schema.js';
import { isOkey, seatName } from './seat.js';
import { TileBack, TileFace } from './tile.js';

type Props = PlayerRendererProps<OkeyPlayerView>;
type Playing = Extract<OkeyPlayerView, { phase: 'TURN' | 'TALLY' }>;
type Slots = (number | null)[];

const tilesIn = (slots: readonly (number | null)[]) =>
  slots.filter((id): id is number => id !== null);

const sameTiles = (a: readonly (number | null)[], b: readonly (number | null)[]) => {
  const left = tilesIn(a).sort((x, y) => x - y);
  const right = tilesIn(b).sort((x, y) => x - y);
  return left.length === right.length && left.every((id, i) => id === right[i]);
};

/** Moves a tile to a slot; a tile already there swaps places with it. */
function moveTile(slots: Slots, tile: number, to: number): Slots {
  const from = slots.indexOf(tile);
  if (from === -1 || from === to) return slots;
  const next = [...slots];
  next[from] = next[to] ?? null;
  next[to] = tile;
  return next;
}

const button =
  'min-h-[44px] rounded-xl px-3 py-2 text-sm font-bold transition-transform active:scale-95 disabled:opacity-40';

function RackSlot({
  index,
  children,
  onTap,
}: {
  index: number;
  children: ReactNode;
  onTap: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `s:${index}` });
  return (
    <div
      ref={setNodeRef}
      data-testid="okey-slot"
      data-slot={index}
      onClick={onTap}
      className={`flex aspect-[3/4] items-end rounded-md ${isOver ? 'bg-accent/40' : 'bg-rack-edge/50'}`}
    >
      {children}
    </div>
  );
}

function RackTile({
  id,
  wild,
  selected,
  onTap,
}: {
  id: number;
  wild: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `t:${id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="okey-rack-tile"
      data-tile={id}
      data-selected={selected}
      className={`w-full touch-none ${isDragging ? 'opacity-30' : ''}`}
      {...listeners}
      {...attributes}
      onClick={(event) => {
        event.stopPropagation();
        onTap();
      }}
    >
      <TileFace id={id} size="fill" wild={wild} selected={selected} />
    </button>
  );
}

/** A pile to draw from (the middle or the left neighbour's tile): tap or drag onto the rack. */
function Source({
  id,
  enabled,
  onTap,
  testId,
  label,
  children,
}: {
  id: string;
  enabled: boolean;
  onTap: () => void;
  testId: string;
  label: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, disabled: !enabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={testId}
      data-enabled={enabled}
      disabled={!enabled}
      onClick={onTap}
      className={`flex w-[52px] shrink-0 touch-none flex-col items-center gap-1 rounded-lg p-1 ${
        enabled ? 'ring-accent ring-2' : 'opacity-70'
      }`}
      {...listeners}
      {...attributes}
    >
      {children}
      <span className="text-muted text-[10px] leading-none">{label}</span>
    </button>
  );
}

/** Where a tile is dropped to discard or to finish. */
function Target({
  id,
  enabled,
  testId,
  label,
  children,
}: {
  id: string;
  enabled: boolean;
  testId: string;
  label: string;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled });
  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      className={`flex w-[52px] shrink-0 flex-col items-center gap-1 rounded-lg border-2 border-dashed p-1 ${
        isOver ? 'border-accent bg-accent/20' : enabled ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="w-full">{children ?? <span className="block aspect-[3/4] w-full" />}</div>
      <span className="text-muted text-[10px] leading-none">{label}</span>
    </div>
  );
}

function Board({
  view,
  playerId,
  players,
  phase,
  serverNow,
  submit,
  haptic,
  describeError,
  t,
}: Props & { view: Playing }) {
  const [local, setLocal] = useState<Slots | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ id: string; width: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  const server = view.rack ?? [];
  const slots = local && sameTiles(local, server) ? local : server;
  const tiles = tilesIn(slots);
  const pick = selected !== null && tiles.includes(selected) ? selected : null;
  const me = view.seats.findIndex((seat) => seat.id === playerId);
  const left = view.seats[(me + view.seats.length - 1) % view.seats.length];
  const mine = view.seats[me];
  const playing = view.phase === 'TURN';
  const myTurn = playing && view.turn === playerId;
  const turnSeat = view.seats.find((seat) => seat.id === view.turn);

  const send = async (input: OkeyInput, failure?: string) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit(input);
    setBusy(false);
    if (!outcome.ok) setError(failure ?? describeError(outcome.code));
  };
  const arrange = (next: Slots) => {
    setLocal(next);
    void submit({ type: 'arrange', slots: next }).then((outcome) => {
      if (!outcome.ok) setLocal(null);
    });
  };
  const discard = (tile: number) => {
    setSelected(null);
    void send({ type: 'discard', tile });
  };
  const finish = (tile: number) => {
    setSelected(null);
    void send({ type: 'finish', tile }, t('cannotFinish'));
  };

  const onDragStart = (event: DragStartEvent) => {
    setDragging({
      id: String(event.active.id),
      width: event.active.rect.current.initial?.width ?? 48,
    });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const source = String(active.id);
    const target = String(over.id);
    const slot = target.startsWith('s:') ? Number(target.slice(2)) : null;
    if (source === 'deck' && slot !== null) {
      void send({ type: 'draw', slot });
    } else if (source === 'left' && slot !== null) {
      void send({ type: 'take', slot });
    } else if (source.startsWith('t:')) {
      const tile = Number(source.slice(2));
      if (slot !== null) arrange(moveTile(slots, tile, slot));
      else if (target === 'discard') discard(tile);
      else if (target === 'finish') finish(tile);
    }
  };

  const status = !playing
    ? view.tally.winner
      ? t('tallyWon', {
          name: seatName(
            view.seats.find((s) => s.id === view.tally.winner) ?? { id: '', bot: null },
            players,
            t,
          ),
        })
      : t('tallyDraw')
    : myTurn
      ? view.canDiscard
        ? t('discardNow')
        : t('drawNow')
      : t('waitingTurn', { name: turnSeat ? seatName(turnSeat, players, t) : '?' });

  const overlayTile = dragging?.id.startsWith('t:') ? Number(dragging.id.slice(2)) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Source
            id="left"
            enabled={view.canTake && !busy}
            onTap={() => void send({ type: 'take' })}
            testId="okey-take"
            label={t('fromLeft')}
          >
            {left?.discard != null ? (
              <span className="w-full">
                <TileFace id={left.discard} size="fill" wild={isOkey(left.discard, view.okey)} />
              </span>
            ) : (
              <span className="border-line block aspect-[3/4] w-full rounded-md border-2 border-dashed" />
            )}
          </Source>
          <Source
            id="deck"
            enabled={view.canDraw && !busy}
            onTap={() => void send({ type: 'draw' })}
            testId="okey-draw"
            label={t('deck', { count: view.deckCount })}
          >
            <span className="bg-rack border-card-face block aspect-[3/4] w-full rounded-md border-2" />
          </Source>
          <div
            className="flex w-[44px] shrink-0 flex-col items-center gap-1"
            data-testid="okey-player-indicator"
          >
            <span className="w-full">
              <TileFace id={view.indicator} size="fill" />
            </span>
            <span className="text-muted text-[10px] leading-none">{t('indicator')}</span>
          </div>
          <p
            className={`min-w-0 flex-1 truncate text-sm font-bold ${myTurn ? 'text-accent' : ''}`}
            data-testid="okey-status"
          >
            {status}
          </p>
          {playing && (
            <Countdown
              endsAt={phase?.endsAt ?? null}
              durationMs={phase?.durationMs ?? null}
              serverNow={serverNow}
              size={40}
              label={t('timeLeft')}
            />
          )}
          <Target
            id="discard"
            enabled={view.canDiscard}
            testId="okey-discard-zone"
            label={t('discardHere')}
          >
            {mine?.discard != null && <TileFace id={mine.discard} size="fill" />}
          </Target>
          <Target
            id="finish"
            enabled={view.canDiscard}
            testId="okey-finish-zone"
            label={t('finishHere')}
          />
        </div>

        <div
          className="bg-rack border-rack-edge grid gap-[3px] rounded-xl border-b-8 p-[6px]"
          style={{ gridTemplateColumns: `repeat(${RACK_ROW}, minmax(0, 1fr))` }}
          data-testid="okey-rack"
        >
          {slots.map((id, index) => (
            <RackSlot
              key={index}
              index={index}
              onTap={() => {
                if (pick !== null && id === null) {
                  setSelected(null);
                  arrange(moveTile(slots, pick, index));
                }
              }}
            >
              {id !== null && (
                <RackTile
                  id={id}
                  wild={isOkey(id, view.okey)}
                  selected={pick === id}
                  onTap={() => {
                    setSelected(pick === id ? null : id);
                  }}
                />
              )}
            </RackSlot>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            data-testid="okey-sort-runs"
            className={`${button} bg-surface`}
            onClick={() => {
              arrange(arrangeRuns(tiles, view.okey));
            }}
          >
            {t('sortRuns')}
          </button>
          <button
            type="button"
            data-testid="okey-sort-pairs"
            className={`${button} bg-surface`}
            onClick={() => {
              arrange(arrangePairs(tiles, view.okey));
            }}
          >
            {t('sortPairs')}
          </button>
          {view.canShow && (
            <button
              type="button"
              data-testid="okey-show"
              disabled={busy}
              className={`${button} bg-brand`}
              onClick={() => void send({ type: 'show' })}
            >
              {t('show')}
            </button>
          )}
          <span className="flex-1" />
          {error && (
            <p role="alert" data-testid="okey-error" className="text-danger self-center text-sm">
              {error}
            </p>
          )}
          <button
            type="button"
            data-testid="okey-discard"
            disabled={!view.canDiscard || pick === null || busy}
            className={`${button} bg-danger text-ink`}
            onClick={() => {
              if (pick !== null) discard(pick);
            }}
          >
            {t('discard')}
          </button>
          <button
            type="button"
            data-testid="okey-finish"
            disabled={!view.canDiscard || pick === null || busy}
            className={`${button} bg-success text-canvas`}
            onClick={() => {
              if (pick !== null) finish(pick);
            }}
          >
            {t('finish')}
          </button>
        </div>
      </div>
      <DragOverlay>
        {dragging &&
          (overlayTile !== null ? (
            <div style={{ width: dragging.width }}>
              <TileFace id={overlayTile} size="fill" wild={isOkey(overlayTile, view.okey)} />
            </div>
          ) : dragging.id === 'left' && left?.discard != null ? (
            <div style={{ width: dragging.width }}>
              <TileFace id={left.discard} size="fill" />
            </div>
          ) : (
            <TileBack size="sm" />
          ))}
      </DragOverlay>
    </DndContext>
  );
}

/** Phone of an Okey player: held sideways, the rack with drag and drop. */
export function OkeyPlayer(props: Props) {
  const { view, playerId, t } = props;

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="okey-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'SETUP') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="okey-player"
        data-phase="SETUP"
      >
        <p className="font-display text-2xl font-bold">
          {view.seated ? t('setupWaiting') : t('watching')}
        </p>
        <p className="text-muted portrait:text-accent text-lg">{t('rotateHint')}</p>
      </div>
    );
  }

  if (view.phase === 'END') {
    const mine = view.ranking.find((row) => row.id === playerId);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
        data-testid="okey-player-end"
        data-place={mine?.place ?? ''}
      >
        <p className="font-display text-3xl font-extrabold">
          {mine ? t('yourPlace', { place: mine.place }) : t('over')}
        </p>
        {mine && <p className="text-xl tabular-nums">{t('points', { points: mine.points })}</p>}
      </div>
    );
  }

  if (view.rack === null) {
    return (
      <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="okey-spectator">
        {t('watching')}
      </p>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col"
      data-testid="okey-player"
      data-phase={view.phase}
      data-my-turn={view.turn === playerId}
    >
      <div
        className="hidden flex-1 flex-col items-center justify-center gap-4 text-center portrait:flex"
        data-testid="okey-rotate"
      >
        <span className="text-6xl">📱↻</span>
        <p className="font-display text-2xl font-bold">{t('rotate')}</p>
      </div>
      <div className="portrait:hidden">
        <Board {...props} view={view} />
      </div>
    </div>
  );
}
