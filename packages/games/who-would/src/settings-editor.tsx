'use client';

import {
  SettingNumber,
  SettingsGrid,
  SettingToggle,
  type SettingsEditorProps,
} from '@loudroom/game-sdk/client';
import type { WhoWouldSettings } from './schema.js';

/** Per-round "Kim Yapar?" settings: points for the majority and the winner, self votes. */
export function WhoWouldSettingsEditor({
  value,
  onChange,
  t,
}: SettingsEditorProps<WhoWouldSettings>) {
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
        label={t('settings.winnerPoints')}
        hint={t('settings.winnerPointsHint')}
        testId="who-settings-winner-points"
        value={value.winnerPoints}
        min={0}
        max={10_000}
        step={100}
        onChange={(winnerPoints) => {
          onChange({ ...value, winnerPoints });
        }}
      />
      <SettingToggle
        label={t('settings.allowSelfVote')}
        testId="who-settings-self-vote"
        checked={value.allowSelfVote}
        onChange={(allowSelfVote) => {
          onChange({ ...value, allowSelfVote });
        }}
      />
    </SettingsGrid>
  );
}
