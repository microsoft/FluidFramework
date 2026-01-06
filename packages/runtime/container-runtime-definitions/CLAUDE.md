# @fluidframework/container-runtime-definitions

Fluid Runtime definitions - TypeScript interfaces and types for container runtime.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM only
- `pnpm clean` - Clean build outputs

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source code (interfaces and types only)
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## API Exports

- `.` - Public API (`lib/public.d.ts`)
- `./legacy` - Legacy API with beta exports
- `./internal` - Internal API (full exports)

## Notes

- Types-only package (no runtime JavaScript)
- Defines interfaces consumed by container-runtime and other packages
- Dependencies: container-definitions, core-interfaces, driver-definitions, runtime-definitions
