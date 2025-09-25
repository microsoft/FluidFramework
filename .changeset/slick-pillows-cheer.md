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

### React Support

Here is a simple example of a React components which has an invalidation bug due to reading a mutable field from a TreeNode that was provided in a prop:

```typescript
const builder = new SchemaFactory("example");
class Item extends builder.object("Item", { text: SchemaFactory.string }) {}
const ItemComponentBug = ({ item }: { item: Item }): JSX.Element => (
	<span>{item.text}</span> // Reading `text`, a mutable value from a React prop, causes an invalidation bug.
);
```

This bug can now easily be fixed using `withTreeObservations` or ``withMemoizedTreeObservations`:

```typescript
const ItemComponent = withTreeObservations(
	({ item }: { item: Item }): JSX.Element => <span>{item.text}</span>,
);
```

For components which take in TreeNodes, but merely forward them and do not read their properties, they can use `PropTreeNode` as shown:

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

To provide access to TreeNode content in only part of a component the `usePropTreeNode` or `usePropTreeRecord` hooks can be used.


### TreeAlpha.trackObservationsOnce Examples

Here is a rather minimal example of how `TreeAlpha.trackObservationsOnce` can be used:

```typescript
cachedFoo ??= TreeAlpha.trackObservationsOnce(
	() => {
		cachedFoo = undefined;
	},
	() => nodeA.someChild.bar + nodeB.someChild.baz,
).result;
```

That is equivalent to doing the following:

```typescript
if (cachedFoo === undefined) {
	cachedFoo = nodeA.someChild.bar + nodeB.someChild.baz;
	const invalidate = (): void => {
		cachedFoo = undefined;
		for (const u of unsubscribe) {
			u();
		}
	};
	const unsubscribe: (() => void)[] = [
		TreeBeta.on(nodeA, "nodeChanged", (data) => {
			if (data.changedProperties.has("someChild")) {
				invalidate();
			}
		}),
		TreeBeta.on(nodeB, "nodeChanged", (data) => {
			if (data.changedProperties.has("someChild")) {
				invalidate();
			}
		}),
		TreeBeta.on(nodeA.someChild, "nodeChanged", (data) => {
			if (data.changedProperties.has("bar")) {
				invalidate();
			}
		}),
		TreeBeta.on(nodeB.someChild, "nodeChanged", (data) => {
			if (data.changedProperties.has("baz")) {
				invalidate();
			}
		}),
	];
}
```

Here is more complete example showing how to use `TreeAlpha.trackObservationsOnce` invalidate a property derived from its tree fields.

```typescript
const factory = new SchemaFactory("com.example");
class Vector extends factory.object("Vector", {
	x: SchemaFactory.number,
	y: SchemaFactory.number,
}) {
	#length: number | undefined = undefined;
	public length(): number {
		if (this.#length === undefined) {
			const result = TreeAlpha.trackObservationsOnce(
				() => {
					this.#length = undefined;
				},
				() => Math.hypot(this.x, this.y),
			);
			this.#length = result.result;
		}
		return this.#length;
	}
}
const vec = new Vector({ x: 3, y: 4 });
assert.equal(vec.length(), 5);
vec.x = 0;
assert.equal(vec.length(), 4);
```
