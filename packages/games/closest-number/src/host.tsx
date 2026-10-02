'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { formatValue } from './format.js';
import { layoutNumberLine } from './number-line.js';
import type { ClosestNumberHostView } from './schema.js';

type Reveal = Extract<ClosestNumberHostView, { phase: 'REVEAL' }>;

const AVATAR = 76;
const LEVEL_HEIGHT = 84;

/** The reveal's number line: the answer, every guess as an avatar, far-off ones at the edges. */
function NumberLine({
  view,
  players,
  Avatar,
}: Pick<HostRendererProps<Reveal>, 'view' | 'players' | 'Avatar'>) {
  const { answerX, placed } = layoutNumberLine(view.answer, view.zeroPointDistance, view.guesses);
  const byId = new Map(players.map((player) => [player.id, player]));
  const levels = Math.max(1, ...placed.map((entry) => entry.level + 1));

  return (
    <div
      className="relative mx-[60px] shrink-0"
      style={{ height: levels * LEVEL_HEIGHT + 120 }}
      data-testid="closest-number-line"
    >
      <div className="bg-line absolute right-0 bottom-[60px] left-0 h-2 rounded-full" />
      <span
        className="bg-success absolute bottom-[40px] h-[100px] w-2 -translate-x-1/2 rounded-full"
        style={{ left: `${answerX * 100}%` }}
        data-testid="closest-answer-marker"
      />
      <span
        className="bg-success text-canvas absolute bottom-0 -translate-x-1/2 rounded-full px-4 py-1 text-[28px] font-extrabold whitespace-nowrap tabular-nums"
        style={{ left: `${Math.min(0.9, Math.max(0.1, answerX)) * 100}%` }}
      >
        {formatValue(view.answer, view.displayFormat, view.unit)}
      </span>
      {placed.map(({ item, x, level, offscale }) => {
        const player = byId.get(item.playerId);
        if (!player) return null;
        return (
          <div
            key={item.playerId}
            data-testid="closest-guess"
            data-player-id={item.playerId}
            data-offscale={offscale ?? undefined}
            className="absolute flex -translate-x-1/2 items-center transition-[left] duration-700"
            style={{ left: `${x * 100}%`, bottom: 76 + level * LEVEL_HEIGHT }}
          >
            {offscale === 'left' && <span className="text-muted text-[40px]">◀</span>}
            <span className={`rounded-full ${item.closest ? 'ring-accent ring-4' : ''}`}>
              <Avatar avatar={player.avatar} color={player.color} size={AVATAR} />
            </span>
            {offscale === 'right' && <span className="text-muted text-[40px]">▶</span>}
          </div>
        );
      })}
    </div>
  );
}

/** TV screen of a Closest Number question (SPEC §7.2). */
export function ClosestNumberHost({
  view,
  phase,
  serverNow,
  players,
  t,
  Avatar,
}: HostRendererProps<ClosestNumberHostView>) {
  const byId = new Map(players.map((player) => [player.id, player]));

  return (
    <div className="flex h-full flex-col gap-8" data-testid="closest-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="closest-question"
          className={`font-display leading-tight font-extrabold ${
            view.phase === 'REVEAL' ? 'text-[52px]' : 'text-[80px]'
          }`}
        >
          {view.question}
        </h2>
        {view.phase === 'ANSWERING' && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={168}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase !== 'REVEAL' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <p className="text-muted text-[44px]">
            {view.unit
              ? t('answerIn', { unit: view.unit })
              : view.displayFormat === 'year'
                ? t('answerYear')
                : t('answerNumber')}
          </p>
          <p className="text-muted text-[36px]" data-testid="closest-answered">
            {view.phase === 'INTRO'
              ? t('getReady')
              : t('answered', { count: view.answeredCount, total: view.playerCount })}
          </p>
        </div>
      )}

      {view.phase === 'REVEAL' && (
        <>
          <p className="text-[36px]">
            {t('correctAnswerIs')}{' '}
            <span
              data-testid="closest-answer"
              className="font-display text-success text-[96px] font-extrabold tabular-nums"
            >
              {formatValue(view.answer, view.displayFormat, view.unit)}
            </span>
          </p>
          <div className="flex flex-1 flex-col justify-end gap-8">
            {view.guesses.length > 0 ? (
              <NumberLine view={view} players={players} Avatar={Avatar} />
            ) : (
              <p className="text-muted text-[40px]">{t('noGuesses')}</p>
            )}
            <ol className="grid grid-cols-4 gap-4">
              {view.guesses.slice(0, 8).map((guess, index) => {
                const player = byId.get(guess.playerId);
                return (
                  <li
                    key={guess.playerId}
                    data-testid="closest-ranking-row"
                    className={`flex items-center gap-4 rounded-3xl px-5 py-3 ${
                      guess.closest ? 'bg-accent text-canvas' : 'bg-surface'
                    }`}
                  >
                    <span className="text-[32px] font-extrabold tabular-nums">{index + 1}.</span>
                    {player && <Avatar avatar={player.avatar} color={player.color} size={52} />}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[28px] font-semibold">
                        {player?.nickname ?? '?'}
                      </span>
                      <span className="text-[30px] font-bold tabular-nums">
                        {formatValue(guess.value, view.displayFormat, view.unit)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
