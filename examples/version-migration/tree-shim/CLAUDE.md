# @fluid-example/tree-shim

Migrating from legacy SharedTree to new SharedTree using a tree shim.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Clean build artifacts

## Run

- `pnpm start` - Start the webpack dev server
- `pnpm start:tinylicious` - Start Tinylicious server and then the app
- `pnpm start:test` - Start with test configuration

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private version migration example (not published to npm)
- Uses React for the UI
- Uses webpack for bundling and dev server
- Uses Puppeteer for integration tests
- Key dependencies: @fluid-experimental/tree (legacy), @fluidframework/tree (new)
- Demonstrates shimming between legacy and new SharedTree implementations
