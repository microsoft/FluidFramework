# @fluid-example/prosemirror

Collaborative rich text editor using ProseMirror.

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
- Integrates ProseMirror with Fluid's SharedString and merge-tree
- Uses multiple ProseMirror plugins (history, keymap, menu, schema-list)
- Demonstrates structured rich text collaboration
