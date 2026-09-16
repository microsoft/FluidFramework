# Sea Migration Plan

## Status

- **Plan status:** Approved.
- **Execution mode:** Lightweight sequential work on the current branch.
- **Compatibility:** No API, wire-format, persisted-data, package-name, or executable compatibility is required.
- **Completed checkpoint:** 5. Mechanical identifier and terminology renames.
- **Validation:** The checkpoint 5 canonical workspace gate and the `sea-webtransport-server` binary build passed. This plan revision passed the documentation checker and `git diff --check`.
- **Decisions or TODOs changed:** Renamed the existing stream API to `EventStream`, `EventReceipt`, and `CommittedEvent`, and renamed `Snapshot::includes_through` to `at_event`. This plan revision preserved initial snapshots, assigned atomic reference coordination to each `SeaStorage` backend, retained all data in the first implementation, added recoverable snapshot-publication identities, made sessions archive-bound, preserved browser-specific facades and the private sequencer envelope, and deferred transitional package removal until consumer cutover. Flat `SummaryManifest`/`SummaryEntry` identifiers remain only until checkpoint 6 replaces their representation with blob trees; FSP4 wire terminology remains until checkpoint 12 removes its final consumers.
- **Next checkpoint:** 6. Define the Sea core model and interfaces.
- **Plan commit:** `d1a9915141bfeb8e61fb3550e795a27c9f15d816`.

Update this section in every implementation commit. Each update must identify the completed checkpoint, validation performed, decisions or TODOs changed, and the next checkpoint. Keep completed checklist entries in this file so it remains the migration record.

## Purpose

Rename the experimental system to **Sea**, short for **Snapshotted Event Archive**, and reorganize it around application-independent storage, multi-user sequencing, WebTransport, and one obvious server executable.

This is a cross-cutting migration with tightly coupled package, API, protocol, storage, test, and documentation changes. Implement it sequentially on the current branch. Do not create numbered iteration records, parallel workstreams, integration branches, or worktrees for this effort.

The existing [PLAN.md](PLAN.md), iteration records, and decision records are historical evidence. Do not rewrite them to use new names or paths. Update current documentation and this plan instead.

## Settled Decisions

### Product and deployment

- The system name is **Sea**.
- Sea is application-independent. Fluid integration is a downstream adapter and is outside this migration unless a compile fix requires touching it.
- WebTransport is the only supported process transport.
- Delete the Unix-domain-socket service example and Unix process transport rather than preserving compatibility.
- `sea-webtransport-server` is the native-only deployable binary.
- Storage backend selection is runtime configuration. Cargo features may later omit backends from a build, but do not select the active backend.
- The server includes memory, buffered-file, and durable-file backends by default.

### Core concepts and terminology

- Use **event**, not append record or Fluid operation, for the application-independent ordered value.
- Use **snapshot**, not summary, for state associated with an event position.
- A `Blob` is an immutable binary leaf.
- A `BlobDirectory` is an immutable inner node mapping names to `BlobTreeId` values.
- A `BlobTree` is a tree rooted at either a `Blob` or `BlobDirectory`.
- `BlobId` and `BlobDirectoryId` are distinct, domain-separated content identities.
- `BlobTreeId` is a tagged union of `BlobId` and `BlobDirectoryId`.
- Each event initially has one optional `BlobTreeId` in addition to its opaque payload.
- Each snapshot has a boundary and a `BlobTreeId` root. The boundary is either the state before the first event or an `EventPosition` included by the snapshot.
- Blobs, blob directories, blob trees, snapshots, events, positions, and their contracts belong in `sea-core`.
- Event payloads remain opaque. Sea does not parse payloads to discover blob references.
- `EventPosition` is a shared strongly typed `u64` newtype with equality and total ordering and a private numeric field.
- Within one archive, every committed event has a unique stable position and position ordering matches committed event ordering: a smaller position identifies an earlier event.
- Position assignment, starting value, and gaps are otherwise implementation-defined. Arithmetic and adjacency have no defined semantics.
- Use one canonical eight-byte wire and persistence encoding for `EventPosition`.
- Sea does not require positions to encode a document or generation identity, and does not require implementations to pay the storage, wire, or validation cost of detecting cross-document or cross-generation misuse.
- Comparing positions from different archives is mechanically permitted but has no semantic meaning. Acceptance or rejection by one archive does not predict behavior in another.
- A storage or session operation validates only what its implementation needs to interpret a position safely, such as encoding, retention, and whether the represented location is available in the selected archive.

### API boundaries

