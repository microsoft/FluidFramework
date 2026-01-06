# @fluid-example/tree-comparison

Comparing API usage in legacy SharedTree and new SharedTree.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start the webpack dev server
- `pnpm start:test` - Start with test configuration

## Test

- `pnpm test` - Run Jest tests with Puppeteer
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- Uses React for UI rendering
- Compares @fluid-experimental/tree (legacy) with @fluidframework/tree (new)
- Useful for understanding migration between SharedTree versions
- Supports Tinylicious and Routerlicious drivers
