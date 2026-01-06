# @fluid-internal/mocha-test-setup

Utilities for Fluid tests - provides common Mocha test configuration and setup.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output
- `pnpm build:docs` - Generate API documentation

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm check:are-the-types-wrong` - Verify type exports

## Exports

- `.` - Main entry point (ESM and CJS)
- `./mocharc-common` - Common Mocha configuration (CJS only)

## Notes

- Published package with dual ESM/CJS support
- Provides source-map-support integration
- Depends on `@fluid-internal/test-driver-definitions`
- Used as a dev dependency by other test packages
