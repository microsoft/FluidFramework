# fluid-framework

The main entry point into Fluid Framework public packages.

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

- `src/` - Source TypeScript files (re-exports from other packages)
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- This is the primary public API package for Fluid Framework
- Has multiple export entrypoints: `.` (public), `./alpha`, `./beta`, `./legacy`
- Re-exports from: container-definitions, container-loader, core-interfaces, fluid-static, map, sequence, tree, and more
- No direct implementation - primarily aggregates and re-exports
- Type validation is disabled
