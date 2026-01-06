# @fluid-internal/local-server-tests

Tests that can only run against the local server.

## Build

- `pnpm build` - Build the package
- `pnpm build:test` - Build test files from `src/test/tsconfig.json`

## Test

- `pnpm test` - Run all tests
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
- Uses `@fluid-private/test-pairwise-generator` for test case generation
- Uses sinon for mocking
