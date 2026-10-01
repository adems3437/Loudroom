'use client';

import { Countdown } from '@loudroom/game-sdk/client';
import type { PlayerGameState, PlayerRoomState, PublicPlayer } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Avatar } from '@/components/avatar';
import { PlayerRound } from '@/games/round-renderer';
import { tapFeedback } from '@/lib/haptics';
import { useRealtime } from '@/realtime/realtime-provider';

function Centered({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <section
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
    >
      {children}
    </section>
  );
}

/** The phone during a game: whatever the current game state asks of this player. */
export function PlayerGame({
  room,
  game,
  me,
}: {
  room: PlayerRoomState;
  game: PlayerGameState;
  me: PublicPlayer;
}) {
  const t = useTranslations('game');
  const { serverNow } = useRealtime();
  const standing = game.standings.find((entry) => entry.playerId === me.id);
  const rank = standing?.rank ?? null;

  // A buzz when the verdict for this round arrives.
  const verdictKey = game.status === 'ROUND_RESULT' ? game.round?.roundId : null;
  useEffect(() => {
    if (verdictKey) tapFeedback();
  }, [verdictKey]);

  const header = (
    <div className="flex items-center gap-3">
      <Avatar id={me.avatar} color={me.color} size={40} />
      <span className="flex-1 truncate font-semibold">{me.nickname}</span>
      <span
        className="font-display text-xl font-extrabold tabular-nums"
        data-testid="my-score"
        data-score={me.score}
      >
        {t('points', { points: me.score })}
      </span>
    </div>
  );

  let body;
  switch (game.status) {
    case 'STARTING':
      body = (
        <Centered testId="phone-starting">
          <p className="font-display text-4xl font-extrabold">{t('getReadyPhone')}</p>
          {game.countdown && (
            <Countdown
              endsAt={game.countdown.endsAt}
              durationMs={game.countdown.durationMs}
              serverNow={serverNow}
              size={140}
              label={t('getReadyPhone')}
            />
          )}
        </Centered>
      );
      break;
    case 'PLAYING':
    case 'ROUND_RESULT':
      body = game.round ? (
        <div className="flex flex-1 flex-col gap-4">
          <PlayerRound round={game.round} players={room.players} playerId={me.id} />
          {game.status === 'ROUND_RESULT' && game.lastRound && (
            <div
              data-testid="round-points"
              data-points={game.lastRound.points}
              className="bg-surface rounded-3xl p-5 text-center"
            >
              <p className="font-display text-accent text-4xl font-extrabold tabular-nums">
                {t('plusPoints', { points: game.lastRound.points })}
              </p>
              {rank && <p className="text-muted mt-1">{t('rank', { rank })}</p>}
            </div>
          )}
        </div>
      ) : null;
      break;
    case 'SCOREBOARD':
      body = (
        <Centered testId="phone-scoreboard">
          {rank && <p className="font-display text-5xl font-extrabold">{t('rank', { rank })}</p>}
          <p className="text-2xl tabular-nums">{t('points', { points: me.score })}</p>
          <p className="text-muted">{t('waitingHost')}</p>
        </Centered>
      );
      break;
    case 'FINISHED':
      body = (
        <Centered testId="phone-finished">
          <p className="text-muted">{t('gameOver')}</p>
          {rank && (
            <p
              className="font-display text-4xl font-extrabold"
              data-testid="final-rank"
              data-rank={rank}
            >
              {t('finalRank', { rank })}
            </p>
          )}
          <p className="text-2xl tabular-nums">{t('points', { points: me.score })}</p>
        </Centered>
      );
      break;
    case 'PAUSED':
      body = (
        <Centered testId="phone-paused">
          <p className="font-display text-3xl font-extrabold">{t('paused')}</p>
          <p className="text-muted">{t('pausedHint')}</p>
        </Centered>
      );
      break;
  }

  return (
    <section
      data-testid="player-game"
      data-status={game.status}
      className="flex flex-1 flex-col gap-5"
    >
      {header}
      {body}
    </section>
  );
}
