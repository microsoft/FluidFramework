# @fluid-example/example-driver

Simplified drivers used by examples in the FluidFramework repo.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is an example utility package (not published)
- Provides simplified driver wrappers for local, ODSP, routerlicious, and tinylicious drivers
- No tests in this package
- Dual ESM/CommonJS output
