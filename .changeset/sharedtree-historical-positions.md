---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Resolve historical array positions for text-editor presence

Text editors can now translate remote cursors and selections from an earlier document state into the current SharedTree view.
The new alpha `TreeViewAlpha.positions` API accounts for edits made since the position was sent, including the receiving client's pending edits.

The following pseudocode illustrates publishing a selection and using the resolution result.
The application supplies the messaging, sequence lookup, and selection display.

```typescript
const revision = view.positions.getCurrentRevision();
if (revision !== undefined) {
    publishSelection({ revision, sequenceId, focusIndex, anchorIndex });
}

// On receipt, with the editor model synchronized to the local tree:
const sequence = findSequence(message.sequenceId);
const result = view.positions.resolvePositions(message.revision, [
    { sequence, index: message.focusIndex, affinity: "after" },
    { sequence, index: message.anchorIndex, affinity: "after" },
]);

if (result.status === "resolved") {
    const [focus, anchor] = result.positions;
    if (focus.status === "resolved" && anchor.status === "resolved") {
        // Each endpoint contains its current array and index.
        // A move can place an endpoint in a different array.
        showRemoteSelection({
            focus: { sequence: focus.sequence, index: focus.index },
            anchor: { sequence: anchor.sequence, index: anchor.index },
        });
    }
    // Otherwise, an endpoint has status "unavailable" and a reason.
}
// Otherwise, result.status is "revision-unavailable".
// The receiving client may be behind the sender: retry after applying
// the inbound operations for that revision.
// If the revision has expired instead, wait for a fresh presence update.
```

Indices count array elements; editors must convert other coordinate units.
Revision tokens cannot be published while edits are pending or from local forks.
Tokens expire with retained collaboration history and must not be used as persisted references.
Schema-changing commits are not supported for position mapping.
