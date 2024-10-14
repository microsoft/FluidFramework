---
"@fluidframework/tree": minor
---
---
"section": tree
---

Unhydrated SharedTree nodes now emit change events when edited

Newly-created SharedTree nodes which have not yet been inserted into the tree will now emit `nodeChanged` and `treeChanged` events when they are mutated via editing operations.

```ts
const node = new Foo({ foo: 3 });
Tree.on(node, "nodeChanged", () => {
	console.log("This will fire even before node is inserted!");
});

node.foo = 4; // log: "This will fire even before node is inserted!";
```
