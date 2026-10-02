'use client';

import { SettingNumber, SettingsGrid, type SettingsEditorProps } from '@loudroom/game-sdk/client';
import type { MemorySettings } from './schema.js';

/** Per-round Memory settings. The answering time is the round's own time limit field. */
export function MemorySettingsEditor({ value, onChange, t }: SettingsEditorProps<MemorySettings>) {
  return (
    <SettingsGrid>
      <SettingNumber
        label={t('settings.showSeconds')}
        testId="memory-settings-show"
        value={value.showMs / 1000}
        min={2}
        max={30}
        onChange={(seconds) => {
          onChange({ ...value, showMs: Math.round(seconds * 1000) });
        }}
      />
      <SettingNumber
        label={t('settings.boardSize')}
        value={value.boardSize}
        min={4}
        max={16}
        onChange={(boardSize) => {
          onChange({ ...value, boardSize });
        }}
      />
      <SettingNumber
        label={t('settings.distinctCount')}
        hint={t('settings.distinctCountHint')}
        value={value.distinctCount}
        min={3}
        max={12}
        onChange={(distinctCount) => {
          onChange({ ...value, distinctCount });
        }}
      />
      <SettingNumber
        label={t('settings.questionCount')}
        value={value.questionCount}
        min={1}
        max={5}
        onChange={(questionCount) => {
          onChange({ ...value, questionCount });
        }}
      />
      <SettingNumber
        label={t('settings.pointsPerQuestion')}
        value={value.pointsPerQuestion}
        min={0}
        max={5_000}
        step={50}
        onChange={(pointsPerQuestion) => {
          onChange({ ...value, pointsPerQuestion });
        }}
      />
    </SettingsGrid>
  );
}
