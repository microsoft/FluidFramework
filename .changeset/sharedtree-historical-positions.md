---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Resolve historical node selections and text positions for presence

Editors can now share presence on entire nodes, such as images or paragraphs, as well as text cursors and selections.
The new alpha `TreeViewAlpha.locations` API captures a selection on one client and resolves it into the current view on another, accounting for intervening edits and moves.

The following pseudocode illustrates publishing a selection and using the resolution result.
The application supplies the messaging and selection display; no receiver-side node lookup is needed.

```typescript
// Use an attached main view with acknowledged edits and no open transaction.
const capture = view.locations.capture([
    { kind: "node", node: selectedImage },
    { kind: "sequence", node: characters, index: focusIndex, affinity: "after" },
    { kind: "sequence", node: characters, index: anchorIndex, affinity: "after" },
]);
publishSelection({ capture });

// On receipt, with the editor model synchronized to the local tree:
const result = view.locations.resolve(message.capture);

if (result.status === "resolved") {
    for (const entry of result.locations) {
        if (entry.status === "resolved") {
            const location = entry.location;
            if (location.kind === "node") {
                highlightNode(location.node); // A local SimpleTree object.
            } else {
                showCaret(location.node, location.index); // Current array and gap.
            }
        }
        // Otherwise, entry.status is "unavailable" and entry.reason explains why.
    }
}
// Otherwise, result.status is "revision-unavailable".
// The receiving client may be behind the sender: retry after applying
// the inbound operations for that revision.
// If the revision has expired instead, wait for a fresh presence update.
```

Indices count array elements; editors must convert other coordinate units.
Captures contain opaque JSON-serializable node references and a shared revision.
This initial prototype supports only the main view of an attached SharedTree.
Capture throws `UsageError` while local edits are pending; both capture and resolution throw on local forks, non-main shared branches, or during open transactions.
Resolution on the main view still includes the receiver's pending edits.
References expire with retained collaboration history and must not be persisted or interpreted by applications.
Locations remain resolvable across schema widening, provided the receiving view can view the current stored schema.
