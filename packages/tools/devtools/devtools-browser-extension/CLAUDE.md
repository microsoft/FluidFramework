# @fluid-internal/devtools-browser-extension

Browser extension for visualizing Fluid Framework stats and operations.

## Build

- `pnpm build` - Full build including webpack bundle
- `pnpm build:compile` - Compile TypeScript only
- `pnpm webpack` - Build production webpack bundle
- `pnpm webpack:dev` - Build development webpack bundle

## Test

- `pnpm test` - Run all tests (Mocha + Jest)
- `pnpm test:mocha` - Run Mocha unit tests (ESM and CJS)
- `pnpm test:jest` - Run Jest end-to-end tests
- `pnpm test:coverage` - Run tests with coverage

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome
- `pnpm good-fences` - Run good-fences boundary checks

## Development

- `pnpm start:client:test` - Start webpack dev server for testing

## Key Dependencies

- `@fluid-internal/devtools-view` - UI components
- `@fluidframework/devtools-core` - Core functionality
- `@microsoft/1ds-core-js` / `@microsoft/1ds-post-js` - Telemetry
- React 18

## Notes

- Private package (not published)
- Uses Puppeteer for e2e tests
- Requires Chrome types for extension APIs
- Uses sinon-chrome for mocking Chrome APIs in tests
