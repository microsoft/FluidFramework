# @fluid-internal/tablebench

Table-focused benchmarks for comparing SharedTree and SharedMatrix performance.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:test` - Build test files
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start Tinylicious and webpack dev server
- `pnpm start:t9s` - Start Tinylicious only
- `pnpm start:webpack` - Start webpack dev server (requires Tinylicious running)

## Test

- `pnpm test` - Run Mocha tests
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:customBenchmarks` - Run custom benchmark suite

## Benchmarks

- `pnpm bench` - Run execution time benchmarks
- `pnpm bench:profile` - Run benchmarks with V8 profiling (outputs `profile.txt`)
- `pnpm bench:profile:inspect-brk` - Run benchmarks with debugger attached
- `pnpm bench:size` - Run size benchmarks
- `pnpm test:benchmark:report` - Generate benchmark report

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is a benchmark example (private, not published)
- Uses `@fluid-tools/benchmark` for performance measurement
- Key dependencies:
  - `@fluidframework/tree` - SharedTree DDS
  - `@fluidframework/matrix` - SharedMatrix DDS
  - `@fluidframework/azure-client` - Azure Fluid Relay client
- Uses Mocha test framework with custom benchmark reporter
- Requires Tinylicious for local development (`pnpm start` handles this)
