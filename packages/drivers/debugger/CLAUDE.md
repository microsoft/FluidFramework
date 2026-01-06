# @fluidframework/debugger

Fluid Debugger - a tool to play through history of a file.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/replay-driver` - For replaying document operations
- `@fluidframework/driver-definitions` - Core driver interfaces
- `jsonschema` - JSON schema validation

## Notes

- No test suite in this package
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
