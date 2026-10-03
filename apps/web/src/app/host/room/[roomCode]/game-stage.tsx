'use client';

import { Countdown } from '@loudroom/game-sdk/client';
import {
  ClientCommand,
  ServerEvent,
  type HostGameState,
  type HostRoomState,
} from '@loudroom/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/button';
import { FullscreenButton } from '@/components/fullscreen-button';
import { HostRound } from '@/games/round-renderer';
import { setSoundEnabled, sfx, unlockAudio, useSoundEnabled } from '@/lib/sfx';
import { sendCommand } from '@/realtime/commands';
import { useRealtime } from '@/realtime/realtime-provider';
import { Podium } from './podium';
import { Scoreboard } from './scoreboard';

type HostCommand =
  | typeof ClientCommand.GameNext
  | typeof ClientCommand.GamePause
  | typeof ClientCommand.GameResume
  | typeof ClientCommand.GameSkip
  | typeof ClientCommand.GameEnd
  | typeof ClientCommand.GameRestart;

function useHostCommand() {
  const { socket } = useRealtime();
  return (command: HostCommand) => {
    unlockAudio();
    if (socket) void sendCommand(socket, command, {});
  };
}

/** Sound effects driven by the game's notifications and clock (host screen only). */
function useGameSounds(game: HostGameState) {
  const { socket, serverNow } = useRealtime();
  const answered = useRef(0);

  useEffect(() => {
    if (!socket) return;
    const onStart = () => {
      sfx.whoosh();
    };
    const onResult = () => {
      sfx.reveal();
    };
    const onEnd = () => {
      sfx.fanfare();
    };
    socket.on(ServerEvent.RoundStart, onStart);
    socket.on(ServerEvent.RoundResult, onResult);
    socket.on(ServerEvent.GameEnd, onEnd);
    return () => {
      socket.off(ServerEvent.RoundStart, onStart);
      socket.off(ServerEvent.RoundResult, onResult);
      socket.off(ServerEvent.GameEnd, onEnd);
    };
  }, [socket]);

  // A blip for every new answer.
  const view = game.round?.view as { answeredCount?: unknown } | undefined;
  const count = typeof view?.answeredCount === 'number' ? view.answeredCount : 0;
  useEffect(() => {
    if (count > answered.current) sfx.answer();
    answered.current = count;
  }, [count]);

  // Ticks in the last five seconds of a running clock.
  const endsAt = game.status === 'PLAYING' ? (game.round?.phase?.endsAt ?? null) : null;
  useEffect(() => {
    if (endsAt === null) return;
    let last = Infinity;
    const timer = setInterval(() => {
      const seconds = Math.ceil((endsAt - serverNow()) / 1000);
      if (seconds <= 5 && seconds >= 1 && seconds < last) sfx.tick();
      last = seconds;
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, [endsAt, serverNow]);
}

function Controls({ game }: { game: HostGameState }) {
  const t = useTranslations('game');
  const run = useHostCommand();
  const sound = useSoundEnabled();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const button =
    'rounded-2xl border border-line bg-surface px-[0.8em] py-[0.4em] hover:bg-surface-raised';

  if (game.status === 'FINISHED') return null;
  return (
    <div className="flex items-center gap-4 text-[26px]">
      {game.status === 'PAUSED' ? (
        <button
          type="button"
          data-testid="resume-game"
          className={button}
          onClick={() => {
            run(ClientCommand.GameResume);
          }}
        >
          {t('resume')}
        </button>
      ) : (
        <button
          type="button"
          data-testid="pause-game"
          className={button}
          onClick={() => {
            run(ClientCommand.GamePause);
          }}
        >
          {t('pause')}
        </button>
      )}
      {game.status === 'PLAYING' && (
        <button
          type="button"
          data-testid="skip-round"
          className={button}
          onClick={() => {
            run(ClientCommand.GameSkip);
          }}
        >
          {t('skip')}
        </button>
      )}
      {confirmEnd ? (
        <span className="flex items-center gap-3">
          {t('endConfirm')}
          <button
            type="button"
            data-testid="end-confirm"
            className="bg-danger rounded-2xl px-[0.8em] py-[0.4em] font-bold"
            onClick={() => {
              setConfirmEnd(false);
              run(ClientCommand.GameEnd);
            }}
          >
            {t('endYes')}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              setConfirmEnd(false);
            }}
          >
            {t('cancel')}
          </button>
        </span>
      ) : (
        <button
          type="button"
          data-testid="end-game"
          className={button}
          onClick={() => {
            setConfirmEnd(true);
          }}
        >
          {t('end')}
        </button>
      )}
      <button
        type="button"
        aria-pressed={sound}
        className={button}
        onClick={() => {
          unlockAudio();
          setSoundEnabled(!sound);
        }}
      >
        {sound ? t('soundOn') : t('soundOff')}
      </button>
      <FullscreenButton />
    </div>
  );
}

/** Host screen while a game runs: countdown, rounds, scoreboard, podium, pause. */
export function GameStage({ room, game }: { room: HostRoomState; game: HostGameState }) {
  const t = useTranslations('game');
  const tHost = useTranslations('host');
  const run = useHostCommand();
  const { serverNow } = useRealtime();
  useGameSounds(game);

  const status = game.status;
  const roundLabel =
    game.roundIndex >= 0 && status !== 'FINISHED'
      ? t('roundOf', { current: game.roundIndex + 1, total: game.roundCount })
      : '';

  let main;
  if (status === 'STARTING' && game.countdown) {
    main = (
      <div
        className="flex h-full flex-col items-center justify-center gap-12"
        data-testid="game-starting"
      >
        <p className="font-display text-[120px] font-extrabold">{t('getReady')}</p>
        <Countdown
          endsAt={game.countdown.endsAt}
          durationMs={game.countdown.durationMs}
          serverNow={serverNow}
          size={240}
          label={t('getReady')}
        />
      </div>
    );
  } else if (status === 'SCOREBOARD') {
    main = <Scoreboard standings={game.standings} players={room.players} />;
  } else if (status === 'FINISHED') {
    main = <Podium standings={game.standings} players={room.players} />;
  } else if (game.round) {
    main = <HostRound round={game.round} players={room.players} paused={status === 'PAUSED'} />;
  } else if (status === 'PAUSED') {
    main = <Scoreboard standings={game.standings} players={room.players} />;
  }

  return (
    <div
      className="relative flex h-full flex-col gap-8"
      data-testid="game-stage"
      data-status={status}
    >
      <header className="flex items-center justify-between gap-8">
        <span className="text-muted text-[32px] font-semibold" data-testid="round-label">
          {roundLabel}
        </span>
        <Controls game={game} />
      </header>

      <div className="min-h-0 flex-1">{main}</div>

      {game.canAdvance && (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="next-step"
            className={buttonClass('primary', 'min-h-[100px] px-14 text-[44px]')}
            onClick={() => {
              run(ClientCommand.GameNext);
            }}
          >
            {t('next')}
          </button>
        </div>
      )}

      {status === 'FINISHED' && (
        <div className="flex justify-center gap-8">
          <button
            type="button"
            data-testid="play-again"
            className={buttonClass('primary', 'min-h-[100px] px-14 text-[40px]')}
            onClick={() => {
              run(ClientCommand.GameRestart);
            }}
          >
            {t('playAgain')}
          </button>
          <Link
            href="/host/create"
            className={buttonClass('ghost', 'min-h-[100px] px-14 text-[40px]')}
          >
            {tHost('newRoom')}
          </Link>
        </div>
      )}

      {status === 'PAUSED' && (
        <div
          data-testid="paused-overlay"
          // Below the header, so the controls (resume, end) stay usable.
          className="bg-canvas/90 absolute inset-x-0 top-[96px] bottom-0 flex flex-col items-center justify-center gap-10 rounded-[48px]"
        >
          <p className="font-display text-[96px] font-extrabold">{t('paused')}</p>
          <p className="text-muted text-[36px]">{t('pausedHint')}</p>
          <button
            type="button"
            className={buttonClass('primary', 'min-h-[100px] px-14 text-[44px]')}
            onClick={() => {
              run(ClientCommand.GameResume);
            }}
          >
            {t('resume')}
          </button>
        </div>
      )}
    </div>
  );
}
