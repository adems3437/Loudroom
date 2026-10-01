import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { RealtimeRoot } from '@/realtime/realtime-root';

// Phone controller: no pinch or double-tap zoom, and the on-screen keyboard resizes the
// content instead of pushing the layout around.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeRoot>
      <div
        data-surface="player"
        className="flex min-h-dvh touch-manipulation flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none"
      >
        {children}
      </div>
    </RealtimeRoot>
  );
}
