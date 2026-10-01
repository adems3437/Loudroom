import type { ReactNode } from 'react';
import { AdminShell } from './admin-shell';

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
