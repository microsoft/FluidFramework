# @fluid-example/bubblebench-experimental-tree

Bubblemark-inspired DDS benchmark using the experimental tree DDS implementation.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start the benchmark (local mode)
- `pnpm start:tinylicious` - Run against Tinylicious
- `pnpm start:docker` - Run against Docker
- `pnpm start:r11s` - Run against R11s
- `pnpm start:spo` - Run against SharePoint Online
- `pnpm start:spo-df` - Run against SharePoint Online (dogfood)

## Test

- `pnpm test` - Run Jest tests (uses Puppeteer)
- `pnpm test:jest:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is a benchmark example (private, not published)
- Uses `@fluid-experimental/tree` for state management
- Depends on `@fluid-example/bubblebench-common` for shared utilities
- Browser-based benchmark bundled with Webpack
- Compare performance against baseline and other implementations
