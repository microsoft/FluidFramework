# @fluid-example/webpack-fluid-loader

Fluid object loader for webpack-dev-server.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - Build ESM output
- `pnpm build:webpack` - Build webpack bundle
- `pnpm webpack` - Run webpack directly
- `pnpm tsc` - Build CommonJS output

## Test

- `pnpm test` - Run mocha tests (ESM only by default)
- `pnpm test:mocha:esm` - Run ESM tests
- `pnpm test:mocha:cjs` - Run CJS tests
- `pnpm test:coverage` - Run tests with c8 coverage

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format with Biome

## Notes

- This is an example utility package (not published)
- Injects a script tag pointing at its own bundle (`/code/fluid-loader.bundle.js`) into the page
- Webpack bundle must stay up to date for users of this loader
- Supports local, ODSP, and routerlicious drivers
- Dual ESM/CommonJS output
