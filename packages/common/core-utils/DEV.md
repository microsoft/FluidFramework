# Entry point source structure for `@fluidframework/core-utils`

This package has separate external and internal entrypoints. The entrypoints can export the same runtime value with different API metadata.
This structure lets the package deprecate an API for external consumers while retaining a non-deprecated version for Fluid Framework code.

## `src/main.ts`

This barrel contains exports that have the same definition and API metadata in the external and internal entrypoints.
Both `src/index.ts` and `src/internal.ts` re-export this barrel.

## `src/index.ts`

This barrel is the source for the external runtime entrypoints.
It re-exports `src/main.ts` and adds external-specific definitions.
The entrypoint generator processes this barrel to produce the `public`, `alpha`, `beta`, and `legacy` declaration files.

External consumers import APIs from the applicable supported entrypoint, such as `@fluidframework/core-utils` or `@fluidframework/core-utils/legacy`.

## `src/internal.ts`

This barrel is the source for `@fluidframework/core-utils/internal`.
It re-exports `src/main.ts` and adds internal-specific definitions.
Use separate external and internal definitions when an API requires different metadata or typing in each entrypoint.

For example, the external `assert` export is deprecated, but Fluid Framework code still requires a non-deprecated version.
The assertion module defines a non-deprecated internal implementation and a deprecated external function that delegates to it.
The internal barrel exports the implementation under the name `assert`:

```typescript
export { assertInternal as assert } from "./assert.js";
```

This direct export gives the internal entrypoint an independent, non-deprecated TypeScript symbol.
Do not type the internal export with `typeof` the deprecated external symbol.
TypeScript follows that reference and reports internal uses as deprecated.

Fluid Framework code must import this API from the internal entrypoint:

```typescript
import { assert } from "@fluidframework/core-utils/internal";
```

## Package exports

The package export map directs external imports to generated release-level declaration files and the `index.js` runtime file.
It directs internal imports to `internal.d.ts` and `internal.js`.
The package provides equivalent paths under `lib` for ECMAScript modules and `dist` for CommonJS.

The bundled API Extractor check uses `internal.d.ts` because the internal entrypoint contains the complete package API surface.
Run `npm run build:compile` after an entrypoint change, then run `npm run check:exports` to validate all generated entrypoints and release tags.
