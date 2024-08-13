---
"@fluidframework/tree": minor
---

Add `@alpha` API `FixRecursiveArraySchema` as a workaround around an issue with recursive ArrayNode schema.

Importing a recursive ArrayNode schema via a d.ts file can produce an error like
`error TS2310: Type 'RecursiveArray' recursively references itself as a base type.`
if using a tsconfig with `"skipLibCheck": false`.

This error occurs due to the TypeScript compiler splitting the class definition into two separate declarations in the d.ts file (one for the base, and one for the actual class).
For unknown reasons, splitting the class declaration in this way breaks the recursive type handling, leading to the mentioned error.

Since recursive type handling in TypeScript is order dependent, putting just the right kind of usages of the type before the declarations can cause it to not hit this error.
For the case of ArrayNodes, this can be done via usage that looks like this:

```typescript
/**
 * Workaround to avoid
 * `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.` in the d.ts file.
 */
export declare const _RecursiveArrayWorkaround: FixRecursiveArraySchema<typeof RecursiveArray>;
export class RecursiveArray extends schema.arrayRecursive("RA", [() => RecursiveArray]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
}
```
