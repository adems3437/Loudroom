'use client';

import { SettingNumber, SettingsGrid, type SettingsEditorProps } from '@loudroom/game-sdk/client';
import type { BluffSettings } from './schema.js';

/** Per-round Bluff settings. The writing time is the round's own time limit field. */
export function BluffSettingsEditor({ value, onChange, t }: SettingsEditorProps<BluffSettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.truthPoints')}
        value={value.truthPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(truthPoints) => {
          onChange({ ...value, truthPoints });
        }}
      />
      <SettingNumber
        label={t('settings.foolPoints')}
        hint={t('settings.foolPointsHint')}
        testId="bluff-settings-fool-points"
        value={value.foolPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(foolPoints) => {
          onChange({ ...value, foolPoints });
        }}
      />
      <SettingNumber
        label={t('settings.voteSeconds')}
        value={value.voteMs / 1000}
        min={5}
        max={120}
        onChange={(seconds) => {
          onChange({ ...value, voteMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingNumber
        label={t('settings.minOptions')}
        hint={t('settings.minOptionsHint')}
        value={value.minOptions}
        min={2}
        max={8}
        onChange={(minOptions) => {
          onChange({ ...value, minOptions });
        }}
      />
    </SettingsGrid>
  );
}
