# @fluid-example/codemirror

Simple collaborative markdown editor using CodeMirror.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm build:copy` - Copy CSS files to lib
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Fix lint issues

## Run

- `pnpm start` - Start dev server (local mode)
- `pnpm start:tinylicious` - Start with Tinylicious server
- `pnpm dev` - Run webpack in development mode

## Notes

- This is an example package (private, not published)
- Integrates CodeMirror 5 with Fluid's SharedString (`@fluidframework/sequence`)
- Demonstrates real-time collaborative text editing
