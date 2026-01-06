# @fluidframework/routerlicious-urlresolver

URL Resolver for Routerlicious URLs.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Test

- `pnpm test` - Run tests (mocha, both ESM and CJS)
- `pnpm test:mocha:verbose` - Verbose test output

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/driver-definitions` - Core driver interfaces
- `nconf` - Configuration management

## Notes

- Resolves Routerlicious URLs to Fluid resolved URLs
- Uses nconf for environment-based configuration
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
