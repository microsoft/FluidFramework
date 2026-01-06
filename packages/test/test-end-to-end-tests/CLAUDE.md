# @fluid-private/test-end-to-end-tests

End-to-end tests for Fluid Framework against real services.

## Build

- `pnpm build` - Build the package
- `pnpm build:test` - Build test files (ESM)

## Test

- `pnpm test` - Run all tests (local + tinylicious)
- `pnpm test:realsvc:local` - Run tests against local server
- `pnpm test:realsvc:tinylicious` - Run tests against Tinylicious
- `pnpm test:realsvc:frs` - Run tests against FRS (Fluid Relay Service)
- `pnpm test:realsvc:odsp` - Run tests against OneDrive/SharePoint
- `pnpm test:realsvc:r11s` - Run tests against Routerlicious
- `pnpm test:realsvc:verbose` - Run tests with verbose output

## Benchmarks

- `pnpm test:benchmark:report` - Run time benchmarks (local)
- `pnpm test:benchmark:report:frs` - Run time benchmarks (FRS)
- `pnpm test:benchmark:report:odsp` - Run time benchmarks (ODSP)
- `pnpm test:memory-profiling:report` - Run memory benchmarks (local)

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Notes

- Private package (not published)
- Module type: ESM
- Tests run against multiple service backends via test drivers
- Uses `start-server-and-test` to manage Tinylicious lifecycle
- Supports backward compatibility testing via `fluid__test__backCompat` env var
- Benchmark configs in `src/test/benchmark/`
