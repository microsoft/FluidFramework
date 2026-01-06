# @fluidframework/replay-driver

Document replay version of Socket.IO implementation for playing back Fluid document history.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/driver-definitions` - Core driver interfaces
- `@fluidframework/driver-utils` - Driver utilities
- `@fluidframework/telemetry-utils` - Telemetry support

## Notes

- No test suite in this package
- Used by debugger and file-driver packages
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
- Dev dependency on `nock` for HTTP mocking
