# @fluid-example/app-integration-live-schema-upgrade

Example application that demonstrates how to add a data object to a live container.

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
- Uses webpack for bundling and dev server
- Uses Puppeteer for integration tests
- Key dependencies: @fluidframework/aqueduct, @fluidframework/counter, @fluidframework/container-loader
