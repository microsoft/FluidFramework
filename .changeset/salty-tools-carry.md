---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---

Cleanup of several tree and schema alpha APIs for content import and export

A new `TreeSchema` type has been introduced which extends `SimpleTreeSchema` but contains `TreeNodeSchema` instead of `SimpleNodeSchema`.

`TreeViewConfigurationAlpha` is added which is just `TreeViewConfiguration` but implementing `TreeSchema`.

`SimpleTreeSchema` was modified to have a `root` property instead of implementing `SimpleFieldSchema` directly:
this makes it possible for `TreeViewConfigurationAlpha` to implement `TreeSchema` which extends `SimpleTreeSchema`.

`generateSchemaFromSimpleSchema` now returns the new `TreeSchema` type.

`EncodeOptions` and `ParseOptions` have been unified as `TreeEncodingOptions` which covers both the encoding and parsing cases.

`getJsonSchema` now takes in `ImplicitAllowedTypes` instead of `ImplicitFieldSchema` since it can't handle optional roots.
`getJsonSchema` also takes in the new `TreeSchemaEncodingOptions` to provide options for how to handle stored keys vs property keys, and fields with defaults.

Now that `getJsonSchema` takes in configuration options, its results are no longer cached.
