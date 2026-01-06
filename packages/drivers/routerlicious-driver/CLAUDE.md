# @fluidframework/routerlicious-driver

Socket.IO + Git implementation of Fluid service API for Routerlicious servers.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, CJS only due to ESM stubbing issues)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/driver-base` - Shared driver code
- `@fluidframework/server-services-client` - Routerlicious client utilities
- `socket.io-client` - WebSocket communication
- `cross-fetch` - HTTP requests

## Notes

- Primary driver for Routerlicious-based Fluid services
- ESM tests skipped due to stubbing issues (ADO #7404)
- Tests use Sinon and Nock for mocking
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
