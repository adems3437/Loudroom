'use client';

import type { ReactNode } from 'react';

/** Building blocks for the games' settings editors, styled like the admin panel's fields. */

const inputClass =
  'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-ink focus:border-brand focus:outline-none';

function SettingLabel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted text-sm">{hint}</span>}
    </label>
  );
}

export function SettingsGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-4">{children}</div>;
}

/**
 * A number setting. The field keeps what is typed; only parsable numbers reach `onChange`, and
 * the server checks the range when the pack is saved.
 */
export function SettingNumber({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  testId?: string;
}) {
  return (
    <SettingLabel label={label} hint={hint}>
      <input
        type="number"
        data-testid={testId}
        className={inputClass}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onChange={(event) => {
          const parsed = Number(event.target.value.replace(',', '.'));
          if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </SettingLabel>
  );
}

export function SettingChoice<Value extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  testId?: string;
}) {
  return (
    <SettingLabel label={label} hint={hint}>
      <select
        data-testid={testId}
        className={inputClass}
        value={value}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          if (chosen) onChange(chosen.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </SettingLabel>
  );
}

export function SettingToggle({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-start gap-3 self-center">
      <input
        type="checkbox"
        data-testid={testId}
        className="accent-brand mt-1 size-5"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-muted text-sm">{hint}</span>}
      </span>
    </label>
  );
}
