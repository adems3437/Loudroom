import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';

/** Desktop admin shell. Needs no realtime connection. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin');
  return (
    <div className="min-h-dvh">
      <header className="border-line bg-surface flex items-center gap-3 border-b px-6 py-4">
        <span className="text-xl">
          <Brand />
        </span>
        <span className="text-muted text-sm">{t('title')}</span>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
