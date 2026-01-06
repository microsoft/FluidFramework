# @fluid-example/monaco

Collaborative Monaco code editor example.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues

## Run

- `pnpm start` - Start dev server (local mode)
- `pnpm start:tinylicious` - Start with Tinylicious server

## Notes

- This is an example package (private, not published)
- Integrates Monaco Editor with Fluid's SharedString (`@fluidframework/sequence`)
- Uses monaco-editor-webpack-plugin for bundling
- Demonstrates rich code editor collaboration
