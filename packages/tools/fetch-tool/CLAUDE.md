# @fluid-tools/fetch-tool

Console tool to fetch Fluid data from relay services.

## Build

- `pnpm build` - Full build
- `pnpm build:compile` - Compile TypeScript
- `pnpm build:esnext` - Build ESM output
- `pnpm tsc` - Build CommonJS output

## CLI

- Binary: `fluid-fetch` (bin/fluid-fetch)
- Run locally: `node bin/fluid-fetch`

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome
- `pnpm eslint:fix` - Fix ESLint issues

## Key Dependencies

- `@azure/identity` - Azure authentication
- `@fluidframework/odsp-driver` - SharePoint/OneDrive driver
- `@fluidframework/routerlicious-driver` - Routerlicious driver
- `@fluidframework/tool-utils` - Shared tool utilities

## Notes

- ESM module type
- Supports ODSP and Routerlicious services
- Uses Azure identity with cache persistence
- Type validation with internal entrypoint
