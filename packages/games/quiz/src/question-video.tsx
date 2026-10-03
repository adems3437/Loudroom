'use client';

import { mediaUrl, type PhaseClock } from '@loudroom/game-sdk/client';
import { useEffect, useRef, useState } from 'react';

/** Drift between the video and the server clock tolerated before seeking. */
const MAX_DRIFT_S = 0.6;

/**
 * The question video on the TV, kept in step with the server's INTRO clock: its position is
 * the time already played (duration − time left), so a pause, a resume, a reload or a late
 * reconnect all land at the right moment. Browsers may refuse sound without a user gesture
 * (e.g. after a reload); the video then plays muted and offers a "sound on" button. Either way
 * answering opens when the server's clock runs out, not when the video does.
 */
export function QuestionVideo({
  mediaId,
  format,
  durationMs,
  phase,
  paused,
  serverNow,
  label,
  unmuteLabel,
}: {
  mediaId: string;
  format: 'mp4' | 'webm';
  durationMs: number;
  phase: PhaseClock | null;
  paused: boolean;
  serverNow: () => number;
  label: string;
  unmuteLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blockedSound, setBlockedSound] = useState(false);
  const endsAt = phase?.name === 'INTRO' ? phase.endsAt : null;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (paused || endsAt === null) {
      video.pause();
      return;
    }
    const sync = () => {
      const position = Math.max(0, durationMs - (endsAt - serverNow())) / 1000;
      if (position >= durationMs / 1000) {
        video.pause();
        return;
      }
      if (Math.abs(video.currentTime - position) > MAX_DRIFT_S) video.currentTime = position;
      if (video.paused) {
        video.play().catch(() => {
          // Sound needs a gesture here: play muted and offer to turn it on.
          video.muted = true;
          setBlockedSound(true);
          void video.play().catch(() => undefined);
        });
      }
    };
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, endsAt, durationMs, serverNow]);

  return (
    <div className="relative flex h-full min-h-0 justify-center">
      <video
        ref={ref}
        data-testid="quiz-question-video"
        src={mediaUrl(mediaId, format)}
        aria-label={label}
        playsInline
        preload="auto"
        className="h-full max-h-[620px] min-h-0 w-auto rounded-[32px] bg-black object-contain"
      />
      {blockedSound && (
        <button
          type="button"
          data-testid="quiz-video-unmute"
          className="bg-canvas/80 text-ink border-line absolute bottom-6 left-1/2 -translate-x-1/2 rounded-2xl border px-8 py-4 text-[32px] font-semibold"
          onClick={() => {
            if (ref.current) ref.current.muted = false;
            setBlockedSound(false);
          }}
        >
          {unmuteLabel}
        </button>
      )}
    </div>
  );
}
