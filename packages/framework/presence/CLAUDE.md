# @fluidframework/presence

A component for lightweight data sharing within a single session.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm build:esnext` - Build ESM (runs main + experimental builds)
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, both ESM and CJS)
- `pnpm test:coverage` - Run tests with coverage (c8)
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome

## Key Files

- `src/` - Source TypeScript files
- `src/test/` - Test files
- `lib/` - ESM build output
- `dist/` - CommonJS build output
- `tsconfig.main.json` - Main build config
- `tsconfig.json` - Experimental build config (extends main)

## Notes

- Has specialized build: `build:esnext:main` then `build:esnext:experimental`
- Export entrypoints: `./beta`, `./alpha`, `./legacy/alpha` (no default `.` export)
- Uses `@fluidframework/id-compressor` for client identification
- Integrates with fluid-static for session awareness
- Type validation is disabled
