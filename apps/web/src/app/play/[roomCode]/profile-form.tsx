'use client';

import { AVATAR_IDS, nicknameSchema, type AvatarId } from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/avatar';
import { buttonClass } from '@/components/button';
import { tapFeedback } from '@/lib/haptics';

const PREVIEW_COLOR = '#9b82ff';

/** Nickname + avatar form, used to join and to edit the profile in the lobby. */
export function ProfileForm({
  initialNickname = '',
  initialAvatar = AVATAR_IDS[0],
  color = PREVIEW_COLOR,
  submitLabel,
  busyLabel,
  onSubmit,
  secondary,
}: {
  initialNickname?: string;
  initialAvatar?: AvatarId;
  color?: string;
  submitLabel: string;
  busyLabel: string;
  /** Resolves with an error message, or null on success. */
  onSubmit: (nickname: string, avatar: AvatarId) => Promise<string | null>;
  secondary?: ReactNode;
}) {
  const t = useTranslations('play');
  const avatarName = useTranslations('avatars');
  const [nickname, setNickname] = useState(initialNickname);
  const [avatar, setAvatar] = useState<AvatarId>(initialAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        tapFeedback();
        const parsed = nicknameSchema.safeParse(nickname);
        if (!parsed.success) {
          setError(t('nicknameInvalid'));
          return;
        }
        setBusy(true);
        setError(null);
        void onSubmit(parsed.data, avatar).then((message) => {
          setBusy(false);
          setError(message);
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="nickname" className="text-lg font-semibold">
          {t('nickname')}
        </label>
        <input
          id="nickname"
          data-testid="nickname-input"
          autoComplete="nickname"
          enterKeyHint="done"
          maxLength={32}
          value={nickname}
          aria-describedby="nickname-hint"
          onChange={(event) => {
            setNickname(event.target.value);
            setError(null);
          }}
          className="min-h-touch border-line bg-surface focus:border-brand rounded-2xl border-2 px-4 text-2xl font-semibold outline-none"
        />
        <p id="nickname-hint" className="text-muted text-sm">
          {t('nicknameHint')}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">{t('avatar')}</legend>
        <div role="radiogroup" className="grid grid-cols-4 gap-3">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={avatar === id}
              aria-label={avatarName(id)}
              data-testid={`avatar-option-${id}`}
              onClick={() => {
                tapFeedback();
                setAvatar(id);
              }}
              className={`min-h-touch grid aspect-square place-items-center rounded-2xl border-2 transition-colors ${
                avatar === id ? 'border-accent bg-surface-raised' : 'bg-surface border-transparent'
              }`}
            >
              <Avatar id={id} color={color} size={56} />
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          data-testid="form-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="join-button"
        disabled={busy}
        className={buttonClass('accent', 'min-h-[64px] text-xl')}
      >
        {busy ? busyLabel : submitLabel}
      </button>
      {secondary}
    </form>
  );
}
