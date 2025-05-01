---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Handling of AllowedTypes arrays has changed

As an optimization, how [AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) arrays are processed has changed.
Now much larger arrays can be provided without hitting:

> "Type instantiation is excessively deep and possibly infinite.ts"

Previously arrays of around 43 schema would start having this issue, but now arrays of hundreds work correctly.

This optimization has resulted in a small change in behavior for how [input types](https://fluidframework.com/docs/api/fluid-framework/input-typealias) are computed.
When the `AllowedTypes` array has a type that is a union of two arrays, and the two arrays start with the same subsequence of types,
previously this would allow the types from the common prefix of the arrays.
For example `[typeof A] | [typeof A, typeof B]` would permit inserting content compatible with `A`.
Now all such unions produce `never` for their insertable node types (just like this example would if the order of the second array were reversed).
This case was not intentionally supported, and as documented in [input types](https://fluidframework.com/docs/api/fluid-framework/input-typealias), non-exact types, like these unions,
are not guaranteed to produce anything other than `never`.

If providing exact schema is impractical and the previous behavior is required, convert the union of arrays to an array of unions.
The above example can be turned into `[typeof A, typeof B | typeof A]`.

This is also fix for a case where
[AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias)
was order dependent, which violates its documented order independence.
