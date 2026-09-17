# Sea Sequencer

`sea-sequencer` provides the multi-user local `SeaSession` implementation over any `SeaStorage` backend.
Private session-control envelopes share the backend event log but are never exposed as application events.

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
