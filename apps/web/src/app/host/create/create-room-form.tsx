'use client';

import {
  ClientCommand,
  DEFAULT_MAX_PLAYERS,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  type LateJoin,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/brand';
import { buttonClass } from '@/components/button';
import { saveSession } from '@/lib/session-storage';
import { sendCommand } from '@/realtime/commands';
import { useRealtime } from '@/realtime/realtime-provider';

export function CreateRoomForm() {
  const t = useTranslations();
  const router = useRouter();
  const { socket, connection, adoptSession, clearSession } = useRealtime();
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [lateJoin, setLateJoin] = useState<LateJoin>('closed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new room needs a connection that is not bound to an earlier room.
  useEffect(() => {
    clearSession();
  }, [clearSession]);

  const create = async () => {
    if (!socket) return;
    setBusy(true);
    setError(null);
    const result = await sendCommand(socket, ClientCommand.RoomCreate, {
      settings: { maxPlayers, lateJoin },
    });
    if (!result.ok) {
      setBusy(false);
      setError(t(`errors.${result.code}`));
      return;
    }
    saveSession('host', result.data.roomCode, { token: result.data.hostToken });
    adoptSession(result.data.hostToken);
    router.push(`/host/room/${result.data.roomCode}`);
  };

  const stepper =
    'size-[96px] rounded-full border border-line bg-surface text-[56px] leading-none hover:bg-surface-raised disabled:opacity-40';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      <span className="text-[64px]">
        <Brand />
      </span>
      <h1 className="font-display text-[80px] leading-none font-extrabold">
        {t('host.createTitle')}
      </h1>
      <div className="flex flex-col items-center gap-6">
        <span id="max-players-label" className="text-muted text-[36px]">
          {t('host.maxPlayers')}
        </span>
        <div className="flex items-center gap-12" role="group" aria-labelledby="max-players-label">
          <button
            type="button"
            className={stepper}
            aria-label={t('host.decrease')}
            disabled={maxPlayers <= MIN_PLAYERS_LIMIT}
            onClick={() => {
              setMaxPlayers((value) => Math.max(MIN_PLAYERS_LIMIT, value - 1));
            }}
          >
            −
          </button>
          <output
            data-testid="max-players"
            className="font-display w-[200px] text-center text-[120px] font-extrabold tabular-nums"
          >
            {maxPlayers}
          </output>
          <button
            type="button"
            className={stepper}
            aria-label={t('host.increase')}
            disabled={maxPlayers >= MAX_PLAYERS_LIMIT}
            onClick={() => {
              setMaxPlayers((value) => Math.min(MAX_PLAYERS_LIMIT, value + 1));
            }}
          >
            +
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-6">
        <span id="late-join-label" className="text-muted text-[36px]">
          {t('host.lateJoin')}
        </span>
        <div role="radiogroup" aria-labelledby="late-join-label" className="flex gap-4 text-[32px]">
          {(['closed', 'zeroPoints'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={lateJoin === option}
              onClick={() => {
                setLateJoin(option);
              }}
              className={`rounded-2xl border-2 px-8 py-4 ${
                lateJoin === option ? 'border-accent bg-surface-raised' : 'border-line bg-surface'
              }`}
            >
              {option === 'closed' ? t('host.lateJoinClosed') : t('host.lateJoinZero')}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        data-testid="create-room"
        className={buttonClass('primary', 'min-h-[120px] px-20 text-[48px]')}
        disabled={busy || connection !== 'connected'}
        onClick={() => void create()}
      >
        {busy ? t('host.creating') : t('host.createCta')}
      </button>
      {error && (
        <p role="alert" className="text-danger text-[36px]">
          {error}
        </p>
      )}
    </div>
  );
}
