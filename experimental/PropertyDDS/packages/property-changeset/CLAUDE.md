# @fluid-experimental/property-changeset

Property changeset definitions and related functionalities. Core component of the PropertyDDS system for representing and manipulating property changes.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build tests (ESM and CJS)
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, both ESM and CJS)
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Dependencies

- `@fluid-experimental/property-common` - Common property utilities
- `ajv` / `ajv-keywords` - JSON schema validation
- `lodash` - Utility functions
- `traverse` - Object traversal

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Part of the PropertyDDS suite of packages
- Type validation is disabled for this package
- Supports both ESM and CommonJS output
