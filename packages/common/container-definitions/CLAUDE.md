# @fluidframework/container-definitions

Fluid container definitions - interfaces and types for Fluid containers.

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

- `src/loader.ts` - Loader interfaces and types
- `src/runtime.ts` - Runtime interfaces and types
- `src/deltas.ts` - Delta/operation types
- `src/audience.ts` - Audience interfaces
- `src/fluidPackage.ts` - Fluid package definitions
- `src/error.ts` - Error types

## Exports

- `.` - Public API
- `./legacy` - Legacy API (beta exports)
- `./internal` - Internal API

## Notes

- Type-only package defining core container interfaces
- Dependencies: `@fluidframework/core-interfaces`, `@fluidframework/driver-definitions`
- Has known broken type validation for `ContainerErrorTypes`
