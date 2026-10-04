'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { KizmaSettings } from './schema.js';

/** Per-round Kızma Birader settings: board, pawns, clocks, match length, places, bots. */
export function KizmaSettingsEditor({ value, onChange, t }: SettingsEditorProps<KizmaSettings>) {
  const boards: { value: '4' | '6'; label: string }[] = [
    { value: '4', label: t('settings.board4') },
    { value: '6', label: t('settings.board6') },
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
      <SettingChoice
        label={t('settings.board')}
        testId="kizma-settings-board"
        value={value.board === 6 ? '6' : '4'}
        options={boards}
        onChange={(board) => {
          onChange({ ...value, board: board === '6' ? 6 : 4 });
        }}
      />
      <SettingNumber
        label={t('settings.pawns')}
        testId="kizma-settings-pawns"
        value={value.pawns}
        min={1}
        max={4}
        onChange={(pawns) => {
          onChange({ ...value, pawns });
        }}
      />
      <SettingToggle
        label={t('settings.autoMove')}
        hint={t('settings.autoMoveHint')}
        checked={value.autoMove}
        onChange={(autoMove) => {
          onChange({ ...value, autoMove });
        }}
      />
      <SettingNumber
        label={t('settings.turnSeconds')}
        value={value.rollMs / 1000}
        min={5}
        max={60}
        onChange={(seconds) => {
          const ms = Math.round(seconds * 1000);
          onChange({ ...value, rollMs: ms, moveMs: ms });
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
