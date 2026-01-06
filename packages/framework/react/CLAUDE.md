# @fluidframework/react

Utilities for integrating content powered by the Fluid Framework into React applications.

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

- Has multiple export entrypoints: `.` (public), `./alpha`, `./beta`, `./internal`
- Peer dependency on React 18.x
- Uses `@testing-library/react` and `global-jsdom` for testing
- Integrates with `@fluidframework/tree` for reactive tree bindings
- Type validation is disabled
