# @fluidframework/odsp-driver-definitions

Type definitions and interfaces for SharePoint Online (SPO) and OneDrive Consumer (ODC) driver.

## Build

- `pnpm build` - Build the package
- `pnpm build:compile` - Compile only
- `pnpm clean` - Clean build artifacts

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:biome` - Check formatting with Biome

## Key Dependencies

- `@fluidframework/driver-definitions` - Core driver interfaces

## Notes

- Definition-only package (no runtime code)
- No test suite in this package
- Dual ESM/CJS build output (lib/ and dist/)
- Uses Biome for formatting
- Has known breaking type changes (see typeValidation in package.json)
