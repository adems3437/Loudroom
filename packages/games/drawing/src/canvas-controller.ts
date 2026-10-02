import type { StreamUpdate } from '@loudroom/game-sdk/client';
import { drawAll, drawStroke, DrawingModel } from './canvas-model.js';
import { CANVAS_UNITS, drawingChunkSchema, type DrawingChunk, type DrawingOp } from './schema.js';

/** Points closer than this (canvas units) to the previous one are dropped. */
const MIN_STEP = 2;
const MAX_LINE_VALUES = 128;
const MAX_OPS = 16;

export interface Pen {
  color: number;
  size: number;
}

export interface CanvasOptions {
  /** Set on the drawer's phone: pointer input draws with it. */
  pen?: Pen | undefined;
  /** Where outgoing chunks go (the round stream). */
  send?: ((chunk: DrawingChunk) => void) | undefined;
  onFull?: (() => void) | undefined;
}

/**
 * Everything behind one drawing canvas, outside React (chunks arrive ~20 times a second):
 * the model, painting, and on the drawer's phone the outgoing queue.
 */
export class CanvasController {
  private model = new DrawingModel();
  private canvas: HTMLCanvasElement | null = null;
  private readonly queue: DrawingOp[] = [];
  private stroke: { id: number; last: [number, number] } | null = null;
  private options: CanvasOptions = {};

  configure(options: CanvasOptions): void {
    this.options = options;
  }

  get drawable(): boolean {
    return this.options.pen !== undefined && this.options.send !== undefined;
  }

  attach(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
  }

  /** Matches the canvas pixels to its size on screen, then repaints. */
  resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    this.redraw();
  }

  receive(update: StreamUpdate): void {
    const chunks = update.chunks.flatMap((chunk) => {
      const parsed = drawingChunkSchema.safeParse(chunk);
      return parsed.success ? [parsed.data] : [];
    });
    if (update.reset) {
      this.model = new DrawingModel();
      for (const chunk of chunks) this.model.apply(chunk);
      this.redraw();
    } else {
      this.apply(chunks);
    }
    if (update.full) this.options.onFull?.();
  }

  /** Sends what is queued (called every 50 ms and when a stroke ends). */
  flush(): void {
    const ops = this.queue.splice(0, MAX_OPS);
    if (ops.length > 0) this.options.send?.({ ops });
  }

  undo(): void {
    const id = this.model.lastStrokeId();
    if (id !== null) this.emit({ t: 'undo', s: id });
  }

  clear(): void {
    this.emit({ t: 'clear' });
  }

  pointerDown(point: [number, number]): void {
    const pen = this.options.pen;
    if (!pen) return;
    const id = this.model.nextStrokeId();
    this.stroke = { id, last: point };
    this.emit({ t: 'line', s: id, c: pen.color, w: pen.size, p: point });
  }

  pointerMove(point: [number, number]): void {
    const stroke = this.stroke;
    const pen = this.options.pen;
    if (!stroke || !pen) return;
    const [lastX, lastY] = stroke.last;
    if (Math.hypot(point[0] - lastX, point[1] - lastY) < MIN_STEP) return;
    stroke.last = point;
    this.emit({ t: 'line', s: stroke.id, c: pen.color, w: pen.size, p: point });
  }

  pointerUp(): void {
    this.stroke = null;
    this.flush();
  }

  /** A pointer position on the canvas element in canvas units. */
  static unitsAt(element: Element, clientX: number, clientY: number): [number, number] {
    const rect = element.getBoundingClientRect();
    const clamp = (value: number) => Math.min(CANVAS_UNITS, Math.max(0, Math.round(value)));
    return [
      clamp(((clientX - rect.left) / rect.width) * CANVAS_UNITS),
      clamp(((clientY - rect.top) / rect.height) * CANVAS_UNITS),
    ];
  }

  private context() {
    const canvas = this.canvas;
    const ctx = canvas?.getContext('2d');
    return canvas && ctx ? { canvas, ctx } : null;
  }

  private redraw(): void {
    const target = this.context();
    if (!target) return;
    drawAll(target.ctx, this.model, target.canvas.width, target.canvas.height);
    target.canvas.dataset.strokes = String(this.model.strokeCount);
  }

  /** Applies chunks, painting only what is new unless something was taken away. */
  private apply(chunks: readonly DrawingChunk[]): void {
    const target = this.context();
    let repaint = false;
    for (const chunk of chunks) {
      const change = this.model.apply(chunk);
      if (change.redraw) repaint = true;
      else if (target && !repaint) {
        for (const { stroke, from } of change.grown) {
          drawStroke(target.ctx, stroke, target.canvas.width, target.canvas.height, from);
        }
      }
    }
    if (repaint) this.redraw();
    else if (target) target.canvas.dataset.strokes = String(this.model.strokeCount);
  }

  /** Draws an op locally at once and queues it for sending. */
  private emit(op: DrawingOp): void {
    this.apply([{ ops: [op] }]);
    const last = this.queue.at(-1);
    // Points of the same stroke join the last queued piece while it has room.
    if (
      op.t === 'line' &&
      last?.t === 'line' &&
      last.s === op.s &&
      last.p.length + op.p.length <= MAX_LINE_VALUES
    ) {
      last.p.push(...op.p);
    } else {
      this.queue.push(op.t === 'line' ? { ...op, p: [...op.p] } : op);
    }
  }
}
