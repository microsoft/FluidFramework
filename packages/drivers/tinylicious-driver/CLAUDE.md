# @fluidframework/tinylicious-driver

Driver for Tinylicious, the lightweight local Fluid server for development.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, ESM only by default)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/routerlicious-driver` - Base routerlicious driver
- `@fluidframework/driver-utils` - Driver utilities
- `jsrsasign` - JWT token generation

## Exports

- `.` - Main driver exports
- `./test-utils` - Test utility exports

## Notes

- Wraps routerlicious-driver for Tinylicious compatibility
- Ideal for local development and testing
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
