# @fluidframework/telemetry-utils

Collection of telemetry-related utilities for Fluid Framework including logging, error handling, and event batching.

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

- `src/logger.ts` - Core logging infrastructure and logger implementations
- `src/error.ts` - Error utilities and error normalization
- `src/errorLogging.ts` - Error logging helpers
- `src/fluidErrorBase.ts` - Base class for Fluid errors
- `src/layerCompatError.ts` - Layer compatibility error handling
- `src/config.ts` - Configuration utilities for telemetry
- `src/mockLogger.ts` - Mock logger for testing
- `src/sampledTelemetryHelper.ts` - Sampled telemetry for high-frequency events
- `src/telemetryEventBatcher.ts` - Batch telemetry events
- `src/events.ts` - Event utilities

## Notes

- Dual ESM/CommonJS package with `lib/` (ESM) and `dist/` (CommonJS) outputs
- Exports three entry points: default (public), `/legacy`, and `/internal`
- Core dependency for most Fluid packages - changes here affect many consumers
- Uses `debug` for debug logging and `uuid` for generating correlation IDs
- Uses `sinon` for test mocking
