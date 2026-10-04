'use client';

import {
  SettingChoice,
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { AmiralMode, AmiralSettings, FleetName } from './schema.js';

/** Per-round Amiral Battı settings: mode, board and fleet, clocks, points, bots. */
export function AmiralSettingsEditor({ value, onChange, t }: SettingsEditorProps<AmiralSettings>) {
  const modes: { value: AmiralMode; label: string }[] = [
    { value: 'teams', label: t('settings.teams') },
    { value: 'tournament', label: t('settings.tournament') },
  ];
  const fleets: { value: FleetName; label: string }[] = [
    { value: 'classic', label: t('settings.fleetClassic') },
    { value: 'small', label: t('settings.fleetSmall') },
    { value: 'mini', label: t('settings.fleetMini') },
  ];
  const points = (
    key:
      | 'winPoints'
      | 'losePoints'
      | 'championPoints'
      | 'finalistPoints'
      | 'semifinalPoints'
      | 'otherPoints',
  ) => (
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
        label={t('settings.mode')}
        testId="amiral-settings-mode"
        value={value.mode}
        options={modes}
        onChange={(mode) => {
          onChange({ ...value, mode });
        }}
      />
      <SettingChoice
        label={t('settings.fleet')}
        testId="amiral-settings-fleet"
        value={value.fleet}
        options={fleets}
        onChange={(fleet) => {
          onChange({ ...value, fleet });
        }}
      />
      <SettingToggle
        label={t('settings.extraShotOnHit')}
        checked={value.extraShotOnHit}
        onChange={(extraShotOnHit) => {
          onChange({ ...value, extraShotOnHit });
        }}
      />
      <SettingNumber
        label={t('settings.placementSeconds')}
        value={value.placementMs / 1000}
        min={30}
        max={300}
        onChange={(seconds) => {
          onChange({ ...value, placementMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingNumber
        label={t('settings.shotSeconds')}
        value={value.shotMs / 1000}
        min={5}
        max={120}
        onChange={(seconds) => {
          onChange({ ...value, shotMs: Math.round(seconds * 1000) });
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
      {value.mode === 'teams' ? (
        <>
          {points('winPoints')}
          {points('losePoints')}
        </>
      ) : (
        <>
          {points('championPoints')}
          {points('finalistPoints')}
          {points('semifinalPoints')}
          {points('otherPoints')}
        </>
      )}
    </SettingsGrid>
  );
}