- `SeaStorage` is the trusted backend contract.
- `SeaSession` is the individual-user interface exposed by local sequencing and WebTransport clients.
- A `SeaSession` is bound to one archive. Content operations through that session are scoped to the same archive and do not accept an independently chosen archive identifier.
- Storage and session interfaces are distinct because they have different trust, concurrency, durability, identity, and recovery semantics.
- They should reuse core value types and narrow parent traits where that makes substitution practical without leaking backend policy into clients.
- `sea-sequencer` wraps `SeaStorage` to provide multi-user sessions, read and write streams, submission identity, ambiguity recovery, minimum-reference tracking, fencing, and subscriptions.
- A direct single-user adapter over `SeaStorage` should implement `SeaSession` if doing so preserves the session contract without artificial behavior. Otherwise, provide shared narrow traits and document why direct storage and sequenced sessions differ.
- `sea-webtransport` owns the shared wire protocol, framing, common client/server transport types, and native and browser clients. Its client implements `SeaSession`.
- Local, injected, native WebTransport, and browser WebTransport clients expose equivalent `SeaSession` behavior so consumers can change deployment topology without implementing a second protocol facade.
- Sea tracks stable submissions, references, cursors, and ambiguous outcomes, but cannot semantically rebase opaque event payloads. Application adapters such as the Fluid driver own payload rebasing and explicit resubmission policy.
- `EventPosition` is the only Sea event-order value. Downstream adapters may project it into application sequence-number types with checked conversion rather than requiring Sea to carry a second sequence number.
- Compression, encryption, and stateful compression are `SeaSession` decorators, normally applied on the client side of the WebTransport boundary.
- Session compression transforms data before transport so it can reduce bandwidth, server memory, and stored size.
- Session encryption transforms data before transport so event and blob content can remain end-to-end encrypted from the Sea server.
- Compose compression before encryption by default because encrypted bytes are not usefully compressible.
- The server and `SeaStorage` treat transformed application bytes as opaque while still validating the Sea metadata and content identities needed for ordering, snapshots, and blob-tree lifetime.
- `sea-webtransport-server` owns native listener and TLS setup, storage composition, runtime configuration, lifecycle, and the server binary. It depends on `sea-webtransport`, `sea-sequencer`, and concrete storage packages.
- The first browser implementation may use a target-specific facade over the `SeaSession` contract. The shared contract must not require `Send` or `Sync` from browser-owned state that is intentionally single-threaded.

### Atomicity and lifetime

- Accepting an event and recording its optional blob-tree reference is one atomic storage operation.
- Publishing a snapshot and recording its blob-tree reference is one atomic storage operation.
- Event or snapshot acceptance must fail before commit when its referenced blob tree is missing, malformed, or unavailable for use.
- `SeaStorage` owns the observable atomic operation, including validating the referenced tree closure and making its retention reference durable enough for the event or snapshot acknowledgement being returned. A backend may delegate immutable object bytes to `sea-content-addressed`, but the backend remains the transaction coordinator.
- `sea-core::storage` specifies observable atomicity and lifetime behavior. It does not prescribe one physical log layout.
- Backends may use separate event-reference and snapshot-reference logs, one combined log, or transactional metadata.
- Blob-tree reachability includes retained event references, retained snapshot references, and temporary upload pins or leases once garbage collection exists.
- `SeaStorage` supports retained snapshot history and selecting the newest retained snapshot at or before an `EventPosition`, not only reading the latest snapshot.
- The first correct implementation retains all events, snapshots, and uploaded content. Retention and garbage collection may be added later without changing identities or lookup semantics.
- A session load establishes one gap-free boundary. It selects a compatible snapshot, captures a head, delivers every event after the snapshot through that head in order, emits a caught-up marker naming that head, and then continues with later live events without omission or duplication during the uninterrupted load.
- Snapshot subscriptions have documented latest-value semantics by default. Slow consumers may observe coalesced updates and are not promised every publication.

### Publication recovery

- Event submissions and snapshot publications have stable operation identities independent of transport request IDs.
- An exact retry of a committed operation returns the original receipt, including the same `SnapshotId` for a snapshot publication. Reusing an operation identity with different content or preconditions is a conflict.
- A caller can resolve an ambiguous snapshot publication without guessing from the latest snapshot or retrying with a now-stale expected parent.
- The concrete encoding and generation policy for stable operation identities are implementation details so long as native, browser, and injected clients expose equivalent behavior.

### Initial version boundaries

- Authentication and multi-tenant policy are not introduced by this migration. The server supplies an opaque authorization context when one exists, and session/content APIs preserve it without defining credentials or claims.
- The first implementation prevents archive-independent digest probing by requiring content access through an archive-bound session. Stronger cross-tenant authorization remains deployment work.
- Blob-directory names and topology remain server-visible initially. Compression and encryption transform event payloads and blob leaf bytes, not Sea ordering metadata, identities, or directory structure.
- Stateful-compression dictionaries are supplied as immutable decorator configuration initially. Making dictionaries Sea-managed content is deferred until a consumer requires dynamic dictionary distribution or rotation.

## Existing Consumer Requirements

The migration is not complete when Rust packages alone compile. The following in-repository consumers are required acceptance surfaces:

- `tests/minimal-fluid-driver` builds a TypeScript Fluid driver over generated WASM clients, runs Node contract tests, and bundles SharedTree browser and benchmark harnesses.
- `tests/wasm-client` validates the generated Node WASM distribution and its injected transport boundary.
- `tests/webtransport-browser` validates the generated browser client against the native HTTP/3 server with certificate pinning.
- `sea-counter`, conformance suites, benchmarks, and Rust integration tests consume the local Rust interfaces directly.

