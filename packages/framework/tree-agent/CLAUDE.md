# @fluidframework/tree-agent

Experimental package to simplify integrating AI into Fluid-based applications.

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
- Core AI integration package for Fluid Framework
- Dependencies: `@anthropic-ai/sdk`, `zod` for schema validation
- Dev dependencies include LangChain providers (Anthropic, OpenAI, Google) and SES for sandboxing
- Integrates with `@fluidframework/tree` for collaborative AI-powered data structures
- Type validation is disabled
