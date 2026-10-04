'use client';

import { createRandom } from '@loudroom/game-sdk';
import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { randomFleet, validFleet } from './fleet.js';
import { Grid } from './grid.js';
import type { AmiralInput, AmiralPlayerView, Placement } from './schema.js';

type Props = PlayerRendererProps<AmiralPlayerView>;
type Playing = Extract<AmiralPlayerView, { phase: 'PLACE' | 'BATTLE' }>;

const button =
  'min-h-touch rounded-2xl px-4 py-3 font-bold transition-transform active:scale-95 disabled:opacity-40';

/** A cell's name as on a paper board: column letter, row number (B5). */
const cellName = (x: number, y: number) => `${String.fromCharCode(65 + x)}${y + 1}`;

type Tab = 'target' | 'own';

/** The captain lays out the fleet: pick a ship, tap its first cell; rotate; or random. */
function Placer({
  view,
  send,
  busy,
  t,
}: {
  view: Playing;
  send: (input: AmiralInput) => void;
  busy: boolean;
  t: Props['t'];
}) {
  const [ships, setShips] = useState<(Placement | null)[]>(() =>
    view.fleet ? [...view.fleet] : view.ships.map(() => null),
  );
  const [selected, setSelected] = useState(0);
  const [vertical, setVertical] = useState(false);

  const placeAt = (x: number, y: number) => {
    const candidate = { x, y, vertical };
    const others = ships.map((ship, i) => (i === selected ? candidate : ship));
    const placed = others.flatMap((ship, i) => (ship ? [{ ship, size: view.ships[i] ?? 0 }] : []));
    if (
      !validFleet(
        placed.map((p) => p.ship),
        placed.map((p) => p.size),
        view.grid,
      )
    )
      return;
    setShips(others);
    const next = others.findIndex((ship) => ship === null);
    if (next !== -1) setSelected(next);
  };
  const complete = ships.every((ship) => ship !== null);

  return (
    <div className="flex flex-col gap-3" data-testid="amiral-placer">
      <ul className="flex flex-wrap gap-2">
        {view.ships.map((size, i) => (
          <li key={i}>
            <button
              type="button"
              data-testid="amiral-ship"
              data-size={size}
              aria-pressed={selected === i}
              onClick={() => {
                setSelected(i);
              }}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                selected === i ? 'bg-accent text-canvas' : ships[i] ? 'bg-brand/60' : 'bg-surface'
              }`}
            >
              {'■'.repeat(size)}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Grid
          size={view.grid}
          shots={[]}
          fleet={ships}
          sizes={view.ships}
          onCell={placeAt}
          testId="amiral-place"
          label={t('yourFleet')}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          data-testid="amiral-rotate"
          onClick={() => {
            setVertical(!vertical);
          }}
          className={`${button} border-line border`}
        >
          {vertical ? t('vertical') : t('horizontal')}
        </button>
        <button
          type="button"
          data-testid="amiral-random"
          onClick={() => {
            setShips(randomFleet(createRandom(Date.now() % 2 ** 31), view.ships, view.grid));
          }}
          className={`${button} border-line border`}
        >
          {t('random')}
        </button>
        <button
          type="button"
          data-testid="amiral-ready-button"
          disabled={!complete || busy}
          onClick={() => {
            send({
              type: 'place',
              ships: ships.filter((ship): ship is Placement => ship !== null),
            });
          }}
          className={`${button} bg-brand text-ink`}
        >
          {t('ready')}
        </button>
      </div>
    </div>
  );
}

/** Phone of an Amiral Battı player: lay out the fleet, then fire at the other side's board. */
export function AmiralPlayer({ view, players, playerId, submit, haptic, describeError, t }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aim, setAim] = useState<readonly [number, number] | null>(null);
  // A tab picked by hand (or the enemy board, right after firing, to see the result) holds
  // until the turn changes hands; then the board that matters shows.
  const [picked, setPicked] = useState<{ tab: Tab; myTurn: boolean } | null>(null);
  const nick = (id: string) => players.find((player) => player.id === id)?.nickname ?? '?';

  const send = async (input: AmiralInput) => {
    if (busy) return;
    haptic();
    setBusy(true);
    setError(null);
    const outcome = await submit(input);
    setBusy(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-muted flex-1 text-center" data-testid="amiral-player-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'END') {
    const won = view.winners.includes(playerId);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="amiral-player-end"
        data-won={view.mySide === null ? 'null' : String(won)}
      >
        <p className="font-display text-3xl font-extrabold">
          {view.mySide === null ? t('over') : won ? t('youWon') : t('youLost')}
        </p>
      </div>
    );
  }

  const duel = view.duels.find((d) => d.id === view.myDuel) ?? null;
  const mine =
    duel && view.mySide !== null ? (duel.a.side === view.mySide ? duel.a : duel.b) : null;
  const theirs = duel && mine ? (mine === duel.a ? duel.b : duel.a) : null;
  const canShoot = view.phase === 'BATTLE' && view.canShoot;
  const tab: Tab = picked?.myTurn === canShoot ? picked.tab : canShoot || !mine ? 'target' : 'own';
  const target =
    canShoot && aim && !theirs?.shotsTaken.some((s) => s.x === aim[0] && s.y === aim[1])
      ? aim
      : null;
  const errorBox = error && (
    <p
      role="alert"
      data-testid="amiral-error"
      className="bg-danger/15 text-danger rounded-xl px-4 py-3"
    >
      {error}
    </p>
  );

  if (view.mySide === null) {
    return (
      <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="amiral-spectator">
        {t('watching')}
      </p>
    );
  }

  if (view.phase === 'PLACE') {
    const side = view.sides[view.mySide];
    return (
      <div className="flex flex-1 flex-col gap-4" data-testid="amiral-player" data-phase="PLACE">
        {view.canPlace && !side?.ready ? (
          <>
            <p className="font-display text-xl font-bold">{t('placeFleet')}</p>
            <Placer view={view} send={(input) => void send(input)} busy={busy} t={t} />
          </>
        ) : (
          <p className="bg-surface rounded-2xl px-4 py-4 text-center" data-testid="amiral-waiting">
            {duel?.b === null
              ? t('byeYou')
              : side?.ready
                ? t('waitingOthers')
                : t('captainPlacing', { name: nick(side?.captain ?? '') })}
          </p>
        )}
        {view.fleet && (
          <div className="self-center">
            <Grid
              size={view.grid}
              shots={[]}
              fleet={view.fleet}
              sizes={view.ships}
              cellPx={Math.floor(220 / view.grid)}
              testId="amiral-own"
              label={t('yourFleet')}
            />
          </div>
        )}
        {errorBox}
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col gap-4"
      data-testid="amiral-player"
      data-phase="BATTLE"
      data-can-shoot={view.canShoot}
    >
      <p
        className={`font-display text-xl font-bold ${view.canShoot ? 'text-accent' : ''}`}
        data-testid="amiral-turn-info"
      >
        {!duel || !theirs
          ? view.myDuel === null
            ? t('out')
            : t('byeYou')
          : duel.winner
            ? t('duelOver')
            : view.canShoot
              ? t('yourShot')
              : t('shooting', { name: nick(duel.shooter ?? '') })}
      </p>
      {theirs && mine && (
        <div className="grid grid-cols-2 gap-2" role="group">
          {(['target', 'own'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`amiral-tab-${value}`}
              aria-pressed={tab === value}
              onClick={() => {
                setPicked({ tab: value, myTurn: canShoot });
              }}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                tab === value ? 'bg-accent text-canvas' : 'bg-surface'
              }`}
            >
              {value === 'target'
                ? t('theirBoard', { count: theirs.shipsLeft })
                : t('yourBoard', { count: mine.shipsLeft })}
            </button>
          ))}
        </div>
      )}
      {theirs && tab === 'target' && (
        <>
          <Grid
            size={view.grid}
            shots={theirs.shotsTaken}
            aim={target}
            onCell={
              canShoot && !busy
                ? (x, y) => {
                    haptic();
                    setAim([x, y]);
                  }
                : undefined
            }
            canTap={(x, y) => !theirs.shotsTaken.some((s) => s.x === x && s.y === y)}
            testId="amiral-target"
            label={t('theirBoardLabel')}
          />
          {canShoot && (
            <button
              type="button"
              data-testid="amiral-fire"
              disabled={!target || busy}
              onClick={() => {
                if (!target) return;
                setAim(null);
                setPicked({ tab: 'target', myTurn: false });
                void send({ type: 'shoot', x: target[0], y: target[1] });
              }}
              className={`${button} bg-danger text-ink text-xl`}
            >
              {target ? t('fireAt', { cell: cellName(target[0], target[1]) }) : t('pickCell')}
            </button>
          )}
        </>
      )}
      {mine && (tab === 'own' || !theirs) && (
        <Grid
          size={view.grid}
          shots={mine.shotsTaken}
          fleet={view.fleet}
          sizes={view.ships}
          testId="amiral-own"
          label={t('yourFleet')}
        />
      )}
      {errorBox}
    </div>
  );
}
