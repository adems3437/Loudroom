import type { ReactNode } from 'react';
import { AdminSessionProvider } from '@/admin/session';

/** Desktop admin area. Needs no realtime connection; talks to the REST API on this origin. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AdminSessionProvider>{children}</AdminSessionProvider>
    </div>
  );
}
