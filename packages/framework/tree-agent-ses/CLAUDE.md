# @fluidframework/tree-agent-ses

SES (Secure ECMAScript) integration helpers for @fluidframework/tree-agent.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha)
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

## Notes

- Has multiple export entrypoints: `.` (public), `./alpha`, `./internal`
- Provides sandboxed execution for AI-generated code via SES
- Dependencies: `@fluidframework/tree-agent`, `ses` (Secure ECMAScript)
- Type validation is disabled
