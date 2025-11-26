# ESLint Print Configs - Wrapper Config Files

This directory contains wrapper ESLint flat config files used by the `scripts/print-configs.ts` script to generate printed configuration snapshots.

## Purpose

The print-configs script generates JSON snapshots of the resolved ESLint configurations for different variants (recommended, strict, minimal, etc.) applied to different file types (TypeScript, React/TSX, test files). These snapshots are committed to version control in `printed-configs/` and allow us to track how ESLint rule configurations change over time.

## Why Wrapper Files?

With ESLint 9's flat config format, we can't directly use the shared `flat.mjs` module as a config file because it exports multiple named configs (`recommended`, `strict`, `minimalDeprecated`). ESLint expects a default export.

These wrapper files solve that problem by importing and re-exporting each variant as a default export:

- **`recommended.mjs`** - Wraps the `recommended` config
- **`strict.mjs`** - Wraps the `strict` config
- **`minimal.mjs`** - Wraps the `minimalDeprecated` config

## How It Works

1. The `print-configs.ts` script uses ESLint's `calculateConfigForFile()` API
2. It points to these wrapper configs via the `overrideConfigFile` option
3. ESLint resolves the full config for each test file (`src/file.ts`, `src/file.tsx`, `src/test/file.ts`)
4. The script serializes and saves the resolved configs as JSON in `printed-configs/`

## Maintenance

These files are intentionally simple and should rarely need changes. They exist purely to bridge the gap between our multi-export `flat.mjs` module and ESLint's single-config-per-file requirement.
