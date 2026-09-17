# Monitored Stream Plan

## Status

- **Plan status:** In progress.
- **Execution mode:** Lightweight sequential work on the current branch.
- **Compatibility:** Preserve existing import paths where practical, but the `SeaArchive::read` signature and behavior intentionally change.
- **Current checkpoint:** 2. Migrate archive reads and loads.
- **Last completed checkpoint:** 1. Introduce the generic monitored-stream API.
- **Last validation:** `cargo fmt --all -- --check`, package Clippy with warnings denied, package rustdoc with warnings denied, all-target/all-feature package tests, and the documentation checker passed on 2026-09-17.
- **Decisions or TODOs changed:** The generic API uses associated data, position, and error types; exposes one object-safe `MonitoredStream` trait; and provides target-aware `BoxMonitoredStream` aliases.
- **Next checkpoint:** 2. Migrate archive reads and loads.

Update this section in every implementation commit.
Record the completed checkpoint, validation performed, decisions or TODOs changed, and the next checkpoint.
Do not combine checkpoints in one commit.

## Purpose

Provide a reusable stream abstraction that reports both ordered data and current delivery progress.
Use it first to make `SeaArchive::read` support finite historical reads and unbounded live reads through one explicit API,
and to make `SeaEventSubscription::load` use the same monitored event-delivery engine after atomically selecting a snapshot.
Evaluate other streaming surfaces separately and migrate each accepted surface in its own commit.

The abstraction must support:

- progress bars based on a consumed cursor and the latest known position;
- notification when a reader has caught up and is waiting for new items;
- warning when production or transport throughput is causing items to buffer;
- synchronous stream construction, with asynchronous initialization failures delivered by the stream; and
- native thread-safe implementations and intentionally single-threaded browser implementations.

## Settled Design

### Generic module

Add `sea-core/src/monitored_stream.rs` and export it as `sea_core::monitored_stream`.
The module must depend only on the Rust standard library and general-purpose stream crates already used by `sea-core`.
It must not depend on archive, blob, snapshot, session, transport, or storage types.

Use generic support types with names along these lines:

```rust
pub enum MonitoredStreamStatus {
    StreamingBacklog,
    AwaitingNewItems,
    FallenBehind,
}

pub struct MonitoredStreamProgress<P> {
    pub previous: Option<P>,
    pub latest_known: Option<P>,
    pub status: MonitoredStreamStatus,
}

pub enum MonitoredStreamItem<T, P> {
    Item(T),
    Progress(MonitoredStreamProgress<P>),
}
```

Expose a `MonitoredStream` trait over `futures_core::Stream`.
The exact generic-parameter or associated-type spelling may be selected during checkpoint 1 based on object safety and ergonomic boxed aliases, but it must provide:

- a data item type;
- a position type;
- an error type;
- stream items containing either ordered data or a progress snapshot; and
- synchronous access to the latest `MonitoredStreamProgress` snapshot.

Provide native and browser boxed aliases if target-specific `Send` bounds cannot be expressed cleanly by one alias.
Do not introduce Sea-specific bounds such as `ClassifiedError` into this generic module.

### Cursor semantics

`previous` is the stream cursor immediately before the next unread data item.
It is initialized to the `after` value supplied when the stream is created.
It advances to an item's position immediately before that item is returned from `poll_next`.
Internal receipt, download, decoding, or buffering of an item does not advance `previous`.

For an archive read beginning before the first event, `previous` is `None`.
Otherwise, it is `Some(position)` even when that position was supplied as the initial cursor rather than emitted by this stream instance.
This makes the current cursor directly reusable to resume a read.

`latest_known` is the newest item position the implementation currently knows belongs to this stream's range.
Before the implementation has discovered the remote head, it starts equal to `previous`.
Equality therefore does not by itself prove that the reader is caught up; status carries whether initial discovery has completed.

Each progress snapshot is internally consistent.
Neither field may move backward during one uninterrupted stream.

### Status semantics

`StreamingBacklog` means either:

- initial latest-position discovery has not completed; or
- the implementation knows that unread items exist, without evidence that throughput is causing sustained buffering.

`AwaitingNewItems` means initial discovery has completed and `previous == latest_known`.
For an empty archive this is represented by both positions being `None`.

