# @fluidframework/azure-end-to-end-tests

End-to-end tests for Azure client.

## Build

- `pnpm build` - Build the package
- `pnpm build:test` - Build tests only

## Test

- `pnpm test` - Run tests against Tinylicious (starts server automatically on port 7071)
- `pnpm test:realsvc:azure` - Run tests against Azure Fluid Relay service
- `pnpm test:realsvc:tinylicious:run` - Run tests directly (requires Tinylicious already running)
- `pnpm test:coverage` - Run tests with coverage (c8)

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Format with Biome

## Key Files

- `src/test/` - Test source files
- `.mocharc.cjs` - Mocha configuration

## Notes

- Tests run on port 7071 (different from main azure-client tests on 7070)
- Set `FLUID_CLIENT=azure` to test against real Azure service
- Supports verbose logging with `FLUID_TEST_VERBOSE=msgs` or `FLUID_TEST_VERBOSE=msgs+telem`
- Tests cross-version compatibility with `@fluidframework/azure-client-legacy` (v1.2.0)