The final generated client API should expose typed Sea operations rather than require TypeScript to construct or parse the Sea wire protocol. Generated web and Node artifacts must have documented module names, output paths, TypeScript declarations, and `wasm-bindgen` version requirements. Build tracking must include all Rust inputs that affect those artifacts.

The minimal Fluid driver remains an adapter outside Sea. It is responsible for Fluid interfaces, joins and leaves, connection modes, pending-operation rebasing, explicit resubmission policy, and checked conversion from `EventPosition` to Fluid's JavaScript-safe sequence-number range. Sea supplies the ordered event, session, snapshot, blob-tree, reconnect, and ambiguity primitives needed to implement those behaviors without FSP-specific TypeScript code.

Proper Fluid summary support maps naturally onto Sea without adding Fluid concepts to `sea-core`:

- a Fluid summary blob maps to a Sea `Blob`;
- a Fluid summary tree maps recursively to a `BlobDirectory`;
- a Fluid tree or blob handle resolves its path against the acknowledged parent Sea snapshot and reuses the resulting `BlobTreeId`;
- a Fluid attachment references an existing `BlobId` uploaded through the blob API;
- the published Fluid summary maps to a Sea `Snapshot` rooted at the resulting `BlobTreeId` and associated with the adapter's mapped `EventPosition`; and
- Fluid summary context supplies the expected parent and reference position used for conditional snapshot publication.

A Sea `SnapshotId` identifies one publication and its lineage independently of its root `BlobTreeId`. A separate stable publication-operation identity supports idempotent retry and ambiguity resolution. Fluid version IDs and summary acknowledgement handles map to `SnapshotId`; content and subtree handles resolve to `BlobTreeId`. Reusing an identical tree at a later event position may therefore produce a new snapshot identity without duplicating the tree.

Sea must therefore preserve recursive tree identities, typed leaf/directory references, historical snapshot lookup, conditional publication, and authorized content retrieval. It must not require the adapter to flatten trees, re-upload unchanged subtrees, or encode Sea protocol frames in TypeScript.

## Target Package Architecture

| Package | Target responsibility |
| --- | --- |
| `sea-core` | Events, positions, blobs, blob directories, blob trees, snapshots, errors, capabilities, `SeaStorage`, `SeaSession`, and narrow shared traits. |
| `sea-conformance` | Reusable semantic laws for storage, sessions, session decorators, blob trees, and snapshot atomicity. |
| `sea-memory` | In-process Sea storage. |
| `sea-file` | Buffered single-process file storage. |
| `sea-file-durable` | Crash-durable file storage and persisted fencing support. |
| `sea-content-addressed` | Reusable immutable blob and blob-directory persistence used by storage backends. |
| `sea-sequencer` | Multi-user `SeaSession` implementation over `SeaStorage`. |
| `sea-webtransport` | Versioned protocol, framing, generated web/Node bindings, shared transport logic, and native/browser `SeaSession` clients. |
| `sea-webtransport-server` | Native server library if useful, runtime backend composition, TLS, lifecycle, and `sea-webtransport-server` binary. |
| `sea-compression` | Transparent `SeaSession` decorator that compresses application data before transport. |
| `sea-encryption` | Transparent `SeaSession` decorator that provides authenticated end-to-end encryption of application data. |
| `sea-stateful-compression` | `SeaSession` compression using immutable shared dictionary content. |
| `sea-benchmarks` | Cross-layer Sea benchmarks. |
| `sea-counter` | Minimal snapshot-and-replay example. |

The final architecture does not retain separate `fluid-*`, `snapshotted-stream-*`, generic process-network, native-service, protocol-only, transport-neutral-client, browser-service, or Unix-service-example packages. Transitional packages may exist between checkpoints, but each must have an explicit removal or merge checkpoint below.

## Initial Rename Map

The first rename checkpoints are mechanical. They do not yet merge packages or redesign APIs.

| Current package | Mechanical Sea name | Final disposition |
| --- | --- | --- |
| `snapshotted-stream-core` | `sea-core` | Retain. |
| `snapshotted-stream-conformance` | `sea-conformance` | Retain. |
| `snapshotted-stream-memory` | `sea-memory` | Retain. |
| `snapshotted-stream-file-simple` | `sea-file` | Retain. |
| `snapshotted-stream-durable-log-spike` | `sea-file-durable` | Retain and remove spike terminology. |
| `snapshotted-stream-content-addressed` | `sea-content-addressed` | Retain with blob-tree terminology. |
| `snapshotted-stream-compression` | `sea-compression` | Retain. |
| `snapshotted-stream-encryption` | `sea-encryption` | Retain. |
| `snapshotted-stream-stateful-compression` | `sea-stateful-compression` | Retain. |
| `snapshotted-stream-network` | `sea-network` | Transitional; remove Unix transport and fold any retained shared transport behavior into `sea-webtransport` or direct traits. |
| `fluid-sequencer` | `sea-sequencer` | Retain and generalize. |
| `fluid-service-protocol` | `sea-protocol` | Transitional; merge into `sea-webtransport`. |
| `fluid-service-storage` | `sea-storage` | Transitional composition package; move contracts to `sea-core`, concrete behavior to backends/server, then remove. |
| `fluid-native-service` | `sea-service` | Transitional orchestration package; move behavior to `sea-sequencer` and `sea-webtransport-server`, then remove. |
| `snapshotted-stream-client` | `sea-client` | Transitional; merge the user client into `sea-webtransport`. |
| `fluid-webtransport-native` | `sea-webtransport` | Retain as the consolidation target, but remove its binary after the server package exists. |
| `fluid-webtransport-browser` | `sea-webtransport-browser` | Transitional; merge browser client code into `sea-webtransport`. |
| `fluid-native-service-browser` | `sea-service-browser` | Transitional; remove or fold any required direct-session WASM adapter into its owning package. |
| `snapshotted-stream-benchmarks` | `sea-benchmarks` | Retain. |
| `snapshotted-stream-counter` | `sea-counter` | Retain. |
| `fluid-native-service-example` | No rename | Delete at the practical file-removal checkpoint. |

