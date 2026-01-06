# @fluid-private/test-pairwise-generator

Pairwise test case generator for Fluid Framework tests.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output
- `pnpm build:docs` - Generate API documentation

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

## Notes

- Published package with dual ESM/CJS support
- Uses `random-js` for randomization
- Generates pairwise combinations to reduce test matrix size while maintaining coverage
- Used by test packages to generate configuration combinations
