'use client';

import { Countdown, mediaUrl, type HostRendererProps } from '@loudroom/game-sdk/client';
import type { ReactNode } from 'react';
import type { SortingHostView, SortingItemView } from './schema.js';

function ItemCard({
  item,
  compact = false,
  children,
}: {
  item: SortingItemView;
  /** Fills its row's height (the reveal list fits up to 8 items on screen). */
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`bg-surface flex items-center gap-6 rounded-[28px] px-7 ${
        compact ? 'h-full min-h-0 py-1' : 'min-h-[96px] py-3'
      }`}
    >
      {item.mediaId && (
        <img
          src={mediaUrl(item.mediaId)}
          alt=""
          className={`w-[110px] shrink-0 rounded-2xl bg-black/20 object-cover ${
            compact ? 'h-full max-h-[80px]' : 'h-[80px]'
          }`}
        />
      )}
      <span className="flex-1 text-[36px] leading-tight font-bold">{item.text}</span>
      {children}
    </div>
  );
}

/** TV screen of a sorting question (SPEC §7.3); in REVEAL the right order and who got it. */
export function SortingHost({ view, phase, serverNow, t }: HostRendererProps<SortingHostView>) {
  return (
    <div className="flex h-full flex-col gap-8" data-testid="sorting-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="sorting-question"
          className={`font-display leading-tight font-extrabold ${
            view.phase === 'INTRO' ? 'text-[80px]' : 'text-[52px]'
          }`}
        >
          {view.question}
        </h2>
        {view.phase === 'ANSWERING' && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={168}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'INTRO' && (
        <p className="text-muted text-[40px]">
          {view.labels
            ? t('fromTo', { first: view.labels.first, last: view.labels.last })
            : t('getReady')}
        </p>
      )}

      {view.phase === 'ANSWERING' && (
        <>
          <ul className="grid flex-1 grid-cols-2 content-start gap-5">
            {view.items.map((item) => (
              <li key={item.id} data-testid="sorting-host-item">
                <ItemCard item={item} />
              </li>
            ))}
          </ul>
          <p className="text-muted text-[36px]" data-testid="sorting-answered">
            {t('answered', { count: view.answeredCount, total: view.playerCount })}
          </p>
        </>
      )}

      {view.phase === 'REVEAL' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="flex justify-between gap-8 text-[30px]">
            <span className="text-muted">{view.labels && `▲ ${view.labels.first}`}</span>
            <span data-testid="sorting-perfect">
              {t('perfect', { count: view.perfectCount, total: view.answeredCount })}
            </span>
          </p>
          <ol className="flex min-h-0 flex-1 flex-col gap-2">
            {view.correctOrder.map((item, index) => {
              const share =
                view.answeredCount > 0
                  ? Math.round((item.placedRight / view.answeredCount) * 100)
                  : 0;
              return (
                <li
                  key={item.id}
                  data-testid="sorting-correct-item"
                  data-item-id={item.id}
                  className="flex max-h-[100px] min-h-0 flex-1 items-center gap-5"
                >
                  <span className="font-display w-[64px] text-right text-[44px] font-extrabold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="h-full min-h-0 flex-1">
                    <ItemCard item={item} compact>
                      <span
                        className="flex w-[260px] items-center gap-3"
                        aria-label={t('placedRight', { percent: share })}
                      >
                        <span className="bg-canvas h-4 flex-1 overflow-hidden rounded-full">
                          <span
                            className="bg-success block h-full rounded-full transition-[width] duration-700"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="w-[90px] text-right text-[32px] font-bold tabular-nums">
                          %{share}
                        </span>
                      </span>
                    </ItemCard>
                  </div>
                </li>
              );
            })}
          </ol>
          {view.labels && <p className="text-muted text-[30px]">▼ {view.labels.last}</p>}
        </div>
      )}
    </div>
  );
}
