# @fluidframework/local-driver

Fluid local driver for in-process testing and development.

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

- `@fluidframework/server-local-server` - Local Fluid server
- `@fluidframework/routerlicious-driver` - Base routerlicious driver
- `@fluidframework/driver-base` - Shared driver code
- `jsrsasign` - JWT token generation

## Notes

- Uses in-memory local server for testing
- Depends on `@fluidframework/server-*` packages
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
