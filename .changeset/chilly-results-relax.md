---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Added support for optional schema validation on newly inserted content in SharedTree

When defining how to view a SharedTree, an application can now specify that new content inserted into the tree should
be subject to schema validation at the time it is inserted, so if it's not valid according to the stored schema in the
tree an error is thrown immediately.

This can be accomplished by passing an `ITreeConfigurationOptions` argument with `enableSchemaValidation` set to `true`
when creating a `TreeConfiguration` to use with the SharedTree.

Since this feature requires additional compute when inserting new content into the tree, it is not enabled by default.
