'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { SeatBar } from '@loudroom/table-kit/client';
import { UnoCardBack, UnoCardFace, colorClass } from './card.js';
import type { UnoEvent, UnoHostView } from './schema.js';

/** One line about the last move, for the table. */
export function describeEvent(
  event: UnoEvent,
  name: (playerId: string) => string,
  t: HostRendererProps<UnoHostView>['t'],
): string {
  switch (event.kind) {
    case 'play':
      return t('event.play', { name: name(event.playerId) });
    case 'draw':
      return t('event.draw', { name: name(event.playerId), count: event.count });
    case 'pass':
      return t('event.pass', { name: name(event.playerId) });
    case 'uno':
      return t('event.uno', { name: name(event.playerId) });
    case 'caught':
      return t('event.caught', { name: name(event.playerId), by: name(event.by) });
  }
}

/** TV screen of UNO (SPEC §7.14): the seats, the pile and the draw pile, whose turn it is. */
export function UnoHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<UnoHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const name = (id: string) => byId.get(id)?.nickname ?? '?';

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-hidden"
      data-testid="uno-host"
      data-phase={view.phase}
    >
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[56px] leading-tight font-extrabold">{t('name')}</h2>
          <p className="text-muted text-[30px]">{view.title}</p>
        </div>
        {view.phase === 'TURN' && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={140}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'SKIPPED' && (
        <p className="text-warning text-[48px] font-bold" data-testid="uno-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}

      {view.phase === 'TURN' && (
        <>
          <SeatBar
            players={players}
            Avatar={Avatar}
            seats={view.seats.map((seat) => ({
              playerId: seat.playerId,
              count: seat.count,
              active: seat.playerId === view.turn,
              side: null,
              badge:
                seat.playerId === view.turn && view.bot
                  ? t('botPlaying')
                  : seat.called
                    ? t('unoBadge')
                    : null,
            }))}
          />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-16">
            <div className="flex flex-col items-center gap-3">
              <UnoCardBack size="lg" />
              <span className="text-muted text-[28px]">
                {t('deckCount', { count: view.deckCount })}
              </span>
            </div>
            <div
              className="flex flex-col items-center gap-4"
              data-testid="uno-top"
              data-card-id={view.top.id}
              data-color={view.color}
            >
              <UnoCardFace card={view.top} size="lg" />
              <span className="flex items-center gap-3 text-[30px]">
                <span className={`size-9 rounded-full ${colorClass(view.color)}`} />
                {t(`color.${view.color}`)}
              </span>
            </div>
            <div className="flex w-[420px] flex-col gap-4 text-[34px]">
              <span className="text-muted" aria-label={t('direction')}>
                {view.direction === 1 ? '↻' : '↺'} {t('direction')}
              </span>
              <span className="font-bold" data-testid="uno-turn">
                {t('turnOf', { name: name(view.turn) })}
              </span>
              {view.pending > 0 && (
                <span className="text-danger font-extrabold">
                  {t('pending', { count: view.pending })}
                </span>
              )}
              {view.last && (
                <span
                  className="text-muted text-[28px]"
                  data-testid="uno-last"
                  data-kind={view.last.kind}
                >
                  {describeEvent(view.last, name, t)}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {view.phase === 'END' && (
        <div className="flex flex-1 flex-col gap-6" data-testid="uno-result">
          <p className="font-display text-accent text-[72px] font-extrabold">
            {t(view.endedBy === 'time' ? 'wonOnTime' : 'won', { name: name(view.winner) })}
          </p>
          <ol className="flex flex-col gap-3 text-[34px]">
            {view.ranking.map((row, index) => {
              const player = byId.get(row.playerId);
              return (
                <li
                  key={row.playerId}
                  data-testid="uno-rank"
                  data-player-id={row.playerId}
                  className="bg-surface flex items-center gap-6 rounded-3xl px-6 py-3"
                >
                  <span className="w-12 font-extrabold tabular-nums">{index + 1}.</span>
                  {player && <Avatar avatar={player.avatar} color={player.color} size={56} />}
                  <span className="flex-1 font-bold">{name(row.playerId)}</span>
                  <span className="text-muted">
                    {t('leftInHand', { cards: row.cards, points: row.handPoints })}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
