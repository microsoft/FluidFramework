# @fluidframework/azure-service-utils

Helper service-side utilities for connecting to Azure Fluid Relay service. Provides token generation utilities for backend APIs.

## Build

- `pnpm build` - Full build (compile + API reports)
- `pnpm build:compile` - Compile TypeScript only
- `pnpm build:esnext` - Build ESM output to `lib/`
- `pnpm tsc` - Build CommonJS output to `dist/`
- `pnpm clean` - Remove generated files

## Lint

- `pnpm lint` - Run all linting
- `pnpm lint:fix` - Auto-fix lint issues
- `pnpm check:format` - Check formatting with Biome

## API Reports

- `pnpm build:api-reports` - Generate API reports
- `pnpm api` - Run API extractor

## Key Files

- `src/index.ts` - Main entry point, exports `generateToken` and types
- `src/generateToken.ts` - Token generation logic using jsrsasign
- Dual CJS/ESM output with multiple export paths (public, legacy, internal)

## Notes

- Primary export is `generateToken` for creating Azure Fluid Relay tokens
- Uses `jsrsasign` for JWT token generation
- Exports are tiered: public (default), legacy, and internal
- No tests are currently defined
- Type validation uses the "legacy" entrypoint
