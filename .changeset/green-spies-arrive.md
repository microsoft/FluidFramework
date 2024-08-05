---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: tree
highlight: true
---

✨ New! `Record`-typed objects can now be used to construct MapNodes

You can now construct MapNodes from `Record` typed objects, similar to how maps are expressed in JSON.

Before this change, an `Iterable<string, Child>` was required, but now an object like `{key1: Child1, key2: Child2}` is allowed.

Full example using this new API:

```typescript
class Schema extends schemaFactory.map("ExampleMap", schemaFactory.number) {}
const fromRecord = new Schema({ x: 5 });
```

This new feature makes it possible for schemas to construct a tree entirely from JSON-compatible objects using their constructors,
as long as they do not require unhydrated nodes to differentiate ambiguous unions,
or IFluidHandles (which themselves are not JSON compatible).

Due to limitations of TypeScript and recursive types,
recursive maps do not advertise support for this feature in their typing,
but it works at runtime.
