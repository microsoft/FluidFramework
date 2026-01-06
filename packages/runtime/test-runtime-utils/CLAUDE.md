# @fluidframework/test-runtime-utils

Fluid runtime test utilities - mock implementations and helpers for testing Fluid applications.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM only
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

- `src/` - Source code (mock implementations, test helpers)
- `src/test/` - Test files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## API Exports

- `.` - Public API (`lib/public.d.ts`)
- `./legacy` - Legacy API with beta exports
- `./internal` - Internal API (full exports)

## Notes

- Test-only package - provides mocks for runtime interfaces
- Used as devDependency by other packages for unit testing
- Includes mock implementations for data stores, delta connections, and runtime components
- Dependencies include routerlicious-driver and jsrsasign for token generation
