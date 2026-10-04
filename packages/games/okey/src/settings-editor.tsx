'use client';

import {
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { OkeySettings } from './schema.js';

/**
 * Per-round Okey settings: the defaults for the choices made on the TV before the deal, the
 * clocks and the bots.
 */
export function OkeySettingsEditor({ value, onChange, t }: SettingsEditorProps<OkeySettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.hands')}
        hint={t('settings.handsHint')}
        testId="okey-settings-hands"
        value={value.hands}
        min={1}
        max={20}
        onChange={(hands) => {
          onChange({ ...value, hands });
        }}
      />
      <SettingNumber
        label={t('settings.startPoints')}
        hint={t('settings.startPointsHint')}
        testId="okey-settings-points"
        value={value.startPoints}
        min={2}
        max={50}
        onChange={(startPoints) => {
          onChange({ ...value, startPoints });
        }}
      />
      <SettingNumber
        label={t('settings.turnSeconds')}
        value={value.turnMs / 1000}
        min={10}
        max={120}
        onChange={(seconds) => {
          onChange({ ...value, turnMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingNumber
        label={t('settings.matchMinutes')}
        hint={t('settings.matchMinutesHint')}
        value={value.matchMs / 60_000}
        min={2}
        max={120}
        onChange={(minutes) => {
          onChange({ ...value, matchMs: Math.round(minutes * 60_000) });
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
