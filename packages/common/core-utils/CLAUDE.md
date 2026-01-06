# @fluidframework/core-utils

Core utilities for the Fluid Framework. Not intended for use outside the Fluid client repo.

## Build

- `pnpm build` - Build the package (runs fluid-build)
- `pnpm build:esnext` - Build ESM with TypeScript
- `pnpm tsc` - Build CommonJS
- `pnpm clean` - Remove build artifacts

## Test

- `pnpm test` - Run mocha tests
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:mocha:cjs` - Run CJS tests only
- `pnpm test:coverage` - Run tests with c8 coverage

## Benchmarks

- `pnpm bench` - Run benchmarks
- `pnpm bench:profile` - Run benchmarks with V8 profiling

## Lint

- `pnpm lint` - Run all linters
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with biome
- `pnpm eslint` - Run eslint only

## Key Files

- `src/assert.ts` - Assertion utilities
- `src/lazy.ts` - Lazy initialization utilities
- `src/timer.ts` - Timer utilities
- `src/delay.ts` - Delay/sleep utilities
- `src/promiseCache.ts` - Promise caching
- `src/promises.ts` - Promise utilities
- `src/heap.ts` - Heap data structure
- `src/list.ts` - List data structure
- `src/compare.ts` - Comparison utilities
- `src/map.ts` - Map utilities

## Exports

- `.` - Public API
- `./legacy` - Legacy API
- `./internal` - Internal API

## Notes

- Internal utility package with no external dependencies
- Contains performance benchmarks using @fluid-tools/benchmark
