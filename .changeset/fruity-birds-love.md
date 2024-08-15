---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": "tree"
---
Enable compile time type narrowing based on a TreeNode's NodeKind.

TreeNode's schema aware APIs implement WithType, which now has a NodeKind parameter that can be used to narrow TreeNodes based on NodeKind.

Example:

```typescript
function getKeys(node: TreeNode & WithType<string, NodeKind.Array>): number[];
function getKeys(node: TreeNode & WithType<string, NodeKind.Map | NodeKind.Object>): string[];
function getKeys(node: TreeNode): string[] | number[];
function getKeys(node: TreeNode): string[] | number[] {
	const schema = Tree.schema(node);
	if (schema.kind === NodeKind.Array) {
		const arrayNode = node as TreeArrayNode;
		const keys: number[] = [];
		for (let index = 0; index < arrayNode.length; index++) {
			keys.push(index);
		}
		return keys;
	}
	if (schema.kind === NodeKind.Map) {
		return [...(node as TreeMapNode).keys()];
	}

	return Object.keys(node);
}
```
