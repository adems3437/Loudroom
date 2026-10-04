'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { TombalaDrawMode, TombalaSettings } from './schema.js';

/** Per-round Tombala settings: how numbers are drawn, marking, prizes and wrong calls. */
export function TombalaSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<TombalaSettings>) {
  const modes: { value: TombalaDrawMode; label: string }[] = [
    { value: 'auto', label: t('settings.drawAuto') },
    { value: 'manual', label: t('settings.drawManual') },
  ];
  return (
    <SettingsGrid>
      <SettingChoice
        label={t('settings.drawMode')}
        testId="tombala-settings-draw-mode"
        value={value.drawMode}
        options={modes}
        onChange={(drawMode) => {
          onChange({ ...value, drawMode });
        }}
      />
      <SettingNumber
        label={t('settings.drawSeconds')}
        hint={t('settings.drawSecondsHint')}
        testId="tombala-settings-interval"
        value={value.drawIntervalMs / 1000}
        min={3}
        max={20}
        onChange={(seconds) => {
          onChange({ ...value, drawIntervalMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingToggle
        label={t('settings.autoMark')}
        hint={t('settings.autoMarkHint')}
        testId="tombala-settings-auto-mark"
        checked={value.autoMark}
        onChange={(autoMark) => {
          onChange({ ...value, autoMark });
        }}
      />
      <SettingNumber
        label={t('settings.firstLinePoints')}
        value={value.firstLinePoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(firstLinePoints) => {
          onChange({ ...value, firstLinePoints });
        }}
      />
      <SettingNumber
        label={t('settings.secondLinePoints')}
        value={value.secondLinePoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(secondLinePoints) => {
          onChange({ ...value, secondLinePoints });
        }}
      />
      <SettingNumber
        label={t('settings.tombalaPoints')}
        value={value.tombalaPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(tombalaPoints) => {
          onChange({ ...value, tombalaPoints });
        }}
      />
      <SettingNumber
        label={t('settings.falseClaimLockout')}
        hint={t('settings.falseClaimLockoutHint')}
        value={value.falseClaimLockout}
        min={0}
        max={10}
        onChange={(falseClaimLockout) => {
          onChange({ ...value, falseClaimLockout });
        }}
      />
      <SettingNumber
        label={t('settings.falseClaimPenalty')}
        hint={t('settings.falseClaimPenaltyHint')}
        value={value.falseClaimPenalty}
        min={0}
        max={5_000}
        step={50}
        onChange={(falseClaimPenalty) => {
          onChange({ ...value, falseClaimPenalty });
        }}
      />
    </SettingsGrid>
  );
}
