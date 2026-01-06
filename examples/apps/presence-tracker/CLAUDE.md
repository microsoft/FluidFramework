# @fluid-example/presence-tracker

Example application that tracks page focus and mouse position using the Fluid Framework presence features.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start both Tinylicious server and client
- `pnpm start:client` - Start only the webpack dev server
- `pnpm start:tinylicious` - Start only the Tinylicious server

## Test

- `pnpm test` - Run Jest tests (starts Tinylicious automatically)
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- Uses @fluidframework/presence for real-time presence tracking
- Uses @fluidframework/tinylicious-client and fluid-framework
- Requires Tinylicious server running on port 7070
- Uses start-server-and-test for coordinated server/client startup
