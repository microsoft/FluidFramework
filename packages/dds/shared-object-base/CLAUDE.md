# @fluidframework/shared-object-base

Fluid base class for shared distributed data structures.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Benchmark

- `pnpm bench` - Run benchmarks

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports

## Key Files

- `src/` - Source code
- `bench/` - Benchmark code
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Core base class for all DDSs - most DDS packages depend on this
- Has public, legacy, and internal entry points
- Depends on `@fluidframework/datastore` and `@fluidframework/id-compressor`
- Uses `sinon` for test mocking
