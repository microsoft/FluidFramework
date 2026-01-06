# @fluidframework/driver-definitions

Fluid driver definitions - interfaces and types for Fluid drivers (storage/transport layer).

## Build

- `pnpm build` - Build the package (runs fluid-build)
- `pnpm build:esnext` - Build ESM with TypeScript
- `pnpm tsc` - Build CommonJS
- `pnpm clean` - Remove build artifacts

## Test

This package has no tests (`ci:test` echoes "No test for this package").

## Lint

- `pnpm lint` - Run all linters
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with biome
- `pnpm eslint` - Run eslint only

## Key Files

- `src/storage.ts` - Storage interfaces (document storage, blob storage)
- `src/driverError.ts` - Driver error types
- `src/urlResolver.ts` - URL resolver interfaces
- `src/cacheDefinitions.ts` - Caching interfaces
- `src/protocol/` - Protocol-related definitions
- `src/git/` - Git-related definitions

## Exports

- `.` - Public API
- `./legacy` - Legacy API
- `./internal` - Internal API

## Notes

- Type-only package defining driver/storage layer interfaces
- Dependencies: `@fluidframework/core-interfaces`
- Build depends on `typetests:gen` task
