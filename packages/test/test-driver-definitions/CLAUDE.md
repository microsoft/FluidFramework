# @fluid-internal/test-driver-definitions

A driver abstraction and interface definitions for testing against Fluid servers.

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
- Types-only package (no runtime code, main is empty)
- Defines interfaces for test drivers
- Key dependencies:
  - `@fluidframework/core-interfaces`
  - `@fluidframework/driver-definitions`
- Used by `@fluid-private/test-drivers` for implementations
