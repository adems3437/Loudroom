import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Brand } from '@/components/brand';
import { buttonClass } from '@/components/button';
import { ConnectionStatus } from '@/components/connection-status';

export default async function HostHomePage() {
  const t = await getTranslations();
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <h1 className="text-[144px] leading-none">
          <Brand />
        </h1>
        <p className="text-muted mt-6 text-[40px]">{t('brand.tagline')}</p>
      </div>
      <div className="flex items-end justify-between">
        <Link
          href="/host/create"
          data-testid="go-create"
          className={buttonClass('primary', 'min-h-[120px] px-16 text-[48px]')}
        >
          {t('host.createCta')}
        </Link>
        <div className="w-[760px] text-[40px]">
          <ConnectionStatus />
        </div>
      </div>
    </div>
  );
}
