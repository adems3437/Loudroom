'use client';

import { adminSessionSchema, type ApiError } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/button';
import { apiRequest } from '@/lib/api';
import { useAdminSession } from '@/admin/session';
import { ErrorBanner, Field, inputClass } from '@/admin/ui';

/** Only panel paths are followed after login (no open redirect). */
function safeNext(next: string | null): string {
  return next?.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin';
}

export function LoginForm() {
  const t = useTranslations('admin.login');
  const router = useRouter();
  const params = useSearchParams();
  const { state, signedIn } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const next = safeNext(params.get('next'));

  useEffect(() => {
    if (state.status === 'signedIn') router.replace(next);
  }, [state.status, router, next]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await apiRequest('/api/admin/auth/login', {
      method: 'POST',
      json: { email, password },
      schema: adminSessionSchema,
    });
    setBusy(false);
    if (result.ok) signedIn(result.data);
    else setError(result.error);
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t('email')}>
        <input
          data-testid="login-email"
          type="email"
          autoComplete="username"
          required
          className={inputClass}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>
      <Field label={t('password')}>
        <input
          data-testid="login-password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>
      <ErrorBanner error={error} />
      <button
        type="submit"
        data-testid="login-submit"
        disabled={busy}
        className={buttonClass('primary')}
      >
        {busy ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
