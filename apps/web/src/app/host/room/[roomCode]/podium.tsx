'use client';

import type { PublicPlayer, Standing } from '@loudroom/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/avatar';

/** Places on the podium, drawn left to right: 2nd, 1st, 3rd. */
const STEPS = [
  { rank: 2, height: 200, delay: 0.6 },
  { rank: 1, height: 280, delay: 1.2 },
  { rank: 3, height: 140, delay: 0 },
] as const;

/** Final podium, rising one place at a time (SPEC §12). */
export function Podium({ standings, players }: { standings: Standing[]; players: PublicPlayer[] }) {
  const t = useTranslations('game');
  const byId = new Map(players.map((player) => [player.id, player]));
  const at = (rank: number) => {
    const standing = standings.find((entry) => entry.rank === rank);
    const player = standing ? byId.get(standing.playerId) : undefined;
    return standing && player ? { standing, player } : null;
  };

  return (
    <div className="flex h-full flex-col items-center gap-6" data-testid="podium">
      <h2 className="font-display text-[72px] leading-none font-extrabold">{t('podium')}</h2>
      <div className="flex flex-1 items-end justify-center gap-10">
        {STEPS.map(({ rank, height, delay }) => {
          const entry = at(rank);
          if (!entry) return <div key={rank} className="w-[340px]" />;
          return (
            <motion.div
              key={rank}
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay, type: 'spring', stiffness: 160, damping: 18 }}
              className="flex w-[340px] flex-col items-center gap-4"
              data-testid="podium-place"
              data-rank={rank}
              data-player-id={entry.player.id}
            >
              <Avatar
                id={entry.player.avatar}
                color={entry.player.color}
                size={rank === 1 ? 140 : 112}
              />
              <span className="max-w-full truncate text-[44px] font-bold">
                {entry.player.nickname}
              </span>
              <span className="font-display text-accent text-[40px] font-extrabold tabular-nums">
                {t('points', { points: entry.standing.score })}
              </span>
              <div
                className="font-display flex w-full items-start justify-center rounded-t-[32px] pt-6 text-[96px] font-extrabold"
                style={{ height, backgroundColor: entry.player.color, color: '#0a0a12' }}
              >
                {rank}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
