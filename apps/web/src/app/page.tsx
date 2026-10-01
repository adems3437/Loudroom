import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Brand } from '@/components/brand';
import { ConnectionStatus } from '@/components/connection-status';
import { RealtimeRoot } from '@/realtime/realtime-root';

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-10 px-4 py-12">
      <header>
        <h1 className="text-5xl sm:text-6xl">
          <Brand />
        </h1>
        <p className="text-muted mt-3 text-lg">{t('brand.tagline')}</p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/host"
          className="min-h-touch bg-brand hover:bg-brand-strong focus-visible:outline-accent flex flex-col justify-center rounded-2xl px-6 py-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="font-display text-2xl font-bold">{t('home.host')}</span>
          <span className="text-ink/80 text-sm">{t('home.hostHint')}</span>
        </Link>
        <Link
          href="/play"
          className="min-h-touch bg-accent text-canvas focus-visible:outline-ink flex flex-col justify-center rounded-2xl px-6 py-5 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="font-display text-2xl font-bold">{t('home.play')}</span>
          <span className="text-canvas/75 text-sm">{t('home.playHint')}</span>
        </Link>
      </nav>

      <RealtimeRoot>
        <ConnectionStatus />
      </RealtimeRoot>
    </main>
  );
}
