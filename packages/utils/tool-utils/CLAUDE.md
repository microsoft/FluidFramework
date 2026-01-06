# @fluidframework/tool-utils

Common utilities for Fluid tools including token management, snapshot normalization, and HTTP helpers.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:commonjs` - Build CommonJS only
- `pnpm build:compile` - Compile without API reports

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome
- `pnpm format` - Format code with Biome

## Key Files

- `src/odspTokenManager.ts` - ODSP token caching and management
- `src/snapshotNormalizer.ts` - Normalize Fluid snapshots for comparison
- `src/httpHelpers.ts` - HTTP request utilities
- `src/fluidToolRc.ts` - Configuration file (`.fluidtoolrc`) handling
- `src/debug.ts` - Debug utilities

## Notes

- Dual ESM/CommonJS package with `lib/` (ESM) and `dist/` (CommonJS) outputs
- Exports two entry points: default (public) and `/internal`
- Uses `proper-lockfile` for file locking and `async-mutex` for async synchronization
- Primarily used by internal tooling, not typical application code
- Token manager handles caching ODSP tokens with file-based persistence
