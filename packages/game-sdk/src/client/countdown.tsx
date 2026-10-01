'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown ring drawn locally from the server's `endsAt` (no per-second broadcasts, SPEC §3).
 */
export function Countdown({
  endsAt,
  durationMs,
  serverNow,
  size,
  label,
}: {
  endsAt: number | null;
  durationMs: number | null;
  serverNow: () => number;
  size: number;
  /** Accessible name, e.g. "Kalan süre". */
  label: string;
}) {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (endsAt === null) return;
    let frame = 0;
    const tick = () => {
      setNow(serverNow());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [endsAt, serverNow]);

  if (endsAt === null || durationMs === null || durationMs <= 0) return null;
  const remainingMs = Math.max(0, endsAt - now);
  const fraction = Math.min(1, remainingMs / durationMs);
  const seconds = Math.ceil(remainingMs / 1000);
  const stroke = size * 0.1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const urgent = seconds <= 5;

  return (
    <div
      role="timer"
      aria-label={`${label}: ${seconds}`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-raised"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={urgent ? 'stroke-danger' : 'stroke-accent'}
        />
      </svg>
      <span
        className={`font-display font-extrabold tabular-nums ${urgent ? 'text-danger' : ''}`}
        style={{ fontSize: size * 0.38 }}
      >
        {seconds}
      </span>
    </div>
  );
}