The no-rename exception avoids creating a throwaway package name immediately before deletion.

## Commit Sequence

Every commit must update **Status** and this checklist. Prefer a buildable repository at every boundary. Where a purely mechanical commit cannot run all checks, run the listed structural check and restore the full gate in the immediately following commit.

### 1. Plan-only commit

- [x] Review and approve this plan.
- [x] Commit only `SEA_MIGRATION_PLAN.md`.
- [x] Record the plan commit hash in **Status** during checkpoint 2.

Validation:

```bash
node scripts/check-documentation.mjs
```

### 2. Directory moves

- [x] Move package directories to the mechanical names in **Initial Rename Map** using `git mv`.
- [x] Do not rename Rust identifiers, package declarations, dependency keys, or prose in this commit.
- [x] Update only workspace member paths and relative path dependency locations needed for Cargo to discover the moved packages.
- [x] Preserve grouping directories only where they remain meaningful. Prefer a flat `crates/<package-name>/` layout for final Sea packages; defer disruptive source regrouping to checkpoint 4 when needed.
- [x] Leave historical iteration and decision records unchanged.

Validation:

```bash
cargo metadata --no-deps --format-version 1
```

Require all workspace packages to resolve from their new directories. Package names may intentionally remain old until checkpoint 3.

### 3. Package names, references, and current documentation

- [x] Rename Cargo package declarations to the mechanical Sea names.
- [x] Update dependency keys, package aliases, Rust crate imports, feature references, package-scoped commands, scripts, tests, benchmarks, and current Markdown links.
- [x] Update `WORKSTREAMS.md`, `DEVELOPMENT.md`, grouping READMEs, package READMEs, and current top-level architecture prose.
- [x] Do not rewrite append-only decisions, completed iteration records, or historical reports.
- [x] Update `Cargo.lock` through Cargo rather than manual editing.
- [x] Assert that each retained package directory basename equals its package name.

Validation: run the canonical workspace gate in [DEVELOPMENT.md](DEVELOPMENT.md), adjusted in the same commit for renamed packages.

### 4. Practical file moves and deletions

- [x] Delete `fluid-native-service-example` and its Unix-socket tests.
- [x] Remove the Unix process transport from transitional `sea-network`.
- [x] Move source modules whose final owner is already unambiguous and whose movement does not require semantic redesign.
- [x] Create skeleton package locations for `sea-webtransport-server` or other final owners only when the move can remain behavior-preserving.
- [x] Keep moves separate from identifier renames whenever Git can represent them clearly.
- [x] Update only references required by the moves.

Candidate behavior-preserving moves:

- WebTransport executable code from `sea-webtransport` to `sea-webtransport-server` after a server manifest exists.
- Shared protocol modules from transitional `sea-protocol` into `sea-webtransport` when they can move without redesign.
- Browser WebTransport modules into target-specific modules in `sea-webtransport`.

If a candidate move requires meaningful API changes, defer it to its semantic checkpoint rather than mixing concerns.

### 5. Mechanical identifier and terminology renames

- [x] Rename existing application-independent types and modules from Fluid or snapshotted-stream terminology to Sea terminology where semantics are unchanged.
- [x] Rename `summary` concepts to `snapshot` wherever they represent Sea snapshots.
- [x] Distinguish binary `Blob` leaves from `BlobDirectory` inner nodes and `BlobTree` roots in identifiers and documentation, deferring the flat manifest representation itself to checkpoint 6.
- [x] Rename executable, environment-variable, log-output, and configuration terminology to Sea.
- [x] Keep semantic redesign out of this commit; defer types that cannot be renamed without changing their representation or contract.
- [x] Update current docs alongside identifier renames.

Use language-aware symbol renames where available. Validate that no active nonhistorical `fluid-*`, `snapshotted-stream-*`, FSP4, summary-manifest, or ambiguous directory-as-blob terminology remains unless a TODO names its later checkpoint.

### 6. Define the Sea core model and interfaces

