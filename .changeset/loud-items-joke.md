---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": "tree"
---
`Tree.schema` now returns `TreeNodeSchema`.

The typing of `Tree.schema` has changed from:

```typescript
schema<T extends TreeNode | TreeLeafValue>(node: T): TreeNodeSchema<string, NodeKind, unknown, T>;
```

to:

```typescript
schema(node: TreeNode | TreeLeafValue): TreeNodeSchema;
```

The runtime behavior is unaffected: any code which worked and still compiles is fine and does not need changes.

`Tree.schema` was changed to mitigate two different issues:

1. It tried to give a more specific type based on the type of the passed in value.
   When the type of the input is not known precisely (for example it is a union of node types like `Foo | Bar`, or `TreeNode` or even `TreeNode | TreeLeafValue`), this was fine since schema are covariant over their node type.
   However when the input was more specific that the schema type, for example the type is simply `0`, this would result in unsound typing, since the create function could actually return values that did not conform with that schema (for example `schema.create(1)` for the number schema typed with `0` would return `1` with type `0`).
2. The node type was provided to the incorrect type parameter of TreeNodeSchema.
   The `TNode` parameter is the third one, not the fourth.
   The fourth is `TBuild` which sets the input accepted to its create function or constructor.
   Thus this code accidentally left `TNode` unset (which is good due to the above issue), but invalidly set `TBuild`.
   `TBuild` is contravariant, so it has the opposite issue that setting `TNode` would have: if your input is simply typed as something general like `TreeNode`, then the returned schema would claim to be able to construct an instance given any `TreeNode`.
   This is incorrect, and this typing has been removed.

Fortunately it should be rare for code to be impacted by this issue.
Any code which manually specified a generic type parameter to `Tree.schema()` will break, as well as code which assigned its result to an overly specifically typed variable.
Code which used `typeof` on the returned schema could also break, though there are few use-cases for this so such code is not expected to exist.
Currently it's very difficult to invoke the create function or constructor associated with a `TreeNodeSchema` as doing so already requires narrowing to `TreeNodeSchemaClass` or `TreeNodeSchemaNonClass`.
It is possible some such code exists which will need to have an explicit cast added because it happened to work with the more specific (but incorrect) constructor input type.
