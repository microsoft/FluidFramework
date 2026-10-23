---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Unsafe array-to-tuple conversion is available for allowed schemas

The alpha API `unsafeArrayToTuple` is now exported from `@fluidframework/tree/alpha` and `fluid-framework/alpha`.
It returns the original array with its type converted using [`UnionToTuple`](https://fluidframework.com/docs/api/fluid-framework/uniontotuple-typealias), allowing insertable content APIs to work when tuple type information has been lost.
Prefer preserving the tuple type with `as const` when possible.
The helper does not validate the array: if its element type includes a schema that is absent at runtime, TypeScript can accept content that fails at runtime.

See [Why is my insertable content getting typed as `never`?](https://github.com/microsoft/FluidFramework/tree/main/packages/dds/tree#why-is-my-insertable-content-getting-typed-as-never) for examples and an explanation of the runtime risks.
