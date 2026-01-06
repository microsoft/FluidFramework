# @fluidframework/tree

Distributed tree - hierarchical data structure.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:mocha:prod` - Run tests in production mode
- `pnpm test:memory` - Run memory tests
- `pnpm test:stress` - Run stress/fuzz tests
- `pnpm test:customBenchmarks` - Run custom benchmarks
- `pnpm test:snapshots:regen` - Regenerate test snapshots

## Benchmark

- `pnpm bench` - Run benchmarks
- `pnpm bench:profile` - Run benchmarks with profiling
- `pnpm test:benchmark:report` - Generate benchmark report

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports
- `pnpm depcruise` - Check dependency graph
- `pnpm depcruise:regen-known-issues` - Regenerate known dependency issues

## Key Files

- `src/` - Source code
- `src/test/memory/` - Memory tests
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Most feature-rich DDS with alpha, beta, public, legacy, and internal entry points
- Uses `@sinclair/typebox` for schema validation
- Uses `@tylerbu/sorted-btree-es6` for efficient tree operations
- Depends on `@fluidframework/id-compressor` for ID management
- Has dependency cruiser configuration for architecture validation
- Extensive testing: memory, stress, fuzz, smoke, and benchmarks
- Build depends on id-compressor test build
