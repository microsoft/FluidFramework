# @fluidframework/tinylicious-client

A tool to enable creation and loading of Fluid containers using the Tinylicious service.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:test` - Build tests

## Test

- `pnpm test` - Run tests against Tinylicious (starts server automatically on port 7070)
- `pnpm test:realsvc:tinylicious:run` - Run tests directly (requires Tinylicious already running)

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Format with Biome

## Key Files

- `src/` - Source code
- `lib/` - ESM output
- `dist/` - CommonJS output
- Exports: `.` (public), `./beta`, `./internal`

## Notes

- Tinylicious is a lightweight local Fluid service for development/testing
- Tests require Tinylicious running on port 7070
- Dual ESM/CommonJS package with multiple export paths
- Uses `@fluidframework/tinylicious-driver` for service connectivity
