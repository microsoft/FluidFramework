# @fluid-internal/test-service-load

Service load tests for Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build test files (ESM and CJS)
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run stress tests (Tinylicious)
- `pnpm test:stress` - Run stress tests with Tinylicious
- `pnpm test:stress:run` - Run stress tests directly via Mocha

## Run Load Tests

- `pnpm start` - Start load test runner
- `pnpm start:mini` - Start with mini profile
- `pnpm start:t9s` - Start against Tinylicious
- `pnpm start:frs` - Start against FRS
- `pnpm start:odsp` - Start against ODSP
- `pnpm full` - Run full load test profile
- `pnpm debug` - Run with Node.js debugger attached
- `pnpm debug:runner` - Run debug profile

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Notes

- Private package (not published)
- Module type: ESM
- Uses Commander for CLI argument parsing
- Profiles configured for different load scenarios (mini, full, ci_frs, debug)
- Uses `@fluid-private/stochastic-test-utils` for randomized operations
- Supports browser authentication via `--browserAuth` flag
