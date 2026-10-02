'use client';

import { Countdown, type HostRendererProps } from '@loudroom/game-sdk/client';
import { ItemCard } from './item-card.js';
import { questionText } from './question-text.js';
import type { ItemView, MemoryHostView } from './schema.js';

function Board({ board, size }: { board: readonly ItemView[]; size: number }) {
  const columns = Math.ceil(Math.sqrt(board.length));
  return (
    <ul
      className="grid flex-1 content-center justify-center gap-6"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${size * 1.6}px))` }}
      data-testid="memory-board"
    >
      {board.map((item, index) => (
        <li
          key={index}
          data-testid="memory-card"
          className="bg-surface flex items-center justify-center rounded-[28px] p-4"
        >
          <ItemCard item={item} size={size} />
        </li>
      ))}
    </ul>
  );
}

/** TV screen of Memory (SPEC §7.8): the board for a few seconds, then the answers. */
export function MemoryHost({ view, phase, serverNow, t }: HostRendererProps<MemoryHostView>) {
  return (
    <div className="flex h-full flex-col gap-6" data-testid="memory-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-8">
        <h2 className="font-display text-[56px] font-extrabold">{view.title}</h2>
        {(view.phase === 'SHOW' || view.phase === 'QUESTIONS') && (
          <Countdown
            endsAt={phase?.endsAt ?? null}
            durationMs={phase?.durationMs ?? null}
            serverNow={serverNow}
            size={140}
            label={t('timeLeft')}
          />
        )}
      </div>

      {view.phase === 'INTRO' && (
        <p className="font-display flex flex-1 items-center justify-center text-[96px] font-extrabold">
          {t('memorize')}
        </p>
      )}

      {view.phase === 'SHOW' && <Board board={view.board} size={120} />}

      {view.phase === 'QUESTIONS' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="font-display text-[72px] font-extrabold">{t('answerOnPhones')}</p>
          <p className="text-muted text-[36px]" data-testid="memory-finished">
            {t('finished', { count: view.finishedCount, total: view.playerCount })}
          </p>
        </div>
      )}

      {view.phase === 'REVEAL' && (
        <div className="flex min-h-0 flex-1 gap-10">
          <Board board={view.board} size={70} />
          <ol className="flex w-[760px] shrink-0 flex-col justify-center gap-4">
            {view.questions.map((question, index) => {
              const right = question.options.find((o) => o.id === question.correctOptionId);
              return (
                <li
                  key={index}
                  data-testid="memory-answer"
                  className="bg-surface flex items-center justify-between gap-4 rounded-3xl px-6 py-4"
                >
                  <span className="flex flex-col">
                    <span className="text-[28px]">{questionText(question, t)}</span>
                    <span className="text-muted text-[24px]">
                      {t('gotIt', { count: question.correctCount })}
                    </span>
                  </span>
                  <span className="text-success text-[40px] font-extrabold">
                    {right?.item ? <ItemCard item={right.item} size={56} /> : right?.number}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