- [ ] Define `Event`, including opaque payload and `Option<BlobTreeId>`.
- [ ] Define shared `EventPosition(u64)` with a private field, equality, total ordering, and canonical eight-byte encoding.
- [ ] Require unique stable positions whose ordering matches committed event ordering within one archive, without requiring contiguity or a particular starting value.
- [ ] Remove backend-specific public position wrappers and unnecessary position-codec abstraction after all consumers use `EventPosition`.
- [ ] Define domain-separated `BlobId`, `BlobDirectoryId`, and tagged `BlobTreeId`.
- [ ] Define canonical `BlobDirectory` entry semantics, validation, and encoding ownership.
- [ ] Define `SnapshotPosition` as either `Initial` or `At(EventPosition)`. `Initial` represents state before the first event and sorts before every event position for snapshot selection.
- [ ] Define `Snapshot` as a snapshot position plus a blob-tree root and lineage/publication metadata.
- [ ] Keep `SnapshotId` distinct from the snapshot root's `BlobTreeId` so identical content can participate in different positions or lineages.
- [ ] Define stable snapshot-publication identity, exact-retry idempotency that returns the original `SnapshotId`, conflict behavior for identity reuse, and ambiguity resolution. A new operation identity may publish the same root at the same or another position as a distinct snapshot. Do not require the identity to reveal content or lineage.
- [ ] Define retained snapshot history lookup by `SnapshotId`, latest snapshot, and newest-at-or-before an `EventPosition`.
- [ ] Retain all events, snapshots, and uploaded content in the first implementation. Preserve API semantics that allow later retention to report stale positions or unavailable historical snapshots.
- [ ] Define a gap-free load contract that binds snapshot selection, a captured head, finite catch-up through that head, a caught-up marker carrying the head, and continuation into later live events without omission or duplication.
- [ ] Define position semantics without requiring embedded archive or generation identity or foreign-position detection.
- [ ] Define `SeaStorage` as the trusted atomic backend contract, including blob and directory publication and retrieval, recursive closure validation, and event/snapshot attachment of a root.
- [ ] Make each `SeaStorage` backend the coordinator for atomic owner publication and reference recording, while allowing immutable object persistence to be delegated to `sea-content-addressed`.
- [ ] Define `SeaSession` as the archive-bound individual-user contract, including events, snapshots, content operations, load, subscriptions, stable submissions, publication recovery, cancellation, and reconnect behavior.
- [ ] Ensure the `SeaSession` contract can be implemented by native `Send`/`Sync` clients and browser single-threaded clients. Use target-specific adapters or async bounds rather than weakening native storage requirements.
- [ ] Extract only narrow shared traits that produce useful direct/local substitution.
- [ ] Add conformance laws for malformed IDs, missing tree nodes, event and position ordering, stable position round trips, initial and historical snapshot selection, snapshot publication retry and resolution, gap-free load, snapshot lineage, atomic reference recording, and safe handling of malformed or unavailable positions.
- [ ] Do not add a conformance law requiring rejection of a position solely because another archive produced it.
- [ ] Update `sea-core` documentation with explicit trust boundaries and atomicity requirements.

Required atomic operations must make it impossible to commit an event or snapshot while omitting its supplied blob-tree reference.

### 7. Implement blob trees and reference lifetime in storage backends

- [ ] Refactor `sea-content-addressed` around `Blob`, `BlobDirectory`, and recursive `BlobTree` validation.
- [ ] Use domain-separated hashing for leaves and directories.
- [ ] Implement atomic event/reference and snapshot/reference persistence for `sea-memory`, `sea-file`, and `sea-file-durable`.
- [ ] Make every backend assign and persist `EventPosition` values whose order matches committed event order, without assuming positions are contiguous.
- [ ] Persist enough snapshot history to select the newest retained snapshot at or before a requested position.
- [ ] Preserve and recover `Initial` snapshots in every backend.
- [ ] Implement a storage boundary that captures the selected snapshot and catch-up head so subsequent reads cannot omit an event committed across the load transition.
- [ ] Ensure each backend rejects unavailable or invalid trees before acceptance.
- [ ] Reuse unchanged blobs and directories across events and snapshots without duplicating content bytes.
- [ ] Add crash and fault tests proving acknowledged durable events and snapshots retain valid roots.
- [ ] Keep physical reference metadata backend-specific while testing common observable laws.

### 8. Generalize sequencing around `SeaSession`

- [ ] Remove remaining Fluid assumptions from `sea-sequencer`, including mandatory Fluid sequence-number semantics.
- [ ] Implement multi-user sessions, read and write streams, stable submission identity, minimum-reference tracking, fencing, ambiguity resolution, and subscriptions over `SeaStorage`.
- [ ] Define authoritative writer states for activation, replacement, reconnect grace, explicit leave, inactivity expiry, lag eviction, and removal.
- [ ] Ensure replay or restart reconstructs the writer state that affects minimum-reference calculation, and ensure removed writers no longer pin the minimum reference.
- [ ] Retain the current private single-log sequencer envelope initially: session-control entries and submission metadata remain internal to `sea-sequencer`, are never returned as session events, and may create gaps between exposed `EventPosition` values. Re-evaluate a separate sequencer journal only if the envelope prevents required storage substitution or retention.
- [ ] Carry an event's optional `BlobTreeId` through validation, sequencing, persistence, reads, and subscriptions.
- [ ] Ensure the sequencer observes and atomically commits blob-tree references through `SeaStorage`.
- [ ] Implement stable snapshot-publication retry and ambiguity resolution alongside event-submission recovery.
- [ ] Implement the local `SeaSession` interface.
- [ ] Attempt a direct single-user `SeaSession` adapter over `SeaStorage`; retain it only if its behavior is natural and conforms without fabricated session semantics.
- [ ] Remove transitional `sea-service` behavior as it becomes owned by `sea-sequencer` or the server.

