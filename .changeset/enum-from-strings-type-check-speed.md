---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Type-checking schema that use large enums from enumFromStrings is much faster

The type of the `schema` property returned by [`enumFromStrings`](https://fluidframework.com/docs/api/tree/#enumfromstrings-function) is now computed by mapping the provided array of members directly, instead of converting the union of members back into a tuple.
The cost of type-checking code that uses `schema` (for example, as a field's allowed types) now grows linearly with the number of members rather than roughly quadratically.

For example, type-checking a field whose allowed types are a 250-member enum created with `enumFromStrings` takes about 1.4 seconds instead of about 19 seconds with TypeScript 6, and requires about 8 times fewer type instantiations.

`schema` is still a tuple with one entry per member, and its entries are in the same order as the members passed to `enumFromStrings`.
When the members are not a tuple type (for example, a `string[]`), `schema` is typed as an array instead of a single-element tuple, matching its runtime value.
