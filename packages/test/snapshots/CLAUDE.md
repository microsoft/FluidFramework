# @fluid-internal/test-snapshots

Comprehensive test of snapshot logic for Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build test files (ESM and CJS)
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run all tests (ESM by default)
- `pnpm test:mocha:esm` - Run ESM tests
- `pnpm test:mocha:cjs` - Run CJS tests
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:new` - Generate new snapshots
- `pnpm test:update` - Update existing snapshots

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Notes

- Private package (not published)
- Module type: ESM
- Uses `@fluid-internal/replay-tool` for snapshot replay
- Tests snapshot logic for various DDS types (Cell, Counter, Map, Matrix, Sequence, etc.)
- Uses file-driver and replay-driver for snapshot testing
