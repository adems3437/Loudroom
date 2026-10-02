'use client';

import { Countdown, type PlayerRendererProps } from '@loudroom/game-sdk/client';
import { useCallback, useRef, useState } from 'react';
import { DrawingCanvas, type DrawingCanvasHandle, type Pen } from './drawing-canvas.js';
import {
  DRAWING_MAX_WORD,
  ERASER_COLOR,
  PALETTE,
  PEN_SIZES,
  type DrawingChunk,
  type DrawingPlayerView,
} from './schema.js';
import { LetterSlots } from './slots.js';

type Drawer = Extract<DrawingPlayerView, { phase: 'DRAWING'; role: 'drawer' }>;
type Guesser = Extract<DrawingPlayerView, { phase: 'DRAWING'; role: 'guesser' }>;

const toolButton =
  'grid min-h-12 min-w-12 place-items-center rounded-xl bg-surface-raised px-3 font-semibold active:scale-95';

/** The drawer's phone: the canvas, pens and the word (SPEC §7.5). */
function DrawerPad({
  view,
  phase,
  serverNow,
  stream,
  t,
}: Pick<PlayerRendererProps<Drawer>, 'view' | 'phase' | 'serverNow' | 'stream' | 't'>) {
  const [pen, setPen] = useState<Pen>({ color: 0, size: 1 });
  const [full, setFull] = useState(false);
  const canvas = useRef<DrawingCanvasHandle>(null);
  const send = useCallback(
    (chunk: DrawingChunk) => {
      stream.send(chunk);
    },
    [stream],
  );
  const markFull = useCallback(() => {
    setFull(true);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-3" data-testid="drawing-player-drawer">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-2xl font-extrabold" data-testid="drawing-secret-word">
          {view.word}
        </p>
        <Countdown
          endsAt={phase?.endsAt ?? null}
          durationMs={phase?.durationMs ?? null}
          serverNow={serverNow}
          size={56}
          label={t('timeLeft')}
        />
      </div>
      <DrawingCanvas
        ref={canvas}
        stream={stream}
        pen={pen}
        onChunk={send}
        onFull={markFull}
        className="rounded-2xl"
        testId="drawing-pad"
      />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('colors')}>
        {PALETTE.map((color, index) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={pen.color === index}
            aria-label={index === ERASER_COLOR ? t('eraser') : t('color', { number: index + 1 })}
            data-testid="drawing-color"
            className={`size-10 rounded-full border-2 ${
              pen.color === index ? 'border-ink ring-ink ring-2' : 'border-line'
            }`}
            style={{ backgroundColor: color }}
            onClick={() => {
              setPen({ ...pen, color: index });
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PEN_SIZES.map((size, index) => (
          <button
            key={size}
            type="button"
            aria-pressed={pen.size === index}
            aria-label={t('penSize', { number: index + 1 })}
            className={`${toolButton} ${pen.size === index ? 'ring-brand ring-2' : ''}`}
            onClick={() => {
              setPen({ ...pen, size: index });
            }}
          >
            <span
              className="bg-ink block rounded-full"
              style={{ width: size / 1.5 + 4, height: size / 1.5 + 4 }}
            />
          </button>
        ))}
        <button
          type="button"
          data-testid="drawing-undo"
          className={toolButton}
          onClick={() => canvas.current?.undo()}
        >
          {t('undo')}
        </button>
        <button
          type="button"
          data-testid="drawing-clear"
          className={toolButton}
          onClick={() => canvas.current?.clear()}
        >
          {t('clear')}
        </button>
      </div>
      <p className="text-muted text-sm">
        {t('solvedCount', { count: view.solvedCount, total: view.guesserCount })}
      </p>
      {full && (
        <p role="alert" className="bg-warning/15 text-warning rounded-xl px-4 py-3">
          {t('streamFull')}
        </p>
      )}
    </div>
  );
}

/** A guesser's phone: type guesses; "close" hints are shown only here. */
function GuessForm({
  view,
  players,
  submit,
  haptic,
  describeError,
  t,
}: Pick<
  PlayerRendererProps<Guesser>,
  'view' | 'players' | 'submit' | 'haptic' | 'describeError' | 't'
>) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawer = players.find((player) => player.id === view.drawerId);

  if (view.solved) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="drawing-player-solved"
      >
        <p className="font-display text-success text-4xl font-extrabold">{t('youGotIt')}</p>
        <p className="text-muted">{t('waitForOthers')}</p>
      </div>
    );
  }

  const send = async () => {
    if (!text.trim() || sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ type: 'guess', text });
    setSending(false);
    if (outcome.ok) setText('');
    else setError(describeError(outcome.code));
  };

  return (
    <form
      className="flex flex-1 flex-col gap-3"
      data-testid="drawing-player-guess"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="text-muted">{t('guessHint', { nickname: drawer?.nickname ?? '?' })}</p>
      {view.slots && <LetterSlots slots={view.slots} size={22} />}
      <input
        data-testid="drawing-input"
        className="bg-surface border-line focus:border-brand min-h-touch rounded-3xl border-2 px-5 py-4 text-2xl font-bold focus:outline-none"
        maxLength={DRAWING_MAX_WORD + 10}
        autoComplete="off"
        autoCapitalize="none"
        enterKeyHint="send"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <button
        type="submit"
        data-testid="drawing-submit"
        disabled={!text.trim() || sending}
        className="bg-brand min-h-touch rounded-3xl px-6 py-4 text-2xl font-extrabold text-white active:scale-95 disabled:opacity-40"
      >
        {t('send')}
      </button>
      {error && (
        <p
          role="alert"
          data-testid="drawing-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2" data-testid="drawing-my-guesses">
        {[...view.guesses].reverse().map((guess, index) => (
          <li
            key={`${index}-${guess.text}`}
            data-testid="drawing-my-guess"
            data-result={guess.result}
            className={`flex justify-between rounded-xl px-4 py-2 ${
              guess.result === 'close' ? 'bg-warning/20 text-warning' : 'bg-surface text-muted'
            }`}
          >
            <span>{guess.text}</span>
            <span className="font-semibold">
              {guess.result === 'close' ? t('close') : t('wrong')}
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}

/** Phone controller for a drawing round. */
export function DrawingPlayer(props: PlayerRendererProps<DrawingPlayerView>) {
  const { view, players, t } = props;

  if (view.phase === 'SKIPPED') {
    return (
      <p
        className="text-muted flex flex-1 items-center justify-center text-center"
        data-testid="drawing-player-skipped"
      >
        {t('notEnoughPlayers', { min: view.minPlayers })}
      </p>
    );
  }

  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="drawing-player-intro"
      >
        {view.role === 'drawer' ? (
          <>
            <p className="text-muted">{t('yourTurn')}</p>
            <p className="font-display text-4xl font-extrabold" data-testid="drawing-secret-word">
              {view.word}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-bold">
              {t('isDrawing', {
                nickname: players.find((player) => player.id === view.drawerId)?.nickname ?? '?',
              })}
            </p>
            {view.slots && <LetterSlots slots={view.slots} size={22} />}
          </>
        )}
      </div>
    );
  }

  if (view.phase === 'DRAWING') {
    return view.role === 'drawer' ? (
      <DrawerPad
        view={view}
        phase={props.phase}
        serverNow={props.serverNow}
        stream={props.stream}
        t={t}
      />
    ) : (
      <GuessForm
        view={view}
        players={players}
        submit={props.submit}
        haptic={props.haptic}
        describeError={props.describeError}
        t={t}
      />
    );
  }

  const verdict =
    view.role === 'drawer'
      ? t('drawerResult', { count: view.solvedCount })
      : view.solved === true
        ? t('solvedAs', { rank: view.rank ?? 0 })
        : view.solved === false
          ? t('notSolved')
          : t('noGuess');
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
      data-testid="drawing-player-reveal"
      data-correct={String(view.solved)}
    >
      <p className="text-muted">{t('theWordWas')}</p>
      <p className="font-display text-4xl font-extrabold">{view.word}</p>
      <p
        className={`rounded-3xl px-6 py-4 text-2xl font-bold ${
          view.solved ? 'bg-success text-canvas' : 'bg-surface-raised'
        }`}
      >
        {verdict}
      </p>
    </div>
  );
}
