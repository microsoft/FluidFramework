# @fluid-experimental/data-object-base

Data object base for synchronously and lazily loaded object scenarios.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

This package has no test script configured.

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Experimental package (note `@fluid-experimental` scope)
- Single export entrypoint (no public/legacy separation)
- Builds base classes for data objects with container-runtime integration
- Type validation is disabled
