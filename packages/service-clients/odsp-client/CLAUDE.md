# @fluidframework/odsp-client

A tool to enable creation and loading of Fluid containers using the ODSP (OneDrive/SharePoint) service.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - Build ESM only
- `pnpm build:test` - Build tests

## Test

- `pnpm test` - Run unit tests with Mocha (ESM)
- `pnpm test:mocha:cjs` - Run tests in CommonJS mode

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

- Dual ESM/CommonJS package with multiple export paths
- Uses `@fluidframework/odsp-driver` and `@fluidframework/odsp-doclib-utils` for ODSP connectivity
- Type validation is disabled for this package
