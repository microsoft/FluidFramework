# @fluidframework/undo-redo

Undo/Redo functionality for Fluid Framework data structures.

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

- Has export entrypoints: `.` (public), `./internal`
- Supports undo/redo for: `@fluidframework/map`, `@fluidframework/matrix`, `@fluidframework/sequence`
- Uses `@fluidframework/merge-tree` for sequence operations
