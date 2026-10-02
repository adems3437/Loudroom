'use client';

import type { PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useEffect, useRef } from 'react';
import { outcomeKey } from './outcome.js';
import type { AttemptKind, ReactionPlayerView } from './schema.js';

type Submit = PlayerRendererProps<ReactionPlayerView>['submit'];

/**
 * The target (or decoy). The clock starts at the frame it is drawn in
 * (`requestAnimationFrame` time) and stops at the touch's own `timeStamp`, both on the
 * `performance.now()` clock — network delay is not part of it (SPEC §7.7).
 */
function Target({
  attempt,
  kind,
  submit,
  haptic,
  t,
}: {
  attempt: number;
  kind: AttemptKind;
  submit: Submit;
  haptic: () => void;
  t: PlayerRendererProps<ReactionPlayerView>['t'];
}) {
  const shownAt = useRef<number | null>(null);
  const tapped = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame((time) => {
      shownAt.current = time;
      void submit({ type: 'shown', attempt });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [attempt, submit]);

  return (
    <button
      type="button"
      data-testid="reaction-target"
      data-kind={kind}
      className={`flex flex-1 touch-manipulation flex-col items-center justify-center gap-4 rounded-[40px] select-none ${
        kind === 'decoy' ? 'bg-danger' : 'bg-success'
      }`}
      onPointerDown={(event) => {
        if (tapped.current) return;
        tapped.current = true;
        haptic();
        const reactionMs = event.timeStamp - (shownAt.current ?? event.timeStamp);
        void submit({ type: 'tap', attempt, reactionMs });
      }}
    >
      <span className="font-display text-canvas text-6xl font-extrabold">
        {kind === 'decoy' ? t('decoy') : t('go')}
      </span>
    </button>
  );
}

/** Phone controller for Reaction: wait, then tap the target as fast as possible. */
export function ReactionPlayer({
  view,
  submit,
  haptic,
  t,
}: PlayerRendererProps<ReactionPlayerView>) {
  const counter =
    view.phase === 'ARMED' || view.phase === 'GO' || view.phase === 'RESULT'
      ? t('attemptOf', { current: view.attempt + 1, total: view.total })
      : null;

  return (
    <div
      className="flex flex-1 flex-col gap-3"
      data-testid="reaction-player"
      data-phase={view.phase}
    >
      {counter && <p className="text-muted text-center">{counter}</p>}

      {view.phase === 'INTRO' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-3xl font-extrabold">{view.title}</p>
          <p>{view.variant === 'goNoGo' ? t('rulesGoNoGo') : t('rulesClassic')}</p>
        </div>
      )}

      {view.phase === 'ARMED' && (
        <button
          type="button"
          data-testid="reaction-wait"
          data-early={view.early}
          className="bg-surface-raised flex flex-1 touch-manipulation flex-col items-center justify-center gap-3 rounded-[40px] select-none"
          onPointerDown={() => {
            if (view.early) return;
            haptic();
            void submit({ type: 'early', attempt: view.attempt });
          }}
        >
          <span className="font-display text-4xl font-extrabold">
            {view.early ? t('outcome.early') : t('wait')}
          </span>
          <span className="text-muted">{view.early ? t('earlyHint') : t('waitHint')}</span>
        </button>
      )}

      {view.phase === 'GO' &&
        (view.done === null ? (
          <Target
            key={view.attempt}
            attempt={view.attempt}
            kind={view.kind}
            submit={submit}
            haptic={haptic}
            t={t}
          />
        ) : (
          <p
            className="font-display flex flex-1 items-center justify-center text-3xl font-extrabold"
            data-testid="reaction-done"
          >
            {t(outcomeKey[view.done])}
          </p>
        ))}

      {view.phase === 'RESULT' && (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-2"
          data-testid="reaction-attempt-result"
          data-outcome={view.outcome}
        >
          <p className="font-display text-6xl font-extrabold tabular-nums">
            {view.ms !== null ? t('ms', { ms: view.ms }) : t(outcomeKey[view.outcome])}
          </p>
        </div>
      )}

      {view.phase === 'REVEAL' && (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          data-testid="reaction-player-reveal"
        >
          <p className="text-muted">{t('yourMedian')}</p>
          <p className="font-display text-5xl font-extrabold tabular-nums">
            {view.medianMs === null ? t('noValid') : t('ms', { ms: view.medianMs })}
          </p>
          {view.rank !== null && <p className="text-xl">{t('rank', { rank: view.rank })}</p>}
          <ul className="flex flex-wrap justify-center gap-2">
            {view.results.map((result, index) => (
              <li key={index} className="bg-surface rounded-xl px-3 py-1 text-sm tabular-nums">
                {result.ms !== null ? t('ms', { ms: result.ms }) : t(outcomeKey[result.outcome])}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
