---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Remove JsonValidator

The `@alpha` API `JsonValidator` has been removed: its replacement `FormatValidator` must now be used.

As part of this:
- `typeboxValidator` has been replaced with `FormatValidatorBasic`.
- `noopValidator` has been replaced with `FormatValidatorNoOp`.
