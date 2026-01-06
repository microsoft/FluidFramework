# @fluid-private/stochastic-test-utils

Utilities for stochastic (randomized) tests in Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build test files (ESM and CJS)
- `pnpm tsc` - Build CommonJS output
- `pnpm build:docs` - Generate API documentation

## Test

- `pnpm test` - Run all tests
- `pnpm test:mocha:esm` - Run ESM tests
- `pnpm test:mocha:cjs` - Run CJS tests
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:coverage` - Run tests with coverage
- `pnpm bench` - Run benchmarks

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:are-the-types-wrong` - Verify type exports

## Exports

- `.` - Main entry point (ESM and CJS)
- `./internal/test/utils` - Internal test utilities

## Notes

- Published package with dual ESM/CJS support
- Uses `best-random` for random number generation
- Provides utilities for creating reproducible randomized tests
- Key dependency: `@fluidframework/core-utils`
