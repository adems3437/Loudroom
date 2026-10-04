/**
 * Parallel turns under one phase clock (e.g. a tournament's duels): every actor moves once per
 * step; the step ends when nobody is left waiting (or the clock runs out and bots move).
 */
export interface Lockstep {
  /** Who still has to act in this step. */
  waiting: string[];
}

export function startStep(actors: readonly string[]): Lockstep {
  return { waiting: [...new Set(actors)] };
}

export function acted(step: Lockstep, actor: string): Lockstep {
  return { waiting: step.waiting.filter((id) => id !== actor) };
}

export const isWaiting = (step: Lockstep, actor: string) => step.waiting.includes(actor);

export const stepDone = (step: Lockstep) => step.waiting.length === 0;