`FallenBehind` means `previous < latest_known` and events are known to be buffering because producer, network, processing, or consumer throughput is limiting delivery.
It is a warning about current buffered backlog, not a loss-of-data signal and not a statement about connectivity.
The precise threshold for entering or leaving this state is implementation-defined.
An implementation must eventually enter `FallenBehind` if new items continue to accumulate while the consumer does not read them.

A future connection-health mechanism may report that timely delivery is not guaranteed while disconnected or degraded, regardless of the two positions.
That concern is intentionally separate from `MonitoredStreamStatus` and remains a documented TODO on `MonitoredStream`.

### Progress delivery

Progress values are out-of-band observations, not entries in the logical data sequence.
`MonitoredStreamItem::Progress` may cut ahead of buffered data and reports the latest state when the consumer observes it.
It does not describe a transition at either `previous` or `latest_known`.

Implementations may coalesce superseded progress updates.
They must preserve the order of all `Item` values and must not allow repeated progress updates to starve data delivery.
A progress item carries one atomic snapshot so consumers never combine fields from different observations.
The stream's synchronous progress accessor returns the same kind of snapshot for consumers that need to inspect state without waiting for another item.

### Archive read semantics

Change `SeaArchive::read` to a synchronous method with parameters:

```rust
fn read(
    &self,
    after: Option<EventPosition>,
    stop_after: Option<EventPosition>,
) -> /* monitored stream */;
```

Calling `read` constructs the stream but does not confirm remote or storage initialization.
Polling drives initialization, and initialization failures are returned through the stream's error items.
Dropping the stream cancels its read or subscription work.

`after` is an exclusive starting cursor.
`None` begins before the first event.

`stop_after` is an inclusive stopping position.
`Some(position)` creates a finite stream that ends after returning that position.
`None` creates an unbounded stream that waits for newly committed events after catching up.

Data items remain in strict archive order without omission or duplication during an uninterrupted stream.
Progress items do not participate in archive ordering.

For a bounded read, completion of the stream communicates that `stop_after` was reached; `AwaitingNewItems` is reserved for an unbounded stream waiting for future items.
Invalid cursors, unavailable retained history, setup failures, and later transport failures are reported through the stream.

## Incremental Commit Sequence

### 1. Introduce the generic monitored-stream API

Add only the reusable abstraction and its focused tests.
Do not change `SeaArchive`, existing stream aliases, implementations, protocols, or consumers in this commit.

Tasks:

- Add `sea-core/src/monitored_stream.rs` with complete module and public API documentation.
- Define `MonitoredStreamStatus`, `MonitoredStreamProgress`, `MonitoredStreamItem`, and `MonitoredStream`.
- Add boxed native and browser aliases if required.
- Export the module and intentionally selected convenience re-exports from `sea-core`.
- Document cursor initialization, monotonicity, status invariants, out-of-band progress ordering, coalescing, starvation prevention, and the future connection-health TODO.
- Add tests for any concrete behavior implemented in this module, such as constructors, invariant-enforcing state transitions, or a generic wrapper.
- If the module contains only data types and a trait, use compile-time/API-shape tests rather than tests that merely restate derived equality.

Validation:

```bash
cargo fmt --all -- --check
cargo clippy -p sea-core --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps
cargo test -p sea-core --all-targets --all-features
node scripts/check-documentation.mjs
```

Commit this checkpoint independently before changing an existing stream API.

### 2. Migrate archive reads and loads

Change the complete `SeaArchive::read` and `SeaEventSubscription::load` vertical paths in one commit so every implementation and consumer agrees on the new semantics.
Keep the operations distinct: `read` starts from an explicit event cursor, while `load` atomically selects a compatible snapshot and starts event delivery after that snapshot's boundary.
Implement both operations using one internal monitored event-stream engine.
Do not migrate unrelated subscription methods in this commit.

Tasks:

