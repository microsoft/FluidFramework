# @fluid-experimental/sharejs-json1

Distributed data structure for hosting ottypes, specifically ShareJS json1 OT type.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output only
- `pnpm build:test` - Build tests (ESM and CJS)
- `pnpm dev` - Watch mode for development
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Dependencies

- `@fluid-experimental/ot` - Base OT hosting infrastructure
- `ot-json1` - ShareJS json1 OT type implementation

## Notes

- This is an experimental package under the `@fluid-experimental` namespace
- Type validation is disabled for this package
- Supports both ESM and CommonJS output
