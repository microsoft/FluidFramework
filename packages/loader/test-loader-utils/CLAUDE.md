# @fluid-private/test-loader-utils

Mocks and other test utilities for the Fluid Framework Loader.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:compile` - Compile without API reports

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Key Files

- `src/mockDocumentService.ts` - Mock document service for testing
- `src/mockDocumentDeltaConnection.ts` - Mock delta connection
- `src/mockDeltaStorage.ts` - Mock delta storage

## Notes

- Private package (`@fluid-private/`) - not published to npm
- No test suite in this package (it provides test utilities for other packages)
- Type validation is disabled for this package
- Used by `container-loader` and other packages for testing
