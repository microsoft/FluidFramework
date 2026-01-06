# @fluid-example/example-webpack-integration

Webpack configuration used by examples in the FluidFramework repo.

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
- Provides shared webpack configuration for Fluid examples
- Includes webpack and webpack-dev-server as dependencies
- Dual ESM/CommonJS output
- No tests in this package
