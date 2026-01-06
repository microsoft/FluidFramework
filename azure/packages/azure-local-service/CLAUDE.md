# @fluidframework/azure-local-service

Local implementation of the Azure Fluid Relay service for testing/development use. This is a thin wrapper around `tinylicious`.

## Build

This package has no build step - it's a simple JavaScript entry point.

- `pnpm clean` - Remove generated files

## Run

- `pnpm start` - Start the local service using pm2
- `pnpm start:debug` - Start with Node.js inspector enabled (port 9229)
- `pnpm stop` - Stop the pm2-managed service

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:format` - Check formatting with Biome

## Key Files

- `index.js` - Entry point that imports and runs tinylicious

## Notes

- This package wraps `tinylicious` to provide a local Azure Fluid Relay-compatible service
- Uses pm2 for process management in production mode
- No tests are defined for this package
- Type validation is disabled
