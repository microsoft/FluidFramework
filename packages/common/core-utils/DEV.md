# Entry point structure for `@fluidframework/core-utils`

This package has separate external and internal entry points.
An entry point controls the exports that are available from a package import path.

A barrel file re-exports application programming interfaces (APIs) from other modules.
This package uses three barrel files to give external and internal APIs different support metadata.
For example, an external API can have the `@deprecated` tag while the equivalent internal API does not have this tag.

## Shared exports: `src/main.ts`

This barrel file contains exports that are the same in the external and internal entry points.
The `src/index.ts` and `src/internal.ts` files re-export these shared APIs.

The file does not export `assert`.
The external entry point defines a deprecated alias for the internal `assert` function.

## External exports: `src/index.ts`

This barrel file is the source for the external entry points.
It re-exports the shared APIs from `src/main.ts`.
It also defines the deprecated external `assert` alias.

The entry point generator uses this file to generate the `public`, `alpha`, `beta`, and `legacy` declaration files.
External consumers import APIs from a supported path such as `@fluidframework/core-utils` or `@fluidframework/core-utils/legacy`.

## Internal exports: `src/internal.ts`

This barrel file is the source for `@fluidframework/core-utils/internal`.
It re-exports the shared APIs from `src/main.ts`.
It exports the internal `assert` function.

Fluid Framework code must import `assert` from the internal entry point:

```typescript
import { assert } from "@fluidframework/core-utils/internal";
```

## Separate `assert` symbols

TypeScript stores the `@deprecated` tag on the external `assert` symbol.
A type-only re-export does not remove this tag.
An internal export that uses `typeof` on the external symbol also retains this tag.
As a result, IntelliSense marks internal uses as deprecated.

The assertion module defines the internal `assert` symbol without the `@deprecated` tag.
The internal barrel file exports this symbol without modification:

```typescript
export { assert } from "./assert.js";
```

The external barrel file imports this symbol with a private alias.
It defines a deprecated `assert` constant with the same call signature:

This structure keeps the `@deprecated` tag on the external symbol only.

## Package export map

The `exports` field in `package.json` maps each import path to its declaration file and JavaScript file.
External import paths use generated declaration files and the `index.js` file.
The internal import path uses the `internal.d.ts` and `internal.js` files.

The `lib` directory contains ECMAScript module (ESM) output.
The `dist` directory contains CommonJS output.

The bundled API Extractor check uses `internal.d.ts`.
This declaration file contains the complete package API surface.

## Validate a change

Run these commands from the `packages/common/core-utils` directory:

1. Run `npm run build:compile` to compile the package and generate the entry points.
2. Run `npm run check:exports` to validate the generated entry points and API release tags.
3. Run `npm run check:biome` to validate the file format.
