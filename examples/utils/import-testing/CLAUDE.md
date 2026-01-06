# @fluid-example/import-testing

Testing package imports across different module systems and TypeScript versions.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build ESM and CJS tests
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run all tests (ESM and CJS)
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:mocha:cjs` - Run CJS tests only
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is an example utility package (not published)
- Tests imports of fluid-framework and related packages
- Validates compatibility across multiple TypeScript versions (5.4-5.9)
- Tests both ESM and CommonJS module systems
