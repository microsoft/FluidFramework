# @fluid-example/app-insights-logger

A simple Fluid application with a React UI to test the Fluid App Insights telemetry logger that routes Fluid telemetry to Azure App Insights.

## Build

- `pnpm build` - Build the package
- `pnpm webpack` - Build webpack bundle for production
- `pnpm webpack:dev` - Build webpack bundle for development

## Run

- `pnpm start` - Start the full application (Tinylicious + client)
- `pnpm start:tinylicious` - Start Tinylicious server only
- `pnpm start:test-app:client` - Start webpack dev server only

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:coverage` - Run tests with coverage

## Lint

- `pnpm lint` - Run all linting
- `pnpm eslint` - Run ESLint
- `pnpm eslint:fix` - Fix ESLint issues
- `pnpm format` - Format with Biome

## Notes

- This is an example package (not published)
- Uses Tinylicious as the local Fluid server (port 7070)
- Demonstrates integration with `@fluidframework/app-insights-logger`
- Uses `@microsoft/applicationinsights-web` for Azure App Insights integration
- Tests use Jest with jsdom environment and React Testing Library
