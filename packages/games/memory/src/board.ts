import type { Random } from '@loudroom/game-sdk';
import type { MemoryItem, MemorySettings, QuestionType } from './schema.js';

export interface Option {
  id: string;
  itemId: string | null;
  number: number | null;
}

export interface Question {
  type: QuestionType;
  /** The object to count ("how many"). */
  subjectId: string | null;
  options: Option[];
  correctOptionId: string;
}

export interface Board {
  /** Item ids by space, in display order (repeats allowed). */
  slots: string[];
  questions: Question[];
}

const OPTIONS = 4;
const TYPES: QuestionType[] = ['present', 'absent', 'count'];

/** Item ids sorted, then shuffled: the board never depends on the order the editor used. */
function shuffledIds(items: readonly MemoryItem[], random: Random): string[] {
  return random.shuffle(items.map((item) => item.id).sort());
}

function options(
  values: { itemId?: string | undefined; number?: number | undefined }[],
  correct: number,
  random: Random,
) {
  const list = values.map((value, index) => ({ value, correct: index === correct }));
  const shuffled = random.shuffle(list).map((entry, index) => ({
    option: {
      id: `o${index + 1}`,
      itemId: entry.value.itemId ?? null,
      number: entry.value.number ?? null,
    },
    correct: entry.correct,
  }));
  return {
    options: shuffled.map((entry) => entry.option),
    correctOptionId: shuffled.find((entry) => entry.correct)?.option.id ?? 'o1',
  };
}

/**
 * Builds the board and the questions for one round (SPEC §7.8: generated on the server from
 * the content set): `distinctCount` objects spread over `boardSize` spaces with repeats, and
 * "which was there", "which was not", "how many" questions — the same for everyone.
 */
export function buildBoard(
  items: readonly MemoryItem[],
  settings: Pick<MemorySettings, 'boardSize' | 'distinctCount' | 'questionCount'>,
  random: Random,
): Board {
  const ids = shuffledIds(items, random);
  // Room for three absent objects as options, and at least three shown ones.
  const distinct = Math.max(
    3,
    Math.min(settings.distinctCount, settings.boardSize, ids.length - 3),
  );
  const shown = ids.slice(0, distinct);
  const absent = ids.slice(distinct);
  const extra = Array.from(
    { length: Math.max(0, settings.boardSize - distinct) },
    () => shown[random.int(0, shown.length - 1)] ?? '',
  );
  const slots = random.shuffle([...shown, ...extra]);
  const counts = new Map<string, number>();
  for (const id of slots) counts.set(id, (counts.get(id) ?? 0) + 1);

  const pick = (list: readonly string[], count: number) => random.shuffle(list).slice(0, count);
  const order = random.shuffle(TYPES);
  const questions: Question[] = Array.from({ length: settings.questionCount }, (_, index) => {
    const type = order[index % order.length] ?? 'present';
    if (type === 'present') {
      const [right] = pick(shown, 1);
      const wrong = pick(absent, OPTIONS - 1);
      const built = options(
        [right, ...wrong].map((itemId) => ({ itemId })),
        0,
        random,
      );
      return { type, subjectId: null, ...built };
    }
    if (type === 'absent') {
      const [right] = pick(absent, 1);
      const wrong = pick(shown, OPTIONS - 1);
      const built = options(
        [right, ...wrong].map((itemId) => ({ itemId })),
        0,
        random,
      );
      return { type, subjectId: null, ...built };
    }
    const subject = shown[random.int(0, shown.length - 1)] ?? '';
    const count = counts.get(subject) ?? 1;
    // Four different counts around the right one, never below 1.
    const low = Math.max(1, count - random.int(0, OPTIONS - 1));
    const numbers = Array.from({ length: OPTIONS }, (_, offset) => low + offset);
    const built = options(
      numbers.map((number) => ({ number })),
      numbers.indexOf(count),
      random,
    );
    return { type, subjectId: subject, ...built };
  });
  return { slots, questions };
}
