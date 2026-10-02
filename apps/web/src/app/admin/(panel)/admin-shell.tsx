'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { useAdminSession, useAdminUser } from '@/admin/session';
import { smallButton } from '@/admin/ui';

const NAV = [
  { href: '/admin', key: 'overview' },
  { href: '/admin/content', key: 'content' },
  { href: '/admin/content/categories', key: 'categories' },
  { href: '/admin/media', key: 'media' },
  { href: '/admin/game-packs', key: 'packs' },
  { href: '/admin/sessions', key: 'history' },
  { href: '/admin/users', key: 'users', adminOnly: true },
  { href: '/admin/account', key: 'account' },
] as const;

/** The most specific nav entry matching the path is the active one. */
function activeHref(pathname: string): string | undefined {
  return NAV.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** Signed-in frame of the panel: navigation on the left, the page on the right. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const user = useAdminUser();
  const { logout } = useAdminSession();
  const pathname = usePathname();

  if (!user) {
    return <p className="text-muted p-8">{t('common.loading')}</p>;
  }
  const active = activeHref(pathname);

  return (
    <div className="grid min-h-dvh grid-cols-[240px_1fr]">
      <aside className="border-line bg-surface sticky top-0 flex h-dvh flex-col gap-6 border-r px-4 py-6">
        <Link href="/admin" className="px-2 text-xl">
          <Brand />
          <span className="text-muted mt-1 block text-sm">{t('title')}</span>
        </Link>
        <nav aria-label={t('nav.menu')}>
          <ul className="flex flex-col gap-1">
            {NAV.filter((item) => !('adminOnly' in item) || user.role === 'ADMIN').map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-testid={`nav-${item.key}`}
                  aria-current={active === item.href ? 'page' : undefined}
                  className="hover:bg-surface-raised aria-[current=page]:bg-brand block rounded-xl px-3 py-2"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2">
          <p className="text-sm">
            <span className="block font-semibold" data-testid="admin-user">
              {user.displayName}
            </span>
            <span className="text-muted">{t(`roles.${user.role}`)}</span>
          </p>
          <button
            type="button"
            data-testid="logout"
            className={smallButton()}
            onClick={() => void logout()}
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
