# @fluid-example/webflow

Collaborative markdown editor with custom flow layout.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:copy` - Copy CSS files to lib
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues

## Run

- `pnpm start` - Start dev server (local mode)
- `pnpm start:tinylicious` - Start with Tinylicious server
- `pnpm start:single` - Start in single-user mode
- `pnpm dev` - Watch mode for TypeScript

## Test

- `pnpm test` - Run Mocha tests
- `pnpm test:coverage` - Run tests with c8 coverage

## Notes

- This is an example package (private, not published)
- Uses `@fluidframework/sequence` and `@fluidframework/merge-tree`
- Has jsdom-based tests for DOM manipulation
- More complex editor example with custom layout engine
