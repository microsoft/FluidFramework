# @fluid-example/table-document

Chaincode component containing table data structures.

## Build

- `pnpm build` - Build the package (ESM + CommonJS)
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:commonjs` - Build CommonJS output
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues

## Test

- `pnpm test` - Run Mocha tests
- `pnpm test:coverage` - Run tests with c8 coverage

## Notes

- This package is NOT private (may be published)
- Uses `@fluid-experimental/sequence-deprecated` for table data
- Provides both ESM and CommonJS exports
- Has API extractor configuration for type checking
