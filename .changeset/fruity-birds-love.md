---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": "tree"
---
Compile-time type narrowing based on a TreeNode's NodeKind

`TreeNode`'s schema aware APIs implement `WithType`, which now has a `NodeKind` parameter that can be used to narrow `TreeNode`s based on `NodeKind`.

Example:

```typescript
function getKeys(node: TreeNode & WithType<string, NodeKind.Array>): number[];
function getKeys(node: TreeNode & WithType<string, NodeKind.Map | NodeKind.Object>): string[];
function getKeys(node: TreeNode): string[] | number[];
function getKeys(node: TreeNode): string[] | number[] {
	const schema = Tree.schema(node);
	switch (schema.kind) {
		case NodeKind.Array: {
			const arrayNode = node as TreeArrayNode;
			const keys: number[] = [];
			for (let index = 0; index < arrayNode.length; index++) {
				keys.push(index);
			}
			return keys;
		}
		case NodeKind.Map:
			return [...(node as TreeMapNode).keys()];
		case NodeKind.Object:
			return Object.keys(node);
		default:
			throw new Error("Unsupported Kind");
	}
}
```
