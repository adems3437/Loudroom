import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { ReconnectingBanner } from '@/components/reconnecting-banner';
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
      <ReconnectingBanner />
      {/*
        select-none keeps taps from selecting text; inputs stay editable (iOS needs this). A
        phone held sideways (Okey's rack) gets the full width and slim margins.
      */}
      <div
        data-surface="player"
        className="phone-landscape:max-w-none phone-landscape:pt-2 phone-landscape:pb-2 phone-landscape:pl-[max(1rem,env(safe-area-inset-left))] phone-landscape:pr-[max(1rem,env(safe-area-inset-right))] mx-auto flex min-h-dvh w-full max-w-md touch-manipulation flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none [&_input]:select-text"
      >
        {children}
      </div>
    </RealtimeRoot>
  );
}
