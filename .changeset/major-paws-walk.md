---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Handling of AllowedTypes arrays has changed

As an optimization, how [AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) arrays are processed has changed.
In many cases (such as ArrayNode and MapNode schema) much larger arrays can be provided without hitting:

> "Type instantiation is excessively deep and possibly infinite.ts"

Previously arrays of around 43 schema would start having this issue, but now arrays of hundreds work correctly.

This optimization has resulted in a small change in behavior for how [input types](https://fluidframework.com/docs/api/fluid-framework/input-typealias) are computed.
When the `AllowedTypes` array has a type that is a union of two arrays, and the two arrays start with the same subsequence of types, for example `[typeof A] | [typeof A, typeof B]`,
previously this would allow the types from the common prefix of the arrays.
Now all such unions produce `never` for their insertable node types (just like this example would if the order of the second array were reversed).
This case was not intentionally supported, and as documented in [input types](https://fluidframework.com/docs/api/fluid-framework/input-typealias), non-exact types, like these unions,
are not guaranteed to produce anything other than `never`.

If providing exact schema is not possible and the previous behavior is required, convert the union of arrays to an array of unions.
The above example can be turned into `[typeof A, typeof B | typeof A]`.

In addition to allowing much larger unions to compile, this change also fixes a case where
[AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias)
was order dependent, which it is documented not to be.
