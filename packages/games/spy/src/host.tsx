'use client';

import { Countdown, type HostRendererProps, type RendererPlayer } from '@loudroom/game-sdk/client';
import type { SpyHostView, SpyLocation } from './schema.js';

type Avatar = HostRendererProps<SpyHostView>['Avatar'];

function PlayerBadge({
  player,
  Avatar,
  size,
}: {
  player: RendererPlayer | undefined;
  Avatar: Avatar;
  size: number;
}) {
  if (!player) return null;
  return (
    <span className="flex items-center gap-3">
      <Avatar avatar={player.avatar} color={player.color} size={size} />
      <span className="max-w-[360px] truncate font-bold">{player.nickname}</span>
    </span>
  );
}

function Locations({
  locations,
  highlight,
}: {
  locations: readonly SpyLocation[];
  highlight?: string;
}) {
  return (
    <ul className="flex flex-wrap content-start gap-3" data-testid="spy-locations">
      {locations.map((location) => (
        <li
          key={location.id}
          className={`rounded-2xl px-5 py-2 text-[28px] ${
            location.id === highlight ? 'bg-accent text-canvas font-extrabold' : 'bg-surface'
          }`}
        >
          {location.emoji ? `${location.emoji} ` : ''}
          {location.name}
        </li>
      ))}
    </ul>
  );
}

/** TV screen of "Casus Kim?" (SPEC §7.11): whose turn it is and the clock; never the place. */
export function SpyHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<SpyHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));

  return (
    <div
      className="flex h-full flex-col gap-8 overflow-hidden"
      data-testid="spy-host"
      data-phase={view.phase}
    >
      <div className="flex items-start justify-between gap-10">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-[60px] leading-tight font-extrabold">{t('name')}</h2>
          <p className="text-muted text-[32px]">{view.title}</p>
        </div>
        {(view.phase === 'DISCUSS' || view.phase === 'VOTE') && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={168}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'SKIPPED' && (
        <p className="text-warning text-[48px] font-bold" data-testid="spy-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}

      {view.phase === 'INTRO' && (
        <div className="flex flex-1 flex-col gap-8">
          <p className="text-[64px] font-extrabold">{t('checkRoles')}</p>
          <p className="text-muted text-[40px]">{t('spyCount', { count: view.spyCount })}</p>
          <Locations locations={view.locations} />
        </div>
      )}

      {view.phase === 'DISCUSS' && (
        <div className="flex flex-1 flex-col gap-8">
          <div
            className="bg-surface flex items-center gap-8 self-start rounded-[40px] px-10 py-6 text-[48px]"
            data-testid="spy-asker"
            data-player-id={view.asker}
          >
            <PlayerBadge player={byId.get(view.asker)} Avatar={Avatar} size={120} />
            <span className="text-muted">{t('asks')}</span>
          </div>
          {view.lastAsk && (
            <p
              className="text-muted flex items-center gap-4 text-[32px]"
              data-testid="spy-last-ask"
            >
              {t('lastAsk', {
                from: byId.get(view.lastAsk.from)?.nickname ?? '?',
                to: byId.get(view.lastAsk.to)?.nickname ?? '?',
              })}
            </p>
          )}
          <p className="text-[32px]" data-testid="spy-vote-requests" data-count={view.voteRequests}>
            {t('voteRequests', { count: view.voteRequests, needed: view.votesNeeded })}
          </p>
          <Locations locations={view.locations} />
        </div>
      )}

      {view.phase === 'VOTE' && (
        <div className="flex flex-1 flex-col gap-10">
          <p className="text-[64px] font-extrabold">{t('whoIsSpy')}</p>
          <ul className="flex flex-wrap gap-10">
            {view.roster.map((id) => {
              const player = byId.get(id);
              if (!player) return null;
              return (
                <li key={id} className="flex w-[200px] flex-col items-center gap-3">
                  <Avatar avatar={player.avatar} color={player.color} size={140} />
                  <span className="max-w-full truncate text-[34px] font-bold">
                    {player.nickname}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted text-[36px]" data-testid="spy-voted">
            {t('voted', { count: view.votedCount, total: view.playerCount })}
          </p>
        </div>
      )}

      {view.phase === 'REVEAL' && (
        <div className="flex flex-1 flex-col gap-8">
          <p
            className={`font-display self-start rounded-full px-10 py-4 text-[56px] font-extrabold ${
              view.outcome === 'caught' || view.outcome === 'wrongGuess'
                ? 'bg-success text-canvas'
                : 'bg-danger text-ink'
            }`}
            data-testid="spy-outcome"
            data-outcome={view.outcome}
          >
            {t(`outcome.${view.outcome}`)}
          </p>
          <div className="flex items-center gap-10 text-[44px]">
            <span data-testid="spy-location" data-location-id={view.location.id}>
              {t('locationWas', {
                location: `${view.location.emoji ? `${view.location.emoji} ` : ''}${view.location.name}`,
              })}
            </span>
          </div>
          <div
            className="flex flex-wrap items-center gap-6 text-[40px]"
            data-testid="spy-spies"
            data-ids={view.spies.join(',')}
          >
            <span className="text-muted">{t('spiesWere', { count: view.spies.length })}</span>
            {view.spies.map((id) => (
              <PlayerBadge key={id} player={byId.get(id)} Avatar={Avatar} size={96} />
            ))}
          </div>
          {view.guess && (
            <p className="text-[32px]" data-testid="spy-guess">
              {t('guessed', {
                name: byId.get(view.guess.playerId)?.nickname ?? '?',
                location: view.locations.find((l) => l.id === view.guess?.locationId)?.name ?? '?',
              })}
            </p>
          )}
          <ul className="flex flex-wrap gap-8">
            {view.distribution
              .filter((entry) => entry.count > 0)
              .map((entry) => (
                <li key={entry.playerId} className="flex items-center gap-3 text-[32px]">
                  <PlayerBadge player={byId.get(entry.playerId)} Avatar={Avatar} size={64} />
                  <span className="text-muted">{t('votes', { count: entry.count })}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
