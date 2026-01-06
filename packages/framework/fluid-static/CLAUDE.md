# @fluidframework/fluid-static

A tool to enable consumption of Fluid Data Objects without requiring custom container code.

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

- Simplifies Fluid container setup for common use cases
- Has multiple export entrypoints: `.` (public), `./legacy`, `./internal`
- Depends on aqueduct, container-loader, container-runtime, and tree
- Used by `fluid-framework` as a dependency
