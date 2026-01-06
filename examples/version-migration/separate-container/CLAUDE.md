# @fluid-example/version-migration-separate-container

Migrate data between two formats by exporting and reimporting in a new container.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Clean build artifacts

## Run

- `pnpm start` - Start the webpack dev server
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
- Depends on @fluid-example/migration-tools for migration utilities
- Key dependencies: @fluidframework/map, @fluidframework/sequence, @fluidframework/cell, @fluidframework/container-runtime
