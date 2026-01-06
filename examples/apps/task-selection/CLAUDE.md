# @fluid-example/task-selection

Example demonstrating selecting a unique task amongst connected Fluid clients.

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
- Uses @fluidframework/task-manager for task coordination
- Uses @fluid-experimental/oldest-client-observer for client tracking
- Demonstrates leader election and task assignment patterns
