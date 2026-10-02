'use client';

import {
  ContainedImage,
  mediaUrl,
  type ImagePoint,
  type PlayerRendererProps,
} from '@loudroom/game-sdk/client';
import { useState, type ReactNode } from 'react';
import { At, TargetDot, TargetRing } from './marks.js';
import type { ImageLocationPlayerView, ImageView } from './schema.js';

function Pin() {
  return (
    <>
      <span className="bg-brand block size-7 rounded-full border-4 border-white shadow-lg" />
      <span className="block h-3 w-1 rounded-full bg-white" />
    </>
  );
}

/** The image as big as the phone allows: full width, at most 60 % of the screen height. */
function PhoneImage({
  image,
  alt,
  onPick,
  children,
  testId,
}: {
  image: ImageView;
  alt: string;
  onPick?: (point: ImagePoint) => void;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="w-full"
      style={{ aspectRatio: `${image.width} / ${image.height}`, maxHeight: '60dvh' }}
    >
      <ContainedImage
        src={mediaUrl(image.mediaId)}
        alt={alt}
        natural={image}
        testId={testId}
        className="bg-surface h-full w-full rounded-2xl"
        {...(onPick ? { onPick } : {})}
      >
        {children}
      </ContainedImage>
    </div>
  );
}

/** Phone controller (SPEC §7.4): tap to drop the pin, tap again to move it, then send. */
export function ImageLocationPlayer({
  view,
  submit,
  haptic,
  describeError,
  t,
}: PlayerRendererProps<ImageLocationPlayerView>) {
  const [pin, setPin] = useState<ImagePoint | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view.phase === 'INTRO') {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
        data-testid="location-player-intro"
      >
        <p className="text-muted">{t('lookAtScreen')}</p>
        <p className="font-display text-2xl font-bold">{view.question}</p>
      </div>
    );
  }

  if (view.phase === 'REVEAL') {
    const verdict =
      view.correct === null
        ? t('noPin')
        : view.correct
          ? t('onTarget')
          : t('rankOf', {
              rank: view.rank ?? 0,
              total: view.answeredCount,
            });
    return (
      <div
        className="flex flex-1 flex-col gap-4"
        data-testid="location-player-reveal"
        data-correct={String(view.correct)}
      >
        <p
          className={`font-display rounded-3xl px-6 py-5 text-center text-3xl font-extrabold ${
            view.correct ? 'bg-success text-canvas' : 'bg-surface-raised'
          }`}
        >
          {verdict}
        </p>
        <PhoneImage image={view.image} alt={t('image')} testId="location-image">
          <TargetRing target={view.target} radius={view.radius} image={view.image} />
          {view.pin && (
            <At point={view.pin} anchor="bottom">
              <Pin />
            </At>
          )}
          <At point={view.target}>
            <TargetDot size={22} />
          </At>
        </PhoneImage>
      </div>
    );
  }

  const sent = view.pin;
  const send = async () => {
    if (!pin || sending) return;
    haptic();
    setSending(true);
    setError(null);
    const outcome = await submit({ point: pin });
    setSending(false);
    if (!outcome.ok) setError(describeError(outcome.code));
  };

  return (
    <div
      className="flex flex-1 flex-col gap-3"
      data-testid={sent ? 'location-player-locked' : undefined}
    >
      <p className="font-display text-lg leading-tight font-bold">{view.question}</p>
      <PhoneImage
        image={view.image}
        alt={t('image')}
        testId="location-image"
        {...(sent
          ? {}
          : {
              onPick: (point: ImagePoint) => {
                haptic();
                setPin(point);
              },
            })}
      >
        {(sent ?? pin) && (
          <At point={sent ?? pin ?? { x: 0, y: 0 }} anchor="bottom" testId="location-my-pin">
            <Pin />
          </At>
        )}
      </PhoneImage>
      {sent ? (
        <p className="text-muted text-center">{t('pinLocked')}</p>
      ) : (
        <>
          <p className="text-muted text-center text-sm">{pin ? t('moveHint') : t('tapHint')}</p>
          <button
            type="button"
            data-testid="location-submit"
            disabled={!pin || sending}
            onClick={() => void send()}
            className="bg-brand min-h-touch rounded-3xl px-6 py-4 text-2xl font-extrabold text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            {t('send')}
          </button>
        </>
      )}
      {error && (
        <p
          role="alert"
          data-testid="location-error"
          className="bg-danger/15 text-danger rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
