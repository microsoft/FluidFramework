# @fluidframework/datastore

Fluid data store implementation - runtime implementation for data stores within containers.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM only
- `pnpm build:commonjs` - Build CommonJS only
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests (Mocha)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output

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

## Notes

- Dual ESM/CJS package with separate build outputs
- Uses `fluid-build` for build orchestration
- Key dependencies: datastore-definitions, id-compressor, runtime-utils, driver-utils
