import type { ReactNode } from 'react';
import { ReconnectingBanner } from '@/components/reconnecting-banner';
import { Stage } from '@/components/stage';
import { RealtimeRoot } from '@/realtime/realtime-root';

/** TV / projector surface: everything renders inside the scaled 16:9 stage. */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeRoot>
      <Stage>
        <div className="absolute inset-x-0 top-0 text-[32px]">
          <ReconnectingBanner />
        </div>
        {children}
      </Stage>
    </RealtimeRoot>
  );
}
