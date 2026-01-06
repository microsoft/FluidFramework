# @fluid-internal/functional-tests

Functional tests for Fluid Framework DDS and container components.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output with TypeScript
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run all tests (ESM)
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:mocha:cjs` - Run CJS tests only
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:coverage` - Run tests with coverage

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Notes

- Private package (not published)
- Tests Fluid DDS types including SharedTree, SharedMap, SharedMatrix, SharedSequence
- Uses Mocha test framework with c8 for coverage
- Module type: ESM
