// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // ── Ignorés ────────────────────────────────────────────────────────────────
  {
    ignores: ['dist/', 'dist-electron/', 'electron-dist/', 'node_modules/'],
  },

  // ── TypeScript (src + electron) ────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'electron/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
      '@angular-eslint': angular,
    },
    rules: {
      ...angular.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // ── Templates Angular ──────────────────────────────────────────────────────
  {
    files: ['src/**/*.html'],
    plugins: {
      '@angular-eslint/template': angularTemplate,
    },
    languageOptions: {
      parser: angularTemplateParser,
    },
    rules: {
      ...angularTemplate.configs.recommended.rules,
    },
  },

  // ── Désactive les règles en conflit avec Prettier ──────────────────────────
  prettierConfig,
);
