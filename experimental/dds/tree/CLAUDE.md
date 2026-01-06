# @fluid-experimental/tree

Distributed tree data structure. An experimental tree implementation with advanced features.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:stress` - Run fuzz/stress tests
- `pnpm perf` - Run performance benchmarks
- `pnpm perf:measure` - Run measurement benchmarks

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Dependencies

- `@fluidframework/tree` - Core tree package
- `@fluidframework/id-compressor` - ID compression utilities
- `@fluidframework/shared-object-base` - Base class for shared objects
- `@tylerbu/sorted-btree-es6` - Sorted B-tree data structure
- `denque` - Double-ended queue
- `lru-cache` - LRU caching

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Contains fuzz tests (`*.fuzz.tests.js`) for stress testing
- Has benchmark tests for performance measurement
- Type validation is disabled for this package
- Supports both ESM and CommonJS output
