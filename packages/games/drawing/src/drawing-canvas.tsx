'use client';

import type { RoundStream } from '@loudroom/game-sdk/client';
import { useCallback, useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { CanvasController, type Pen } from './canvas-controller.js';
import { CANVAS_ASPECT, type DrawingChunk } from './schema.js';

export type { Pen } from './canvas-controller.js';

/** Chunks leave the phone every 50 ms while drawing (SPEC §7.5). */
const FLUSH_MS = 50;

export interface DrawingCanvasHandle {
  undo: () => void;
  clear: () => void;
}

/**
 * The 4:3 drawing, rebuilt from the round's stream: the TV shows it read-only; on the
 * drawer's phone (`pen` + `onChunk`) pointer input draws locally at once and leaves as
 * chunks every 50 ms. `data-strokes` exposes the stroke count (tests).
 */
export function DrawingCanvas({
  stream,
  pen,
  onChunk,
  onFull,
  hidden = false,
  className = '',
  testId,
  ref,
}: {
  stream: RoundStream;
  pen?: Pen;
  onChunk?: (chunk: DrawingChunk) => void;
  onFull?: () => void;
  hidden?: boolean;
  className?: string;
  testId?: string;
  ref?: Ref<DrawingCanvasHandle>;
}) {
  const [controller] = useState(() => new CanvasController());
  const drawable = pen !== undefined && onChunk !== undefined;

  useEffect(() => {
    controller.configure({ pen, send: onChunk, onFull });
  }, [controller, pen, onChunk, onFull]);

  useEffect(
    () =>
      stream.subscribe((update) => {
        controller.receive(update);
      }),
    [controller, stream],
  );

  // While this canvas can draw, queued pieces leave every 50 ms.
  useEffect(() => {
    if (!drawable) return;
    const timer = setInterval(() => {
      controller.flush();
    }, FLUSH_MS);
    return () => {
      clearInterval(timer);
      controller.flush();
    };
  }, [controller, drawable]);

  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      controller.attach(canvas);
      if (!canvas) return;
      // Canvas pixels follow its size on screen (and the device pixel ratio).
      const observer = new ResizeObserver(() => {
        controller.resize();
      });
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        controller.attach(null);
      };
    },
    [controller],
  );

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        controller.undo();
      },
      clear: () => {
        controller.clear();
      },
    }),
    [controller],
  );

  return (
    <canvas
      ref={attach}
      data-testid={testId}
      data-strokes="0"
      className={`block w-full bg-white ${drawable ? 'cursor-crosshair touch-none' : ''} ${
        hidden ? 'blur-2xl' : ''
      } ${className}`}
      style={{ aspectRatio: String(CANVAS_ASPECT) }}
      {...(drawable
        ? {
            onPointerDown: (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              controller.pointerDown(
                CanvasController.unitsAt(event.currentTarget, event.clientX, event.clientY),
              );
            },
            onPointerMove: (event) => {
              controller.pointerMove(
                CanvasController.unitsAt(event.currentTarget, event.clientX, event.clientY),
              );
            },
            onPointerUp: () => {
              controller.pointerUp();
            },
            onPointerCancel: () => {
              controller.pointerUp();
            },
          }
        : {})}
    />
  );
}
