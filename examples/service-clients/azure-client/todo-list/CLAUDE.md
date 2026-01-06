# @fluid-example/azure-client-todo-list

Minimal Fluid Container sample demonstrating the use of SharedTree and nested DDSs via a simple to-do list application.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm webpack` - Production webpack build
- `pnpm clean` - Clean build artifacts

## Run

- `pnpm start` - Start with Tinylicious (local Fluid server on port 7070)
- `pnpm start:azure` - Start with Azure Fluid Relay
- `pnpm start:client` - Start webpack dev server only (requires separate Fluid server)

## Test

- `pnpm test` - Run Jest tests with Puppeteer
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm eslint` - Run ESLint only
- `pnpm check:format` - Check Biome formatting
- `pnpm format` - Auto-fix formatting with Biome

## Notes

- This is a private example package (not published to npm)
- Uses `@fluidframework/azure-client` for Azure Fluid Relay connectivity
- React-based UI with `@fluidframework/react` bindings
- Demonstrates SharedTree usage with nested distributed data structures
- Tinylicious runs on port 7070 for local development
- Tests use Puppeteer for browser automation
