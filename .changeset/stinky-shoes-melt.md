---
"fluid-framework": minor
---
---
"section": "tree"
---

New alpha APIs for indexing

SharedTree now supports indexing via two new APIs, `createSimpleTreeIndex` and `createIdentifierIndex`.

`createSimpleTreeIndex` is used to create a `SimpleTreeIndex` which indexes nodes based on their schema.
Depending on the schema, the user specifies which field to key the node on.

example that indexes `IndexableParent`s and `IndexableChild`s and returns the first node of a particular key:
```typescript
function isStringKey(key: TreeIndexKey): key is string {
    return typeof key === "string";
}

const index = createSimpleTreeIndex(
    view,
    new Map([[IndexableParent, parentKey], [IndexableChild, childKey]]),
    (nodes) => nodes[0],
    isStringKey,
    [IndexableParent, IndexableChild],
);
```

`createIdentifierIndex` is used to create an `IdentifierIndex` which provides an efficient way to retrieve nodes using the node identifier.

example:
```typescript
const identifierIndex = createIdentifierIndex(view);
const node = identifierIndex.get("node12345");
```
