'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { useState } from 'react';
import { DrawingCanvas } from './drawing-canvas.js';
import type { DrawingHostView } from './schema.js';
import { LetterSlots } from './slots.js';

/**
 * TV screen of a drawing round (SPEC §7.5): the live drawing from the stream, who draws, the
 * letter boxes, who got it and the wrong guesses. "Hide" blurs the drawing on this screen.
 */
export function DrawingHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
  stream,
}: HostRendererProps<DrawingHostView>) {
  const [hidden, setHidden] = useState(false);
  const byId = new Map(players.map((player) => [player.id, player]));

  if (view.phase === 'SKIPPED') {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="drawing-host"
        data-phase="SKIPPED"
      >
        <p className="text-warning text-[48px] font-bold">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      </div>
    );
  }

  const drawer = byId.get(view.drawerId);
  const solvers = (view.phase === 'INTRO' ? [] : view.solvers).flatMap((id) => byId.get(id) ?? []);

  return (
    <div className="flex h-full gap-10" data-testid="drawing-host" data-phase={view.phase}>
      <div className="relative h-full shrink-0" style={{ aspectRatio: '4 / 3' }}>
        <DrawingCanvas
          stream={stream}
          hidden={hidden}
          className="h-full rounded-[28px]"
          testId="drawing-host-canvas"
        />
        <button
          type="button"
          data-testid="drawing-hide"
          aria-pressed={hidden}
          className="bg-canvas/80 absolute top-4 right-4 rounded-full px-5 py-2 text-[24px] font-semibold"
          onClick={() => {
            setHidden(!hidden);
          }}
        >
          {hidden ? t('showDrawing') : t('hideDrawing')}
        </button>
        {hidden && (
          <p className="text-canvas pointer-events-none absolute inset-0 grid place-items-center text-[40px] font-bold">
            {t('drawingHidden')}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-4" data-testid="drawing-drawer">
            {drawer && <Avatar avatar={drawer.avatar} color={drawer.color} size={72} />}
            <span className="text-[34px] font-bold">
              {t('isDrawing', { nickname: drawer?.nickname ?? '?' })}
            </span>
          </span>
          {view.phase === 'DRAWING' && (
            <Countdown
              endsAt={phase?.endsAt ?? null}
              durationMs={phase?.durationMs ?? null}
              serverNow={serverNow}
              size={130}
              label={t('timeLeft')}
            />
          )}
        </div>

        {view.phase === 'REVEAL' ? (
          <p
            className="font-display text-success text-[88px] leading-none font-extrabold"
            data-testid="drawing-word"
          >
            {view.word}
          </p>
        ) : view.slots ? (
          <LetterSlots slots={view.slots} size={44} />
        ) : null}

        {view.phase === 'INTRO' && <p className="text-muted text-[36px]">{t('getReady')}</p>}

        {view.phase !== 'INTRO' && (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-[28px]">
              {view.phase === 'DRAWING'
                ? t('solvedCount', { count: solvers.length, total: view.guesserCount })
                : t('solvers')}
            </p>
            <ol className="flex flex-wrap gap-3">
              {solvers.map((player, index) => (
                <li
                  key={player.id}
                  data-testid="drawing-solver"
                  className="bg-success text-canvas flex items-center gap-3 rounded-full py-1 pr-5 pl-1 text-[26px] font-bold"
                >
                  <Avatar avatar={player.avatar} color={player.color} size={44} />
                  {index + 1}. {player.nickname}
                </li>
              ))}
            </ol>
          </div>
        )}

        {view.phase !== 'INTRO' && (
          <ul
            className="flex min-h-0 flex-1 flex-col-reverse gap-2 overflow-hidden"
            data-testid="drawing-feed"
          >
            {[...view.feed]
              .reverse()
              .slice(0, 8)
              .map((item, index) => (
                <li
                  key={`${index}-${item.playerId}`}
                  data-testid="drawing-feed-item"
                  className="text-muted flex items-center gap-3 text-[28px]"
                >
                  <span className="font-semibold">{byId.get(item.playerId)?.nickname ?? '?'}:</span>
                  <span className="truncate">{item.text}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
