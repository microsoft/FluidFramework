# @fluid-example/app-integration-external-data

Demonstrates integrating an external data source with Fluid data.

## Build

- `pnpm build` - Build the package
- `pnpm webpack` - Build webpack bundle for production
- `pnpm webpack:dev` - Build webpack bundle for development

## Run

- `pnpm start` - Start the full application (Tinylicious + services + client)
- `pnpm start:tinylicious` - Start Tinylicious server only
- `pnpm start:services` - Start mock external services (ports 5236 and 5237)
- `pnpm start:client` - Start webpack dev server

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm eslint` - Run ESLint
- `pnpm eslint:fix` - Fix ESLint issues
- `pnpm format` - Format with Biome

## Notes

- This is an example package (not published)
- Uses Tinylicious as the local Fluid server (port 7070)
- Includes mock external data service (port 5236) and customer service (port 5237)
- Tests use Puppeteer for browser automation
