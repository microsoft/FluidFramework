# @fluid-example/multiview-container

Container package that assembles the multiview sample application.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:copy` - Copy CSS files to lib
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues

## Run

- `pnpm start` - Start dev server (local mode)
- `pnpm start:tinylicious` - Start with Tinylicious server

## Test

- `pnpm test` - Run Jest tests (Puppeteer-based)

## Notes

- This is an example package (private, not published)
- Main entry point for the multiview example
- Combines all multiview models and views into a runnable application
- Demonstrates how to compose multiple Fluid data objects with different views
