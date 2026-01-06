# @fluidframework/eslint-config-fluid

Shareable ESLint config for the Fluid Framework. Provides multiple configuration presets for consistent linting across Fluid packages.

## Build

- `pnpm build` - Print configs and run prettier check
- `pnpm print-configs` - Generate printed config files to `printed-configs/`
- `pnpm clean` - Remove dist and build logs

## Format

- `pnpm format` - Format code with prettier
- `pnpm prettier` - Check formatting without fixing
- `pnpm prettier:fix` - Fix formatting issues

## Test

- No tests currently implemented

## Key Files

- `index.js` - Main entry point
- `base.js` - Base ESLint configuration
- `recommended.js` - Recommended rules configuration
- `strict.js` - Strict rules configuration
- `strict-biome.js` - Strict config with Biome compatibility
- `flat.mts` - Flat config format (ESLint 9+)
- `minimal-deprecated.js` - Minimal/deprecated rules configuration
- `scripts/print-configs.ts` - Script to generate printed config output

## Notes

- This is a private package (not published to npm)
- Uses ESLint 9 flat config format via `flat.mts`
- The `print-configs` script outputs expanded configs to `printed-configs/` for debugging
- Integrates multiple ESLint plugins: TypeScript, import-x, jsdoc, unicorn, react, and more
