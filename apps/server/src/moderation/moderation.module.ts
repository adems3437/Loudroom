import { readFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ProfanityFilter } from './profanity-filter.js';
import { ENGLISH_WORDS, TURKISH_WORDS } from './wordlists.js';

function extraWords(file: string | null): string[] {
  if (!file) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

@Global()
@Module({
  providers: [
    {
      provide: ProfanityFilter,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new ProfanityFilter([
          ...TURKISH_WORDS,
          ...ENGLISH_WORDS,
          ...extraWords(config.profanityExtraWordsFile),
        ]),
    },
  ],
  exports: [ProfanityFilter],
})
export class ModerationModule {}
