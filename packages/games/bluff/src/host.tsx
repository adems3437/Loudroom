'use client';

import {
  Countdown,
  type AvatarProps,
  type HostRendererProps,
  type RendererPlayer,
} from '@loudroom/game-sdk/client';
import { useEffect, useState, type ComponentType } from 'react';
import type { BluffHostView, BluffRevealStep } from './schema.js';

type Reveal = Extract<BluffHostView, { phase: 'REVEAL' }>;

/** Server time, refreshed every animation frame while `active`. */
function useServerTime(serverNow: () => number, active: boolean): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      setNow(serverNow());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [serverNow, active]);
  return now;
}

function Avatars({
  ids,
  players,
  Avatar,
  size,
}: {
  ids: readonly string[];
  players: ReadonlyMap<string, RendererPlayer>;
  Avatar: ComponentType<AvatarProps>;
  size: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-3">
      {ids.map((id) => {
        const player = players.get(id);
        return player ? (
          <span key={id} className="flex items-center gap-2">
            <Avatar avatar={player.avatar} color={player.color} size={size} />
            <span className="text-[28px] font-semibold">{player.nickname}</span>
          </span>
        ) : null;
      })}
    </span>
  );
}

/**
 * The staged reveal (SPEC §7.6): each picked lie with who fell for it, then whose lie it was;
 * the truth last. The REVEAL phase clock says how far along it is, so it pauses with the game.
 */
function RevealSteps({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: Pick<HostRendererProps<Reveal>, 'view' | 'phase' | 'serverNow' | 'players' | 't' | 'Avatar'>) {
  const now = useServerTime(serverNow, !view.done);
  const byId = new Map(players.map((player) => [player.id, player]));
  const last = view.steps.length - 1;
  const elapsed =
    phase?.durationMs != null && phase.endsAt != null
      ? phase.durationMs - Math.max(0, phase.endsAt - now)
      : Number.POSITIVE_INFINITY;
  const index = view.done ? last : Math.min(last, Math.floor(elapsed / view.stepMs));
  // How far into the current step (0..1): its text first, then who fell for it, then whose.
  const within = view.done ? 1 : (elapsed - index * view.stepMs) / view.stepMs;
  const step: BluffRevealStep | undefined = view.steps[index];
  if (!step) return null;
  const showVoters = within > 0.25;
  const showVerdict = within > 0.6;
  const isTruth = step.kind === 'truth';

  return (
    <div
      className="flex flex-1 flex-col gap-8"
      data-testid="bluff-reveal-step"
      data-kind={step.kind}
    >
      <ol className="flex flex-wrap gap-3">
        {view.steps.slice(0, index).map((previous) => (
          <li
            key={previous.optionId}
            className="bg-surface text-muted rounded-full px-5 py-2 text-[26px] line-through"
          >
            {previous.text}
          </li>
        ))}
      </ol>
      <div
        className={`flex flex-col gap-6 rounded-[40px] px-12 py-10 transition-colors duration-500 ${
          isTruth && showVerdict ? 'bg-success text-canvas' : 'bg-surface'
        }`}
      >
        <p className="font-display text-[96px] leading-none font-extrabold">{step.text}</p>
        {showVoters && (
          <div className="flex flex-col gap-3">
            <span className="text-[30px] opacity-80">
              {isTruth
                ? t('knewIt', { count: step.voters.length })
                : t('fellForIt', { count: step.voters.length })}
            </span>
            <Avatars ids={step.voters} players={byId} Avatar={Avatar} size={56} />
          </div>
        )}
        {showVerdict && (
          <p className="text-[44px] font-extrabold" data-testid="bluff-verdict">
            {isTruth ? (
              t('theTruth')
            ) : step.kind === 'decoy' ? (
              t('houseLie')
            ) : (
              <span className="flex flex-wrap items-center gap-4">
                {t('lieBy')}
                <Avatars ids={step.authors} players={byId} Avatar={Avatar} size={64} />
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** TV screen of a Bluff question (SPEC §7.6). */
export function BluffHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<BluffHostView>) {
  return (
    <div className="flex h-full flex-col gap-8" data-testid="bluff-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="bluff-question"
          className={`font-display leading-tight font-extrabold ${
            view.phase === 'INTRO' || view.phase === 'WRITE' ? 'text-[76px]' : 'text-[52px]'
          }`}
        >
          {view.question}
        </h2>
        {(view.phase === 'WRITE' || view.phase === 'VOTE') && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={160}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'INTRO' && <p className="text-muted text-[44px]">{t('getReady')}</p>}

      {view.phase === 'WRITE' && (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <p className="text-[48px] font-bold">{t('writeLie')}</p>
          <p className="text-muted text-[36px]" data-testid="bluff-written">
            {t('written', { count: view.writtenCount, total: view.playerCount })}
          </p>
        </div>
      )}

      {view.phase === 'VOTE' && (
        <>
          <ul className="grid flex-1 grid-cols-2 content-center gap-5">
            {view.options.map((option) => (
              <li
                key={option.id}
                data-testid="bluff-host-option"
                className="bg-surface rounded-[28px] px-8 py-6 text-[44px] leading-tight font-extrabold"
              >
                {option.text}
              </li>
            ))}
          </ul>
          <p className="text-muted text-[36px]" data-testid="bluff-voted">
            {t('voted', { count: view.votedCount, total: view.playerCount })}
          </p>
        </>
      )}

      {view.phase === 'REVEAL' && (
        <RevealSteps
          view={view}
          phase={phase}
          serverNow={serverNow}
          players={players}
          t={t}
          Avatar={Avatar}
        />
      )}
    </div>
  );
}
