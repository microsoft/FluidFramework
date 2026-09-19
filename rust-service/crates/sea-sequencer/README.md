# Sea Sequencer

`sea-sequencer::session` provides replacement multi-user sessions over one exclusively owned `sea_core::storage::SeaView`.
The `sea_core::session` traits define content/history, author, and snapshot-coordination facets; `SeaSession` is their convenience marker.

## Runtime

Move a view into `session::LocalSequencer::<Storage>::recover`, then call `open_session` for each author connection.
Recovery performs a bounded scan only when `head` is nonempty and restores committed submission identities and application positions.
It rejects malformed envelopes, invalid references, and duplicate committed operation identities.
Active authority and publisher selection are runtime-local.
`announce_membership` optionally publishes immutable public member metadata in the same archive order as application events.
Announced memberships receive a service-authored departure on close, replacement, shutdown, or recovery; unannounced memberships produce no control records.
Recovery closes outstanding announcements before admitting fresh sessions.
Session identities used by committed events remain reserved after recovery; unused memberships need not survive a runtime restart.
Opening another session for an author replaces its previous membership and closes that membership's streams.

Every session shares the runtime's single view and serialized mutation order.
Closing a session is idempotent across clones, removes its minimum-reference contribution and publisher registration, and does not close another session.
Closing the last session does not close the runtime.
`shutdown` first settles pending work, closes all memberships, and releases the view even when closed session handles remain alive.
Operations already holding resources and backend streams or availability handles may retain ownership according to their contracts; drop these before assuming reopening is possible.
The sequencer never relies on memory-specific stream survival or writer-lease behavior.

## Delivery

Application submissions carry sequencer metadata in the existing private envelope codec.
Opt-in membership transitions use a distinct persisted envelope and are delivered as `SessionEventKind::Joined` and `SessionEventKind::Left`.
Application events remain `SessionEventKind::Application` with unchanged submission encoding and retry identity space.
Exact announcement retries return the original position; changing metadata is rejected.
Membership metadata is public control data and is not transformed by payload compression or encryption.
`read` lazily initializes the view's bounded or live read and preserves its progress and error classification.
Closing or replacing membership terminates its initialized live reads.
Loads use `LoadStart`, returning a selected handle-based snapshot and the live suffix without an atomic captured head.
The backend's retained live stream provides catch-up and subsequent delivery, so the replacement runtime has no event broadcast queue, lag limit, or broadcast-recovery loop.
Publisher observations use coalescing watch streams because intermediate publisher states need not all be delivered.

## Ordered Append and Recovery

The required append contract is strict order and termination at the first failure.
Accepted application events form a prefix of the submissions on one append stream.
A rejection, invalid request, or transport failure ends that stream's authority; later queued submissions must not be accepted.
Concurrent local callers must serialize their intended submission order before invoking the session API.
Each event retains its session identity and the reference position describing the sequenced history known when it was constructed.
Earlier application events from that session identify its preceding local work.
SEA treats payloads as opaque and cannot adjust an event for a different submission context.

For announced sessions, the durable leave record is the final sequencing barrier.
It follows every accepted event from that session, and no event from that session may be accepted afterward.
Closing an append stream must settle admitted work before writing its leave.
Unknown storage outcomes must block progress or require recovery, never produce a leave that falsely claims finality.
Connection loss alone is not proof of completion; server failure detection and cleanup must establish that barrier.
An independent read session can replay through the leave even when the old connection and its reads have ended.

To recover non-idempotent application events:

1. Read the old session's history through its leave record.
2. Count its application events to determine the accepted submission prefix; joins and leaves do not count.
3. Reconcile the accepted history with local state.
4. Transform the unaccepted suffix as required by the application and submit it under a fresh session.

The reader needs the relevant session history, or equivalent prefix accounting in a snapshot.
Lost acknowledgments do not change the committed prefix.
An exact operation-ID lookup is separate from resubmission: it can confirm an existing outcome, but does not authorize replaying an old payload at a new reference.
The local runtime revokes authority on a failed or cancelled admitted append, including membership announcement failures.
It settles retained backend work before persisting the departure; failed settlement prevents mutation until recovery.
Transport dispatch also closes authority for malformed author requests that never reach the sequencer.
Client and decorator admission state prevents a cancelled request from being followed by a successful suffix.
The Fluid driver's explicit recovery helper verifies the old terminal prefix and requires an application-owned suffix transformation under a fresh session.
Normal Fluid containers delegate pending-state processing and rebasing to the runtime.
See [known issues](../../KNOWN_ISSUES.md) for remaining implementation limits.

