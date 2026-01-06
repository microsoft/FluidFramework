# @fluid-private/test-version-utils

Utilities for version compatibility testing in Fluid Framework.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:test` - Build test files (ESM)
- `pnpm build:docs` - Generate API documentation

## Test

- `pnpm test` - Run all tests
- `pnpm test:mocha` - Run tests with 10s timeout
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:are-the-types-wrong` - Verify type exports

## Exports

- `.` - Main entry point (ESM only)
- `./mocharc-common` - Common Mocha configuration (CJS)

## Notes

- Published package (ESM only, no CJS)
- Provides utilities for testing version compatibility across Fluid releases
- Uses `semver` for version parsing and comparison
- Uses `proper-lockfile` for file locking during package installation
- Uses `nconf` for configuration management
- Key dependency: `@fluid-tools/version-tools`
- Caches legacy package versions in `node_modules/.legacy`
