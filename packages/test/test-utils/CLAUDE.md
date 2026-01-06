# @fluidframework/test-utils

Utilities for Fluid Framework tests - core test infrastructure.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build test files (ESM and CJS)
- `pnpm tsc` - Build CommonJS output
- `pnpm build:docs` - Generate API documentation
- `pnpm api` - Run API tasks

## Test

- `pnpm test` - Run all tests
- `pnpm test:mocha:esm` - Run ESM tests
- `pnpm test:mocha:cjs` - Run CJS tests
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:are-the-types-wrong` - Verify type exports

## Exports

- `.` - Public API (default)
- `./legacy` - Legacy API (beta exports)
- `./internal` - Internal API (full exports)

## Notes

- Published package with dual ESM/CJS support
- Core test infrastructure used by most Fluid test packages
- Provides test container creation, driver utilities, and test helpers
- Uses `best-random` for deterministic test randomization
- Supports multiple driver backends (local, ODSP, Routerlicious)
- Type validation enabled with `legacy` entrypoint
