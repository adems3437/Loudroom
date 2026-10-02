'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import type { WhoWouldHostView } from './schema.js';

/** TV screen of a "Kim Yapar?" question (SPEC §7.9): players as options, then the vote counts. */
export function WhoWouldHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<WhoWouldHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));

  return (
    <div className="flex h-full flex-col gap-10" data-testid="who-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="who-question"
          className={`font-display leading-tight font-extrabold ${
            view.phase === 'INTRO' ? 'text-[96px]' : 'text-[60px]'
          }`}
        >
          {view.question}
        </h2>
        {view.phase === 'VOTING' && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={168}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'INTRO' && <p className="text-muted text-[44px]">{t('getReady')}</p>}

      {view.phase === 'SKIPPED' && (
        <p className="text-warning text-[48px] font-bold" data-testid="who-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}

      {view.phase === 'VOTING' && (
        <>
          <ul className="flex flex-1 flex-wrap content-center justify-center gap-10">
            {view.candidates.map((id) => {
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
          <p className="text-muted text-[36px]" data-testid="who-voted">
            {t('voted', { count: view.votedCount, total: view.playerCount })}
          </p>
        </>
      )}

      {view.phase === 'REVEAL' && (
        <>
          {view.winners.length > 0 && view.title && (
            <p
              className="bg-accent text-canvas self-start rounded-full px-10 py-3 text-[48px] font-extrabold"
              data-testid="who-title"
            >
              🏆 {view.title}
            </p>
          )}
          {view.winners.length === 0 && <p className="text-muted text-[44px]">{t('noVotes')}</p>}
          <ul className="flex flex-1 flex-wrap content-center justify-center gap-10">
            {view.distribution.map((entry) => {
              const player = byId.get(entry.playerId);
              if (!player) return null;
              const winner = view.winners.includes(entry.playerId);
              return (
                <li
                  key={entry.playerId}
                  data-testid="who-result"
                  data-player-id={entry.playerId}
                  data-count={entry.count}
                  data-winner={winner}
                  className={`flex w-[220px] flex-col items-center gap-3 transition-[opacity,transform] duration-500 ${
                    winner ? 'scale-110' : 'opacity-60'
                  }`}
                >
                  <span className="relative">
                    <span className={`block rounded-full ${winner ? 'ring-accent ring-8' : ''}`}>
                      <Avatar
                        avatar={player.avatar}
                        color={player.color}
                        size={winner ? 160 : 120}
                      />
                    </span>
                    <span className="bg-ink text-canvas absolute -right-3 -bottom-2 grid min-w-[64px] place-items-center rounded-full px-3 text-[40px] font-extrabold tabular-nums">
                      {entry.count}
                    </span>
                  </span>
                  <span className="max-w-full truncate text-[34px] font-bold">
                    {player.nickname}
                  </span>
                  <span className="text-muted text-[26px]">
                    {t('votes', { count: entry.count })}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
