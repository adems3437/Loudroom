'use client';

import { SettingNumber, SettingsGrid, type SettingsEditorProps } from '@loudroom/game-sdk/client';
import type { ImageLocationSettings } from './schema.js';

/** Per-round Image Location settings; distances are edited in percent of the longer side. */
export function ImageLocationSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<ImageLocationSettings>) {
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
      <SettingNumber
        label={t('settings.fullScoreRadius')}
        hint={t('settings.fullScoreRadiusHint')}
        testId="location-settings-radius"
        value={Math.round(value.fullScoreRadius * 1000) / 10}
        min={0.5}
        max={30}
        step={0.5}
        onChange={(percent) => {
          onChange({ ...value, fullScoreRadius: percent / 100 });
        }}
      />
      <SettingNumber
        label={t('settings.zeroScoreDistance')}
        hint={t('settings.zeroScoreDistanceHint')}
        value={Math.round(value.zeroScoreDistance * 1000) / 10}
        min={2}
        max={100}
        step={1}
        onChange={(percent) => {
          onChange({ ...value, zeroScoreDistance: percent / 100 });
        }}
      />
    </SettingsGrid>
  );
}
