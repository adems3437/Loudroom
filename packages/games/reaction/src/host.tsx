'use client';

import type { HostRendererProps } from '@loudroom/game-sdk/client';
import { outcomeKey } from './outcome.js';
import type { ReactionHostView } from './schema.js';

/**
 * TV screen of Reaction (SPEC §7.7). The target is drawn on the phones, not here (the TV's
 * delay varies): the TV shows the state of each attempt and the results.
 */
export function ReactionHost({ view, players, t, Avatar }: HostRendererProps<ReactionHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const counter =
    view.phase === 'INTRO' || view.phase === 'REVEAL'
      ? null
      : t('attemptOf', { current: view.attempt + 1, total: view.total });

  return (
    <div className="flex h-full flex-col gap-8" data-testid="reaction-host" data-phase={view.phase}>
      {counter && <p className="text-muted text-[36px]">{counter}</p>}

      {view.phase === 'INTRO' && (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <h2 className="font-display text-[88px] leading-tight font-extrabold">{view.title}</h2>
          <p className="text-[44px]">
            {view.variant === 'goNoGo' ? t('rulesGoNoGo') : t('rulesClassic')}
          </p>
          <p className="text-muted text-[36px]">{t('attempts', { count: view.total })}</p>
        </div>
      )}

      {view.phase === 'ARMED' && (
        <p className="font-display text-muted flex flex-1 animate-pulse items-center justify-center text-[140px] font-extrabold">
          {t('getReady')}
        </p>
      )}

      {view.phase === 'GO' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <p
            className={`font-display text-[200px] leading-none font-extrabold ${
              view.kind === 'decoy' ? 'text-danger' : 'text-success'
            }`}
            data-testid="reaction-go"
          >
            {view.kind === 'decoy' ? t('decoy') : t('go')}
          </p>
          <p className="text-muted text-[36px]">
            {t('done', { count: view.doneCount, total: view.playerCount })}
          </p>
        </div>
      )}

      {view.phase === 'RESULT' && (
        <ol className="flex flex-1 flex-col gap-3" data-testid="reaction-results">
          {view.results.map((result, index) => {
            const player = byId.get(result.playerId);
            return (
              <li
                key={result.playerId}
                data-testid="reaction-result-row"
                data-outcome={result.outcome}
                className={`flex items-center gap-5 rounded-3xl px-6 py-3 ${
                  index === 0 && result.outcome === 'ok' ? 'bg-accent text-canvas' : 'bg-surface'
                }`}
              >
                {player && <Avatar avatar={player.avatar} color={player.color} size={56} />}
                <span className="flex-1 text-[34px] font-bold">{player?.nickname ?? '?'}</span>
                <span className="text-[38px] font-extrabold tabular-nums">
                  {result.ms !== null ? t('ms', { ms: result.ms }) : t(outcomeKey[result.outcome])}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {view.phase === 'REVEAL' && (
        <div className="flex flex-1 flex-col gap-4">
          <h2 className="font-display text-[64px] font-extrabold">{t('ranking')}</h2>
          <ol className="flex flex-col gap-3" data-testid="reaction-ranking">
            {view.ranking.map((entry, index) => {
              const player = byId.get(entry.playerId);
              return (
                <li
                  key={entry.playerId}
                  data-testid="reaction-ranking-row"
                  className="bg-surface flex items-center gap-5 rounded-3xl px-6 py-3"
                >
                  <span className="w-[60px] text-[40px] font-extrabold tabular-nums">
                    {entry.medianMs === null ? '–' : `${index + 1}.`}
                  </span>
                  {player && <Avatar avatar={player.avatar} color={player.color} size={56} />}
                  <span className="flex-1 text-[34px] font-bold">{player?.nickname ?? '?'}</span>
                  <span className="text-muted text-[28px]">
                    {entry.penalties > 0 ? t('penalties', { count: entry.penalties }) : ''}
                  </span>
                  <span className="w-[220px] text-right text-[40px] font-extrabold tabular-nums">
                    {entry.medianMs === null ? t('noValid') : t('ms', { ms: entry.medianMs })}
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
