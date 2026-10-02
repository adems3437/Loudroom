'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { ClosestNumberSettings } from './schema.js';

/** Per-round Closest Number settings: scoring mode and how far off a guess may still score. */
export function ClosestNumberSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<ClosestNumberSettings>) {
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
        testId="closest-settings-scoring"
        value={value.scoring}
        options={[
          { value: 'relative', label: t('settings.scoringRelative') },
          { value: 'rank', label: t('settings.scoringRank') },
        ]}
        onChange={(scoring) => {
          onChange({ ...value, scoring });
        }}
      />
      <SettingNumber
        label={t('settings.maxRelativeError')}
        hint={t('settings.maxRelativeErrorHint')}
        value={Math.round(value.maxRelativeError * 100)}
        min={5}
        max={1_000}
        step={5}
        onChange={(percent) => {
          onChange({ ...value, maxRelativeError: percent / 100 });
        }}
      />
      <SettingNumber
        label={t('settings.maxYearError')}
        hint={t('settings.maxYearErrorHint')}
        value={value.maxYearError}
        min={1}
        max={1_000}
        onChange={(maxYearError) => {
          onChange({ ...value, maxYearError });
        }}
      />
    </SettingsGrid>
  );
}
