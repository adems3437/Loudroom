import { CANVAS_UNITS, ERASER_COLOR, PALETTE, PEN_SIZES, type DrawingChunk } from './schema.js';

export interface Stroke {
  id: number;
  color: number;
  size: number;
  /** x, y, x, y, … in canvas units. */
  points: number[];
}

/** What changed: either everything (undo, clear) or new points at the end of strokes. */
export interface ModelChange {
  redraw: boolean;
  /** Strokes that grew, with the index of their first new point (in x, y pairs). */
  grown: { stroke: Stroke; from: number }[];
}

/**
 * The drawing as the strokes received so far. Both the drawer's phone and the TV apply the
 * same chunks, in order, so they show the same picture.
 */
export class DrawingModel {
  private readonly strokes = new Map<number, Stroke>();
  private order: number[] = [];

  apply(chunk: DrawingChunk): ModelChange {
    const change: ModelChange = { redraw: false, grown: [] };
    for (const op of chunk.ops) {
      if (op.t === 'clear') {
        this.strokes.clear();
        this.order = [];
        change.redraw = true;
      } else if (op.t === 'undo') {
        if (this.strokes.delete(op.s)) {
          this.order = this.order.filter((id) => id !== op.s);
          change.redraw = true;
        }
      } else {
        let stroke = this.strokes.get(op.s);
        if (!stroke) {
          stroke = { id: op.s, color: op.c, size: op.w, points: [] };
          this.strokes.set(op.s, stroke);
          this.order.push(op.s);
        }
        const from = stroke.points.length / 2;
        stroke.points.push(...op.p);
        change.grown.push({ stroke, from });
      }
    }
    return change;
  }

  list(): Stroke[] {
    return this.order.flatMap((id) => this.strokes.get(id) ?? []);
  }

  lastStrokeId(): number | null {
    return this.order.at(-1) ?? null;
  }

  /** An id no stroke has used, for the next stroke. */
  nextStrokeId(): number {
    return Math.max(-1, ...this.strokes.keys(), ...this.order) + 1;
  }

  get strokeCount(): number {
    return this.order.length;
  }
}

function prepare(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number): void {
  ctx.strokeStyle = PALETTE[stroke.color] ?? PALETTE[0];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = ((PEN_SIZES[stroke.size] ?? PEN_SIZES[0]) / CANVAS_UNITS) * width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Draws a stroke's points from pair index `from` on (a few straight segments). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
  from = 0,
): void {
  const x = (i: number) => ((stroke.points[i * 2] ?? 0) / CANVAS_UNITS) * width;
  const y = (i: number) => ((stroke.points[i * 2 + 1] ?? 0) / CANVAS_UNITS) * height;
  const count = stroke.points.length / 2;
  prepare(ctx, stroke, width);
  if (count === 1) {
    ctx.beginPath();
    ctx.arc(x(0), y(0), ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const start = Math.max(0, from - 1);
  ctx.beginPath();
  ctx.moveTo(x(start), y(start));
  if (from === 0 && count > 2) {
    // A whole stroke is smoothed: quadratic curves through the midpoints.
    for (let i = 1; i < count - 1; i++) {
      ctx.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2);
    }
    ctx.lineTo(x(count - 1), y(count - 1));
  } else {
    for (let i = start + 1; i < count; i++) ctx.lineTo(x(i), y(i));
  }
  ctx.stroke();
}

/** The whole picture on a white canvas. */
export function drawAll(
  ctx: CanvasRenderingContext2D,
  model: DrawingModel,
  width: number,
  height: number,
): void {
  ctx.fillStyle = PALETTE[ERASER_COLOR];
  ctx.fillRect(0, 0, width, height);
  for (const stroke of model.list()) drawStroke(ctx, stroke, width, height);
}
