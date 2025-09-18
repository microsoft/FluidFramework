---
"fluid-framework": minor
"@fluidframework/tree": minor
"@fluid-experimental/tree-react-api": minor
"__section": tree
---
Added APIs for tracking observations of SharedTree content for automatic invalidation

`TreeAlpha.trackObservations` and `TreeAlpha.trackObservationsOnce` have been added.
These provide a way to run some operation which reads content from [TreeNodes](https://fluidframework.com/docs/api/tree/treenode-class), then run a call back when anything observed by that operation changes.

This functionality has also been exposed in the form of React hooks and React higher order components via the `@fluid-experimental/tree-react-api` package.
It is now possible to use these utilities to implement React applications which pass TreeNodes in their props and get all necessary invalidation from tree changes handled automatically.
The recommended pattern for doing this is to use `treeDataObject` or `TreeViewComponent` at the root, then `withTreeObservations` or `withMemoizedTreeObservations` for any sub-components which read from TreeNodes.
Alternatively more localized changes can be made by using `PropNode` to type erase TreeNodes passed in props, then of of the `usePropTreeNode` or `usePropTreeRecord` hooks to read from them.

All of these APIs work with both hydrated and [un-hydrated](https://fluidframework.com/docs/api/tree/unhydrated-typealias) TreeNodes.
