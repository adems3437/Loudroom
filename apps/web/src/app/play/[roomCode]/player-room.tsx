'use client';

import { ClientCommand, type PlayerRoomState, type PublicPlayer } from '@loudroom/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/avatar';
import { Brand } from '@/components/brand';
import { buttonClass } from '@/components/button';
import { ConnectionStatus } from '@/components/connection-status';
import { tapFeedback } from '@/lib/haptics';
import { removeSession, saveSession, useStoredSession } from '@/lib/session-storage';
import { useWakeLock } from '@/lib/use-wake-lock';
import { sendCommand } from '@/realtime/commands';
import { useRealtime } from '@/realtime/realtime-provider';
import { ProfileForm } from './profile-form';

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const t = useTranslations();
  const { socket, room, sessionEnded, adoptSession, resumeSession, clearSession, hasSession } =
    useRealtime();
  const stored = useStoredSession('player', roomCode);

  useEffect(() => {
    if (stored) resumeSession(stored.token);
    // Joining needs a connection that is not still bound to another room.
    else if (stored === null && hasSession()) clearSession();
  }, [stored, resumeSession, clearSession, hasSession]);

  // A session the server no longer knows (expired, kicked) is forgotten on this device too.
  useEffect(() => {
    if (sessionEnded === 'SESSION_EXPIRED' || sessionEnded === 'KICKED') {
      removeSession('player', roomCode);
    }
  }, [sessionEnded, roomCode]);

  const inThisRoom = room?.role === 'player' && room.code === roomCode ? room : null;
  const me = inThisRoom?.players.find((player) => player.id === stored?.playerId) ?? null;
  useWakeLock(me !== null);

  const join = async (nickname: string, avatar: PublicPlayer['avatar']) => {
    if (!socket) return t('errors.NO_RESPONSE');
    const result = await sendCommand(socket, ClientCommand.RoomJoin, {
      roomCode,
      nickname,
      avatar,
    });
    if (!result.ok) return t(`errors.${result.code}`);
    const session = { token: result.data.playerToken, playerId: result.data.playerId };
    adoptSession(session.token);
    saveSession('player', roomCode, session);
    return null;
  };

  let content: ReactNode;
  if (sessionEnded === 'KICKED') {
    content = (
      <Notice testId="kicked-screen" message={t('play.kicked')}>
        <Link href="/" className={buttonClass('ghost')}>
          {t('play.home')}
        </Link>
      </Notice>
    );
  } else if (sessionEnded === 'SESSION_REPLACED' && stored) {
    content = (
      <Notice testId="session-replaced" message={t('play.replaced')}>
        <button
          type="button"
          className={buttonClass('accent')}
          onClick={() => {
            resumeSession(stored.token);
          }}
        >
          {t('play.continueHere')}
        </button>
      </Notice>
    );
  } else if (inThisRoom && me) {
    content = <PlayerLobby room={inThisRoom} me={me} />;
  } else if (stored && sessionEnded === null) {
    content = <p className="text-muted text-center">{t('play.resuming')}</p>;
  } else if (stored !== undefined) {
    content = (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{t('play.joinTitle')}</h1>
          <p className="text-muted">{t('play.room', { code: roomCode })}</p>
        </div>
        {sessionEnded === 'SESSION_EXPIRED' && (
          <p role="status" className="bg-warning/15 text-warning rounded-xl px-4 py-3">
            {t('play.expired')}
          </p>
        )}
        <ProfileForm submitLabel={t('play.join')} busyLabel={t('play.joining')} onSubmit={join} />
      </section>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className="flex items-center justify-between">
        <span className="text-2xl">
          <Brand />
        </span>
        <ConnectionStatus variant="compact" />
      </header>
      {content}
    </main>
  );
}

function Notice({
  testId,
  message,
  children,
}: {
  testId: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      <p className="font-display text-2xl font-bold">{message}</p>
      {children}
    </section>
  );
}

