'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { Grid } from './grid.js';
import type { AmiralHostView, DuelView } from './schema.js';

type Props = HostRendererProps<AmiralHostView>;
type Playing = Extract<AmiralHostView, { phase: 'PLACE' | 'BATTLE' }>;

/** One side of a duel: its name, ships left and the shots fired at its board. */
function Half({
  view,
  duel,
  letter,
  cellPx,
  name,
  t,
}: {
  view: Playing;
  duel: DuelView;
  letter: 'a' | 'b';
  cellPx: number;
  name: (side: number) => string;
  t: Props['t'];
}) {
  const half = letter === 'a' ? duel.a : duel.b;
  if (!half) return null;
  const toMove = view.phase === 'BATTLE' && duel.winner === null && duel.turn !== letter;
  return (
    <div
      className="flex flex-col items-center gap-2"
      data-testid="amiral-half"
      data-side={half.side}
    >
      <span
        className={`max-w-full truncate font-bold ${duel.winner === letter ? 'text-success' : ''}`}
      >
        {name(half.side)}
      </span>
      <Grid
        size={view.grid}
        shots={half.shotsTaken}
        cellPx={cellPx}
        testId="amiral-board"
        label={name(half.side)}
      />
      <span className={`text-muted ${toMove ? 'text-accent' : ''}`}>
        {t('shipsLeft', { count: half.shipsLeft })}
      </span>
    </div>
  );
}

/** TV screen of Amiral Battı (SPEC §7.16): shot maps of both sides, never their ships. */
export function AmiralHost({ view, phase, serverNow, players, t }: Props) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const nick = (id: string) => byId.get(id)?.nickname ?? '?';

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-warning text-[48px] font-bold" data-testid="amiral-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  const sideName = (side: number) => {
    const members = view.sides[side]?.members ?? [];
    return view.mode === 'teams'
      ? t('team', { names: members.map(nick).join(', ') })
      : nick(members[0] ?? '');
  };

  if (view.phase === 'END') {
    return (
      <div
        className="flex h-full flex-col gap-6 overflow-hidden"
        data-testid="amiral-host"
        data-phase="END"
      >
        <h2 className="font-display text-[56px] font-extrabold">{t('name')}</h2>
        <p
          className="font-display text-accent text-[64px] font-extrabold"
          data-testid="amiral-result"
        >
          {t('won', { names: view.winners.map(nick).join(', ') })}
        </p>
        <ol className="flex flex-col gap-2 text-[32px]">
          {view.ranking.map((row) => (
            <li
              key={row.playerId}
              data-testid="amiral-rank"
              data-player-id={row.playerId}
              data-place={row.place}
              className="bg-surface flex justify-between rounded-2xl px-6 py-2"
            >
              <span className="font-bold">{nick(row.playerId)}</span>
              <span className="text-muted">{t('place', { place: row.place })}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const teams = view.mode === 'teams';
  // Few duels get big boards; up to six fit in three columns.
  const duelCell = view.duels.length <= 2 ? (view.grid > 8 ? 26 : 38) : view.grid > 8 ? 13 : 18;
  const battle = view.phase === 'BATTLE';
  const waitingShooters = view.duels
    .filter((d) => d.waiting && d.shooter)
    .map((d) => d.shooter ?? '');

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-hidden"
      data-testid="amiral-host"
      data-phase={view.phase}
      data-round={view.bracketRound}
    >
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[52px] leading-tight font-extrabold">{t('name')}</h2>
          <p className="text-muted text-[28px]">
            {teams ? t('modeTeams') : t('bracketRound', { round: view.bracketRound })}
          </p>
        </div>
        <Countdown
          endsAt={phase?.endsAt ?? null}
          durationMs={phase?.durationMs ?? null}
          serverNow={serverNow}
          size={120}
          label={t('timeLeft')}
        />
      </div>

      {view.phase === 'PLACE' && (
        <div className="flex flex-col gap-4 text-[32px]">
          <p className="text-[44px] font-extrabold">{t('placing')}</p>
          <ul className="flex flex-wrap gap-4">
            {view.duels.map((duel) => (
              <li
                key={duel.id}
                className="bg-surface flex items-center gap-4 rounded-3xl px-6 py-3"
                data-testid="amiral-pair"
              >
                {[duel.a, duel.b].map((half, i) =>
                  half ? (
                    <span key={half.side} className="flex items-center gap-2">
                      {i === 1 && <span className="text-muted">{t('versus')}</span>}
                      <span className="font-bold">{sideName(half.side)}</span>
                      <span
                        data-testid="amiral-ready"
                        data-ready={view.sides[half.side]?.ready ?? false}
                      >
                        {view.sides[half.side]?.ready ? '✅' : '⏳'}
                      </span>
                    </span>
                  ) : (
                    <span key="bye" className="text-muted">
                      {t('bye')}
                    </span>
                  ),
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {battle && (
        <>
          <p className="text-[30px]" data-testid="amiral-turn">
            {view.bot
              ? t('botPlaying')
              : waitingShooters.length === 1
                ? t('shooting', { name: nick(waitingShooters[0] ?? '') })
                : t('waitingShots', { count: waitingShooters.length })}
          </p>
          {teams ? (
            view.duels.map((duel) => (
              <div
                key={duel.id}
                className="flex min-h-0 flex-1 items-start justify-center gap-24 text-[30px]"
              >
                <Half
                  view={view}
                  duel={duel}
                  letter="a"
                  cellPx={view.grid > 8 ? 46 : 60}
                  name={sideName}
                  t={t}
                />
                <Half
                  view={view}
                  duel={duel}
                  letter="b"
                  cellPx={view.grid > 8 ? 46 : 60}
                  name={sideName}
                  t={t}
                />
              </div>
            ))
          ) : (
            <ul
              className={`grid gap-6 text-[22px] ${view.duels.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
            >
              {view.duels.map((duel) => (
                <li
                  key={duel.id}
                  className={`bg-surface flex justify-center gap-6 rounded-3xl p-4 ${duel.winner ? 'opacity-60' : ''}`}
                  data-testid="amiral-duel"
                  data-winner={duel.winner ?? ''}
                >
                  {duel.b === null ? (
                    <span className="text-muted">
                      {t('byeOf', { name: sideName(duel.a.side) })}
                    </span>
                  ) : (
                    <>
                      <Half
                        view={view}
                        duel={duel}
                        letter="a"
                        cellPx={duelCell}
                        name={sideName}
                        t={t}
                      />
                      <Half
                        view={view}
                        duel={duel}
                        letter="b"
                        cellPx={duelCell}
                        name={sideName}
                        t={t}
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