### 9. Introduce the Sea WebTransport protocol and client

- [ ] Introduce a bounded, versioned Sea protocol. Do not extend FSP4 with new Sea semantics.
- [ ] Merge transitional `sea-protocol`, `sea-client`, and `sea-webtransport-browser` into `sea-webtransport`.
- [ ] Make native and browser clients implement `SeaSession`.
- [ ] Expose typed generated WASM methods for Sea operations so TypeScript consumers do not encode or parse protocol frames.
- [ ] Keep server-side transport helpers in the same package when genuinely shared with clients.
- [ ] Use target-specific dependencies/modules so browser builds do not pull native listener or TLS implementations.
- [ ] Implement the lazy load flow: optional required position, newest compatible snapshot, optional eager blob-tree content, every subsequent event, an explicit caught-up marker, and continued live delivery without gaps.
- [ ] Implement distinct event-author and event-subscription stream lifecycles with explicit takeover, reconnect, cancellation, backpressure, and terminal-error behavior.
- [ ] Implement latest-value snapshot subscriptions with coalescing semantics and leave guaranteed delivery of every snapshot as a future optional mode.
- [ ] Implement bounded content streams with request IDs, interleaved responses, versioned loading hints, optional eager recursive results, truncation, and explicit end-of-request markers.
- [ ] Keep unattached uploads available in the first implementation. Do not add leases, expiry, or collection while all uploaded content is retained.
- [ ] Bind each session and its content requests to one archive. Carry opaque host-supplied authorization context when present, and prevent archive-independent digest probing without defining authentication or tenant policy in Sea.
- [ ] Cover unary operations, event submission streams, snapshot publication retry and resolution, gap-free load, bounded historical reads, event and snapshot subscriptions, blob-tree upload and fetch, cancellation, reconnect, and ambiguous outcomes.
- [ ] Keep FSP4 and any thin transitional packages only where an unmigrated in-repository consumer still requires them. Do not add compatibility behavior, and remove them in checkpoint 12 after the final consumer cutover.

### 10. Adapt session decorators

- [ ] Adapt compression, encryption, and stateful compression as transparent `SeaSession` decorators rather than `SeaStorage` wrappers.
- [ ] Support composition on both local sessions and WebTransport clients, with the normal deployment applying decorators before the WebTransport boundary.
- [ ] Define one versioned envelope that records the transformations required to decode event payloads and blob leaves. Snapshots reference transformed blob trees and do not carry a second opaque application payload.
- [ ] Compose compression before encryption by default and test that reversing the order is rejected or requires an explicit nondefault composition.
- [ ] Preserve event and snapshot blob-tree references through transformation so the sequencer and storage can validate availability and retain referenced trees without decrypting application content.
- [ ] Ensure the `BlobId` visible through a decorated session identifies the exact transformed bytes stored by the server. Keep any plaintext identity or integrity metadata inside the authenticated envelope, and let the decorator maintain any transient plaintext-to-stored identity mapping it needs.
- [ ] Have decorators transform leaf uploads before returning their `BlobId`; directories, events, and snapshots then use the IDs returned through the decorated session. Do not expose a second plaintext `BlobTreeId` namespace.
- [ ] Leave blob-directory names and topology untransformed in the first implementation. Revisit encrypted directories only with a concrete confidentiality requirement and a replacement for server-side reachability validation.
- [ ] Supply stateful-compression dictionaries as immutable decorator configuration and record their version or fingerprint in the envelope. Do not add Sea-managed dictionary lifetime in this checkpoint.
- [ ] Verify compression reduces encoded WebTransport bytes for representative compressible data and does not require the server to inflate it.
- [ ] Verify the server cannot recover encrypted event or blob-leaf plaintext and can still validate framing, content hashes, references, and limits.
- [ ] Add common `SeaSession` decorator conformance tests for reads, writes, snapshots, subscriptions, reconnect, errors, and cancellation.
- [ ] Defer server-side storage compression or encryption wrappers unless later measurements establish a separate need.

### 11. Build the native WebTransport server

- [ ] Make `sea-webtransport-server` native-only.
- [ ] Produce one binary named `sea-webtransport-server`.
- [ ] Compose `sea-webtransport`, `sea-sequencer`, `sea-memory`, `sea-file`, and `sea-file-durable`.
- [ ] Select the backend at runtime, defaulting to durable file storage.
- [ ] Own TLS identity, bind configuration, data root, limits, graceful shutdown, and process lifecycle.
- [ ] Export an embedding library only if it makes server tests or real embedding materially simpler.
- [ ] Move end-to-end process tests to this package and cover every backend plus invalid configuration.
- [ ] Remove the old binary from `sea-webtransport` and remove transitional `sea-storage` composition after ownership has moved.
- [ ] Document one canonical command for starting Sea.

