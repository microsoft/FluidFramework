# @fluid-tools/api-markdown-documenter

## 0.13.0

-   Fixed a bug where type parameter information was only being generated for `interface` and `class` items.
-   Adds "Constraint" and "Default" columns to type parameter tables when any are present among the type parameters.

### ⚠ BREAKING CHANGES

Update the signature of `createTypeParametersSection` to always generate a `SectionNode` when called, such that consumers don't have to handle a potentially undefined return value.
If the consumer wants to omit the section (for example when the list of type parameters is empty), they can make the call conditional on their end.

## 0.12.0

### ⚠ BREAKING CHANGES

Update `typescript` dependency from `4.x` to `5.x`.
