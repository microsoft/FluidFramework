# @fluidframework/driver-base

Shared driver code for Fluid driver implementations.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, ESM only by default)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/driver-definitions` - Core driver interfaces
- `@fluidframework/driver-utils` - Driver utilities
- `@fluidframework/telemetry-utils` - Telemetry support

## Notes

- Base class implementations for driver development
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
