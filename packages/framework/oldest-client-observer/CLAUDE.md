# @fluid-experimental/oldest-client-observer

Data object to determine if the local client is the oldest amongst connected clients.

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

- Experimental package (note `@fluid-experimental` scope)
- Has multiple export entrypoints: `.` (public), `./legacy`, `./internal`
- Useful for leader election scenarios in distributed systems
- Type validation is disabled
