'use client';

import { SettingNumber, SettingsGrid, type SettingsEditorProps } from '@loudroom/game-sdk/client';
import type { SpySettings } from './schema.js';

/** Per-round "Casus Kim?" settings: talk and vote times, a second spy, points. */
export function SpySettingsEditor({ value, onChange, t }: SettingsEditorProps<SpySettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.discussionMinutes')}
        testId="spy-settings-discussion"
        value={value.discussionMs / 60_000}
        min={1}
        max={15}
        onChange={(minutes) => {
          onChange({ ...value, discussionMs: Math.round(minutes * 60_000) });
        }}
      />
      <SettingNumber
        label={t('settings.voteSeconds')}
        value={value.voteMs / 1000}
        min={10}
        max={120}
        onChange={(seconds) => {
          onChange({ ...value, voteMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingNumber
        label={t('settings.twoSpiesFrom')}
        hint={t('settings.twoSpiesFromHint')}
        testId="spy-settings-two-spies"
        value={value.twoSpiesFrom}
        min={0}
        max={20}
        onChange={(twoSpiesFrom) => {
          onChange({ ...value, twoSpiesFrom });
        }}
      />
      <SettingNumber
        label={t('settings.townPoints')}
        hint={t('settings.townPointsHint')}
        value={value.townPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(townPoints) => {
          onChange({ ...value, townPoints });
        }}
      />
      <SettingNumber
        label={t('settings.voterBonus')}
        hint={t('settings.voterBonusHint')}
        value={value.voterBonus}
        min={0}
        max={10_000}
        step={50}
        onChange={(voterBonus) => {
          onChange({ ...value, voterBonus });
        }}
      />
      <SettingNumber
        label={t('settings.spyEscapePoints')}
        value={value.spyEscapePoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(spyEscapePoints) => {
          onChange({ ...value, spyEscapePoints });
        }}
      />
      <SettingNumber
        label={t('settings.spyGuessPoints')}
        value={value.spyGuessPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(spyGuessPoints) => {
          onChange({ ...value, spyGuessPoints });
        }}
      />
    </SettingsGrid>
  );
}
