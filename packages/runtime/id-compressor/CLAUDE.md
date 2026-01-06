# @fluidframework/id-compressor

ID compressor - efficient ID generation and compression for Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM only
- `pnpm build:commonjs` - Build CommonJS only
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests (Mocha)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output
- `pnpm test:benchmark:report` - Run performance benchmarks
- `pnpm test:snapshots:regen` - Regenerate test snapshots

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source code
- `src/test/` - Test files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## API Exports

- `.` - Public API (`lib/public.d.ts`)
- `./legacy` - Legacy API with beta exports
- `./internal` - Internal API (full exports)
- `./internal/test-utils` - Test utilities (restricted export)

## Notes

- Dual ESM/CJS package with separate build outputs
- Has benchmark tests for performance monitoring
- Uses snapshot testing - regenerate with `test:snapshots:regen`
- Key dependencies: core-utils, telemetry-utils, sorted-btree-es6, uuid
