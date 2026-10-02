'use client';

import {
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { DrawingSettings } from './schema.js';

/** Per-round drawing settings. The drawing time is the round's own time limit field. */
export function DrawingSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<DrawingSettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.baseScore')}
        hint={t('settings.baseScoreHint')}
        value={value.baseScore}
        min={0}
        max={10_000}
        step={100}
        onChange={(baseScore) => {
          onChange({ ...value, baseScore });
        }}
      />
      <SettingNumber
        label={t('settings.rankStep')}
        value={value.rankStep}
        min={0}
        max={5_000}
        step={50}
        onChange={(rankStep) => {
          onChange({ ...value, rankStep });
        }}
      />
      <SettingNumber
        label={t('settings.minScore')}
        value={value.minScore}
        min={0}
        max={10_000}
        step={50}
        onChange={(minScore) => {
          onChange({ ...value, minScore });
        }}
      />
      <SettingNumber
        label={t('settings.drawerPoints')}
        hint={t('settings.drawerPointsHint')}
        testId="drawing-settings-drawer-points"
        value={value.drawerPoints}
        min={0}
        max={5_000}
        step={50}
        onChange={(drawerPoints) => {
          onChange({ ...value, drawerPoints });
        }}
      />
      <SettingToggle
        label={t('settings.showLetterSlots')}
        checked={value.showLetterSlots}
        onChange={(showLetterSlots) => {
          onChange({ ...value, showLetterSlots });
        }}
      />
    </SettingsGrid>
  );
}
