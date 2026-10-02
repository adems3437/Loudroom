'use client';

import { SettingNumber, SettingsGrid, type SettingsEditorProps } from '@loudroom/game-sdk/client';
import type { ReactionSettings } from './schema.js';

/** Per-round Reaction settings. */
export function ReactionSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<ReactionSettings>) {
  const number = (
    key: 'attempts' | 'maxReactionMs' | 'goodMs' | 'baseScore' | 'rankStep' | 'minScore',
    min: number,
    max: number,
    step = 1,
  ) => (
    <SettingNumber
      key={key}
      label={t(`settings.${key}`)}
      value={value[key]}
      min={min}
      max={max}
      step={step}
      testId={`reaction-settings-${key}`}
      onChange={(next) => {
        onChange({ ...value, [key]: next });
      }}
    />
  );
  return (
    <SettingsGrid>
      {number('attempts', 1, 7)}
      {number('maxReactionMs', 500, 5_000, 100)}
      {number('goodMs', 150, 2_000, 50)}
      {number('baseScore', 0, 10_000, 100)}
      {number('rankStep', 0, 5_000, 50)}
      {number('minScore', 0, 10_000, 50)}
      <SettingNumber
        label={t('settings.decoyRate')}
        hint={t('settings.decoyRateHint')}
        value={Math.round(value.decoyRate * 100)}
        min={0}
        max={100}
        step={5}
        onChange={(percent) => {
          onChange({ ...value, decoyRate: percent / 100 });
        }}
      />
    </SettingsGrid>
  );
}
