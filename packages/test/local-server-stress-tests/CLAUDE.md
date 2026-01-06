# @fluid-internal/local-server-stress-tests

Stress tests that can only run against the local server.

## Build

- `pnpm build` - Build the package
- `pnpm build:test` - Build test files only

## Test

- `pnpm test` - Run stress tests
- `pnpm test:mocha` - Run mocha tests from `lib/test/**/*.spec.*js`
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:coverage` - Run tests with coverage

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Notes

- Private package (not published)
- Module type: CommonJS
- Uses `@fluidframework/server-local-server` for local testing
- Tests DDS stress scenarios including SharedTree, SharedMap, SharedMatrix, SharedSequence
- Uses stochastic test utilities from `@fluid-private/stochastic-test-utils`
