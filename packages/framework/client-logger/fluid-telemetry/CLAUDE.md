# @fluidframework/fluid-telemetry

Customer-facing Fluid telemetry types and classes for producing and consuming telemetry.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run all tests (requires Tinylicious server)
- `pnpm test:mocha` - Run unit tests only
- `pnpm test:realsvc:tinylicious` - Run end-to-end tests with Tinylicious

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `src/test/` - Test files (unit: `*.spec.js`, e2e: `*.spec.realsvc.js`)
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## Notes

- Tests require Tinylicious server running on port 7070
- Has multiple export entrypoints: `.` (public), `./beta`, `./internal`
- Depends on `@fluidframework/fluid-static` and container loader
- Type validation is disabled
