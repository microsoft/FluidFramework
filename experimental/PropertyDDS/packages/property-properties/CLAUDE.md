# @fluid-experimental/property-properties

Definitions of properties. Core property type definitions for the PropertyDDS system.

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

- `@fluid-experimental/property-changeset` - Changeset handling
- `@fluid-experimental/property-common` - Common utilities
- `ajv` - JSON schema validation
- `lodash` - Utility functions
- `traverse` - Object traversal

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Part of the PropertyDDS suite of packages
- Provides property type definitions used by property-dds
- Type validation is disabled for this package
- Tests run from `dist/test` directory
