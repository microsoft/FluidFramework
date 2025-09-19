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
Alternatively more localized changes can be made by using `PropNode` to type erase TreeNodes passed in props, then use one of the `usePropTreeNode` or `usePropTreeRecord` hooks to read from them.

These APIs work with both hydrated and [un-hydrated](https://fluidframework.com/docs/api/tree/unhydrated-typealias) TreeNodes.

Here is a simple example of a React components which would have an invalidation bug if not using `withTreeObservations`:

```typescript
const builder = new SchemaFactory("example");
class Item extends builder.object("Item", { text: SchemaFactory.string }) {}
const ItemComponent = withTreeObservations(
	({ item }: { item: Item }): JSX.Element => <span>{item.text}</span>,
);
```

For components which take in TreeNodes, but should not read from them, they can use `PropTreeNode` as shown:

```typescript
const ItemParentComponent = ({ item }: { item: PropTreeNode<Item> }): JSX.Element => (
	<ItemComponent item={item} />
);
```

If such a component reads from the TreeNode, it gets a compile error instead of an invalidation bug.
In this case the invalidation bug would be that if `item.text` is modified, the component would not re-render.

```typescript
const InvalidItemParentComponent = ({
	item,
}: { item: PropTreeNode<Item> }): JSX.Element => (
	// @ts-expect-error PropTreeNode turns this invalidation bug into a compile error
	<span>{item.text}</span>
);
```
