import type { Outcome } from './schema.js';

/** Translation key for an attempt's outcome. */
export const outcomeKey: Record<Outcome, string> = {
  ok: 'outcome.ok',
  early: 'outcome.early',
  missed: 'outcome.missed',
  invalid: 'outcome.invalid',
  decoyTap: 'outcome.decoyTap',
  held: 'outcome.held',
};
