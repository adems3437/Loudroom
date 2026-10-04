'use client';

import {
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { PistiSettings } from './schema.js';

/** Per-round Pişti settings: when the match ends, partners, the turn clock, bots. */
export function PistiSettingsEditor({ value, onChange, t }: SettingsEditorProps<PistiSettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.targetPoints')}
        hint={t('settings.targetPointsHint')}
        testId="pisti-settings-target"
        value={value.targetPoints}
        min={0}
        max={1_001}
        step={10}
        onChange={(targetPoints) => {
          onChange({ ...value, targetPoints });
        }}
      />
      <SettingNumber
        label={t('settings.maxDeals')}
        hint={t('settings.maxDealsHint')}
        testId="pisti-settings-deals"
        value={value.maxDeals}
        min={0}
        max={20}
        onChange={(maxDeals) => {
          onChange({ ...value, maxDeals });
        }}
      />
      <SettingNumber
        label={t('settings.turnSeconds')}
        value={value.turnMs / 1000}
        min={5}
        max={120}
        onChange={(seconds) => {
          onChange({ ...value, turnMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingToggle
        label={t('settings.teams')}
        hint={t('settings.teamsHint')}
        checked={value.teams}
        onChange={(teams) => {
          onChange({ ...value, teams });
        }}
      />
      <SettingToggle
        label={t('settings.bots')}
        hint={t('settings.botsHint')}
        checked={value.bots}
        onChange={(bots) => {
          onChange({ ...value, bots });
        }}
      />
    </SettingsGrid>
  );
}
