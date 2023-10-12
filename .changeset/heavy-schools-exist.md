---
"@fluid-experimental/tree2": minor
---

Allow ImplicitFieldSchema for non-recursive schema building

SchemaBuilder now accepts `ImplicitFieldSchema` in many places which used to require `FieldSchema`.
This allows `Required` fields to be implicitly specified from just their AllowedTypes.
Additionally in these cases the AllowedTypes can be implicitly specified from a single `Any` or `TreeSchema`.
