# @fluid-internal/devtools-view

Visualization suite for Fluid Devtools UI components.

## Build

- `pnpm build` - Full build
- `pnpm build:compile` - Compile TypeScript
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run Jest tests (CJS only due to fluentui issue 30778)
- `pnpm test:jest:cjs` - Run CJS Jest tests
- `pnpm test:jest:esm` - Run ESM Jest tests (currently skipped)
- `pnpm test:coverage` - Run tests with coverage

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome

## API

- `pnpm build:docs` - Build API documentation
- `pnpm check:exports` - Check API exports

## Key Dependencies

- `@fluentui/react` and `@fluentui/react-components` - UI framework
- `@fluidframework/devtools-core` - Core devtools data
- `recharts` - Charting library
- `react-split-pane` - Resizable panes
- React 18

## Notes

- Private package (not published)
- Dual ESM/CJS output (lib/ for ESM, dist/ for CJS)
- ESM tests skipped due to FluentUI compatibility issue
- Uses axe-core for accessibility testing
