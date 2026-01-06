# @fluid-example/migration-tools

Tools for migrating data in Fluid containers.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:docs` - Generate API documentation with api-extractor
- `pnpm tsc` - Build CommonJS output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome
- `pnpm check:exports` - Validate API exports

## Notes

- This is an example utility package (not published)
- Provides utilities for container migration scenarios
- Exports via `/alpha` and `/internal` subpaths (not root)
- Dual ESM/CommonJS output
- No tests in this package
