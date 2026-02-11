# Suggested Commands

## Package Manager
- `corepack enable` - Enable corepack
- `pnpm install` - Install deps

## Build
- `pnpm build` - Build all
- `pnpm build --filter @fluidframework/<pkg>` - Build specific package

## Test
- `pnpm test` - Run tests (in package dir)
- `pnpm test:coverage` - With coverage

## Lint/Format
- `pnpm lint` - Lint
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format with Biome

## Clean
- `pnpm clean` - Clean build artifacts

## System Utils (Darwin)
- fd instead of find
- sd instead of sed
- rg instead of grep
