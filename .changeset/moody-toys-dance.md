---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
section: tree
highlight: true
---

✨ New! When unambiguous, ArrayNodes can now be constructed from Maps and MapNodes from arrays

Since the types for ArrayNodes and MapNodes indicate they can be constructed from iterables,
it should work, even if those iterables are themselves arrays or maps.
To avoid this being a breaking change, a priority system was introduced.
ArrayNodes will only be implicitly constructable from JavaScript Map objects in contexts where no MapNodes are allowed.
Similarly MapNodes will only be implicitly constructable from JavaScript Array objects in contexts where no ArrayNodes are allowed.

In practice, the main case in which this is likely to matter is when implicitly constructing a map node. If you provide an array of key value pairs, this now works instead of erroring, as long as no ArrayNode is valid at that location in the tree.

```typescript
class MyMapNode extends schemaFactory.map("x", schemaFactory.number) {}
class Root extends schemaFactory.object("root", { data: MyMapNode }) {}
// This now works (before it compiled, but error at runtime):
const fromArray = new Root({ data: [["x", 5]] });
```

Prior versions used to have to do:
```typescript
new Root({ data: new MyMapNode([["x", 5]]) });
```
or:
```typescript
new Root({ data: new Map([["x", 5]]) });
```
Both of these options still work: strictly more cases are allowed with this change.
