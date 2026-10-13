# Historical tree locations

Text editors can transmit presence for entire SimpleTree nodes as well as gaps between array elements.
`TreeViewAlpha.locations.capture` captures the sender's selection and a sequenced revision together.
`resolve` translates that capture into the receiver's current local state, including pending local edits.
It returns ordinary SimpleTree objects and does not require an application-level lookup of the source node.
This initial prototype supports capture and resolution only on the main view of an attached SharedTree.
Local forks, independent views, and non-main shared branches are deliberately excluded.

## Public concepts

`TreeLocation` is an `@input` type distinguishing `{ kind: "node", node }` from `{ kind: "sequence", node, index, affinity? }`.
A node location selects the whole object, map, record, or array.
A sequence location selects a gap in an array.
Primitive leaves are not `TreeNode` objects and cannot identify a particular occurrence by value.
An ordinary string leaf does not expose independently editable character locations through this API.

`CapturedTreeLocations` is a sealed, type-erased presence payload.
Its API extends `ErasedType` and exposes no properties or representation details.
It is JSON-serializable and designed to be safely transmitted between clients of the same SharedTree.
Applications must not construct, inspect, or modify its representation.
The entire capture can be sent through JSON without serialization helpers, live node objects, or local anchor handles.

`ResolvedTreeLocation` contains either a current `TreeLocation` or an explicit unavailable reason.
Node results can be narrowed with `Tree.is(node, MySchema)`.
A batch can mix object selections and text endpoints, and results preserve input order and selection direction.
These APIs are alpha-only.
The capture, resolver, and result types are `@sealed`; inputs and readable outputs are distinct so optional input defaults do not weaken output guarantees.

```typescript
// Use an attached main view, after its edits are acknowledged and outside a transaction.
const capture = view.locations.capture([
    { kind: "node", node: image },
    { kind: "sequence", node: characters, index: focus },
    { kind: "sequence", node: characters, index: anchor },
]);
sendPresence({ capture });

// On another client, after synchronizing the editor model with the local tree:
const result = view.locations.resolve(message.capture);
if (result.status === "resolved") {
    for (const entry of result.locations) {
        if (entry.status !== "resolved") {
            continue;
        }
        const location = entry.location;
        if (location.kind === "node") {
            highlightNode(location.node);
        } else {
            showCaret(location.node, location.index);
        }
    }
} else {
    // Retry after applying the referenced inbound revision.
    // If it has expired instead, request a fresh capture.
}
```

The messaging and rendering functions in this example are application pseudocode.

## Revisions and ordering

Capture throws `UsageError` unless the attached main view matches its sequenced state with no open transaction.
Pending local edits, local forks, independent views, non-main shared branches, and the uninitialized root sentinel cannot produce captures.
A local commit ID alone is insufficient: rebasing can change its context without changing its identifier.
The prototype relies on main's established sequenced history rather than supporting arbitrary branch perspectives.
Non-main shared branches are excluded even after acknowledgement because a history-rewriting rebase could change the interpretation of a captured revision.
Supporting them or speculative sender states requires additional perspective information and reconstruction; neither is part of this prototype.

Resolution has the same main-view, attachment, and no-open-transaction requirements, but permits pending local edits on the receiver.
It transforms the captured locations through those edits.
Unsupported local view states throw `UsageError`; missing or expired source revisions are normal asynchronous outcomes and return `revision-unavailable`.

Read the selection and call `capture` synchronously after any edits needed to materialize shared content have been acknowledged.
If publication must wait, recompute the selection before capturing.
Use the same rule when relaying other users' tracked selections: capture their current local locations, not their old wire references with a newer revision.

You can retain a container operation sequence number as a transport barrier.
The number controls when a signal can be processed; the capture's revision determines the coordinates.
If the receiver is behind, `resolve` returns `revision-unavailable` and the application can retry after receiving the referenced revision.
Expired, unknown, and wrong-branch revisions produce the same status; do not retry them indefinitely.
Editor-model updates must be applied before using a resolved result in an editor.

## Identity, moves, and gaps

The opaque reference contains a sender-side historical path, not a path in the receiver's current tree.
The path and revision identify the source location.
Resolution follows the source forward through history, including moves of any ancestor.
Replacing a node at the same path does not transfer identity.

