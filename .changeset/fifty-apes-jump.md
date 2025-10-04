---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Alpha APIs for annotated allowed types have been refactored

Staged allowed types must now be run through `SchemaFactoryAlpha.types` to convert them into an [`AllowedTypes`](https://fluidframework.com/docs/api/tree/allowedtypes-typealias).
This change also means that it is now possible to use the produced `AllowedTypesFull` in non-alpha APIs since it implements `AllowedTypes`.

Reading data out of `ImplicitAllowedTypes` should now be done via `normalizeAllowedTypes` which now returns a `AllowedTypesFull` providing access to all the data in a friendly format.
