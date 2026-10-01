import { useTranslations } from 'next-intl';

/** Wordmark. Synchronous, so it works in server and client components alike. */
export function Brand({ className = '' }: { className?: string }) {
  const t = useTranslations('brand');
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      {t('name')}
      <span className="text-accent">.</span>
    </span>
  );
}
