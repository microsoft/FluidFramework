---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
New alpha `TreeAlpha.release` API to free the objects created for reading nodes

Reading a node of a [TreeView](https://fluidframework.com/docs/api/fluid-framework/treeview-interface) creates objects for it, including its `TreeNode`, which are kept for the life of the view.
An app which reads a large tree once (for example, to render it) and keeps the view therefore keeps memory proportional to everything it has read.

`TreeAlpha.release(node)` frees these objects for `node` and every node under it which has been read, without changing the tree.
Afterwards, the released `TreeNode` objects cannot be used; reading the same location again, for example from the parent, returns a new `TreeNode`.
Nodes with event listeners on them or under them, and unhydrated nodes, cannot be released.

```typescript
for (const section of view.root.sections) {
	render(section);
	TreeAlpha.release(section);
}
```

Reading every section of a synthetic 200-section document kept about 1,180 MB for the life of the view; releasing each section after reading it kept 2 to 4 MB, at about 2.5 ms per section.

Before each edit, the tree clears the cursors of the nodes read since the last edit; it now keeps them in a list rather than a set, so an edit after reading about 32,000 nodes takes 22 to 30 ms instead of 38 to 41 ms.

Measured in Node.js 22 with production asserts; results depend on the schema and workload.
