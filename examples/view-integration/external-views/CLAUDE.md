# @fluid-example/app-integration-external-views

Minimal Fluid Container & Data Object sample to implement a collaborative dice roller as a standalone app.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm webpack` - Build webpack bundle for production
- `pnpm webpack:dev` - Build webpack bundle for development

## Run

- `pnpm start` - Start with Tinylicious service (default)
- `pnpm start:local` - Start with local service
- `pnpm start:t9s` - Start with Tinylicious service
- `pnpm start:odsp` - Start with OneDrive/SharePoint service
- `pnpm start:test` - Start for testing (local service, test config)

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm check:format` - Check formatting with Biome
- `pnpm format` - Fix formatting with Biome

## Notes

- This is a view integration example (not published)
- Uses React for the view layer
- Demonstrates external view integration with Fluid containers
- Supports multiple service backends (local, Tinylicious, ODSP)
- Tests use Puppeteer for browser automation
