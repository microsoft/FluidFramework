# @fluidframework/core-interfaces

Core Fluid object interfaces - foundational types for the Fluid Framework.

## Build

- `pnpm build` - Build the package (runs fluid-build)
- `pnpm build:esnext` - Build ESM with TypeScript
- `pnpm tsc` - Build CommonJS
- `pnpm clean` - Remove build artifacts

## Test

- `pnpm test` - Run mocha tests
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:mocha:cjs` - Run CJS tests only
- `pnpm test:coverage` - Run tests with c8 coverage

## Lint

- `pnpm lint` - Run all linters
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with biome
- `pnpm eslint` - Run eslint only

## Key Files

- `src/events.ts` - Event-related interfaces
- `src/handles.ts` - Handle interfaces
- `src/error.ts` - Error interfaces and types
- `src/disposable.ts` - Disposable interface
- `src/fluidLoadable.ts` - Loadable interfaces
- `src/jsonSerializable.ts` / `src/jsonDeserialized.ts` - JSON serialization types
- `src/exposedInternalUtilityTypes.ts` - Internal utility types
- `src/brandedType.ts` / `src/erasedType.ts` - Type branding utilities

## Exports

- `.` - Public API
- `./legacy` - Legacy API
- `./legacy/alpha` - Legacy alpha API
- `./internal` - Internal API
- `./internal/exposedUtilityTypes` - Exposed utility types

## Notes

- Foundation package with no runtime dependencies
- Has known broken type validation for `FluidErrorTypes`
- Contains special test for `exactOptionalPropertyTypes` TypeScript flag
