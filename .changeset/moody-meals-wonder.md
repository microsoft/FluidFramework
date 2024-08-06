---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: fix
---

Recursive SharedTree schemas using MapNodes no longer produce invalid d.ts files

Consider a recursive SharedTree schema like the following:

```typescript
export class RecursiveMap extends schema.mapRecursive("RM", [() => RecursiveMap]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveMap>;
}
```

This schema, which follows all our recommended best practices for maximum chances of working, would work when used from within its compilation unit, but would generate d.ts that fails to compile when exporting it:

```typescript
declare const RecursiveMap_base: import("@fluidframework/tree").TreeNodeSchemaClass<"com.example.RM", import("@fluidframework/tree").NodeKind.Map, import("@fluidframework/tree").TreeMapNodeUnsafe<readonly [() => typeof RecursiveMap]> & import("@fluidframework/tree").WithType<"com.example.RM">, {
    [Symbol.iterator](): Iterator<[string, RecursiveMap], any, undefined>;
}, false, readonly [() => typeof RecursiveMap]>;
export declare class RecursiveMap extends RecursiveMap_base {
}
```

This results in the compile error in TypeScript 5.4.5:

> error TS2310: Type 'RecursiveMap' recursively references itself as a base type.

With this change, that error is fixed by modifying the `TreeMapNodeUnsafe` type it references to inline the definition of `ReadonlyMap` instead of using the one from the TypeScript standard library.
