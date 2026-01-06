# @fluid-experimental/property-common

Common functions used in properties. Foundational utilities for the PropertyDDS system.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build tests
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Dependencies

- `ajv` - JSON schema validation
- `lodash` - Utility functions
- `murmurhash3js` - Hashing utilities
- `base64-js` - Base64 encoding/decoding
- `traverse` - Object traversal

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Part of the PropertyDDS suite of packages
- Base dependency for other PropertyDDS packages
- Type validation is disabled for this package
- Tests run from `dist/test` directory
