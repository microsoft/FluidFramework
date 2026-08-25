# Entry point source structure for `@fluidframework/core-utils`

This package has separate external and internal entrypoints. The entrypoints can export the same runtime value with different API metadata.
This structure lets the package deprecate an API for external consumers while retaining a non-deprecated version for Fluid Framework code.

## `src/index.ts`

This barrel is the source for the external runtime entrypoints.
The entrypoint generator processes this barrel to produce the `public`, `alpha`, `beta`, and `legacy` declaration files.

External consumers import APIs from the applicable supported entrypoint, such as `@fluidframework/core-utils` or `@fluidframework/core-utils/legacy`.

## `src/internal.ts`

This barrel is the source for `@fluidframework/core-utils/internal`.
It re-exports `src/index.ts`, so the internal entrypoint is a superset of the external entrypoint.
It can also shadow an external export when Fluid Framework code requires different API metadata or typing.

For example, the external `assert` export is deprecated, but Fluid Framework code still requires a non-deprecated version.
The internal barrel exports a new `@internal` binding that references the external implementation:

```typescript
import { assert as publicAssert } from "./assert.js";

/**
 * @internal
 */
export const assert: typeof publicAssert = publicAssert;
```

This alias preserves the complete assertion function type and the runtime function identity.
Do not create a wrapper function because a wrapper would create a different function object and duplicate runtime behavior.

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
