import type { ReactNode } from 'react';
import { Stage } from '@/components/stage';
import { RealtimeRoot } from '@/realtime/realtime-root';

/** TV / projector surface: everything renders inside the scaled 16:9 stage. */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeRoot>
      <Stage>{children}</Stage>
    </RealtimeRoot>
  );
}