### 12. Migrate generated bindings and the Fluid adapter

- [ ] Replace the two current generated WASM packages with the final `sea-webtransport` web and Node artifacts plus the selected local/injected `SeaSession` artifact or mode.
- [ ] Update WASM build scripts, Cargo package names, output filenames, TypeScript imports, bundler externals, ignored paths, declarative build inputs/outputs, and `wasm-bindgen` version checks.
- [ ] Migrate `tests/wasm-client` and `tests/webtransport-browser` before deleting the generated package names they consume. Keep generated artifacts ignored and generated from one pinned `wasm-bindgen` version.
- [ ] Rewrite the minimal Fluid driver against typed generated `SeaSession` methods and remove its FSP4 encoder/parser and protocol-specific request facade.
- [ ] Project `EventPosition` into Fluid sequence numbers with an explicit `Number.MAX_SAFE_INTEGER` check. Do not silently truncate a Rust or WASM `u64`/`bigint`.
- [ ] Preserve a checked bidirectional mapping between Fluid reference sequence numbers and Sea `EventPosition` values; account explicitly for synthetic Fluid protocol messages rather than assuming the numbers are identical.
- [ ] Preserve explicit disconnect, reconnect, cancellation, pending submission resolution, and caller-driven resubmission behavior.
- [ ] Preserve snapshot publication identities across disconnect, resolve ambiguous publication outcomes, and never infer success solely from whichever snapshot is latest after reconnect.
- [ ] Preserve both local/injected and remote WebTransport test and benchmark modes unless review explicitly removes one.
- [ ] Map recursive `ISummaryTree` values to `BlobDirectory` trees without flattening paths.
- [ ] Support summary tree and blob handles by resolving their paths against the acknowledged parent snapshot and reusing existing `BlobTreeId` values.
- [ ] Support attachment nodes by referencing existing `BlobId` values returned by the Sea blob upload API.
- [ ] Use `ISummaryContext` acknowledgement/proposal handles and reference sequence numbers to select the parent `SnapshotId`, map the included `EventPosition`, and conditionally publish the next Sea snapshot.
- [ ] Keep Fluid version and acknowledgement identities mapped to `SnapshotId`, not `BlobTreeId`, so equal content at different event positions remains distinguishable without duplication.
- [ ] Reconstruct `ISnapshotTree`, versions, blobs, and summaries from Sea snapshot and blob-tree APIs, including historical version lookup.
- [ ] Add Fluid-driver tests for nested trees, unchanged subtree reuse, tree and blob handles, attachments, initial summaries, conditional publication conflicts, historical versions, and reload from a snapshot followed by event catch-up.
- [ ] Add reconnect tests spanning snapshot publication and concurrent event submission to prove the gap-free load contract through the generated WASM and TypeScript layers.
- [ ] Remove FSP4 and transitional `sea-protocol`, `sea-client`, `sea-webtransport-browser`, and `sea-service-browser` packages only after their Rust, generated-WASM, Node, browser, Fluid-driver, and benchmark consumers have moved in the same checkpoint.
- [ ] Run TypeScript formatting, linting, type checking, Node tests, SharedTree browser builds, generated Node WASM tests, and the headless browser WebTransport harness.
- [ ] Update the root pnpm build graph, declarative WASM inputs/outputs, workspace registration, `.gitignore` rules, and `.github/workflows/rust-service.yml` to use final Sea packages, artifacts, and validation commands.

### 13. Examples, benchmarks, and final cleanup

- [ ] Update `sea-counter` to exercise the final local/session API and snapshot recovery.
- [ ] Update `sea-benchmarks` to measure the final package graph and distinguish event, blob, directory, snapshot, protocol, and transport costs.
- [ ] Retain benchmark coverage for local/injected Sea, Sea WebTransport with every storage mode, TypeScript local service, and Tinylicious where the comparison remains useful.
- [ ] Remove all transitional packages and dead compatibility code.
- [ ] Rewrite `WORKSTREAMS.md` as the final package graph.
- [ ] Update `README.md`, `DEVELOPMENT.md`, `KNOWN_ISSUES.md`, `BLOB_STORAGE.md`, and active package docs.
- [ ] Confirm historical records remain untouched.
- [ ] Run the final validation gate and record results in **Status**.

## Re-evaluation TODOs

These choices are intentionally provisional because changing them later is tractable. Resolve a TODO only with implementation or measurement evidence, and update this plan in the commit that resolves it.

