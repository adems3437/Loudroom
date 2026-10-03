'use client';

import {
  Countdown,
  mediaUrl,
  OptionShape,
  optionStyle,
  type HostRendererProps,
} from '@loudroom/game-sdk/client';
import { QuestionVideo } from './question-video.js';
import type { QuizHostView } from './schema.js';

/** TV screen of a quiz question: question, clock, options; in REVEAL the answer and spread. */
export function QuizHost({ view, phase, paused, serverNow, t }: HostRendererProps<QuizHostView>) {
  const reveal = view.phase === 'REVEAL' ? view : null;
  const counts = new Map(reveal?.distribution.map((entry) => [entry.optionId, entry.count]));
  const maxCount = Math.max(1, ...counts.values());

  return (
    <div className="flex h-full flex-col gap-10" data-testid="quiz-host" data-phase={view.phase}>
      <div className="flex items-start justify-between gap-10">
        <h2
          data-testid="quiz-question"
          className={`font-display leading-tight font-extrabold ${
            view.phase === 'INTRO' ? 'text-[88px]' : 'text-[60px]'
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

      {view.media?.type === 'video' && view.phase === 'INTRO' && (
        <div className="min-h-0 flex-1">
          <QuestionVideo
            mediaId={view.media.mediaId}
            format={view.media.format}
            durationMs={view.media.durationMs}
            phase={phase}
            paused={paused}
            serverNow={serverNow}
            label={t('questionVideo')}
            unmuteLabel={t('soundOn')}
          />
        </div>
      )}

      {view.media?.type === 'image' && (
        <div className="flex min-h-0 flex-1 justify-center">
          <img
            data-testid="quiz-question-image"
            src={mediaUrl(view.media.mediaId)}
            alt={t('questionImage')}
            className={`h-full min-h-0 w-auto rounded-[32px] object-contain ${
              view.phase === 'INTRO' ? 'max-h-[620px]' : 'max-h-[360px]'
            }`}
          />
        </div>
      )}

      {view.phase !== 'INTRO' && (
        <ul
          className={`grid grid-cols-2 content-end gap-6 ${
            view.media?.type === 'image' ? 'shrink-0' : 'flex-1'
          }`}
        >
          {view.options.map((option) => {
            const style = optionStyle(option.slot);
            const isCorrect = reveal?.correctOptionId === option.id;
            const count = counts.get(option.id) ?? 0;
            return (
              <li
                key={option.id}
                data-testid="quiz-option"
                data-option-id={option.id}
                data-correct={reveal ? isCorrect : undefined}
                className={`relative flex items-center gap-6 overflow-hidden rounded-[32px] px-8 transition-[opacity,transform] duration-500 ${
                  view.media?.type === 'image' ? 'min-h-[120px] py-3' : 'min-h-[150px] py-6'
                } ${
                  reveal && !isCorrect ? 'scale-[0.97] opacity-35' : ''
                } ${isCorrect ? 'ring-ink ring-8' : ''}`}
                style={{ backgroundColor: style.color }}
              >
                <OptionShape slot={option.slot} size={64} />
                {option.mediaId && (
                  <img
                    src={mediaUrl(option.mediaId)}
                    alt=""
                    className="h-[110px] w-[150px] shrink-0 rounded-2xl bg-black/20 object-cover"
                  />
                )}
                <span className="flex-1 text-[44px] leading-tight font-bold text-white">
                  {option.text}
                </span>
                {reveal && (
                  <span className="flex items-end gap-4" aria-label={t('votes', { count })}>
                    <span className="text-[44px] font-extrabold text-white tabular-nums">
                      {count}
                    </span>
                    {/* Distribution bar, grows into place on reveal. */}
                    <span className="flex h-[110px] w-[36px] items-end rounded-full bg-black/20">
                      <span
                        className="w-full rounded-full bg-white transition-[height] duration-700 ease-out"
                        style={{ height: `${(count / maxCount) * 100}%` }}
                      />
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-muted text-[36px]" data-testid="quiz-answered">
        {view.phase === 'INTRO'
          ? t('getReady')
          : t('answered', { count: view.answeredCount, total: view.playerCount })}
      </p>
    </div>
  );
}
