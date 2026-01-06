# @fluid-private/test-dds-utils

Fluid DDS test utilities - shared testing infrastructure for DDS packages.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests (ESM and CJS)
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:mocha:suite` - Run DDS suite cases

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports

## Key Files

- `src/` - Source code with test utilities
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Private package (`@fluid-private` scope) - internal use only
- Type validation is disabled
- Provides shared test infrastructure for DDS packages
- Depends on `@fluid-private/stochastic-test-utils`
- Tests run in both ESM and CJS modes
