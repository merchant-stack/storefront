// Flat ESLint config (v9). Shared across the monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/build/**',
      '**/*.tsbuildinfo',
      'packages/db/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Match repo conventions: be strict where it matters, lenient on the rest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'off', // would require type-aware lint; defer.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Tests + scripts can use console freely.
    files: ['**/*.test.ts', '**/scripts/**', 'packages/db/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Next.js / React files have a slightly different baseline.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off', // plugin not flat-config-ready yet; rely on next build.
    },
  },
];
