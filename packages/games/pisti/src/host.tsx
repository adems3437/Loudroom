'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { SeatBar } from '@loudroom/table-kit/client';
import { PlayingCardBack, PlayingCardFace } from './card.js';
import type { PistiHostView } from './schema.js';

type Table = Extract<PistiHostView, { phase: 'TURN' | 'TALLY' }>;

/** TV screen of Pişti (SPEC §7.13): the table, the seats and the score. */
export function PistiHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<PistiHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const names = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)?.nickname ?? '?').join(' & ');

  return (
    <div
      className="relative flex h-full flex-col gap-6 overflow-hidden"
      data-testid="pisti-host"
      data-phase={view.phase}
    >
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[56px] leading-tight font-extrabold">{t('name')}</h2>
          <p className="text-muted text-[30px]">
            {view.phase === 'TURN' || view.phase === 'TALLY'
              ? [
                  t('deal', { deal: view.deal }),
                  view.targetPoints > 0 ? t('target', { target: view.targetPoints }) : null,
                  view.maxDeals > 0 ? t('maxDeals', { count: view.maxDeals }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : view.title}
          </p>
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
        <p className="text-warning text-[48px] font-bold" data-testid="pisti-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}

      {(view.phase === 'TURN' || view.phase === 'TALLY') && (
        <>
          <SeatBar
            players={players}
            Avatar={Avatar}
            seats={view.seats.map((seat) => ({
              playerId: seat.playerId,
              count: seat.count,
              active: view.phase === 'TURN' && seat.playerId === view.turn,
              side: view.teams ? seat.side : null,
              badge:
                view.phase === 'TURN' && seat.playerId === view.turn && view.bot
                  ? t('botPlaying')
                  : null,
            }))}
          />
          <Board view={view} t={t} name={(id) => byId.get(id)?.nickname ?? '?'} />
        </>
      )}

      {view.phase === 'TALLY' && (
        <div
          className="bg-canvas/90 absolute inset-0 flex flex-col justify-center gap-6"
          data-testid="pisti-tally"
        >
          <p className="font-display text-[56px] font-extrabold">
            {t('dealOver', { deal: view.deal })}
          </p>
          <table className="text-[30px]">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="py-2 font-semibold">{t('side')}</th>
                <th>{t('cards')}</th>
                <th>{t('mostCards')}</th>
                <th>{t('cardPoints')}</th>
                <th>{t('pistis')}</th>
                <th>{t('dealTotal')}</th>
                <th>{t('score')}</th>
              </tr>
            </thead>
            <tbody>
              {view.tally.map((row) => (
                <tr
                  key={row.side}
                  data-testid="pisti-tally-row"
                  data-cards={row.cards}
                  data-side={row.side}
                  data-total={row.total}
                >
                  <td className="py-2 font-bold">{names(view.sides[row.side]?.players ?? [])}</td>
                  <td>{row.cards}</td>
                  <td>{row.mostCards}</td>
                  <td>{row.cardPoints}</td>
                  <td>{row.pistis + row.jackPistis}</td>
                  <td className="font-bold">+{row.total}</td>
                  <td className="text-accent font-extrabold">{view.sides[row.side]?.score ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.phase === 'END' && (
        <div className="flex flex-1 flex-col gap-6" data-testid="pisti-result">
          <p className="font-display text-accent text-[72px] font-extrabold">
            {t('won', {
              names: view.winners.map((side) => names(view.sides[side]?.players ?? [])).join(', '),
            })}
          </p>
          <ol className="flex flex-col gap-3 text-[36px]">
            {[...view.sides]
              .sort((a, b) => b.score - a.score)
              .map((side) => (
                <li
                  key={side.side}
                  data-testid="pisti-side"
                  data-score={side.score}
                  className="bg-surface flex items-center justify-between rounded-3xl px-8 py-4"
                >
                  <span className="font-bold">{names(side.players)}</span>
                  <span className="tabular-nums">{t('points', { count: side.score })}</span>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Board({
  view,
  t,
  name,
}: {
  view: Table;
  t: HostRendererProps<PistiHostView>['t'];
  name: (id: string) => string;
}) {
  const hiddenBacks = Math.min(view.pile.hidden, 3);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-16">
      <div className="flex flex-col items-center gap-3">
        {view.deckCount > 0 ? (
          <PlayingCardBack size="lg" />
        ) : (
          <span className="h-[260px] w-[186px]" />
        )}
        <span className="text-muted text-[28px]">{t('deckCount', { count: view.deckCount })}</span>
      </div>
      <div
        className="flex flex-col items-center gap-3"
        data-testid="pisti-pile"
        data-count={view.pile.count}
        data-top={view.pile.visible.at(-1)?.id ?? ''}
      >
        <div className="relative h-[260px] w-[300px]">
          {Array.from({ length: hiddenBacks }, (_, i) => (
            <span key={`b${i}`} className="absolute top-0" style={{ left: i * 14 }}>
              <PlayingCardBack size="lg" />
            </span>
          ))}
          {view.pile.visible.map((card, i) => (
            <span key={card.id} className="absolute top-0" style={{ left: (hiddenBacks + i) * 14 }}>
              <PlayingCardFace card={card} size="lg" />
            </span>
          ))}
        </div>
        <span className="text-muted text-[28px]">{t('pileCount', { count: view.pile.count })}</span>
      </div>
      <div className="flex w-[460px] flex-col gap-4 text-[32px]">
        <span className="font-bold" data-testid="pisti-turn">
          {t('turnOf', { name: name(view.turn) })}
        </span>
        {view.last && (
          <span
            data-testid="pisti-last"
            data-captured={view.last.captured}
            data-pisti={view.last.pisti ?? ''}
            className={view.last.pisti ? 'text-accent text-[56px] font-extrabold' : 'text-muted'}
          >
            {view.last.pisti
              ? t(view.last.pisti === 'jack' ? 'jackPisti' : 'pisti', {
                  name: name(view.last.playerId),
                })
              : view.last.captured
                ? t('took', { name: name(view.last.playerId) })
                : t('threw', { name: name(view.last.playerId) })}
          </span>
        )}
        <ul className="flex flex-col gap-2" data-testid="pisti-scores">
          {view.sides.map((side) => (
            <li
              key={side.side}
              className="bg-surface flex justify-between rounded-2xl px-5 py-2 text-[28px]"
            >
              <span className="truncate">{side.players.map(name).join(' & ')}</span>
              <span className="tabular-nums">
                {t('scoreLine', { score: side.score, cards: side.captured })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
