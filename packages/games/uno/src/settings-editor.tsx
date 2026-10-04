'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { UnoSettings, UnoTimeoutAction } from './schema.js';

/** Per-round UNO settings: hand size, turn clock, stacking, match length, places, bots. */
export function UnoSettingsEditor({ value, onChange, t }: SettingsEditorProps<UnoSettings>) {
  const timeoutActions: { value: UnoTimeoutAction; label: string }[] = [
    { value: 'autoPlay', label: t('settings.autoPlay') },
    { value: 'drawAndPass', label: t('settings.drawAndPass') },
  ];
  const points = (key: 'firstPoints' | 'secondPoints' | 'thirdPoints' | 'otherPoints') => (
    <SettingNumber
      label={t(`settings.${key}`)}
      value={value[key]}
      min={0}
      max={10_000}
      step={100}
      onChange={(next) => {
        onChange({ ...value, [key]: next });
      }}
    />
  );
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.startingCards')}
        testId="uno-settings-starting-cards"
        value={value.startingCards}
        min={2}
        max={10}
        onChange={(startingCards) => {
          onChange({ ...value, startingCards });
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
      <SettingChoice
        label={t('settings.timeoutAction')}
        value={value.timeoutAction}
        options={timeoutActions}
        onChange={(timeoutAction) => {
          onChange({ ...value, timeoutAction });
        }}
      />
      <SettingNumber
        label={t('settings.matchMinutes')}
        hint={t('settings.matchMinutesHint')}
        value={value.matchMs / 60_000}
        min={2}
        max={60}
        onChange={(minutes) => {
          onChange({ ...value, matchMs: Math.round(minutes * 60_000) });
        }}
      />
      <SettingToggle
        label={t('settings.stacking')}
        hint={t('settings.stackingHint')}
        checked={value.stacking}
        onChange={(stacking) => {
          onChange({ ...value, stacking });
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
      {points('firstPoints')}
      {points('secondPoints')}
      {points('thirdPoints')}
      {points('otherPoints')}
    </SettingsGrid>
  );
}
