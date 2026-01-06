# @fluidframework/fluid-runner

Utility for running functionality inside a Fluid Framework environment.

## Build

- `pnpm build` - Full build including lint and API
- `pnpm build:compile` - Compile only
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run Mocha tests (ESM and CJS)
- `pnpm test:mocha:esm` - Run ESM tests only
- `pnpm test:mocha:cjs` - Run CJS tests only
- `pnpm test:coverage` - Run tests with coverage

## CLI

- Binary: `fluid-runner` (bin/fluid-runner.mjs)
- Run locally: `node bin/fluid-runner.mjs`

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome

## API

- `pnpm api` - Generate API reports
- `pnpm build:docs` - Build API documentation
- `pnpm typetests:gen` - Generate type tests

## Exports

- `.` - Public API
- `./legacy` - Legacy API
- `./internal` - Internal API

## Key Dependencies

- `@fluidframework/container-loader` - Container loading
- `@fluidframework/odsp-driver` - ODSP support
- `yargs` - CLI argument parsing
- `@json2csv/plainjs` - CSV output

## Notes

- Dual ESM/CJS output (lib/ for ESM, dist/ for CJS)
- Type validation with legacy entrypoint
- Uses yargs for CLI interface
