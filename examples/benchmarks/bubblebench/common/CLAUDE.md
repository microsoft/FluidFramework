# @fluid-example/bubblebench-common

Shared utilities and components for the Bubblebench benchmark suite.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is a library package (private, not published)
- Exports shared code at `lib/index.js`
- No standalone run or test scripts - this is consumed by other bubblebench packages
- Key dependencies:
  - `@fluid-experimental/tree` - Experimental tree DDS
  - `@fluidframework/map` - SharedMap DDS
  - `react` / `react-dom` - UI rendering
  - `best-random` - Random number generation
  - `use-resize-observer` - React resize hooks