## Minimum Reference Floor

The required document-wide minimum reference is a durable, nondecreasing admission floor, independent of join/leave policy.
The sequencer chooses when to advance it; policy can consider client progress or a time window, but correctness must not depend on the heuristic.
New submissions below the committed floor must terminate their append stream.
A stream-level reference update must be ordered with its submissions; a per-event reference is also sufficient.
The current API carries a reference on every event.

Floor advances must be persisted in archive order and delivered in that same order to live and replay readers.
Snapshots must retain the floor at their boundary, and recovery must restore it before admitting mutations.
Advances can be debounced to reduce bandwidth and storage; only a committed advance becomes enforceable and observable.
Slow writers may need to catch up and transform their unaccepted events under a new session.
Exact lookup of an already accepted event does not constitute a new admission below the floor.
The runtime stores the committed floor separately from memberships and enforces it before every new application append, including submissions with no reference.
Exact committed-operation lookup remains permitted without readmitting the old event.
Each application or membership envelope persists the resulting floor atomically with its event; this is the ordered advance record, so no separate out-of-band notification can race replay.
Failed appends do not advance it, and recovery rejects decreasing, forward, or context-inconsistent floor metadata.
New readers may open behind the floor to catch up, but cannot submit below it.

Advancement policy combines cooperative member progress with a 1024-position lag window, rounding window advances down to 64-position boundaries.
The proposed advance is bounded by the carrying event's reference and never lowers the committed floor.
Idle readers therefore cannot indefinitely pin advances from progressing writers.
No timer or extra control append is needed in a quiescent document.
These policy constants are conservative heuristics, not part of admission correctness.

Snapshots retain their exact event boundary, whose immutable envelope retains the floor at publication.
The current backend retains that event and all history; snapshot consumers can read the boundary event, and recovery scans the archive before admitting mutations.
Any future compaction must preserve this floor metadata with the snapshot rather than discard the boundary envelope.
The Fluid adapter maps the floor into its retained dense sequence space for live delivery, bounded replay, and reopening, instead of reporting permanent zero.

Persisted application/membership encodings are `SEAQ3`/`SEAM2`; older active-minimum envelopes are rejected and require an explicit migration before reuse.
Wire protocol version 7 rejects clients or servers with the earlier semantics.

## Retry Lookup and Settlement

Stable event operation IDs belong to the sequencer, not storage.
An exact retry by the same author returns its original position, including after reconnect; a changed author, payload, tree, or reference conflicts.
Blob identities in submissions are resolved through the current view before publication; wire identities never fabricate availability handles.
The sequencer never resubmits an append internally.
After returned ambiguity it obtains an authoritative head and scans the bounded candidate range.
An exact committed envelope resolves success; a complete settled empty range yields a definitive rejection.
Under the required prefix contract, rejection terminates the old append stream; recovery and transformed resubmission belong to the caller.
A failed head or incomplete scan yields `RecoveryRequired` and prevents further mutations or claims of absence.

The runtime retains an owned mutation future before first polling backend work.
Dropping a caller future does not drop that backend future or treat cancellation as settlement.
The next state-dependent operation, including close or shutdown, drives the same future to settlement before continuing.
There is no background task or assumed executor, including on WASM; with no further operation, cancelled work may remain pending.
Dropping the whole runtime can still cancel its retained future: the owner must then follow backend settlement/recovery rules before acquiring a replacement view.
An unreconcilable runtime must be discarded and recovered; it cannot use `shutdown` to claim successful settlement.

## Snapshots

The snapshot's event position is its document-scoped version identity.
Nonempty initial application state is an explicit initialization event referencing its uploaded tree followed by a normal snapshot, not an initial-snapshot exception.
Fluid's sequence-number mapping remains its adapter's responsibility.
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

## Validation

From `rust-service/`:

```bash
cargo test -p sea-sequencer
cargo rustc -p sea-sequencer --lib -- -D missing-docs
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-sequencer --all-features --no-deps
```

Tests cover retries, identity conflicts, replacement and close, replay, load boundaries, event delivery, snapshots, and content references.
Tests also run shared session conformance, concurrent submissions, direct live progress, publisher registration cancellation, and recovery.
[`src/fault_tests.rs`](src/fault_tests.rs) injects definitive rejection, ambiguity with and without commitment, failed reconciliation, and cancellation before/after commitment.
Its read streams retain writable components, exercising a stricter lifetime allowed by `SeaStorage` than the memory backend's independent reads.
