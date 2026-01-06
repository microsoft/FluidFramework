# @fluidframework/sequence

Distributed sequence - ordered collection of items (e.g., SharedString).

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:memory` - Run memory tests
- `pnpm test:stress` - Run stress/fuzz tests
- `pnpm test:benchmark:report` - Run benchmark tests

## Performance

- `pnpm perf` - Run performance benchmarks
- `pnpm perf:measure` - Run measurement benchmarks

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports

## Key Files

- `src/` - Source code
- `src/test/memory/` - Memory tests
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Depends on `@fluidframework/merge-tree` for underlying data structure
- Has public, legacy, and internal entry points
- Includes interval collection functionality
- Extensive testing: memory, stress, fuzz, and benchmarks
- Build depends on merge-tree test build