- Rename `through` to `stop_after` in the public API and all implementations.
- Make `SeaArchive::read` synchronous and return a monitored stream directly, without an outer `Future` or `Result`.
- Return `SessionCommittedEvent` values as monitored data items and initialization/runtime failures as stream errors.
- Implement finite behavior for `stop_after: Some(_)`.
- Implement gap-free catch-up followed by live delivery for `stop_after: None`.
- Migrate `SeaEventSubscription::load` to return a monitored stream backed by the same gap-free catch-up and live-delivery engine.
- Preserve atomic snapshot selection and its catch-up boundary; the selected snapshot establishes the load stream's initial `previous` cursor.
- Replace `LoadEvent::CaughtUp` with monitored progress reaching `AwaitingNewItems`.
- Retain an explicit way for `load` to deliver its selected snapshot without treating the snapshot as an archive event or assigning it an event-stream position.
- Initialize `previous` and `latest_known` from `after` and begin in `StreamingBacklog` while the head is unknown.
- Emit progress updates when `latest_known` changes, when the stream first reaches `AwaitingNewItems`, and when it enters or leaves `FallenBehind`.
- Ensure progress updates may cut ahead of buffered events while event items remain strictly ordered.
- Define bounded buffering and implementation-specific `FallenBehind` thresholds without silently dropping archive events.
- Preserve cancellation on stream drop.
- Update decorators so compression, encryption, and stateful compression preserve progress unchanged while transforming only data items.
- Update local sequencing, native WebTransport, browser/WASM bindings, server dispatch, protocol messages, examples, benchmarks, and documentation as required by the changed contract.
- Remove the old finite-read behavior and obsolete aliases once no consumer needs them; do not retain parallel APIs solely for compatibility.

Tests must cover:

- initial progress when `after` is `None` and when it is `Some(position)`;
- initial head discovery and the first `AwaitingNewItems` notification;
- ordered backlog delivery and monotonic cursor advancement;
- live events delivered after initial catch-up when `stop_after` is `None`;
- finite completion immediately after `stop_after` is returned;
- atomic snapshot selection and event catch-up from the selected snapshot boundary;
- load delivery for an empty archive, an initial snapshot, and a snapshot at an event position;
- equivalent progress and event-order behavior between `read` and the event portion of `load`;
- progress updates cutting ahead of buffered data without reordering data;
- eventual `FallenBehind` for a deliberately slow or paused consumer;
- recovery or failure behavior when retained history is unavailable;
- setup failures arriving through the stream rather than from `read`; and
- cancellation when the stream is dropped.

Validation:

Run the complete canonical validation in `rust-service/DEVELOPMENT.md`, including generated WASM and TypeScript consumers, repository policy validation, and `pnpm build:fast`.

Commit this checkpoint independently.

### 3. Evaluate snapshot subscriptions

After checkpoint 2 is stable, decide whether snapshot notification and coordination streams benefit from the same abstraction.
Do not assume their position type is `SnapshotPosition`: multiple publications may represent the same event boundary, and latest-value streams may intentionally coalesce publications.

Before implementation, settle:

- the monotonic position or revision type for snapshot publications and coordination updates;
- whether skipped latest-value publications advance `previous`;
- what backlog and `FallenBehind` mean for a deliberately coalescing stream; and
- whether the stream needs every generic status or a narrower abstraction.

If the semantics fit `MonitoredStream`, migrate `SeaSnapshotCoordinator::subscribe_snapshots` in one commit with focused conformance, local, network, and browser tests.
Otherwise, document why it retains a plain latest-value stream.

### 4. Evaluate remaining streams independently

Evaluate each remaining stream-returning API separately, including:

- `SeaSnapshotPublisher::coordinate_snapshots`; and
- internal `SeaStorage` catch-up streams.

For each surface:

- identify its ordered position domain;
- decide whether progress and throughput pressure are meaningful;
- preserve any atomic snapshot/catch-up boundary;
- avoid forcing monitored semantics onto finite internal streams that do not benefit; and
- migrate it in its own commit with focused tests and the validation proportional to its consumers.

Do not bundle these migrations together merely because they share the generic abstraction.

## Completion Criteria

The plan is complete when:

- the generic monitored-stream API has stable, precise documentation and focused tests;
- `SeaArchive::read` implements the synchronous finite-or-live contract across local, native, and browser clients;
- `SeaEventSubscription::load` preserves atomic snapshot selection while sharing the monitored event-delivery engine with `read`;
- progress reporting supports consumer cursors, latest-known positions, caught-up notification, and throughput-pressure warnings without weakening ordered delivery;
- every other stream surface has either migrated in an independent commit or has a recorded reason to retain its existing abstraction;
- no obsolete parallel stream API remains without a documented consumer; and
- all canonical Rust, generated-client, documentation, policy, and repository build checks pass.
