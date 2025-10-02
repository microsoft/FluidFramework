---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Alpha APIs for annotated allowed types have been refactored

Staged allowed types must now be run through `SchemaFactoryAlpha.types` to convert them into an `AllowedTypes`.
This change also means that it is now possible to use the produced `AllowedTypes` in non-alpha APIs since it implements `AllowedTypes`.
