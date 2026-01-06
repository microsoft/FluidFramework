# @fluidframework/container-loader

Fluid container loader - Core package for loading and managing Fluid containers.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:compile` - Compile without API reports
- `pnpm build:test` - Build test files

## Test

- `pnpm test` - Run all tests (mocha)
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Key Files

- `src/loader.ts` - Main Loader class for creating/loading containers
- `src/container.ts` - Container implementation
- `src/deltaManager.ts` - Manages delta/op synchronization
- `src/connectionManager.ts` - Handles WebSocket connections to Fluid services
- `src/protocol.ts` - Protocol handling for Fluid operations
- `src/quorum.ts` - Quorum management for consensus

## Notes

- Dual-build package (ESM in `lib/`, CommonJS in `dist/`)
- Has internal test exports under `./internal/test/*` paths
- Uses mocha for testing with sinon for mocks
- Key dependencies: driver-definitions, driver-utils, telemetry-utils
