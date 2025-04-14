---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve handling of deleted nodes

[TreeNodes](https://fluidframework.com/docs/api/fluid-framework/treenode-class) which are [deleted](https://fluidframework.com/docs/api/fluid-framework/treestatus-enum#deleted-enummember) were not handled correctly.
This has been improved in two ways:

1. Accessing fields of deleted nodes now consistently gives a usage error indicating that this is invalid.
Previously this would assert indicating a bug in the implementation.
2. When a `TreeNode` is deleted, but the node still exists within the [ITree](https://fluidframework.com/docs/api/driver-definitions/itree-interface), then becomes accessible again later, an a new TreeNode now is allocated instead of reusing the deleted one.
Note that this can only happen when the entire view of the `ITree` is disposed then recreated.
This happens when disposing and recreating a [TreeView](https://fluidframework.com/docs/api/fluid-framework/treeview-interface) or when the contents of the view are disposed due to being out of schema (another client did a schema upgrade), then brought back into schema (the schema upgrade was undone).
