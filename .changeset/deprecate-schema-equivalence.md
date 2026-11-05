---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": deprecation
---
Deprecate isEquivalent compatibility flag

`SchemaCompatibilityStatus.isEquivalent` is deprecated.
Use `canView` to determine whether you can read and edit a document with your view schema.
Use `canUpgrade` to determine whether you can upgrade the document's stored schema.
For details about differences that prevent viewing, use `SchemaCompatibilityStatusBeta.discrepancies`.

There is no direct replacement for schema equivalence.
The property remains available until a future major release.
