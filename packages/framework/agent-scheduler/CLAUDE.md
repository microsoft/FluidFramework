# @fluidframework/agent-scheduler

Built-in runtime object for distributing agents across instances of a container.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

This package has no test script configured.

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Supports both ESM and CommonJS exports
- Has multiple export entrypoints: `.` (public), `./legacy`, `./internal`
- Uses `@fluidframework/map` and `@fluidframework/register-collection` internally
