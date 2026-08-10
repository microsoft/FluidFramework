---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Tree schema branding APIs have been clarified

The deprecated `typeNameSymbol` API has been renamed to `schemaIdentifierBrand`, which is not deprecated.
Replace references to `typeNameSymbol` with `schemaIdentifierBrand`.

Neither symbol is exposed for runtime use; both are exposed only as compile-time types.