---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add ParentObject and parent2/key2/child/children/on traversal APIs to TreeAlpha

[TreeAlpha](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface) now lets you traverse and observe a node's parent *location* even when that location is not itself a [TreeNode](https://fluidframework.com/docs/api/fluid-framework/treenode-class). Previously, walking upward from a node stopped at the document root, and there was no way to represent the parent of a removed (detached) root or of an unhydrated (not-yet-inserted) node.

The new `ParentObject` type is an opaque handle to such a location. A node's parent is now described by the union `TreeNodeParent = TreeNode | ParentObject`, and there are three kinds of `ParentObject`: the document root, the parent of a removed root, and the parent of an unhydrated root.

New members on `TreeAlpha`:

- `parent2(node)` — returns the node's parent as a `TreeNodeParent` (a `TreeNode`, or a `ParentObject` when the parent is one of the non-node locations above).
- `key2(node)` — returns the key of `node` under its parent (`undefined` for the single child of a `ParentObject`).
- `child(parent, key)` / `children(parent)` — read the child (or enumerate the children) of a `TreeNode` or a `ParentObject`.
- `on(parent, eventName, listener)` — subscribe to events on a `TreeNode` or a `ParentObject`.

A `ParentObject` supports the same change events as a `TreeNode` (see [TreeChangeEvents](https://fluidframework.com/docs/api/fluid-framework/treechangeevents-interface)), so callers do not have to reason about whether the value returned by `parent2` is a node or a parent object:

- `nodeChanged` — fires when the child occupying the location changes (the occupant is replaced, attached, or detached) — the shallow change to the location's single child.
- `treeChanged` — fires whenever anything changes in the subtree at the location, including both content changes of the current child and replacement of the child itself.

All of these notifications are delivered after the current batch of changes has been applied, so listeners always observe a consistent tree, consistent with the existing content-change events.

```typescript
const parent = TreeAlpha.parent2(node);
// `parent` may be a TreeNode or a ParentObject (e.g. the document root).
const unsubscribe = TreeAlpha.on(parent, "nodeChanged", () => {
	// The child occupying this location changed.
});
```
