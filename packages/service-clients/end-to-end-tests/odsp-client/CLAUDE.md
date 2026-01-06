# @fluid-experimental/odsp-end-to-end-tests

End-to-end tests for ODSP (OneDrive/SharePoint) client.

## Build

- `pnpm build` - Build the package
- `pnpm build:test` - Build tests only

## Test

- `pnpm test` - Run tests against ODSP service
- `pnpm test:realsvc:odsp` - Run tests against ODSP (same as `test`)
- `pnpm test:coverage` - Run tests with coverage (c8)

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Format with Biome

## Key Files

- `src/test/` - Test source files
- `.mocharc.cjs` - Mocha configuration

## Notes

- Requires ODSP credentials/configuration to run tests
- Set `FLUID_TEST_VERBOSE=1` for verbose logging
- Tests use `@fluidframework/odsp-doclib-utils` for ODSP authentication utilities
