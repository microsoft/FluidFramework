# @fluidframework/merge-tree

Merge tree - core data structure for sequence-based DDSs.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:stress` - Run stress/fuzz tests
- `pnpm test:benchmark:report` - Run benchmark tests

## Performance

- `pnpm perf` - Run performance benchmarks
- `pnpm perf:measure` - Run measurement benchmarks
- `pnpm perf:profile` - Run with profiling

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports

## Key Files

- `src/` - Source code
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Core dependency for sequence-based DDSs (sequence, matrix)
- Has public, legacy, and internal entry points
- Extensive performance testing capabilities
- Uses `@fluid-private/stochastic-test-utils` for fuzz testing
