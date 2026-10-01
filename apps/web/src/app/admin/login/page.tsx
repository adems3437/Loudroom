import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { LoginForm } from './login-form';

export async function generateMetadata() {
  const t = await getTranslations('admin.login');
  return { title: t('title') };
}

export default async function AdminLoginPage() {
  const t = await getTranslations('admin.login');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <span className="text-3xl">
        <Brand />
      </span>
      <section className="bg-surface border-line w-full max-w-md rounded-3xl border p-8">
        <h1 className="font-display mb-6 text-2xl font-bold">{t('title')}</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
