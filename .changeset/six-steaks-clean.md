---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Rename and change type of `annotatedAllowedTypeSet` on `FieldSchemaAlpha` to more closely align with `allowedTypesSet`

This changes the `annotatedAllowedTypeSet` on [`FieldSchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/fieldschemaalpha-class) property now stores evaluated schemas along with their annotations in a list of objects rather than as a mapping from the schemas to their annotations. This makes the API easier to use and better aligns with the current public APIs.
