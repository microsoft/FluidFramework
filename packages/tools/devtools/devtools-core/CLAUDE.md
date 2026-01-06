# @fluidframework/devtools-core

Core functionality for Fluid Framework developer tools.

## Build

- `pnpm build` - Full build including lint and API
- `pnpm build:compile` - Compile only
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output
- `pnpm build:genver` - Generate version info

## Test

- `pnpm test` - Run Mocha tests (ESM only by default)
- `pnpm test:mocha:cjs` - Run CommonJS tests
- `pnpm test:coverage` - Run tests with coverage

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome
- `pnpm eslint:fix` - Fix ESLint issues

## API

- `pnpm api` - Generate API reports
- `pnpm build:docs` - Build API documentation
- `pnpm typetests:gen` - Generate type tests

## Exports

- `.` - Public API
- `./alpha` - Alpha API
- `./beta` - Beta API
- `./internal` - Internal API

## Key Dependencies

- Fluid container and runtime packages
- DDS packages (map, sequence, matrix, cell, counter, tree)
- `@fluidframework/telemetry-utils`

## Notes

- Dual ESM/CJS module output (lib/ for ESM, dist/ for CJS)
- Type validation enabled with alpha entrypoint
- Core package that other devtools packages depend on
