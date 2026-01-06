# @fluidframework/runtime-definitions

Fluid Runtime definitions - core TypeScript interfaces and types for the runtime layer.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM only
- `pnpm clean` - Clean build outputs

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source code (interfaces and types)
- `lib/` - ESM build output
- `dist/` - CommonJS build output

## API Exports

- `.` - Public API (`lib/public.d.ts`)
- `./legacy` - Legacy API with beta exports
- `./legacy/alpha` - Legacy alpha API
- `./internal` - Internal API (full exports)

## Notes

- Foundational definitions package used by most runtime packages
- Has alpha API exports via `./legacy/alpha` entrypoint
- Dependencies: container-definitions, core-interfaces, driver-definitions, id-compressor, telemetry-utils
