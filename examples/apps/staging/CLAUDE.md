# @fluid-example/staging

Using the experimental staging feature.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start the webpack dev server
- `pnpm start:test` - Start with test configuration

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- Demonstrates experimental staging feature
- Uses React for UI and @fluidframework/map for shared state
- Supports multiple drivers: local, Tinylicious, and Routerlicious
