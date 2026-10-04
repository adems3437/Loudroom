'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { BoardView, Die } from './board-view.js';
import type { KizmaEvent, KizmaHostView } from './schema.js';

export function describeEvent(
  event: KizmaEvent,
  name: (id: string) => string,
  t: HostRendererProps<KizmaHostView>['t'],
): string {
  switch (event.kind) {
    case 'roll':
      return t('event.roll', { name: name(event.playerId), value: event.value });
    case 'pass':
      return t('event.pass', { name: name(event.playerId), value: event.value });
    case 'move':
      return event.captured
        ? t('event.capture', { name: name(event.playerId), other: name(event.captured.playerId) })
        : event.from < 0
          ? t('event.out', { name: name(event.playerId) })
          : t('event.move', { name: name(event.playerId), steps: event.to - event.from });
  }
}

/** TV screen of Kızma Birader (SPEC §7.15): the board, the die and whose turn it is. */
export function KizmaHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<KizmaHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const name = (id: string) => byId.get(id)?.nickname ?? '?';

  if (view.phase === 'SKIPPED') {
    return (
      <p className="text-warning text-[48px] font-bold" data-testid="kizma-skipped">
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  const playing = view.phase === 'ROLL' || view.phase === 'MOVE';
  return (
    <div
      className="flex h-full gap-10 overflow-hidden"
      data-testid="kizma-host"
      data-phase={view.phase}
      data-turn={playing ? view.turn : ''}
    >
      <div className="aspect-square h-full shrink-0">
        <BoardView
          board={view.board}
          players={players}
          movable={playing ? view.movable : []}
          turn={playing ? view.turn : null}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[52px] leading-tight font-extrabold">{t('name')}</h2>
            <p className="text-muted text-[28px]">{view.title}</p>
          </div>
          {playing && (
            <Countdown
              endsAt={phase?.endsAt ?? null}
              durationMs={phase?.durationMs ?? null}
              serverNow={serverNow}
              size={120}
              label={t('timeLeft')}
            />
          )}
        </div>

        {playing && (
          <>
            <div className="flex items-center gap-8">
              <Die value={view.die} size={180} />
              <div className="flex flex-col gap-2 text-[34px]">
                <span className="font-bold" data-testid="kizma-turn">
                  {t('turnOf', { name: name(view.turn) })}
                </span>
                {view.bot && <span className="text-accent">{t('botPlaying')}</span>}
                {view.phase === 'ROLL' && view.triesLeft > 1 && (
                  <span className="text-muted text-[28px]">
                    {t('tries', { count: view.triesLeft })}
                  </span>
                )}
              </div>
            </div>
            {view.last && (
              <p
                className={`text-[30px] ${view.last.kind === 'move' && view.last.captured ? 'text-danger font-extrabold' : 'text-muted'}`}
                data-testid="kizma-last"
                data-kind={view.last.kind}
              >
                {describeEvent(view.last, name, t)}
              </p>
            )}
          </>
        )}

        {view.phase === 'END' && (
          <p
            className="font-display text-accent text-[56px] font-extrabold"
            data-testid="kizma-result"
          >
            {t(view.endedBy === 'time' ? 'wonOnTime' : 'won', {
              name: name(view.ranking[0]?.playerId ?? ''),
            })}
          </p>
        )}

        <ol className="flex flex-col gap-3 text-[28px]" data-testid="kizma-standings">
          {(view.phase === 'END'
            ? view.ranking.map((row) => row.playerId)
            : view.board.players.map((p) => p.playerId)
          ).map((id) => {
            const player = byId.get(id);
            const seat = view.board.players.find((p) => p.playerId === id);
            const home = seat?.pawns.filter((p) => p >= view.board.track).length ?? 0;
            return (
              <li
                key={id}
                data-testid="kizma-standing"
                data-player-id={id}
                data-place={seat?.place ?? ''}
                className="bg-surface flex items-center gap-4 rounded-2xl px-4 py-2"
              >
                {player && <Avatar avatar={player.avatar} color={player.color} size={44} />}
                <span className="flex-1 truncate font-bold">{name(id)}</span>
                <span className="text-muted tabular-nums">
                  {seat?.place
                    ? t('place', { place: seat.place })
                    : t('home', { count: home, total: seat?.pawns.length ?? 0 })}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
