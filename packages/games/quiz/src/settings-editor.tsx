'use client';

import {
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { QuizSettings } from './schema.js';

/** Per-round quiz settings in the pack editor. The time limit is a field of the round itself. */
export function QuizSettingsEditor({ value, onChange, t }: SettingsEditorProps<QuizSettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.baseScore')}
        testId="quiz-settings-base-score"
        value={value.baseScore}
        min={0}
        max={10_000}
        step={100}
        onChange={(baseScore) => {
          onChange({ ...value, baseScore });
        }}
      />
      <SettingNumber
        label={t('settings.streakStep')}
        hint={t('settings.streakStepHint', { from: value.streakBonus.fromStreak })}
        value={value.streakBonus.step}
        min={0}
        max={1_000}
        step={50}
        onChange={(step) => {
          onChange({ ...value, streakBonus: { ...value.streakBonus, step } });
        }}
      />
      <SettingToggle
        label={t('settings.allowAnswerChange')}
        hint={t('settings.allowAnswerChangeHint')}
        testId="quiz-settings-answer-change"
        checked={value.allowAnswerChange}
        onChange={(allowAnswerChange) => {
          onChange({ ...value, allowAnswerChange });
        }}
      />
    </SettingsGrid>
  );
}
