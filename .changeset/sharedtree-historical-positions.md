---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Resolve historical node selections and text positions for presence

The new alpha `TreeViewAlpha.locations` API allows capturing a *location* on one view and resolving it in another view (possibly one on a different client).
The resolved position accounts for intervening edits and moves.
The primary use case for this functionality is for presence scenarios.
Selections can target entire nodes (e.g. "whole paragraph," or "todo item") or a gap within a sequence of nodes (e.g. "text caret position").

The following pseudocode illustrates how an application may use this API.

```typescript
// Use an attached main view with acknowledged edits and no open transaction.
const capture = view.locations.capture([
    { kind: "node", node: selectedImage },
    { kind: "sequence", node: characters, index: focusIndex },
    { kind: "sequence", node: characters, index: anchorIndex },
]);

// Send to another client, typically through the signal API.
publishSelection({ capture });

// On receipt, with the editor model synchronized to the local tree:
const results = view.locations.resolve(message.capture);
for (const entry of results) {
    if (entry.status === "resolved") {
        const location = entry.location;
        if (location.kind === "node") {
            highlightNode(location.node); // A local SimpleTree object.
        } else {
            showCaret(location.node, location.index); // Current array and gap.
        }
    }
    // Otherwise, entry.status is "unavailable" and entry.reason explains why,
    // or entry.status is "revision-unavailable".
    // The receiving client may be behind the sender: retry after applying
    // the inbound operations for that revision.
    // If the revision has expired instead and been trimmed, wait for a fresh presence update.
}

// Single locations do not require arrays.
const caret = view.locations.captureGap(characters, focusIndex);
const caretResult = view.locations.resolve(caret);
const selectedNode = view.locations.captureNode(selectedImage);
```

`capture` and `resolve` accept either one location or an array and return the corresponding single result or array.
The array overloads have identical per-location semantics and are more performant for many locations because they share setup and, for captures from the same revision, replay work.
Captured locations can be combined into arrays even when they come from different calls or revisions.

Indices count array elements; editors must convert other coordinate units.
Captures are opaque JSON-serializable payloads designed for transmission between clients of the same SharedTree.
Their representation is hidden with `ErasedType`; applications should transmit them unchanged (but are free to
nest them within other presence data).
For more details on the full API surface and current limitations, see the [TreeLocationResolver documentation](../packages/dds/tree/src/simple-tree/api/locations.ts).
