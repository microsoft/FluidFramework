# @fluid-example/tree-cli-app

SharedTree CLI app demo.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:test` - Build test files
- `pnpm clean` - Remove build artifacts

## Run

- `pnpm app` - Run the CLI application (node ./lib/index.js)

## Test

- `pnpm test` - Run Mocha tests
- `pnpm test:mocha:verbose` - Run tests with verbose output

## Lint

- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues
- `pnpm format` - Format code with Biome

## Notes

- This is a private example application (not published to npm)
- CLI-based example (no webpack/browser)
- Uses @fluidframework/tree for SharedTree functionality
- Uses @sinclair/typebox for schema validation
- Uses Mocha for testing (not Jest like other examples)
