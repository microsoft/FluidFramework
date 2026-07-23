---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Array insertion anchors now track their index from change deltas

The `@alpha` `ArrayPlaceAnchor` returned by `createArrayInsertionAnchor` now maintains its `index` incrementally from the array node's change delta instead of re-deriving it from the child that happened to sit at the anchor point when it was created. Inserts and removes before the anchor shift it, while edits after it leave it in place.

As a result, removing the child originally at the anchor's index no longer sends the anchor to the end of the array: it now stays in the gap between the surviving neighbors, which is the behavior an insertion point (such as a text cursor) needs.

Because the anchor now holds a subscription to the array node to receive those deltas, `ArrayPlaceAnchor` gained a `dispose()` method. Call it when the anchor is no longer needed to release the subscription; after disposal the anchor stops updating and `index` returns its last tracked value.

```typescript
const anchor = createArrayInsertionAnchor(array, 1);
// ... use anchor.index as content is inserted and removed around it ...
anchor.dispose(); // release the subscription when done
```
