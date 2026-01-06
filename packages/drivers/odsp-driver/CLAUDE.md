# @fluidframework/odsp-driver

Socket storage implementation for SharePoint Online (SPO) and OneDrive Consumer (ODC).

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, both CJS and ESM)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/odsp-driver-definitions` - ODSP-specific types
- `@fluidframework/odsp-doclib-utils` - ODSP document library utilities
- `@fluidframework/driver-base` - Shared driver code
- `socket.io-client` - WebSocket communication

## Notes

- Primary driver for Microsoft 365 integration
- Tests use Sinon for mocking
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
