# @fluidframework/app-insights-logger

Fluid logging client that sends telemetry events to Azure App Insights.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Integrates with `@microsoft/applicationinsights-web`
- Has multiple export entrypoints: `.` (public), `./beta`, `./internal`
- Browser-focused package with UMD bundle support
