# @fluid-example/bundle-size-tests

A package for understanding the bundle size of Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build TypeScript only
- `pnpm webpack` - Run webpack bundling

## Test

- `pnpm test` - Run mocha tests (requires webpack build first)

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Bundle Analysis

- `pnpm explore:tree` - Generate bundle analysis report for SharedTree

## Notes

- This is an example utility package (not published)
- Tests verify bundle sizes against thresholds using puppeteer
- Webpack bundles are required before running tests
- Uses source-map-explorer for detailed bundle analysis
