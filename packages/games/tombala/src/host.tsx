'use client';

import type { HostRendererProps, RendererPlayer } from '@loudroom/game-sdk/client';
import { useEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import type { TombalaHostView, TombalaPrize } from './schema.js';
import { TOMBALA_MAX_NUMBER } from './schema.js';

type Avatar = HostRendererProps<TombalaHostView>['Avatar'];

function turkishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('tr')) ?? null;
}

function subscribeVoices(onChange: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => undefined;
  window.speechSynthesis.addEventListener('voiceschanged', onChange);
  return () => {
    window.speechSynthesis.removeEventListener('voiceschanged', onChange);
  };
}

/** Whether the browser has a Turkish voice to read the numbers with (SPEC §7.10). */
function useTurkishVoice(): boolean {
  return useSyncExternalStore(
    subscribeVoices,
    () => turkishVoice() !== null,
    () => false,
  );
}

/** Reads each newly drawn number aloud when a Turkish voice exists and reading is on. */
function useAnnounce(number: number | null, enabled: boolean) {
  useEffect(() => {
    const voice = turkishVoice();
    if (!enabled || number === null || !voice) return;
    const utterance = new SpeechSynthesisUtterance(String(number));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [number, enabled]);
}

function Winners({
  ids,
  byId,
  Avatar,
  size,
}: {
  ids: readonly string[];
  byId: Map<string, RendererPlayer>;
  Avatar: Avatar;
  size: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-3">
      {ids.map((id) => {
        const player = byId.get(id);
        if (!player) return null;
        return (
          <span key={id} className="flex items-center gap-2">
            <Avatar avatar={player.avatar} color={player.color} size={size} />
            <span className="max-w-[260px] truncate font-bold">{player.nickname}</span>
          </span>
        );
      })}
    </span>
  );
}

const PRIZE_KEY: Record<TombalaPrize, string> = {
  firstLine: 'prize.firstLine',
  secondLine: 'prize.secondLine',
  tombala: 'prize.tombala',
};

/** 1–90 in rows of ten; drawn numbers lit, the latest one highlighted. */
function NumberBoard({ drawn }: { drawn: readonly number[] }) {
  const set = new Set(drawn);
  const last = drawn.at(-1);
  return (
    <ol className="grid h-full grid-cols-10 grid-rows-9 gap-1.5" data-testid="tombala-board">
      {Array.from({ length: TOMBALA_MAX_NUMBER }, (_, i) => i + 1).map((number) => {
        const isDrawn = set.has(number);
        return (
          <li
            key={number}
            data-testid="tombala-board-cell"
            data-number={number}
            data-drawn={isDrawn}
            className={`grid place-items-center rounded-xl text-[28px] font-bold tabular-nums transition-colors duration-500 ${
              number === last
                ? 'bg-accent text-canvas'
                : isDrawn
                  ? 'bg-brand text-ink'
                  : 'bg-surface text-muted'
            }`}
          >
            {number}
          </li>
        );
      })}
    </ol>
  );
}

function DrawButton({
  label,
  sendHostInput,
  describe,
}: {
  label: string;
  sendHostInput: HostRendererProps<TombalaHostView>['sendHostInput'];
  describe: (code: string) => string;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-4">
      {error && <span className="text-danger text-[26px]">{error}</span>}
      <button
        type="button"
        data-testid="tombala-draw"
        disabled={sending}
        onClick={() => {
          setSending(true);
          setError(null);
          void sendHostInput({ type: 'draw' }).then((outcome) => {
            setSending(false);
            if (!outcome.ok) setError(describe(outcome.code));
          });
        }}
        className="bg-accent text-canvas rounded-full px-10 py-4 text-[34px] font-extrabold transition-transform active:scale-95 disabled:opacity-50"
      >
        {label}
      </button>
    </span>
  );
}

/** TV screen of Tombala (SPEC §7.10): the drawn number, the 1–90 board and the prizes. */
export function TombalaHost({
  view,
  players,
  t,
  Avatar,
  paused,
  sendHostInput,
}: HostRendererProps<TombalaHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const hasVoice = useTurkishVoice();
  const [speak, setSpeak] = useState(true);
  const drawn = 'drawn' in view ? view.drawn : [];
  const last = drawn.at(-1) ?? null;
  useAnnounce(view.phase === 'DRAW' && !paused ? last : null, speak && hasVoice);

  const canDraw = !paused && (view.phase === 'INTRO' || view.phase === 'DRAW');
  const describe = (code: string) =>
    t(`hostError.${code === 'ROUND_CLOSED' ? 'closed' : 'failed'}`);

  return (
    <div
      className="relative flex h-full flex-col gap-6 overflow-hidden"
      data-testid="tombala-host"
      data-phase={view.phase}
      data-drawn-count={drawn.length}
    >
      <div className="flex items-center justify-between gap-8">
        <h2 className="font-display text-[56px] font-extrabold">{view.title}</h2>
        <div className="flex items-center gap-4">
          {hasVoice && (
            <button
              type="button"
              data-testid="tombala-speech"
              aria-pressed={speak}
              onClick={() => {
                setSpeak(!speak);
              }}
              className="border-line rounded-full border px-6 py-3 text-[26px]"
            >
              {speak ? t('speechOn') : t('speechOff')}
            </button>
          )}
          {canDraw && (
            <DrawButton
              label={view.phase !== 'INTRO' && view.drawMode === 'auto' ? t('drawNow') : t('draw')}
              sendHostInput={sendHostInput}
              describe={describe}
            />
          )}
        </div>
      </div>

      {view.phase === 'SKIPPED' && (
        <p className="text-warning text-[48px] font-bold" data-testid="tombala-skipped">
          {t('notEnoughPlayers', { min: view.minPlayers })}
        </p>
      )}

      {view.phase === 'INTRO' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-[64px] font-extrabold">{t('cardsDealt')}</p>
          <p className="text-muted text-[40px]">
            {view.drawMode === 'auto' ? t('introAuto') : t('introManual')}
          </p>
        </div>
      )}

      {(view.phase === 'DRAW' || view.phase === 'CLAIM' || view.phase === 'REVEAL') && (
        <>
          {/* Fits the stage with the "next" button below it (about 720 px tall). */}
          <div className="flex min-h-0 flex-1 gap-10">
            <div className="flex w-[380px] shrink-0 flex-col items-center gap-4">
              <div
                data-testid="tombala-last"
                data-number={last ?? ''}
                className="bg-accent text-canvas grid size-[280px] place-items-center rounded-full text-[160px] leading-none font-extrabold tabular-nums shadow-2xl"
              >
                {last ?? '–'}
              </div>
              <p className="text-muted text-[32px]">{t('remaining', { count: view.remaining })}</p>
              <ol className="flex gap-3" aria-label={t('previous')}>
                {drawn
                  .slice(-6, -1)
                  .reverse()
                  .map((number) => (
                    <li
                      key={number}
                      className="bg-surface-raised grid size-[56px] place-items-center rounded-full text-[26px] font-bold tabular-nums"
                    >
                      {number}
                    </li>
                  ))}
              </ol>
            </div>
            <div className="min-h-0 flex-1">
              <NumberBoard drawn={drawn} />
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-6">
            {view.prizes.map((status) => (
              <li
                key={status.prize}
                data-testid="tombala-prize"
                data-prize={status.prize}
                data-winners={status.winners.join(',')}
                className={`flex min-h-[96px] flex-col gap-1 rounded-3xl px-6 py-3 text-[26px] ${
                  status.winners.length > 0 ? 'bg-success/20' : 'bg-surface'
                }`}
              >
                <span className="font-display text-[32px] font-extrabold">
                  {t(PRIZE_KEY[status.prize])}
                </span>
                {status.winners.length > 0 ? (
                  <Winners ids={status.winners} byId={byId} Avatar={Avatar} size={40} />
                ) : (
                  <span className="text-muted">{t('open')}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {view.phase === 'CLAIM' && (
        <ClaimBanner
          prize={view.claim.prize}
          winners={view.claim.winners}
          byId={byId}
          Avatar={Avatar}
          t={t}
        />
      )}
    </div>
  );
}

function ClaimBanner({
  prize,
  winners,
  byId,
  Avatar,
  t,
}: {
  prize: TombalaPrize;
  winners: readonly string[];
  byId: Map<string, RendererPlayer>;
  Avatar: ComponentType<{ avatar: string; color: string; size: number }>;
  t: HostRendererProps<TombalaHostView>['t'];
}) {
  return (
    <div
      data-testid="tombala-claim-banner"
      data-prize={prize}
      className="bg-canvas/85 absolute inset-0 flex flex-col items-center justify-center gap-10"
    >
      <p className="font-display text-accent text-[160px] leading-none font-extrabold">
        {t(prize === 'tombala' ? 'shoutTombala' : 'shoutLine')}
      </p>
      <p className="text-[44px] font-bold">{t(PRIZE_KEY[prize])}</p>
      <span className="text-[44px]">
        <Winners ids={winners} byId={byId} Avatar={Avatar} size={96} />
      </span>
    </div>
  );
}
