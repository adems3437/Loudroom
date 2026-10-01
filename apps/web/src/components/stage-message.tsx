import type { ReactNode } from 'react';

/** Centered message on the host stage (loading, errors). */
export function StageMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-12 text-center">
      <p className="font-display max-w-[1200px] text-[56px] leading-tight font-bold">{children}</p>
      {action}
    </div>
  );
}
