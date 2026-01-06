# @fluid-example/diceroller

Minimal Fluid Container and Object sample to implement a collaborative dice roller.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start with Tinylicious (t9s) service
- `pnpm start:local` - Start with local service
- `pnpm start:t9s` - Start with Tinylicious service
- `pnpm start:odsp` - Start with ODSP service

## Test

- `pnpm test` - Run Jest tests with Puppeteer
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- Uses React for UI and @fluidframework/map for shared state
- Minimal example demonstrating basic Fluid Framework usage
- Supports multiple service backends (local, t9s, ODSP)
