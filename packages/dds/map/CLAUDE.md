# @fluidframework/map

Distributed map - a key-value data structure.

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
- `pnpm test:snapshots:regen` - Regenerate test snapshots

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

- Dual ESM/CommonJS package
- Has public, legacy, and internal entry points
- Includes memory and stress testing capabilities
- Uses `path-browserify` for browser compatibility
