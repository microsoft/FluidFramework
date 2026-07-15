---
"@fluidframework/tree": patch
"fluid-framework": patch
"__section": fix
---
Fix insertable types when using typesRecursive with multiple allowed types

The allowed types produced by `SchemaFactoryBeta.typesRecursive` (and `SchemaFactoryAlpha.typesRecursive`) are now processed correctly when used in a recursive schema that permits more than one type.

Previously, passing such a their output to a recursive schema (for example `factory.arrayRecursive` or `factory.mapRecursive`) computed the node's insertable content type as `never`.
This caused valid insertions to fail to compile.
Recursive schemas built from a `typesRecursive` list with two or more types now accept insertable content for each of the allowed types as expected.
Recursive schemas that use a single type were unaffected.
