# Historical sequence positions

Text editors can send character-level presence as an array identifier, numeric selection endpoints, and a revision token.
On receipt, `TreeViewAlpha.positions` translates those endpoints into the receiving view's current local state.
This includes unacknowledged local edits.
Resolution does not create references that continue to track subsequent edits.
An editor can use its existing position-tracking model after resolving each message.

## Source state and transport

`getCurrentRevision()` returns an opaque, serializable token only when the view matches its shared branch's sequenced state and no transaction is open.
It returns `undefined` for pending edits, unattached trees, unacknowledged branch creation, and local forks.
The uninitialized root sentinel has no publishable token.
The token identifies a branch and a commit in its final sequenced form, not an arbitrary local head.
Rebasing can change a local commit's context without changing its identifier.

Read the selection and token synchronously after any edits needed to materialize shared content have been acknowledged.
When publication must wait, recompute both rather than pairing an earlier selection with a newer token.
You can retain your container's operation sequence number as a transport barrier.
That number controls when a signal can be processed; the tree revision identifies the coordinates.
Wait for both operation processing and editor-model updates before resolving received positions.

Use the same rules for ordinary and bulk presence.
When relaying tracked positions for other users, measure them in the relaying client's current state and use that state's token.
Presence-owner identity is not needed for revision lookup.
You still need edit-origin identity if your editor's subsequent caret tracking distinguishes insertions by the caret's owner from insertions by other users.

## Coordinates and identity

You supply the receiver's array object to `resolvePositions`.
Route signals to that object using a shared identifier in your application; do not serialize a local object reference.
Do not substitute a different array when the identifier cannot be resolved.
Moving an array in the tree does not change its identity.

Indices identify gaps, from zero through the array's historical length, inclusive.
They count elements, not UTF-16 code units, Unicode code points, or grapheme clusters unless your schema uses exactly those units as elements.
Convert editor offsets into array indices on the sender, and convert resolved indices back on the receiver.
Structural symbols and embedded objects must participate in that conversion.
An ordinary string leaf does not expose independently editable character positions through this API.

Resolve selection focus and anchor in one batch.
Results preserve input order and selection direction.
An index of zero is a valid endpoint, not an absent selection.

```typescript
const revision = view.positions.getCurrentRevision();
if (revision !== undefined) {
    // Send revision, the shared sequence identifier, and current array indices.
}

// After receiving the message and applying its referenced operations:
const result = view.positions.resolvePositions(message.revision, [
    { sequence, index: message.focus, affinity: "after" },
    { sequence, index: message.anchor, affinity: "after" },
]);

if (result.status === "resolved") {
    // Each endpoint has its own resolved or unavailable status.
    // A resolved endpoint includes its current array as well as its index.
}
```

## Edit semantics

Inserts before a position shift it.
An insert at the position leaves it before or after the new content according to `affinity`.
Deleting a span collapses positions in that span to the deletion boundary.
Later edits transform that collapsed gap; undo does not reconstruct its former offset within deleted content.

Positions inside moved content follow that content, including into another array.
At the edges of a moved span, `"before"` follows the preceding element and `"after"` follows the following element.
The start and end of an array provide sentinels where there is no adjacent element.
These rules also cover empty arrays.
The resolver returns the destination array so the editor can route a transferred position correctly.

A deleted containing array makes its positions unavailable.
Replacing it with another array at the same tree path does not transfer identity.
An array created after the source revision is not a valid source sequence.
If an array was removed and later restored, the resolver does not reconstruct positions through the period in which the array was absent.

The result distinguishes an unavailable revision from unavailable individual positions.
Unknown, expired, or wrong-branch tokens produce `revision-unavailable`.
Invalid indices produce `invalid-position`; deleted arrays produce `sequence-deleted`.
Crossing a schema-changing commit produces `unsupported-change`.
No failure path silently clamps an index or substitutes another sequence.
Transactions and cross-view array arguments are API misuse and throw a usage error.

## Index and lifecycle

The index is local and optional.
First access builds it from the retained commit graph without replaying changes into a forest.
Subsequent updates subscribe to branch changes and replace a rebased local suffix rather than treating rollback and reapplication as new user edits.
Transaction commits enter the index as committed changes; intermediate transaction states cannot be used for publication or resolution.

Each change becomes a sparse field map with binary-searchable intervals.
Node intervals map array identity through ancestor edits.
Gap intervals map positions with each affinity, including constant intervals for deletion collapse.
Move endpoints and detached-root renames connect source and destination intervals.
Global changes describe edits to detached or newly created destinations without requiring content snapshots.

History is stored as a forest of power-of-two blocks.
Appending combines equally sized trailing blocks.
Each block stores the exact composition of its children's maps, not a list of changes to replay.
Composition preserves sequential gap semantics, including deletion collapse.
It also retains child blocks for partial-range queries, prefix trimming, and local-suffix replacement.

A query decomposes its historical suffix into logarithmically many blocks.
For each endpoint, it first maps the current array's identity backward to recover its historical path and length.
It then maps the historical gap forward.
Field lookups skip unrelated edits, and interval lookups are binary searches.
Query cost depends on tree depth, the logarithm of retained history, and the logarithm of interval fragmentation, rather than array length or a linear replay of intervening commits.

Index construction and updates are not free.
Composition processes affected fields and interval boundaries; highly fragmented moves can increase map size.
Each appended change participates in logarithmically many block merges in an append-only history.
Rebasing rebuilds the changed suffix.
These costs should be considered separately from query cost.

The index follows SharedTree's configured history retention.
It neither creates forks nor pins commits to retain expired presence.
Trimming releases the corresponding block prefix and revision lookup entries, keeping the current baseline usable.
If the tree is configured to retain history indefinitely, the index follows that choice.
Disposing a view releases its index; another view can rebuild an index from the history still available.
Tokens and maps are not additional summary data.
