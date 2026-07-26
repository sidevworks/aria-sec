// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output and local scratch dirs. `.vercel/output` in particular holds
  // minified bundles; linting them produced hundreds of meaningless errors that
  // buried the real findings in this repo's source.
  globalIgnores([
    'dist',
    'out',
    'release',
    '.claude',
    '.vercel',
    'tmp',
    'marketing',
    'aria-memory*',
    'docs/landing/design',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Allow intentional throwaways: _-prefixed vars/args and unused catch bindings.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // React Compiler / RC-era hooks rules. This codebase predates them and relies on
      // patterns they flag but that are legitimate here: async fetch-on-mount/poll effects
      // (setState runs after `await`, not synchronously), render-local helper components in
      // CommandCenterPane that close over local state, and deliberately-curated effect deps.
      // Kept as warnings (visible, non-blocking) rather than errors. See the lint-cleanup
      // audit report for the full rationale before promoting any of these back to 'error'.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['electron/**/*.js', 'electron.vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
