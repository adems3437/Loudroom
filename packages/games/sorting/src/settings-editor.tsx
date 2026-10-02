'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { SortingSettings } from './schema.js';

/** Per-round sorting settings: scoring mode and whether a sent order may change. */
export function SortingSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<SortingSettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.baseScore')}
        value={value.baseScore}
        min={0}
        max={10_000}
        step={100}
        onChange={(baseScore) => {
          onChange({ ...value, baseScore });
        }}
      />
      <SettingChoice
        label={t('settings.scoring')}
        testId="sorting-settings-scoring"
        value={value.scoring}
        options={[
          { value: 'position', label: t('settings.scoringPosition') },
          { value: 'kendall', label: t('settings.scoringKendall') },
        ]}
        onChange={(scoring) => {
          onChange({ ...value, scoring });
        }}
      />
      <SettingToggle
        label={t('settings.allowAnswerChange')}
        hint={t('settings.allowAnswerChangeHint')}
        checked={value.allowAnswerChange}
        onChange={(allowAnswerChange) => {
          onChange({ ...value, allowAnswerChange });
        }}
      />
    </SettingsGrid>
  );
}
