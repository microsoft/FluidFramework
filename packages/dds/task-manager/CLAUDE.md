# @fluidframework/task-manager

Distributed data structure for queueing exclusive tasks.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build test files
- `pnpm clean` - Clean build outputs

## Test

- `pnpm test` - Run all tests
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:exports` - Validate API exports

## Key Files

- `src/` - Source code
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Dual ESM/CommonJS package
- Has public, legacy, and internal entry points
- Depends on `@fluidframework/container-runtime-definitions`
- Used for coordinating exclusive task execution across clients
