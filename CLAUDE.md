# Fluid Framework

Distributed real-time collaborative web application framework using JavaScript/TypeScript.

## Build System

- Uses **pnpm** as package manager (required)
- Enable corepack: `corepack enable`
- Install dependencies: `pnpm install`
- Build all: `pnpm build`
- Build specific package: `pnpm build --filter @fluidframework/<package-name>`

## Commands

- `pnpm build` - Build all packages
- `pnpm test` - Run tests across all packages
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm clean` - Clean build artifacts

## Workspace Structure

This is a pnpm monorepo with multiple release groups:

- **packages/**: Core Fluid Framework packages (`@fluidframework/*`)
  - `common/` - Shared interfaces and utilities
  - `dds/` - Distributed Data Structures
  - `drivers/` - Service drivers
  - `framework/` - Framework components
  - `loader/` - Container loading
  - `runtime/` - Runtime components
  - `service-clients/` - Service client implementations
  - `test/` - Test utilities
  - `tools/` - Developer tools
  - `utils/` - Shared utilities
- **experimental/**: Experimental packages (`@fluid-experimental/*`)
- **examples/**: Example applications (`@fluid-example/*`, not published)
- **azure/packages/**: Azure-specific packages
- **tools/**: Build and development tools

## Code Style

- TypeScript with strict mode
- ESLint for linting
- Biome for formatting
- API Extractor for API documentation and release tags

## Testing

- Uses Mocha for most packages
- Use `pnpm test` in package directory
- Coverage via c8: `pnpm test:coverage`

## Key Conventions

- Package exports use release tags: `/public`, `/beta`, `/alpha`, `/legacy`, `/internal`
- Dual ESM/CJS builds (lib/ for ESM, dist/ for CJS)
- Use `workspace:~` for internal dependencies
- Follow conventional commits for commit messages
