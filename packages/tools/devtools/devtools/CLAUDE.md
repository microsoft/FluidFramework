# @fluidframework/devtools

Fluid Framework developer tools for integrating devtools into Fluid applications.

## Build

- `pnpm build` - Full build including lint and API
- `pnpm build:compile` - Compile only
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Tests not yet implemented (TODO)

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

- `@fluidframework/devtools-core` - Core devtools functionality
- `@fluidframework/fluid-static` - Fluid static integration

## Notes

- Dual ESM/CJS module output (lib/ for ESM, dist/ for CJS)
- Uses api-extractor for API surface management
- Type validation enabled with alpha entrypoint
