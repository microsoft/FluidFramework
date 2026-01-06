# @fluidframework/driver-web-cache

Implementation of the driver caching API for a web browser.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (Jest)
- `pnpm test:jest` - Run Jest tests directly

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `idb` - IndexedDB wrapper for browser storage
- `@fluidframework/driver-definitions` - Core driver interfaces
- `@fluidframework/driver-utils` - Driver utilities

## Notes

- Uses IndexedDB for browser-based caching
- Tests use `fake-indexeddb` for mocking
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
