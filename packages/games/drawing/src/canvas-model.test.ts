import { describe, expect, it } from 'vitest';
import { DrawingModel } from './canvas-model.js';
import { chunkCost } from './schema.js';

describe('DrawingModel', () => {
  it('continues a stroke across chunks and reports what grew', () => {
    const model = new DrawingModel();
    model.apply({ ops: [{ t: 'line', s: 0, c: 0, w: 1, p: [10, 10, 20, 20] }] });
    const change = model.apply({ ops: [{ t: 'line', s: 0, c: 0, w: 1, p: [30, 30] }] });
    expect(change.redraw).toBe(false);
    expect(change.grown[0]?.from).toBe(2);
    expect(model.list()).toEqual([{ id: 0, color: 0, size: 1, points: [10, 10, 20, 20, 30, 30] }]);
  });

  it('undoes a whole stroke and clears everything', () => {
    const model = new DrawingModel();
    model.apply({
      ops: [
        { t: 'line', s: 0, c: 0, w: 0, p: [1, 1] },
        { t: 'line', s: 1, c: 2, w: 2, p: [5, 5] },
      ],
    });
    expect(model.lastStrokeId()).toBe(1);
    expect(model.apply({ ops: [{ t: 'undo', s: 1 }] }).redraw).toBe(true);
    expect(model.list().map((stroke) => stroke.id)).toEqual([0]);
    expect(model.nextStrokeId()).toBe(1);
    expect(model.apply({ ops: [{ t: 'undo', s: 7 }] }).redraw).toBe(false);
    model.apply({ ops: [{ t: 'clear' }] });
    expect(model.strokeCount).toBe(0);
  });

  it('counts the cost of a chunk by its points', () => {
    expect(
      chunkCost({ ops: [{ t: 'line', s: 0, c: 0, w: 0, p: [1, 1, 2, 2] }, { t: 'clear' }] }),
    ).toBe(4);
  });
});
