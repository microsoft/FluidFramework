# @fluid-experimental/property-dds

Definition of the property distributed data store. The main DDS implementation for the PropertyDDS system.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build tests (ESM and CJS)
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Dependencies

- `@fluid-experimental/property-changeset` - Changeset handling
- `@fluid-experimental/property-properties` - Property definitions
- `@fluidframework/shared-object-base` - Base class for shared objects
- `axios` - HTTP client
- `lz4js` / `pako` - Compression
- `msgpackr` - MessagePack serialization

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Part of the PropertyDDS suite of packages
- Main DDS implementation that depends on property-changeset and property-properties
- Type validation is disabled for this package
- Supports both ESM and CommonJS output
