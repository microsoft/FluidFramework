# @fluid-experimental/dds-interceptions

Distributed Data Structures that support an interception callback.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `src/test/` - Test files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Experimental package (note `@fluid-experimental` scope)
- Single export entrypoint (no public/legacy separation)
- Wraps `@fluidframework/map`, `@fluidframework/sequence`, and `@fluidframework/merge-tree`
- Type validation is disabled
