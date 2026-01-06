# @fluid-internal/client-utils

Internal client utilities for the Fluid Framework. Not intended for use outside the Fluid Framework.

## Build

- `pnpm build` - Build the package (runs fluid-build)
- `pnpm build:esnext` - Build ESM with TypeScript
- `pnpm tsc` - Build CommonJS
- `pnpm clean` - Remove build artifacts

## Test

- `pnpm test` - Run all tests (mocha + jest)
- `pnpm test:mocha` - Run mocha tests (ESM and CJS)
- `pnpm test:jest` - Run jest tests (browser environment with puppeteer)
- `pnpm test:coverage` - Run tests with c8 coverage

## Lint

- `pnpm lint` - Run all linters
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with biome
- `pnpm eslint` - Run eslint only

## Key Files

- `src/indexBrowser.ts` - Browser entry point
- `src/indexNode.ts` - Node.js entry point
- `src/bufferBrowser.ts` / `src/bufferNode.ts` - Platform-specific buffer utilities
- `src/base64EncodingBrowser.ts` / `src/base64EncodingNode.ts` - Platform-specific base64 encoding
- `src/hashFileBrowser.ts` / `src/hashFileNode.ts` - Platform-specific hashing
- `src/typedEventEmitter.ts` - Typed event emitter implementation

## Notes

- Dual entry points: separate browser and Node.js builds
- Uses both mocha and jest for testing (jest for browser tests with puppeteer)
- Dependencies: `@fluidframework/core-interfaces`, `@fluidframework/core-utils`