function PlayerLobby({ room, me }: { room: PlayerRoomState; me: PublicPlayer }) {
  const t = useTranslations();
  const router = useRouter();
  const { socket, clearSession } = useRealtime();
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const others = room.players.filter((player) => player.id !== me.id);

  if (editing) {
    return (
      <ProfileForm
        initialNickname={me.nickname}
        initialAvatar={me.avatar}
        color={me.color}
        submitLabel={t('play.save')}
        busyLabel={t('play.save')}
        onSubmit={async (nickname, avatar) => {
          if (!socket) return t('errors.NO_RESPONSE');
          const result = await sendCommand(socket, ClientCommand.PlayerUpdate, {
            ...(nickname !== me.nickname ? { nickname } : {}),
            avatar,
          });
          if (!result.ok) return t(`errors.${result.code}`);
          setEditing(false);
          return null;
        }}
        secondary={
          <button
            type="button"
            className={buttonClass('ghost')}
            onClick={() => {
              setEditing(false);
            }}
          >
            {t('play.cancel')}
          </button>
        }
      />
    );
  }

  return (
    <section
      data-testid="player-lobby"
      data-player-id={me.id}
      className="flex flex-1 flex-col gap-6"
    >
      {!room.hostConnected && (
        <p role="status" className="bg-warning/15 text-warning rounded-xl px-4 py-3">
          {t('play.hostOffline')}
        </p>
      )}

      <div
        className="bg-surface flex items-center gap-4 rounded-3xl border-4 p-4"
        style={{ borderColor: me.color }}
      >
        <Avatar id={me.avatar} color={me.color} size={96} />
        <div className="min-w-0">
          <p className="text-muted text-sm">{t('play.you')}</p>
          <p data-testid="my-nickname" className="font-display truncate text-3xl font-bold">
            {me.nickname}
          </p>
          <p className="text-muted text-sm">{t('play.room', { code: room.code })}</p>
        </div>
      </div>

      <button
        type="button"
        data-testid="ready-toggle"
        aria-pressed={me.ready}
        onClick={() => {
          tapFeedback();
          if (socket) void sendCommand(socket, ClientCommand.PlayerReady, { ready: !me.ready });
        }}
        className={`font-display min-h-[88px] rounded-3xl text-3xl font-extrabold transition-[background-color,transform] active:scale-[0.97] ${
          me.ready ? 'bg-success text-canvas' : 'bg-brand text-ink'
        }`}
      >
        {me.ready ? `${t('play.readyActive')} ✓` : t('play.readyButton')}
      </button>
      <p className="text-muted text-center">{t('play.readyHint')}</p>

      <div className="flex flex-col gap-3">
        <h2 className="text-muted font-semibold">{t('play.others')}</h2>
        {others.length === 0 ? (
          <p className="text-muted">{t('play.nobodyElse')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {others.map((player) => (
                <motion.li
                  key={player.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: player.connected ? 1 : 0.5, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className="bg-surface flex items-center gap-3 rounded-2xl px-3 py-2"
                >
                  <Avatar id={player.avatar} color={player.color} size={40} />
                  <span className="flex-1 truncate font-semibold">{player.nickname}</span>
                  {player.ready && <span className="text-success">✓</span>}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          className={buttonClass('ghost')}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t('play.edit')}
        </button>
        {confirmLeave ? (
          <div className="bg-surface flex flex-col gap-2 rounded-2xl p-3 text-center">
            <p>{t('play.leaveConfirm')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={buttonClass('ghost')}
                onClick={() => {
                  setConfirmLeave(false);
                }}
              >
                {t('play.cancel')}
              </button>
              <button
                type="button"
                data-testid="leave-confirm"
                className={buttonClass('danger')}
                onClick={() => {
                  if (!socket) return;
                  void sendCommand(socket, ClientCommand.RoomLeave, {}).then(() => {
                    removeSession('player', room.code);
                    clearSession();
                    router.push('/play');
                  });
                }}
              >
                {t('play.leave')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="leave-button"
            className="min-h-touch text-muted underline"
            onClick={() => {
              setConfirmLeave(true);
            }}
          >
            {t('play.leave')}
          </button>
        )}
      </div>
    </section>
  );
}
