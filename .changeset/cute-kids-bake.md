---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
FormatValidator added to replace JsonValidator

The existing `@alpha` type [`JsonValidator`](https://fluidframework.com/docs/api/fluid-framework/jsonvalidator-interface) has a new type erased alternative, `FormatValidator`, which is planned to be stabilized to `@beta` in the future and replaces `JsonValidator` in `ICodecOptions`.
Existing code using `ICodecOptions` should migrate to use `FormatValidator`, but this is not required for adopting this release as `JsonValidator` is still supported.
