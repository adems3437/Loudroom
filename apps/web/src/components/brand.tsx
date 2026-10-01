import { getTranslations } from 'next-intl/server';

export async function Brand({ className = '' }: { className?: string }) {
  const t = await getTranslations('brand');
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      {t('name')}
      <span className="text-accent">.</span>
    </span>
  );
}
