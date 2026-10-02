'use client';

import {
  ContainedImage,
  Countdown,
  mediaUrl,
  type HostRendererProps,
} from '@loudroom/game-sdk/client';
import { At, TargetDot, TargetRing } from './marks.js';
import type { ImageLocationHostView } from './schema.js';

/** Distance as a percentage of the image's longer side, e.g. "%4,2". */
function percent(distance: number): string {
  return `%${(distance * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

/** TV screen of an Image Location question (SPEC §7.4): in REVEAL every pin and the target. */
export function ImageLocationHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<ImageLocationHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const reveal = view.phase === 'REVEAL' ? view : null;

  return (
    <div className="flex h-full flex-col gap-6" data-testid="location-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="location-question"
          className="font-display text-[56px] leading-tight font-extrabold"
        >
          {view.question}
        </h2>
        {view.phase === 'ANSWERING' && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={150}
            label={t('timeLeft')}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-8">
        <ContainedImage
          src={mediaUrl(view.image.mediaId)}
          alt={t('image')}
          natural={view.image}
          className="min-h-0 flex-1 rounded-[24px]"
          testId="location-host-image"
        >
          {reveal && (
            <>
              <TargetRing target={reveal.target} radius={reveal.radius} image={view.image} />
              {reveal.pins.map((pin) => {
                const player = byId.get(pin.playerId);
                if (!player) return null;
                return (
                  <At key={pin.playerId} point={pin.point} anchor="bottom" testId="location-pin">
                    <Avatar avatar={player.avatar} color={player.color} size={56} />
                    <span className="block h-4 w-1 rounded-full bg-white" />
                  </At>
                );
              })}
              <At point={reveal.target} testId="location-target">
                <TargetDot size={40} />
              </At>
            </>
          )}
        </ContainedImage>

        {reveal && (
          <ol className="flex w-[440px] shrink-0 flex-col gap-3">
            {reveal.pins.slice(0, 8).map((pin, index) => {
              const player = byId.get(pin.playerId);
              return (
                <li
                  key={pin.playerId}
                  data-testid="location-ranking-row"
                  className={`flex items-center gap-4 rounded-3xl px-5 py-3 ${
                    pin.inside ? 'bg-success text-canvas' : 'bg-surface'
                  }`}
                >
                  <span className="text-[30px] font-extrabold tabular-nums">{index + 1}.</span>
                  {player && <Avatar avatar={player.avatar} color={player.color} size={48} />}
                  <span className="min-w-0 flex-1 truncate text-[28px] font-semibold">
                    {player?.nickname ?? '?'}
                  </span>
                  <span className="text-[26px] font-bold tabular-nums">
                    {percent(pin.distance)}
                  </span>
                </li>
              );
            })}
            {reveal.pins.length === 0 && <li className="text-muted text-[32px]">{t('noPins')}</li>}
          </ol>
        )}
      </div>

      <p className="text-muted text-[32px]" data-testid="location-answered">
        {view.phase === 'INTRO'
          ? t('getReady')
          : view.phase === 'ANSWERING'
            ? t('answered', { count: view.answeredCount, total: view.playerCount })
            : t('distanceHint')}
      </p>
    </div>
  );
}
