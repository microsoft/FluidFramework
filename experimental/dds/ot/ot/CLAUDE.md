# @fluid-experimental/ot

Distributed data structure for hosting ottypes.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build tests (ESM and CJS)
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

- `@fluidframework/shared-object-base` - Base class for shared objects
- `@fluidframework/datastore-definitions` - Datastore interfaces

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Type validation is disabled for this package
- Supports both ESM and CommonJS output
