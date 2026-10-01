import { getTranslations } from 'next-intl/server';

export default async function AdminHomePage() {
  const t = await getTranslations('admin');
  return <h1 className="font-display text-3xl font-bold">{t('title')}</h1>;
}
