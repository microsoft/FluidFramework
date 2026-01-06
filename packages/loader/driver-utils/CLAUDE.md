# @fluidframework/driver-utils

Collection of utility functions for Fluid drivers.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:compile` - Compile without API reports
- `pnpm build:test` - Build test files

## Test

- `pnpm test` - Run all tests (mocha)
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:coverage` - Run tests with coverage (c8)

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Key Files

- `src/adapters/` - Service adapters including compression support
- `src/documentServiceProxy.ts` - Proxy for document service
- `src/documentStorageServiceProxy.ts` - Proxy for storage service
- `src/runWithRetry.ts` - Retry logic for operations
- `src/networkUtils.ts` - Network utilities
- `src/treeConversions.ts` - Tree structure conversions
- `src/buildSnapshotTree.ts` - Snapshot tree building
- `src/insecureUrlResolver.ts` - URL resolver for testing

## Notes

- Dual-build package (ESM in `lib/`, CommonJS in `dist/`)
- Provides compression adapters via `src/adapters/compression/`
- Uses axios for HTTP requests and lz4js for compression
- Key dependencies: driver-definitions, telemetry-utils
