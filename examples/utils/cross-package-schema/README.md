# Cross-Package SharedTree Schema Example

This example demonstrates a pattern for consuming SharedTree schemas across package boundaries
when those schemas are defined using `SchemaFactoryAlpha.objectAlpha()`.

## Packages

- **`schema-provider`** — Defines schemas via `objectAlpha()`, exposes via root package export
- **`schema-consumer`** — Imports schemas from root provider export
