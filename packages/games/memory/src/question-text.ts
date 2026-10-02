import type { Translate } from '@loudroom/game-sdk/client';
import type { QuestionView } from './schema.js';

export function questionText(question: QuestionView, t: Translate): string {
  if (question.type === 'present') return t('questionPresent');
  if (question.type === 'absent') return t('questionAbsent');
  return t('questionCount', { label: question.subject?.label ?? '?' });
}
