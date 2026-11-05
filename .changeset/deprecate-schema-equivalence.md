---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": deprecation
---
Deprecate isEquivalent compatibility flag

[`SchemaCompatibilityStatus.isEquivalent`](https://fluidframework.com/docs/api/fluid-framework/schemacompatibilitystatus-interface#isequivalent-propertysignature) is deprecated.
Use [`canView`](https://fluidframework.com/docs/api/fluid-framework/schemacompatibilitystatus-interface#canview-propertysignature) to determine whether you can read and edit a document with your view schema.
Use [`canUpgrade`](https://fluidframework.com/docs/api/fluid-framework/schemacompatibilitystatus-interface#canupgrade-propertysignature) to determine whether you can upgrade the document's stored schema.
For details about differences that prevent viewing, use [`SchemaCompatibilityStatusBeta.discrepancies`](https://fluidframework.com/docs/api/fluid-framework/schemacompatibilitystatusbeta-interface#discrepancies-propertysignature).

There is no direct replacement for schema equivalence.
The property remains available until a future major release.