- [ ] **Event root cardinality:** Re-evaluate `Option<BlobTreeId>` versus multiple roots after implementing event APIs and at least one nontrivial consumer. Default: one optional root.
- [ ] **Shared trait granularity:** Re-evaluate the exact narrow parent traits after both `SeaStorage` and `SeaSession` compile. Default: share value types and read concepts, not complete interfaces.
- [ ] **Direct session adapter:** Re-evaluate whether `SeaStorage` can naturally implement a single-user `SeaSession`. Default: attempt an adapter, but do not distort either contract to retain it.
- [ ] **BlobDirectory representation:** Re-evaluate flat named entries versus richer metadata or tree helpers after implementing recursive validation. Default: deterministic named entries referencing `BlobTreeId`.
- [ ] **Upload lifetime:** Re-evaluate explicit leases, bounded temporary pins, or application-managed unattached uploads before implementing garbage collection. Default: preserve unattached uploads indefinitely and add no lease machinery.
- [ ] **Garbage collection:** Re-evaluate collection policy after durable reference atomicity is proven. Default: preserve all uploaded content.
- [ ] **Event and snapshot retention:** Re-evaluate explicit retention only after gap-free load, historical lookup, and sequencer minimum-reference recovery pass conformance tests. Default: retain all events and snapshots.
- [ ] **Reference persistence layout:** Re-evaluate separate event/snapshot logs versus combined metadata per backend. Default: choose the simplest layout that proves atomicity and crash recovery.
- [ ] **Sequencer metadata layout:** Re-evaluate the private single-log envelope after `SeaSession` recovery works over every backend. Default: keep the envelope and allow gaps in exposed event positions; introduce a separate journal only if measurements or substitution requirements justify its transaction cost.
- [ ] **Backend features:** Re-evaluate Cargo features for omitting server backends after binary-size measurements. Default: compile all three server backends and select at runtime.
- [ ] **Configuration precedence:** Re-evaluate CLI and environment-variable precedence while building the server. Default: explicit CLI overrides environment, which overrides durable-file defaults.
- [ ] **Server library:** Re-evaluate exporting an embedding library when moving server tests. Default: export one only when it eliminates duplicated composition or lifecycle code.
- [ ] **Wire representation:** Re-evaluate the concrete codec using browser/native interoperability and benchmark evidence. Default: one bounded, versioned binary protocol owned by `sea-webtransport`.
- [ ] **Generated local client:** Re-evaluate whether local/injected browser sessions are generated from `sea-webtransport`, `sea-sequencer`, or a feature-selected composition after final dependency direction is visible. Default: preserve a local/injected `SeaSession` test mode without retaining a separate service-browser package.
- [ ] **Fluid position range:** Re-evaluate the adapter policy when `EventPosition` exceeds JavaScript's safe integer range. Default: reject connection or projection with a clear error rather than truncate; do not constrain Sea positions to JavaScript numbers.
- [ ] **Encrypted blob-tree visibility:** Re-evaluate encrypted directory names and topology only when a consumer requires that confidentiality. Default: keep directory names, child identities, and traversal metadata server-visible so the server can validate reachability; encrypt event payloads and blob leaf bytes.
- [ ] **Transformation identity:** Re-evaluate whether clients need a stable authenticated plaintext identity in addition to the server-visible content identity of transformed bytes. Default: server-visible IDs hash stored transformed bytes; any plaintext identity is encrypted and authenticated client metadata.
- [ ] **Stateful dictionary distribution:** Re-evaluate storing dictionaries as Sea content when dynamic distribution or rotation is required. Default: immutable out-of-band decorator configuration identified by a version or fingerprint.
- [ ] **Server-side transforms:** Re-evaluate separate `SeaStorage` compression or encryption only if storage measurements show value not achieved by session decorators. Default: session-only transforms.

## Validation Policy

Use focused package checks after each local edit. Before every semantic checkpoint commit, run the canonical workspace checks from [DEVELOPMENT.md](DEVELOPMENT.md):

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p sea-counter
node scripts/check-documentation.mjs
```

During early mechanical checkpoints, use the package name that exists at that checkpoint for the example command. Add native/browser WebTransport build and end-to-end server checks to `DEVELOPMENT.md` as their final packages become available.

Do not treat a passing build as sufficient evidence for storage atomicity, crash recovery, blob-tree reachability, protocol interoperability, or server lifecycle. Each semantic checkpoint must add focused tests for the contract it introduces.

## Completion Criteria

The migration is complete when:

- all retained packages use final Sea names and package-directory basenames match package names;
- the final package graph contains no transitional packages;
- current code and documentation contain no application-independent Fluid terminology;
- `sea-core` owns the event, blob-tree, snapshot, `SeaStorage`, and `SeaSession` contracts;
- all backends satisfy common atomic event/snapshot blob-reference laws;
- `sea-sequencer` exposes the multi-user `SeaSession` implementation;
- native and browser WebTransport clients implement `SeaSession`;
- generated web and Node WASM packages expose typed Sea APIs and pass their package-level harnesses;
- compression, encryption, and stateful compression are conforming `SeaSession` decorators that operate before WebTransport;
- `sea-webtransport-server` is the only process server and supports runtime backend selection;
- the minimal Fluid driver builds and passes Node and browser tests over both local/injected and WebTransport Sea sessions;
- Fluid summaries support recursive trees, blobs, attachments, subtree handles, conditional publication, historical lookup, and snapshot-plus-tail reload without flattening or re-uploading unchanged content;
- Unix transport and its example are deleted;
- the final canonical validation gate passes; and
- every remaining TODO above is resolved or moved to `KNOWN_ISSUES.md` with a concrete reason and trigger.
