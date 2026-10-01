'use client';

import { PASSWORD_MIN_LENGTH, type ApiError } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAdminSession, useAdminUser } from '@/admin/session';
import { ErrorBanner, Field, inputClass, Notice, PageHeader, smallButton } from '@/admin/ui';

export default function AccountPage() {
  const t = useTranslations('admin');
  const user = useAdminUser();
  const { api } = useAdminSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    setDone(false);
    const result = await api('/api/admin/auth/password', {
      method: 'POST',
      json: { currentPassword, newPassword },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    setCurrentPassword('');
    setNewPassword('');
  };

  return (
    <>
      <PageHeader title={t('account.title')} />
      {user && (
        <p className="text-muted mb-6">
          {user.displayName} · {user.email} · {t(`roles.${user.role}`)}
        </p>
      )}
      <form
        className="bg-surface border-line flex max-w-md flex-col gap-4 rounded-2xl border p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-xl font-bold">{t('account.changePassword')}</h2>
        <Field label={t('account.currentPassword')}>
          <input
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
            }}
          />
        </Field>
        <Field label={t('account.newPassword')} hint={t('account.passwordHint')}>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            className={inputClass}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
            }}
          />
        </Field>
        <ErrorBanner error={error} />
        {done && <Notice>{t('account.changed')}</Notice>}
        <button type="submit" className={smallButton('primary', 'py-3')}>
          {t('account.changePassword')}
        </button>
      </form>
    </>
  );
}
