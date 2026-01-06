# @fluid-example/odspsnapshotfetch-perftestapp

Benchmark for comparing binary vs. JSON snapshot download performance from ODSP (OneDrive/SharePoint).

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm start` - Start the benchmark (defaults to SPO dogfood)
- `pnpm start:spo` - Run against SharePoint Online
- `pnpm start:spo-df` - Run against SharePoint Online (dogfood)
- `pnpm dev` - Development mode with webpack

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is a benchmark example (private, not published)
- Runs as an Express.js server (`lib/expressApp.js`)
- Tests ODSP driver performance for snapshot fetching
- Key dependencies:
  - `@fluidframework/odsp-driver` - ODSP driver implementation
  - `@fluidframework/odsp-doclib-utils` - ODSP utilities
  - `@fluidframework/tool-utils` - CLI and tool utilities
  - `express` - HTTP server
- No automated tests - manual performance testing app
