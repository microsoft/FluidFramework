# @fluidframework/odsp-urlresolver

URL Resolver for ODSP (OneDrive/SharePoint) URLs.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, ESM only by default)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/odsp-driver` - ODSP driver implementation
- `@fluidframework/odsp-driver-definitions` - ODSP-specific types
- `@fluidframework/driver-definitions` - Core driver interfaces

## Notes

- Resolves ODSP URLs to Fluid resolved URLs
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
