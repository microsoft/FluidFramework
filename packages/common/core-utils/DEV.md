# Entry point structure for `@fluidframework/core-utils`

The package has separate external and internal entry points.
An entry point specifies the exports for a package import path.

A barrel file re-exports application programming interfaces (APIs) from other modules.
The package uses three barrel files to assign different support metadata to external and internal APIs.
For example, the external `assert` API has the `@deprecated` tag.
The internal `assert` API does not have the `@deprecated` tag.

## Shared exports: `src/main.ts`

The `src/main.ts` file exports APIs that have the same metadata in both entry points.
The `src/index.ts` and `src/internal.ts` files re-export the shared APIs.

The `src/main.ts` file does not export `assert`.
The other two barrel files export different `assert` symbols.

## External exports: `src/index.ts`

The `src/index.ts` file is the source for the external entry points.
It re-exports the shared APIs from `src/main.ts` and the deprecated external `assert` constant.

The entry point generator uses `src/index.ts` to generate the `public`, `alpha`, `beta`, and `legacy` declaration files.
External consumers use a supported path such as `@fluidframework/core-utils` or `@fluidframework/core-utils/legacy`.

## Internal exports: `src/internal.ts`

The `src/internal.ts` file is the source for `@fluidframework/core-utils/internal`.
It re-exports the shared APIs from `src/main.ts` and the internal `assert` function.

Fluid Framework code must import `assert` from the internal entry point:

```typescript
import { assert } from "@fluidframework/core-utils/internal";
```

## Separate `assert` symbols

TypeScript associates the `@deprecated` tag with the external `assert` symbol.
A type-only re-export keeps the `@deprecated` tag.
An export that uses `typeof` on the external symbol also keeps the `@deprecated` tag.
Therefore, IntelliSense marks both export forms as deprecated.

The assertion module defines the internal `assert` function without the `@deprecated` tag.
The internal barrel file exports the function directly:

```typescript
export { assert } from "./assert.js";
```

The external barrel file imports the function with a private alias.
The file defines a deprecated `assert` constant with the same call signature.

The separate symbols put the `@deprecated` tag only on the external symbol.

## Package export map

The `exports` field in `package.json` maps each import path to a declaration file and a JavaScript file.
External import paths use generated declaration files and the `index.js` file.
The internal import path uses the `internal.d.ts` and `internal.js` files.

The `lib` directory contains ECMAScript module output.
The `dist` directory contains CommonJS output.

The API Extractor check uses `internal.d.ts`.
The file contains the complete package API surface.

## Validate a change

Run the following commands in sequence from the `packages/common/core-utils` directory:

1. Run `npm run build:compile`.
	This command compiles the package and generates the entry points.
2. Run `npm run check:exports`.
	This command validates the generated entry points and API release tags.
3. Run `npm run check:biome`.
	This command validates the file format.
