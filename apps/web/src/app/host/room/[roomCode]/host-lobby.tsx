'use client';

import { ClientCommand, type HostRoomState, type PublicPlayer } from '@loudroom/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { buttonClass } from '@/components/button';
import { FullscreenButton } from '@/components/fullscreen-button';
import { QrCode } from '@/components/qr-code';
import { StageMessage } from '@/components/stage-message';
import { removeSession, useStoredSession } from '@/lib/session-storage';
import { sendCommand } from '@/realtime/commands';
import { useRealtime } from '@/realtime/realtime-provider';

export function HostLobby({ roomCode }: { roomCode: string }) {
  const t = useTranslations('host');
  const { room, sessionEnded, resumeSession } = useRealtime();
  const stored = useStoredSession('host', roomCode);

  useEffect(() => {
    if (stored) resumeSession(stored.token);
  }, [stored, resumeSession]);

  useEffect(() => {
    if (sessionEnded === 'SESSION_EXPIRED') removeSession('host', roomCode);
  }, [sessionEnded, roomCode]);

  const newRoom = (
    <Link href="/host/create" className={buttonClass('primary', 'min-h-[100px] px-14 text-[40px]')}>
      {t('newRoom')}
    </Link>
  );

  if (sessionEnded === 'SESSION_EXPIRED') {
    return <StageMessage action={newRoom}>{t('roomGone')}</StageMessage>;
  }
  if (stored === null) return <StageMessage action={newRoom}>{t('noSession')}</StageMessage>;
  if (sessionEnded === 'SESSION_REPLACED' && stored) {
    return (
      <StageMessage
        action={
          <button
            type="button"
            className={buttonClass('primary', 'min-h-[100px] px-14 text-[40px]')}
            onClick={() => {
              resumeSession(stored.token);
            }}
          >
            {t('continueHere')}
          </button>
        }
      >
        {t('replaced')}
      </StageMessage>
    );
  }
  if (room?.role !== 'host' || room.code !== roomCode) {
    return <StageMessage>{t('loading')}</StageMessage>;
  }
  return <Lobby room={room} />;
}

