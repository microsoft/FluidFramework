# @fluid-internal/replay-tool

Tool for replaying Fluid ops for debugging and analysis.

## Build

- `pnpm build` - Full build
- `pnpm build:compile` - Compile TypeScript
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## CLI

- Binary: `replayTool` (bin/replayTool)
- Run locally: `node bin/replayTool`

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome
- `pnpm eslint:fix` - Fix ESLint issues

## Key Dependencies

- Fluid runtime packages (container-runtime, datastore, runtime-utils)
- DDS packages (map, sequence, matrix, cell, ordered-collection)
- `@fluidframework/replay-driver` - Replay driver
- `@fluidframework/file-driver` - File-based driver
- `json-stable-stringify` - Deterministic JSON output

## Notes

- Private package (not published)
- Dual ESM/CJS output (lib/ for ESM, dist/ for CJS)
- Includes experimental/deprecated packages (ink, sequence-deprecated)
- Useful for debugging op sequences and container state
