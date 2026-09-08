---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Static identifier fields now generate identifiers when omitted

`SchemaFactoryAlpha.identifier()` now generates an identifier when an object is created without a value for the field.
This behavior now matches `SchemaFactory.identifier` and prevents a schema compatibility error during object creation.
