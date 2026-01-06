# @fluid-example/view-framework-sampler

Example of integrating a Fluid data object with a variety of view frameworks.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm webpack` - Build webpack bundle for production
- `pnpm webpack:dev` - Build webpack bundle for development

## Run

- `pnpm start` - Start webpack dev server
- `pnpm start:test` - Start for testing (test config)

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
- Demonstrates integration with multiple view frameworks: React and Vue
- Uses @fluidframework/aqueduct for the data layer
- Tests use Puppeteer for browser automation
