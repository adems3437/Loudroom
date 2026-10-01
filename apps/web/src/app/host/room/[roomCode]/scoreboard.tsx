'use client';

import type { PublicPlayer, Standing } from '@loudroom/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/avatar';

const VISIBLE_ROWS = 8;

/** Leaderboard; rows slide to their new rank (Framer Motion `layout`, SPEC §12). */
export function Scoreboard({
  standings,
  players,
}: {
  standings: Standing[];
  players: PublicPlayer[];
}) {
  const t = useTranslations('game');
  const byId = new Map(players.map((player) => [player.id, player]));
  return (
    <div className="flex h-full flex-col gap-8">
      <h2 className="font-display text-[72px] font-extrabold">{t('scoreboard')}</h2>
      <ol className="flex flex-col gap-4" data-testid="scoreboard">
        {standings.slice(0, VISIBLE_ROWS).map((standing) => {
          const player = byId.get(standing.playerId);
          if (!player) return null;
          return (
            <motion.li
              key={standing.playerId}
              layout
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              data-testid="scoreboard-row"
              data-player-id={standing.playerId}
              data-score={standing.score}
              className="bg-surface flex items-center gap-6 rounded-[28px] px-8 py-4"
            >
              <span className="font-display text-muted w-[72px] text-[48px] font-extrabold tabular-nums">
                {standing.rank}
              </span>
              <Avatar id={player.avatar} color={player.color} size={72} />
              <span className="flex-1 truncate text-[40px] font-bold">{player.nickname}</span>
              {standing.delta > 0 && (
                <span className="text-success text-[32px] font-bold tabular-nums">
                  {t('plusPoints', { points: standing.delta })}
                </span>
              )}
              <span className="font-display w-[220px] text-right text-[48px] font-extrabold tabular-nums">
                {standing.score}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
