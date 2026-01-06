# @fluid-private/test-drivers

A driver abstraction and implementations for testing against various Fluid servers.

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

## Notes

- Published package with dual ESM/CJS support
- Implements test drivers for multiple backends:
  - Local server (`@fluidframework/local-driver`)
  - Tinylicious (`@fluidframework/tinylicious-driver`)
  - Routerlicious (`@fluidframework/routerlicious-driver`)
  - ODSP (`@fluidframework/odsp-driver`)
- Depends on `@fluid-internal/test-driver-definitions` for interfaces
- Uses `@fluid-private/test-pairwise-generator` for test configuration
