import { z } from 'zod';

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
/** Upper bound on the raw input before normalization, so huge payloads are rejected cheaply. */
const NICKNAME_MAX_RAW_LENGTH = 64;

const graphemes = new Intl.Segmenter('tr', { granularity: 'grapheme' });

/** Length as a person counts it: an emoji or a letter with combining marks is one character. */
export function graphemeLength(text: string): number {
  let count = 0;
  for (const _ of graphemes.segment(text)) count++;
  return count;
}

/**
 * NFC-normalizes, removes control and format characters (zero-width spaces and joiners, bidi
 * overrides, soft hyphens, …), collapses whitespace and trims (SPEC §9).
 */
export function normalizeNickname(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Comparison key for uniqueness within a room: Turkish lower-casing makes "İrem" equal "irem". */
export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).toLocaleLowerCase('tr');
}

export const nicknameSchema = z
  .string()
  .max(NICKNAME_MAX_RAW_LENGTH)
  .transform(normalizeNickname)
  .refine(
    (value) => {
      const length = graphemeLength(value);
      return length >= NICKNAME_MIN_LENGTH && length <= NICKNAME_MAX_LENGTH;
    },
    { message: `Nickname must be ${NICKNAME_MIN_LENGTH}–${NICKNAME_MAX_LENGTH} characters` },
  );
