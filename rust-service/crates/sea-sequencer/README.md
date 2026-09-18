# Sea Sequencer

`sea-sequencer::next` provides replacement multi-user sessions over one exclusively owned `sea_core::next::SeaView`.
The `sea_core::next::session` traits define content/history, author, and snapshot-coordination facets; `SeaSession` is their convenience marker.

## Replacement Runtime

Move a view into `next::LocalSequencer::<Storage>::recover`, then call `open_session` for each author connection.
Recovery performs a bounded scan only when `head` is nonempty and restores committed submission identities and application positions.
It rejects malformed envelopes, invalid references, and duplicate committed operation identities.
Membership and publisher selection are runtime-local, not control records in the application archive.
Session identities used by committed events remain reserved after recovery; unused memberships need not survive a runtime restart.
Opening another session for an author replaces its previous membership and closes that membership's streams.

Every session shares the runtime's single view and serialized mutation order.
Closing a session is idempotent across clones, removes its minimum-reference contribution and publisher registration, and does not close another session.
Closing the last session does not close the runtime.
`shutdown` first settles pending work, closes all memberships, and releases the view even when closed session handles remain alive.
Operations already holding resources and backend streams or availability handles may retain ownership according to their contracts; drop these before assuming reopening is possible.
The sequencer never relies on memory-specific stream survival or writer-lease behavior.

## Replacement Delivery

Application submissions carry sequencer metadata in the existing private envelope codec.
There are no private open/close entries in the replacement event history, so monitored positions map directly to delivered application events.
`read` lazily initializes the view's bounded or live read and preserves its progress and error classification.
Closing or replacing membership terminates its initialized live reads.
Loads use `LoadStart`, returning a selected handle-based snapshot and the live suffix without an atomic captured head.
The backend's retained live stream provides catch-up and subsequent delivery, so the replacement runtime has no event broadcast queue, lag limit, or broadcast-recovery loop.
Publisher observations use coalescing watch streams because intermediate publisher states need not all be delivered.

## Retry And Settlement

Stable event operation IDs belong to the sequencer, not storage.
An exact retry by the same author returns its original position, including after reconnect; a changed author, payload, tree, or reference conflicts.
Blob identities in submissions are resolved through the current view before publication; wire identities never fabricate availability handles.
The sequencer never resubmits an append internally.
After returned ambiguity it obtains an authoritative head and scans the bounded candidate range.
An exact committed envelope resolves success; a complete settled empty range yields a definitive rejection, permitting an explicit caller retry.
A failed head or incomplete scan yields `RecoveryRequired` and prevents further mutations or claims of absence.

The runtime retains an owned mutation future before first polling backend work.
Dropping a caller future does not drop that backend future or treat cancellation as settlement.
The next state-dependent operation, including close or shutdown, drives the same future to settlement before continuing.
There is no background task or assumed executor, including on WASM; with no further operation, cancelled work may remain pending.
Dropping the whole runtime can still cancel its retained future: the owner must then follow backend settlement/recovery rules before acquiring a replacement view.
An unreconcilable runtime must be discarded and recovered; it cannot use `shutdown` to claim successful settlement.

## Replacement Snapshots

The snapshot's event position is its document-scoped version identity.
Nonempty initial application state is an explicit initialization event referencing its uploaded tree followed by a normal snapshot, not an initial-snapshot exception.
Fluid's sequence-number mapping remains its adapter's responsibility in checkpoint 5.
The session returns availability handles; transports must resolve received identities at the local boundary.

New publication requires an expected parent equal to the latest version and an advancing event position.
Exact position/root retries return the stored publication even after later snapshots; another root at that position conflicts.
There is no separate snapshot-operation-ID index.
Returned ambiguity is resolved only when lookup confirms the requested position/root.
Absence or lookup failure does not establish publication settlement, so it yields `RecoveryRequired` rather than permitting an unsafe retry.

`coordinate_snapshots` registers client-selected, Sea-selected, or read-only participation.
Client-selected publishers suppress Sea nomination; otherwise the lexically first eligible session is nominated.
Nomination changes issue a fresh checked fence, preventing stale authority from becoming valid again.
Publication checks authority at admission; revoking a stream does not roll back an already admitted mutation.
Dropping a coordination stream revokes its own registration synchronously and notifies remaining publishers.
Replacing a registration does not allow an older stream's eventual drop to revoke the replacement.

## Transitional Implementation

The existing `sea-sequencer::session` implementation remains for old consumers until their owning migration checkpoints.
It is not an adapter beneath `next`.
Only the envelope codec, classified error type, and unchanged core identity/event primitives are shared.
Checkpoint 3 migrates wrapper consumers, checkpoint 4 migrates transport/server consumers, and checkpoint 5 removes remaining old session APIs and moves the reusable codec/error definitions out of the transitional module.
The sections below describe the retained old implementation only.

## Session and submission model

A stable `AuthorId` owns one current `SessionId`.
Reconnects use a fresh session identity.
Each event carries a stable `OperationId`, an optional reference position, opaque payload, and optional blob-tree root.

Validation runs before append.
The sequencer rejects reused or replaced sessions, invalid references, and conflicting reuse of an operation identity.
An exact retry returns the original receipt without appending another event.

Replay reconstructs active sessions, stable event receipts, snapshot publication identities, and minimum-reference state.
Explicit close and author-session replacement stop inactive sessions from pinning the minimum reference.

## Storage and fencing

`LocalSequencer::recover` rebuilds this state from a backend.
`LocalSequencer::open_session` opens or replaces an author's session, and the returned `LocalSession` implements load, reads, writes, content operations, snapshot operations, subscriptions, and close.

## Load and subscriptions

`load` selects a compatible snapshot and catch-up head atomically, emits the snapshot and catch-up events, reports monitored progress when it catches up, and continues with live events without a gap.
Archive reads and loads share the same monitored event-delivery engine.
Progress observations may cut ahead of buffered events, while events remain strictly ordered.
Snapshot subscriptions use latest-value semantics and may coalesce intermediate publications for slow consumers.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-sequencer
cargo rustc -p sea-sequencer --lib -- -D missing-docs
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-sequencer --all-features --no-deps
```

Tests cover retries, identity conflicts, replacement and close, replay, load boundaries, event delivery, snapshots, and content references.
Replacement tests additionally run shared session conformance, concurrent submissions, direct live progress, publisher registration cancellation, and recovery.
`src/next_fault_tests.rs` injects definitive rejection, ambiguity with and without commitment, failed reconciliation, and cancellation before/after commitment.
Its read streams retain writable components, exercising a stricter lifetime allowed by `SeaStorage` than the memory backend's independent reads.
