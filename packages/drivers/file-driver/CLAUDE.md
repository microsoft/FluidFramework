# @fluidframework/file-driver

A driver that reads/writes from/to local file storage.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/replay-driver` - For replay functionality
- `@fluidframework/driver-definitions` - Core driver interfaces
- `@fluidframework/driver-utils` - Driver utilities

## Notes

- No test suite in this package
- Node.js only (file system operations)
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