function Lobby({ room }: { room: HostRoomState }) {
  const t = useTranslations('host');
  const { socket } = useRealtime();
  const displayUrl = room.joinUrl.replace(/^https?:\/\//, '');
  const density = densityFor(room.players.length);

  const setLocked = (locked: boolean) => {
    if (socket) void sendCommand(socket, ClientCommand.RoomLock, { locked });
  };

  return (
    <div className="grid h-full grid-cols-[560px_1fr] gap-16">
      <section className="bg-surface flex flex-col items-center justify-center gap-8 rounded-[48px] px-10 py-12 text-center">
        <h2 className="font-display text-[44px] font-bold">{t('joinHeading')}</h2>
        <QrCode value={room.joinUrl} size={380} label={t('qrLabel')} />
        <p
          data-testid="join-url"
          data-url={room.joinUrl}
          className="text-muted text-[28px] break-all"
        >
          {displayUrl}
        </p>
        <div>
          <p className="text-muted text-[28px] tracking-widest uppercase">{t('roomCode')}</p>
          <p
            data-testid="room-code"
            data-code={room.code}
            className="font-display text-accent text-[104px] leading-none font-extrabold tracking-[0.04em] whitespace-nowrap tabular-nums"
          >
            {room.code.slice(0, 3)} {room.code.slice(3)}
          </p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-8">
        <header className="flex items-center justify-between gap-8">
          <h1 className="font-display text-[64px] font-extrabold">
            {t('players')}{' '}
            <span data-testid="player-count" className="text-muted tabular-nums">
              {t('playerCount', { count: room.players.length, max: room.settings.maxPlayers })}
            </span>
          </h1>
          <div className="flex items-center gap-4 text-[28px]">
            <button
              type="button"
              data-testid="lock-toggle"
              aria-pressed={room.locked}
              className={`rounded-2xl border px-[0.8em] py-[0.4em] ${
                room.locked
                  ? 'border-warning bg-warning text-canvas'
                  : 'border-line bg-surface hover:bg-surface-raised'
              }`}
              onClick={() => {
                setLocked(!room.locked);
              }}
            >
              {room.locked ? t('unlock') : t('lock')}
            </button>
            <FullscreenButton />
          </div>
        </header>

        {room.locked && (
          <p role="status" className="bg-warning/15 text-warning rounded-2xl px-6 py-3 text-[32px]">
            {t('locked')}
          </p>
        )}

        {room.players.length === 0 ? (
          <p className="text-muted flex flex-1 items-center justify-center text-[48px]">
            {t('waitingForPlayers')}
          </p>
        ) : (
          <ul className={`grid content-start ${DENSITY[density].grid}`}>
            <AnimatePresence initial={false}>
              {room.players.map((player) => (
                <PlayerCard key={player.id} player={player} density={density} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}

/** Card size by player count, so up to 20 players fit the stage with readable names. */
const DENSITY = {
  roomy: { grid: 'grid-cols-2 gap-6', avatar: 104, name: 'text-[44px]', status: 'text-[30px]' },
  regular: { grid: 'grid-cols-3 gap-5', avatar: 80, name: 'text-[34px]', status: 'text-[26px]' },
  compact: { grid: 'grid-cols-4 gap-4', avatar: 60, name: 'text-[30px]', status: 'text-[24px]' },
} as const;
type Density = keyof typeof DENSITY;

function densityFor(count: number): Density {
  if (count <= 8) return 'roomy';
  if (count <= 12) return 'regular';
  return 'compact';
}

function PlayerCard({ player, density }: { player: PublicPlayer; density: Density }) {
  const size = DENSITY[density];
  const t = useTranslations('host');
  const { socket } = useRealtime();
  const [confirming, setConfirming] = useState(false);

  const status = !player.connected ? t('offline') : player.ready ? t('ready') : t('notReady');
  const statusColor = !player.connected
    ? 'text-danger'
    : player.ready
      ? 'text-success'
      : 'text-muted';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.8, y: 24 }}
      animate={{ opacity: player.connected ? 1 : 0.55, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      data-testid="player-card"
      data-player-id={player.id}
      data-nickname={player.nickname}
      data-ready={player.ready}
      data-connected={player.connected}
      className="bg-surface relative flex items-center gap-4 rounded-[28px] border-4 px-5 py-4"
      style={{ borderColor: player.ready ? player.color : 'transparent' }}
    >
      <Avatar id={player.avatar} color={player.color} size={size.avatar} />
      <div className="min-w-0">
        <p className={`truncate font-bold ${size.name}`}>{player.nickname}</p>
        <p className={`truncate font-semibold ${size.status} ${statusColor}`}>{status}</p>
      </div>

      {confirming ? (
        <div className="bg-canvas/90 absolute inset-0 flex items-center justify-center gap-4 rounded-[28px] text-[26px]">
          <span>{t('kickConfirm')}</span>
          <button
            type="button"
            data-testid="kick-confirm"
            className="bg-danger rounded-xl px-4 py-2 font-bold"
            onClick={() => {
              if (socket) {
                void sendCommand(socket, ClientCommand.RoomKick, { playerId: player.id });
              }
            }}
          >
            {t('kickYes')}
          </button>
          <button
            type="button"
            className="border-line rounded-xl border px-4 py-2"
            onClick={() => {
              setConfirming(false);
            }}
          >
            {t('kickNo')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="kick-button"
          aria-label={t('kick', { nickname: player.nickname })}
          className="border-line bg-surface-raised text-muted hover:bg-danger hover:text-ink absolute -top-3 -right-3 grid size-11 place-items-center rounded-full border text-[28px] leading-none"
          onClick={() => {
            setConfirming(true);
          }}
        >
          ×
        </button>
      )}
    </motion.li>
  );
}