Node selections follow that exact node through moves and survive edits to its contents.
Deletion makes a node selection unavailable.
Deletion is terminal for that capture even if a later undo restores the node.

Sequence indices count array elements, not UTF-16 units or grapheme clusters unless the schema uses those units.
The valid range is zero through the captured array length, inclusive.
Editors must convert their coordinates before capture and convert resolved coordinates back afterward.
Structural symbols and embedded objects participate in that conversion.

Insertion before a gap shifts it.
At the gap, `"before"` stays before the insertion and `"after"` stays after it.
Omitted or undefined affinity defaults to `"before"` during capture.
Resolved sequence locations always report the effective affinity explicitly.
Deletion collapses gaps within the removed span to the deletion boundary.
Later edits transform the collapsed gap; undo does not recover the old offset inside removed content.

Gaps inside moved content follow it across arrays.
At a move boundary, `"before"` follows the preceding element and `"after"` follows the following element.
The array's start and end provide sentinels when there is no adjacent element.
These rules cover empty arrays.

Moving characters out of an array and then deleting the original array does not invalidate locations that followed those characters to a surviving destination.
This also works when the transfer and deletion occur in one transaction.
A whole-node selection of the deleted array becomes unavailable.
If neither the associated content nor the gap's containing array survives, the gap is unavailable.

Malformed references and invalid indices produce `invalid-location`.
Deleted targets produce `target-deleted`.
Schema changes do not change existing node identities or locations and do not make captures unavailable.
The receiving view must still be compatible with the current stored schema; an incompatible view throws the normal view-compatibility usage error.
No failure path silently selects a replacement node or clamps an index.
Capturing or resolving during a transaction, capturing nodes from another view, and using disposed resolvers are API misuse and throw usage errors.

## Anchor-based implementation

Internally, the opaque capture groups one revision with an ordered list of historical locations.
Capture encodes a versioned path using stored field keys, plus revision binding and sequence-length metadata for gap validation.
The encoding is private and can change without exposing `UpPath`, `FieldKey`, or anchor handles to consumers.
On receipt, the resolver validates the encoding and reconstructs an internal up-path.
Captures are not authenticated proofs of historical existence; applications remain responsible for their message envelope and sender identity.

Resolution walks the current retained commit graph back to the captured sequenced revision.
It uses the currently rebased local suffix, not transient rollback and reapplication events.
It then replays the intervening data changes in order through a temporary `AnchorSet`.
Schema entries are skipped, while all data entries are replayed, including entries in the same commit as a schema change.
No historical forest is constructed.
The receiver's current forest is accessed only after replay to obtain the resulting SimpleTree objects.

A whole-node location uses a core node anchor directly.
A gap uses an anchor for its containing array and an anchor for the adjacent element selected by affinity.
An after-affinity gap at array end uses a virtual node path at the array length; the sparse anchor set does not need a materialized node there.
The before-affinity start sentinel stays with the array.
Core anchors handle structural shifts, ancestor moves, and cross-field moves.

A small additional delta visitor maintains a fallback gap in the original array.
If the adjacent element remains detached at the end of a delta, this fallback supplies deletion-collapse behavior.
If it is attached elsewhere, the core anchor supplies the destination instead.

The standard delta visitor handles move pairs, renames, and edits to detached or newly created nodes.
A temporary copy of the receiver's detached-field index is rewound to the source revision before replay.
This reconstructs historical repair-root identities, not their contents.
The distinction matters for rename chains: whether an intermediate ID already existed can change which node is moved.
The current repair index is not used directly as a historical snapshot.

This initial implementation intentionally replays history linearly.
Its cost depends on the repair-identity index size, intervening delta traversal, path depth, and number of locations.
Presence signals are expected to refer to recent revisions.
There is no composed-map index, subscription overhead between calls, or additional summary data.
A future implementation can optimize replay without changing the capture contract.

Captures do not pin history, create forks, or require disposal.
Each resolution owns and releases its sparse anchors.
Revision availability follows the tree's existing history-retention policy.
Applications remain responsible for tracking subsequent edits after resolving a message.
