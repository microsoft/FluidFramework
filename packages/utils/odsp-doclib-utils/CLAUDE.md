# @fluidframework/odsp-doclib-utils

ODSP (OneDrive/SharePoint) utilities for authentication, error handling, and drive operations.

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

- `src/odspAuth.ts` - ODSP authentication utilities
- `src/odspErrorUtils.ts` - Error handling for ODSP operations
- `src/odspDrives.ts` - Drive operations (list drives, etc.)
- `src/odspRequest.ts` - HTTP request helpers for ODSP
- `src/parseAuthErrorClaims.ts` - Parse authentication error claims

## Notes

- Dual ESM/CommonJS package with `lib/` (ESM) and `dist/` (CommonJS) outputs
- Exports three entry points: default (public), `/legacy`, and `/internal`
- Uses `isomorphic-fetch` for cross-environment HTTP requests
- Depends on `@fluidframework/odsp-driver-definitions` for ODSP types
