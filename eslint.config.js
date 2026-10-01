import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/generated/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/next-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // For strings `||` is deliberate: an empty value (e.g. an unset env var) counts as missing.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Server: Nest relies on decorator metadata and empty decorated module classes.
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@loudroom/web', '**/apps/web/**'],
              message: 'The server must not depend on the web app.',
            },
            {
              group: ['@loudroom/game-*/client', '@loudroom/game-sdk/client', 'react', 'react/*'],
              message: 'The server loads only the server side of game packages (SPEC §5).',
            },
          ],
        },
      ],
    },
  },

  // Web: React, Next.js, and the client never reaches into server code.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // SPEC §9: React escaping only.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (SPEC §9).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@loudroom/server', '**/apps/server/**'],
              message: 'The web app talks to the server only through @loudroom/shared contracts.',
            },
          ],
        },
      ],
    },
  },

  // Game packages: React rules for renderers; the server side of a game stays React-free.
  {
    files: ['packages/game-sdk/**/*.tsx', 'packages/games/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (SPEC §9).',
        },
      ],
    },
  },
  {
    files: [
      'packages/games/*/src/server.ts',
      'packages/games/*/src/schema.ts',
      'packages/games/*/src/scoring.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '@loudroom/game-sdk/client',
                './client*',
                './host*',
                './player*',
              ],
              message: 'Server-side game code must not pull in client code.',
            },
          ],
        },
      ],
    },
  },

  // Shared contracts stay framework-free.
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@loudroom/web', '@loudroom/server', '@nestjs/*', 'next', 'next/*', 'react'],
              message: 'packages/shared must stay framework-free.',
            },
          ],
        },
      ],
    },
  },
);
