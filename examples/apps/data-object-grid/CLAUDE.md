# @fluid-example/data-object-grid

Data object grid creates child data objects from a registry and lays them out in a grid.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:copy` - Copy CSS files to lib
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start the webpack dev server
- `pnpm start:test` - Start with test configuration
- `pnpm dev` - Run webpack in development mode

## Test

- `pnpm test` - Run Jest tests with Puppeteer
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- Uses Fluent UI React components and react-grid-layout
- Demonstrates composing multiple Fluid examples (clicker, codemirror, prosemirror, etc.)
- Built with @fluidframework/aqueduct DataObject pattern
