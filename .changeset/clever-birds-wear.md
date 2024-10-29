---
"@fluidframework/merge-tree": minor
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": fix
---

Fix compiler errors when building with libCheck

Compiling code using Fluid Framework when using TypeScript's `libCheck` (meaning without [skipLibCheck](https://www.typescriptlang.org/tsconfig/#skipLibCheck)), two compile errors can be encountered:

```
> tsc

node_modules/@fluidframework/merge-tree/lib/client.d.ts:124:18 - error TS2368: Type parameter name cannot be 'undefined'.

124     walkSegments<undefined>(handler: ISegmentAction<undefined>, start?: number, end?: number, accum?: undefined, splitRange?: boolean): void;
                     ~~~~~~~~~

node_modules/@fluidframework/tree/lib/util/utils.d.ts:5:29 - error TS7016: Could not find a declaration file for module '@ungap/structured-clone'. 'node_modules/@ungap/structured-clone/esm/index.js' implicitly has an 'any' type.
  Try `npm i --save-dev @types/ungap__structured-clone` if it exists or add a new declaration (.d.ts) file containing `declare module '@ungap/structured-clone';`

5 import structuredClone from "@ungap/structured-clone";
                              ~~~~~~~~~~~~~~~~~~~~~~~~~
```

While neither of these compile errors are in the `@public` API surface, they could impact customers using the public API due to how `libCheck` works and how Fluid Framework handles it's API exports.
This change fixes these errors which should allow `libCheck` to be reenabled.
