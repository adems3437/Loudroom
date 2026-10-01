'use client';

import {
  adminUserSchema,
  PASSWORD_MIN_LENGTH,
  type AdminUser,
  type ApiError,
  type UserRole,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAdminSession, useAdminUser } from '@/admin/session';
import {
  ConfirmDelete,
  ErrorBanner,
  formatDate,
  inputClass,
  LoadState,
  PageHeader,
  smallButton,
  tableClass,
  tdClass,
  thClass,
  useApiData,
} from '@/admin/ui';

const listSchema = adminUserSchema.array();
const ROLES: UserRole[] = ['EDITOR', 'ADMIN'];

function UserRow({
  user,
  self,
  onChanged,
  onError,
}: {
  user: AdminUser;
  self: boolean;
  onChanged: () => void;
  onError: (error: ApiError | null) => void;
}) {
  const t = useTranslations('admin');
  const { api } = useAdminSession();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [password, setPassword] = useState('');

  const save = async () => {
    const result = await api(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      json: {
        displayName,
        ...(role !== user.role ? { role } : {}),
        ...(password ? { password } : {}),
      },
    });
    onError(result.ok ? null : result.error);
    if (result.ok) {
      setEditing(false);
      onChanged();
    }
  };
  const remove = async () => {
    const result = await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    onError(result.ok ? null : result.error);
    onChanged();
  };

  if (editing) {
    return (
      <tr data-testid="user-row" data-email={user.email}>
        <td className={tdClass} colSpan={5}>
          <form
            className="grid grid-cols-[1fr_160px_1fr_auto] items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              {t('users.displayName')}
              <input
                required
                maxLength={60}
                className={inputClass}
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('users.role')}
              <select
                className={inputClass}
                value={role}
                disabled={self}
                onChange={(event) => {
                  setRole(event.target.value as UserRole);
                }}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {t(`roles.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('users.newPassword')}
              <input
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                className={inputClass}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </label>
            <span className="flex gap-2">
              <button type="submit" className={smallButton('primary')}>
                {t('common.save')}
              </button>
              <button
                type="button"
                className={smallButton()}
                onClick={() => {
                  setEditing(false);
                }}
              >
                {t('common.cancel')}
              </button>
            </span>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid="user-row" data-email={user.email}>
      <td className={tdClass}>
        <span className="font-semibold">{user.displayName}</span>
        {self && <span className="text-muted"> ({t('users.you')})</span>}
      </td>
      <td className={`${tdClass} text-sm`}>{user.email}</td>
      <td className={tdClass}>{t(`roles.${user.role}`)}</td>
      <td className={`${tdClass} text-muted text-sm`}>
        {user.lastLoginAt ? formatDate(user.lastLoginAt) : t('users.never')}
      </td>
      <td className={tdClass}>
        <span className="flex gap-2">
          <button
            type="button"
            className={smallButton()}
            onClick={() => {
              setEditing(true);
            }}
          >
            {t('common.edit')}
          </button>
          {!self && <ConfirmDelete testId="user-delete" onConfirm={() => void remove()} />}
        </span>
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const t = useTranslations('admin');
  const me = useAdminUser();
  const { api } = useAdminSession();
  const { state, reload } = useApiData(
    me?.role === 'ADMIN' ? '/api/admin/users' : null,
    listSchema,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    email: '',
    displayName: '',
    role: 'EDITOR' as UserRole,
    password: '',
  });

  const create = async () => {
    const result = await api('/api/admin/users', { method: 'POST', json: draft });
    setError(result.ok ? null : result.error);
    if (result.ok) {
      setAdding(false);
      setDraft({ email: '', displayName: '', role: 'EDITOR', password: '' });
      reload();
    }
  };

  if (me && me.role !== 'ADMIN') return <ErrorBanner error={{ code: 'FORBIDDEN', message: '' }} />;

  return (
    <>
      <PageHeader
        title={t('users.title')}
        actions={
          <button
            type="button"
            data-testid="user-new"
            className={smallButton('primary')}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('users.new')}
          </button>
        }
      />
      <div className="mb-4">
        <ErrorBanner error={error} />
      </div>
      {adding && (
        <form
          data-testid="user-form"
          className="bg-surface border-line mb-6 grid grid-cols-[1fr_1fr_160px_1fr_auto] items-end gap-3 rounded-2xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t('users.email')}
            <input
              type="email"
              required
              data-testid="user-email"
              className={inputClass}
              value={draft.email}
              onChange={(event) => {
                setDraft({ ...draft, email: event.target.value });
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('users.displayName')}
            <input
              required
              maxLength={60}
              data-testid="user-name"
              className={inputClass}
              value={draft.displayName}
              onChange={(event) => {
                setDraft({ ...draft, displayName: event.target.value });
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('users.role')}
            <select
              className={inputClass}
              value={draft.role}
              onChange={(event) => {
                setDraft({ ...draft, role: event.target.value as UserRole });
              }}
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`roles.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('users.password')}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              data-testid="user-password"
              title={t('users.passwordHint')}
              className={inputClass}
              value={draft.password}
              onChange={(event) => {
                setDraft({ ...draft, password: event.target.value });
              }}
            />
          </label>
          <span className="flex gap-2">
            <button type="submit" data-testid="user-create" className={smallButton('primary')}>
              {t('users.create')}
            </button>
            <button
              type="button"
              className={smallButton()}
              onClick={() => {
                setAdding(false);
              }}
            >
              {t('common.cancel')}
            </button>
          </span>
        </form>
      )}
      {state.status !== 'ready' ? (
        <LoadState state={state} />
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>{t('users.displayName')}</th>
              <th className={thClass}>{t('users.email')}</th>
              <th className={thClass}>{t('users.role')}</th>
              <th className={thClass}>{t('users.lastLogin')}</th>
              <th className={thClass}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((user) => (
              <UserRow
                key={`${user.id}-${user.role}-${user.displayName}`}
                user={user}
                self={user.id === me?.id}
                onChanged={reload}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
