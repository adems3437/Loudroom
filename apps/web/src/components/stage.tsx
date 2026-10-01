'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

/**
 * Host screen canvas: laid out at 1920×1080 and scaled uniformly to fit the viewport, so the
 * 16:9 composition looks the same on every TV or projector resolution.
 */
export function Stage({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={frameRef} className="bg-canvas fixed inset-0 overflow-hidden">
      <div
        data-testid="stage"
        className="h-stage-h w-stage-w px-safe-x py-safe-y absolute top-1/2 left-1/2 text-[32px]"
        style={{
          transform: `translate(-50%, -50%) scale(${scale ?? 1})`,
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}
