# Sea API and WebTransport Cleanup Plan

## Status

- **Plan status:** In progress.
- **Execution mode:** Sequential, independently committable checkpoints.
- **Compatibility:** No compatibility is required for the current Rust API, generated TypeScript API, WebTransport wire format, or persisted experimental data.
- **Current checkpoint:** 6d. Snapshot coordination stream.
- **Last completed checkpoint:** 6c. Author stream.
- **Last validation:** Checkpoint 6c formatting, 23 paired client/server tests, strict native and WASM Clippy, generated WASM/Node behavior, TypeScript typecheck, idle author liveness across all storage backends, and the real Chromium 152 WebTransport flow passed on 2026-09-16.
- **Latest checkpoint notes:** `OpenAuthorStream` binds one ordered author stream to the opaque authority returned by the event stream. Native and browser clients use the same persistent submit, ambiguity-resolution, and close state machine; the optional stream API, per-submission fallback, `SEAS` marker, and extra length framing are removed. Healthy author streams remain open while idle beyond the operation timeout, and transport loss or EOF closes authoritative membership. The temporary postcard `OpenSession` and `Load` paths remain only for raw/local support until checkpoint 6f.
- **Plan commit:** `3fa80e6688ae3177945fb19c6f5c4e8b43a8c676` (`docs(rust-service): plan Sea API cleanup`).
- **Persistent-stream baseline commit:** `30940207bc7e10081a3d9f364c9033b601c2cf5b` (`Fix stream reuse`).
- **Next checkpoint:** 6d. Snapshot coordination stream.

Update this section in every implementation commit.
Record the completed checkpoint, validation performed, decisions or TODOs changed, and the next checkpoint.
Keep completed checklist entries in this file so it remains the execution record.

## Purpose

Replace the overlapping and ad hoc Sea APIs with one understandable architecture from storage through WebTransport and TypeScript.
The result should:

- have one current storage and session model rather than parallel API generations;
- use one centralized, explicit mechanism for identifying every network message;
- use long-lived WebTransport streams for every known network workflow;
- provide equivalent Sea behavior through native Rust and browser clients, with injected transports and process-local services retained only as explicit test support where useful;
- separate archive access, author lifecycle, snapshot coordination, and Fluid adaptation;
- remove forwarding wrappers and fallback paths that do not enforce useful invariants;
- expose useful generated TypeScript types and IntelliSense; and
- document what each crate, target, module, generated artifact, and client is for and how it is exercised.

The prospective flows in [notes4.md](notes4.md) are design context.
This plan is the executable cleanup sequence and should update that document when implementation decisions settle previously prospective behavior.

## Problems to Resolve

### Parallel Rust APIs

`sea-core` currently exposes both the older `EventStream`/`SnapshotStore` model and the newer `archive::SeaStorage`/`SeaSession` model.
`sea-sequencer` likewise contains the older sequencer and the newer archive-session implementation.
Storage crates, decorators, benchmarks, and conformance tests implement or consume both generations.
This doubles implementation, testing, terminology, and migration cost.

### Ad hoc protocol framing

The current transport combines:

- `SEA1` frame magic and a separate version byte;
- `SEAS` submission-stream magic;
- EOF-delimited request and response bodies;
- four-byte-length-delimited stream frames;
- implicit serializer-assigned enum case indexes;
- request IDs that are meaningful only on some paths; and
- string-valued message discriminators and durability values after WASM generation.

The protocol has no single catalog that establishes which message kinds exist, where they are valid, and how their bytes are encoded.
Adding a stream role or changing a marker length requires coordinated special cases.

### Redundant network paths

Most Sea operations use a fresh bidirectional QUIC stream for one request and response.
Submission now has an optional persistent browser stream plus an inefficient per-operation fallback.
The native client still uses a fresh stream for every submission and every other request.
Known consumers do not require these duplicate transport choices.

A Sea operation may still be logically request/response, but it should travel over an appropriate long-lived stream rather than creating a new WebTransport stream.

### Incomplete lifecycle semantics

The current persistent author stream applies the operation timeout while waiting for the next edit, so an idle but healthy client can be disconnected.
Closing a browser transport does not reliably close the authoritative `SeaSession`.
A disconnected author can therefore remain active and pin minimum-reference state.
Connection and stream errors are not consistently classified or surfaced.

### Confusing WASM target organization

`crates/sea-webtransport/examples/browser.rs` is a production `cdylib` build target, not a runnable example.
It path-imports protocol implementation code and delegates most behavior to a 1,500-line `examples/browser/sea.rs` file.
That file mixes:

- raw browser WebTransport I/O;
- injected JavaScript transport reflection;
- protocol encoding and decoding;
- generated result wrappers;
- a local in-process Sea service;
- local and remote client facades; and
- stream lifecycle state.

Neither the directory structure nor the documentation explains why this is an example, how to run it, or which generated artifacts consume it.

### Weak generated and TypeScript APIs

“Typed” has no stable meaning across the codebase.
Rust protocol values are decoded before crossing WASM, but generated TypeScript declarations still expose `string` discriminators, `Array<any>`, and objects whose fields are conditionally valid only at runtime.
`typedSeaClient.ts` hand-maintains a structural mirror of those generated declarations.

The Fluid package then layers:

1. generated Sea clients;
2. `TypedSeaClientAdapter`;
3. `WasmProtocolClient`;
4. `SerializedWasmProtocolClient`; and
5. `ProtocolClient`.

`ProtocolClient` mostly forwards calls, hides the wrapped members' documentation, and contains unrelated snapshot-operation identity generation.
`WasmProtocolClient` is a Fluid-specific projection despite its general name.
Global serialization compensates for unclear client reentrancy instead of letting each stream owner define its own ordering and concurrency.

### Stale and misleading surfaces

The cleanup must also address:

- duplicate generated-client construction in browser harnesses;
- adapter metrics and benchmark activity counters that are permanently zero, while useful server and implemented stream measurements must be retained;
- `stillUncertain` when no implementation produces it;
- `hasMore` when projected reads return one complete result;
- fake archive creation through a storage author session;
- snapshot operation IDs assembled by unframed byte concatenation;
- string durability and load-item kinds;
- broad decorators that forward the entire `SeaSession` trait; and
- documentation that describes fallback behavior or APIs which should no longer exist.

## Settled Decisions

### Compatibility and migration

- The protocol is experimental and may change incompatibly.
- Do not retain adapters, feature flags, aliases, or fallback paths solely for compatibility.
- Keep the repository buildable and tests meaningful at each checkpoint.
- Delete superseded code in the same checkpoint that moves its final consumers.
- Do not hand-edit generated JavaScript, WASM, declaration, or API-report artifacts.

### One current Sea model

- `SeaStorage` remains the trusted archive backend contract.
- The newer archive/session value types are the migration target.
- The older generic `EventStream`, `PositionCodec`, `SnapshotStore`, old sequencer, duplicate storage implementations, and duplicate conformance laws will be removed after their consumers migrate.
- Split broad interfaces where ownership differs instead of replacing one large trait with another large trait.

### Network message identification

- Define one central network `MessageKind` enum with `#[repr(u8)]`.
- Assign every network message kind an explicit numeric value.
- Do not depend on declaration order or a serializer's enum representation for the wire value.
- The shared frame codec writes and parses `MessageKind` explicitly.
- Unknown values are rejected as a classified protocol error.
- Every frame uses the same bounded length-delimited envelope.
- Stream roles are established by ordinary opening messages from the same `MessageKind` catalog, not magic byte strings.
- Protocol version negotiation remains explicit even though compatibility with the current experimental protocol is not required.
- Every logical-stream opening message carries the protocol version and is rejected before creating service state when the version is unsupported.
- Remove the `SEA1` and `SEAS` magic strings, EOF-delimited frames, and separate unary framing when the common codec is active.

A representative envelope is:

```text
u32 frame_length | u8 message_kind | u64 correlation_id | payload
```

`frame_length` counts all bytes following the length field.
Every frame contains a correlation ID: zero denotes an unsolicited stream notification, while nonzero values pair a request with its response or responses.
Correlation IDs are scoped to one logical stream and cannot be reused on that stream while the prior request remains active.
Opening messages use a nonzero correlation ID and carry the protocol version in their payload.
`max_frame_bytes` bounds the complete encoded frame, including the length field, and the decoder rejects an excessive declared length before allocating its payload buffer.
The exact integer widths may change during implementation only with measured or semantic justification recorded in this plan.

`#[repr(u8)]` alone does not define Serde or Postcard encoding.
The codec must convert the enum to and from its byte explicitly and test every assigned value.

### Separate encoding domains

`MessageKind` is only for the Sea network protocol.
Sequencer persistence records, encrypted payload envelopes, blob-directory encodings, and other durable formats are separate domains.
They must not reuse `MessageKind` values or depend on the network frame codec.
This plan does not require removing an existing durable format's domain marker or version header merely for consistency with the network protocol.
When a durable format needs a case discriminator, use a domain-specific explicitly encoded enum and retain whatever marker/versioning is needed for corruption detection and migration.

### Client and server crate boundary

- `sea-webtransport` owns the transport-independent wire message definitions, shared frame codec, one shared Sea client implementation, and thin native and WASM/browser transport bindings.
- Client connection state, logical-stream state machines, correlation, ordering, recovery, framing, and lifecycle behavior are implemented once under a single `client` module.
- Native and browser builds must not contain parallel implementations of the Sea client or its logical streams.
- Use `cfg` only where the platform API or required bounds genuinely differ, such as opening a WebTransport connection/stream, adapting native versus browser read/write primitives, native `Send`/`Sync` bounds, and exporting WASM-facing values.
- Prefer small target-specific transport primitives behind a shared internal interface over target-specific copies of client behavior.
- Every module compiled for the WASM client must remain free of native listener, server dispatch, storage backend, and sequencer dependencies.
- `sea-webtransport-server` remains a separate native-only crate.
- `sea-webtransport-server` owns endpoint binding, connection acceptance, server-side logical-stream dispatch, archive routing, connection-liveness policy, storage composition, TLS setup, shutdown, and the deployable binary.
- The server crate depends on `sea-webtransport` for the shared protocol and framing API; `sea-webtransport` must not depend on the server crate.
- Shared protocol code must remain WASM-compatible and must not acquire native-only dependencies merely because the server consumes it.
- Do not use Cargo features to compile server implementation into the client crate. The crate boundary, rather than conditional compilation, keeps client size and dependencies honest.
- The `wasm-bindgen` export adapter remains a normal `cfg(target_arch = "wasm32")` module in the `sea-webtransport` library target; do not create a separate WASM crate or production Cargo example.
- Existing native listener, stream acceptance, server dispatch, and service-host code currently located in `sea-webtransport` moves to `sea-webtransport-server`; this is an ownership correction, not a change to client-visible semantics.

In this plan, **WASM bindings** means both:

- the small Rust `wasm-bindgen` export adapter compiled from the `sea-webtransport` crate for `wasm32`; and
- the generated `.wasm`, JavaScript glue, and TypeScript declaration artifacts emitted by `wasm-bindgen` from that crate build.

The generated files may be copied into pnpm package output directories for consumption, but they are generated artifacts, not a separate Rust package.
When discussing Rust ownership, this plan uses **crate**; **package** is reserved for actual pnpm/TypeScript packages or unavoidable tool terminology.

### Long-lived WebTransport streams

All known network operations use long-lived streams.
No per-operation WebTransport stream or unary fallback remains.
The target connection has these logical streams:

1. **Event stream:** snapshot selection, finite catch-up, caught-up marker, and live events.
2. **Author stream:** ordered submissions, acknowledgements, and author reference advancement.
3. **Snapshot coordination stream:** latest accepted snapshot, publisher eligibility, nomination state, and snapshot publication.
4. **Content stream:** correlated blob, directory, and bounded historical-read operations.

A logical stream may be opened lazily when its first operation is needed.
Opening a logical stream still uses a WebTransport bidirectional stream, but subsequent operations reuse it.
The event stream establishes the archive-bound logical connection and returns the opaque session authority used to bind later author and snapshot streams.
Opening the event stream explicitly distinguishes creating an archive from opening an existing archive; content and author operations cannot implicitly create one.
The recovery snapshot delivered on the event stream is atomically paired with its catch-up boundary.
Snapshot-coordination notifications report newly accepted publications and nomination state, but do not replace that atomic recovery flow.

### Snapshot policy and nomination

- Snapshot-generation frequency and timing are client policy.
- The server never requests that a client create a snapshot.
- A client advertises whether it is able and willing to publish snapshots when opening its snapshot coordination stream.
- The Sea service maintains at most one eligible connected client as the current snapshot publisher.
- Nomination grants authority to publish; it does not instruct or schedule publication.
- The nominated client independently decides whether and when a snapshot is appropriate.
- Every client that needs snapshot state, including the Fluid driver, consumes the snapshot coordination stream.
- The stream reports the latest accepted snapshot and subsequent accepted snapshots with latest-value/coalescing semantics.
- Publication includes nomination fencing, expected parent, event boundary, stable publication operation identity, and blob-tree root.
- The Sea service accepts publication only from the current nominated session and only while its fencing authority remains valid.
- When the host determines that the nominee is unresponsive, it disconnects that session; the sequencer then nominates another eligible connected client according to its selection policy.
- `sea-sequencer` owns authoritative publisher eligibility, nomination, fencing, revocation, and selection semantics so local and network access use the same rules.
- `sea-webtransport-server` owns network connection-liveness detection and reports connection loss or eviction to that sequencer state; it does not independently choose or persist a nominee.
- Nomination liveness uses the same explicit session-liveness signals as author membership; it does not introduce a separate hidden timer model.
- Disconnect, replacement, timeout, and server restart must not allow an old nominee to publish.
- The sequencer may nominate another client after a publication without implying when another snapshot should be made.
- A process restart revokes all connection-scoped nominations; recovery does not treat a previously nominated but disconnected client as active.

### Lifecycle and errors

- Operation deadlines bound active reads and writes; they do not impose an idle lifetime on a healthy persistent stream.
- Session liveness, inactivity eviction, reconnect grace, and lag eviction are explicit policy with observable outcomes.
- Closing or losing a connection releases author membership and snapshot nomination according to that policy.
- Stable operation identities remain distinct from transport correlation IDs.
- Ambiguous submissions and snapshot publications remain explicitly resolvable.
- Classified error kinds and safe client-facing context survive Rust dispatch, wire encoding, WASM generation, and TypeScript adaptation; implementation-private error chains are not exposed across the service boundary.
- A malformed stream closes at least that stream; connection- or server-wide impact must be deliberate and tested.

### TypeScript terminology

- Remove “typed” from names unless it distinguishes a documented alternative.
- Generated bindings are called generated Sea bindings.
- The Fluid-facing adapter is a driver, not a generic client.
- Name it `SeaDriver` within a package or module whose Fluid context is already clear.
- Use `FluidSeaDriver` only for a standalone or cross-package exported symbol where `SeaDriver` would be ambiguous.
- Do not use `SeaFluidClient` or another name that obscures its Fluid driver responsibility.
- `SeaDriver` names the aggregate Fluid document-service implementation, not the lower generated-client adapter.
- Prefer generated enums, dedicated result classes, or discriminated unions over `string`, `any`, and invalid optional-field combinations.
- Do not manually mirror generated declarations when an imported generated type can express the contract.

## Target Architecture

```text
Fluid runtime                         Direct benchmark client
      |                                        |
SeaDriver                              generated bindings or
(Fluid service implementations)        shared Rust Sea client
      |                                        |
      +---------- generated Sea bindings ------+
                           |
                   shared Rust Sea client
                           |
                  MessageKind frame codec
                           |
                 WebTransport connection
                           |
             sea-webtransport-server dispatch
                           |
                    sea-sequencer service
                           |
                       SeaStorage
```

### Proposed Rust API boundaries

These are conceptual responsibility boundaries, not a requirement to create one public trait or wrapper for every bullet.
Introduce a type only when it owns state or establishes a useful substitution boundary.
The exact names may be refined during implementation, but responsibilities should be separated as follows:

- **`SeaArchive`:** archive-scoped content, historical reads, snapshot lookup, and explicit creation/opening behavior.
- **`SeaAuthorSession`:** author identity, ordered submit, ambiguity resolution, reference advancement, and close.
- **`SeaEventSubscription`:** gap-free snapshot/catch-up/live event delivery and cursor ownership.
- **`SeaSnapshotCoordinator`:** sequencer-owned eligibility, nomination, latest-value notifications, fenced publication, and close.
- **`SeaStorage`:** trusted atomic backend operations beneath sequencing and coordination.

Decorators should implement only the boundaries they transform.
For example, an event-payload compressor should not manually forward nomination or connection lifecycle methods.

### Proposed WebTransport module layout

Client and shared wire code remain in the size-sensitive, WASM-compatible `sea-webtransport` crate:

```text
crates/sea-webtransport/
  src/
    lib.rs
    protocol/
      mod.rs
      kind.rs
      frame.rs
      messages.rs
      error.rs
    client/
      mod.rs
      connection.rs
      event_stream.rs
      author_stream.rs
      snapshot_stream.rs
      content_stream.rs
    bindings/
      mod.rs
      wasm.rs
      values.rs
    transport/
      mod.rs
      native.rs
      browser.rs
```

`client/` is the client implementation.
`transport/mod.rs` defines the small internal transport interface consumed by `client/`.
`transport/native.rs` and `transport/browser.rs` contain only the target-specific WebTransport primitives required to implement it and are selected with narrow `cfg` declarations.
`bindings/wasm.rs` exposes the shared client to JavaScript; it must not reimplement client or logical-stream behavior.
Retain process-local support only for tests and benchmarks that exercise it, and place it in an explicitly named test-support module or Rust test-support crate rather than treating it as another network client implementation.

Native listener and server implementation remain in the separate server crate:

```text
crates/sea-webtransport-server/
  src/
    lib.rs
    main.rs
    endpoint.rs
    connection.rs
    dispatch/
      mod.rs
      event_stream.rs
      author_stream.rs
      snapshot_stream.rs
      content_stream.rs
    host.rs
    lifecycle.rs
```

The exact server module split may follow implementation pressure, but none of these responsibilities move into `sea-webtransport`.
Only shared wire values and the frame codec cross the crate boundary.
Author membership and snapshot nomination state machines belong in `sea-sequencer`; the server crate only connects transport lifecycle to them.

The WASM export adapter is a normal `cfg(target_arch = "wasm32")` module in the `sea-webtransport` library target.
It must not remain a Cargo example or become another Rust crate.
A runnable example, if retained, must have an executable purpose and documented command.

### Proposed TypeScript layering

```text
Fluid runtime
  |
SeaDriver
(document service, storage, delta, and lifecycle modules)
  |
generated Sea bindings
```

`SeaDriver` (or `FluidSeaDriver` where qualification is required) is the aggregate Fluid driver surface.
Its internal modules implement the Fluid document-service factory, document service, storage, delta storage, delta connection, and lifecycle behavior; these are parts of the driver rather than another layer below it.
The driver owns only Fluid-specific projection and policy:

- checked conversion between `EventPosition` and Fluid sequence numbers;
- Fluid pending-operation identity and explicit recovery policy;
- Fluid message serialization;
- Fluid summary/blob-tree mapping; and
- translation from generated Sea result types to Fluid interfaces.

It should not parse network frames or choose between transport strategies.

## Commit Sequence

Each numbered checkpoint is intended to be one commit unless its checklist explicitly identifies smaller commits.
Every commit updates **Status** and the completed checkboxes in this file.
Do not combine later cleanup into an earlier checkpoint merely because files overlap.

### 0. Plan-only commit

- [x] Review and approve this plan.
- [x] Run the documentation link checker.
- [x] Commit only `SEA_API_CLEANUP_PLAN.md`.
- [x] Record the plan commit hash in **Status** during checkpoint 1.

Validation:

```bash
cd rust-service
node scripts/check-documentation.mjs
```

### 1. Preserve the persistent-author-stream baseline

Commit `30940207bc7e10081a3d9f364c9033b601c2cf5b` contains the performance fix independently from the broader redesign.
It adds persistent submission only to the generated browser WebTransport path; the native Rust client and non-submission operations still open one stream per request.

- [x] Commit the existing long-lived author-stream fix and its current documentation separately from cleanup work.
- [x] Retain the measured browser direct-dummy baseline: 37.86 operations/s and 2,642.5 ms mean convergence before the fix, versus 2,295.24 operations/s and 44.27 ms after it for 100 measured operations and 10 warmup operations over three repetitions.
- [x] Record the exact benchmark command, environment, source state, convergence counts, and before/after stream behavior in adjacent benchmark documentation.
- [x] Confirm no generated or ignored benchmark artifacts are committed accidentally.
- [x] Treat its `SEA1`/`SEAS` markers and unary fallback as temporary implementation to be removed after the replacement codec and streams are active in checkpoint 6f.

Validation:

```bash
cd rust-service
cargo test -p sea-webtransport --all-targets --all-features
pnpm --dir tests/minimal-fluid-driver run test
```

Then run the complete certificate, server, and Chromium procedure documented in [tests/webtransport-browser/README.md](tests/webtransport-browser/README.md).

### 2. Capture current behavior and test infrastructure

Commit tests for behavior that exists before changing APIs or framing.
Tests for new message kinds, shared client internals, nomination, and liveness belong in the checkpoints that introduce those concepts; this checkpoint must not invent placeholder production APIs or commit expected failures.

- [x] Add reusable transport fixtures that can fragment, coalesce, delay, reset, and drop frames or acknowledgements.
- [x] Characterize current bounded frame decoding under fragmented and coalesced input.
- [x] Test current request-ID mismatch rejection and unexpected response-kind rejection.
- [x] Test stream cancellation during an in-flight read and write.
- [x] Test server survival after one malformed stream and one disconnected client.
- [x] Test existing stable-identity resolution after event and snapshot acknowledgement loss.
- [x] Define a reusable observable-behavior suite for archive open, load, submit, content, snapshots, close, and recovery without requiring the future shared client implementation.
- [x] Run that suite against every currently applicable native, browser, injected, and process-local path and record intentional capability differences.

Validation:

```bash
cargo test --workspace --all-targets --all-features
pnpm --dir tests/minimal-fluid-driver run test
```

### 3. Complete the current Sea core migration

This checkpoint may be split into the following ordered commits while keeping both API generations compiling until the final deletion:

#### 3a. Migrate conformance and benchmarks

- [x] Inventory every legacy `sea-conformance` law and map it to `SeaStorage`, current `SeaSession`, a later checkpoint, or an explicit deletion rationale.
- [x] Port laws that remain meaningful to `SeaStorage` and the current `SeaSession` API without anticipating the boundary split in checkpoint 4; do not mechanically translate laws whose old value model no longer exists.
- [x] Split `sea-benchmarks` so storage-backend measurements exercise `SeaStorage`, while compression, encryption, and stateful-compression measurements exercise their surviving `SeaSession` decorators over a common sequenced session.
- [x] Preserve workload inputs where meaningful, but label the measured layer and do not compare old raw-stream decorator timings directly with new sequenced-session decorator timings.
- [x] Version or replace retained result fields whose measurement boundary changes, and document why old and new results are not equivalent.

#### 3b. Migrate storage and decorators

- [x] Remove old-trait implementations from memory, buffered-file, and durable-file storage after their consumers move.
- [x] Retain one position type and one canonical position codec.
- [x] Remove legacy `EventStream`/`SnapshotStore` implementations from compression, encryption, and stateful compression after benchmark and conformance consumers move.
- [x] Keep their current `SeaSession` implementations working until checkpoint 4 introduces narrower boundaries.

#### 3c. Delete the legacy generation

- [x] Delete `EventStream`, `PositionCodec`, `SnapshotStore`, old snapshot values, and old capabilities that have current equivalents.
- [x] Delete the old sequencer implementation and its private frame format.
- [x] Delete duplicate conformance laws and tests.
- [x] Remove stale migration TODOs and update crate READMEs.
- [x] Verify no active code imports the deleted generation.

Validation after each subcommit:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets --all-features
cargo run -p sea-benchmarks -- smoke
```

### 4. Split archive, author, event, and snapshot responsibilities

This checkpoint may be split into the following ordered commits.

#### 4a. Restore the server crate boundary

- [x] Move `WebTransportServer`, endpoint acceptance, native server connection handling, `SeaServiceHost`, and server-side dispatch from `sea-webtransport` to `sea-webtransport-server`.
- [x] Keep only shared protocol/frame values and client implementation in `sea-webtransport`.
- [x] Remove the crate-level `cfg(not(target_arch = "wasm32"))` structure that currently forces the browser artifact to path-import protocol source.
- [x] Preserve server behavior and the one-way dependency from `sea-webtransport-server` to `sea-webtransport`.
- [x] Verify the WASM build cannot reach server, storage-backend, or sequencer code.

#### 4b. Split service responsibilities

- [x] Introduce narrow archive, author-session, event-subscription, and snapshot-coordination contracts.
- [x] Move content and historical reads out of the author-session contract.
- [x] Move snapshot lookup out of the author-session contract.
- [x] Preserve stable submission and snapshot-publication identities.
- [x] Replace fake archive creation through a `storage` author with an explicit archive operation.
- [x] Distinguish explicit archive creation from opening an existing archive so a load cannot silently create missing state; settle exact retry/conflict results in conformance tests before implementation.
- [x] Define teardown ownership for every session and subscription.
- [x] Ensure event-payload decorators only wrap event/content payload operations they actually transform.
- [x] Update all local Rust implementations and conformance tests.

Validation:

```bash
cargo test -p sea-core -p sea-sequencer -p sea-conformance
cargo test -p sea-webtransport -p sea-webtransport-server --all-targets --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

### 5. Introduce the centralized network message codec

Commit the codec and message definitions before switching transports.

- [x] Define `MessageKind` with `#[repr(u8)]` and explicit assigned values.
- [x] Add fallible `u8` conversion that rejects unknown values.
- [x] Define payload structures separately from the kind byte.
- [x] Implement one bounded length-delimited frame encoder and incremental decoder.
- [x] Define a protocol-version value carried by every logical-stream opening message and reject unsupported versions before creating service state.
- [x] Include a correlation ID in every frame, reserve zero for unsolicited notifications, and reject invalid or mismatched correlation IDs.
- [x] Define which message kinds are valid on each logical stream.
- [x] Return a classified protocol error for a message on the wrong stream.
- [x] Replace string durability with a generated enum or explicit numeric wire enum.
- [x] Replace load-item string kinds with explicit generated case types.
- [x] Add exhaustive codec, fragmentation, coalescing, limit, and wrong-stream tests.
- [x] Test every assigned message-kind byte and rejection of every unassigned byte.
- [x] Remove implicit serializer-assigned request/response case indexes from the outer wire envelope.
- [x] Keep the codec and message definitions WASM-compatible and free of server/storage dependencies.
- [x] Consume the same public codec from `sea-webtransport-server` without moving server dispatch into `sea-webtransport`.

Do not remove old framing in the first codec commit if doing so would make the repository unbuildable.
Remove it in checkpoint 6f immediately after all transports switch.

Validation:

```bash
cargo test -p sea-webtransport --all-targets --all-features
```

Add a frame-decoder fuzz target only if this repository has an established fuzz harness by this checkpoint.
Otherwise record the omission in **Status** rather than listing a nonexistent command as validation.

### 6. Move every network workflow to persistent streams

This checkpoint may be split by stream while retaining one common codec.
Do not retain the old per-operation implementation after its final consumer moves.

#### 6a. Establish the shared client

- [x] Move connection state, frame correlation, logical-stream ownership, recovery, and close behavior into one platform-independent `client` module.
- [x] Define the narrow internal transport interface used by that client.
- [x] Implement only connection and bidirectional-stream primitives in the native and browser transport modules.
- [x] Make native Rust and WASM exports delegate to the same client state machines.
- [x] Run the reusable observable-behavior suite through both transport implementations.

#### 6b. Event stream

- [x] Open with an `OpenEventStream` message carrying archive, resume position, and loading hints.
- [x] Make archive create versus open-existing intent explicit and return the opaque session authority that binds later logical streams.
- [x] Preserve atomic snapshot selection, finite catch-up, caught-up marker, and live continuation.
- [x] Implement event-stream behavior once in the shared client and exercise it through native and browser transport primitives and the separate server crate.

#### 6c. Author stream

- [x] Open with an `OpenAuthorStream` message bound to the session authority returned by the event stream.
- [x] Carry ordered submissions and ordered receipts on one stream.
- [x] Preserve ambiguity resolution and stable operation identity.
- [x] Remove the optional stream API and per-submission fallback.
- [x] Make native and browser transports use the same shared author-stream implementation.

#### 6d. Snapshot coordination stream

- [ ] Open with an `OpenSnapshotStream` message bound to the event-stream session authority and carrying publisher eligibility and willingness.
- [ ] Deliver the latest accepted snapshot on open and coalesced accepted-snapshot updates afterward.
- [ ] Deliver nomination and revocation state without requesting snapshot creation.
- [ ] Accept fenced publication from only the current nominee.
- [ ] Implement eligibility, nomination, fencing, revocation, and deterministic replacement in `sea-sequencer`; connect network lifecycle signals from `sea-webtransport-server` without duplicating selection policy there.
- [ ] Revoke and reassign nomination when connection lifecycle reports that the nominee is gone.
- [ ] Test latest-value notification, non-nominee rejection, stale-fence rejection, deterministic failover, and the absence of any server snapshot-generation request message.
- [ ] Expose nomination and accepted-snapshot state through the shared Rust client and generated bindings; Fluid integration remains checkpoint 11.

#### 6e. Content stream

- [ ] Open one reusable content stream lazily and bind it to the session authority returned by the event stream.
- [ ] Correlate bounded history, blob, directory, and snapshot lookup operations by request ID.
- [ ] Define bounded response completion explicitly.
- [ ] Preserve backpressure and permit safe concurrency where useful.

#### 6f. Remove old transport paths

- [ ] Delete per-operation `open_bi()` request code.
- [ ] Delete EOF-delimited frame readers and writers.
- [ ] Delete `SEA1` and `SEAS` markers.
- [ ] Delete unary terminology, APIs, fallback tests, and documentation.
- [ ] Ensure no known client can accidentally select an inefficient path.

Validation after each stream subcommit:

```bash
cargo test -p sea-webtransport -p sea-webtransport-server --all-targets --all-features
node tests/wasm-client/node-test.mjs
# Run the documented real Chromium WebTransport harness.
```

### 7. Implement explicit liveness and cleanup

- [ ] Separate active I/O deadlines from idle stream lifetime.
- [ ] Define session liveness, heartbeat, inactivity, lag, and reconnect-grace policy.
- [ ] Implement liveness policy in `sea-webtransport-server` and make it observable and configurable at that server boundary.
- [ ] Disconnect an unresponsive nominated snapshot publisher before selecting another.
- [ ] Ensure connection loss, explicit close, replacement, and server shutdown release author membership.
- [ ] Ensure the same paths revoke snapshot nomination.
- [ ] Define heartbeat messages and responsiveness rules without introducing a snapshot-generation request.
- [ ] Test an otherwise healthy persistent stream remains open while idle for longer than an active-operation deadline.
- [ ] Persist only lifecycle state needed for authoritative recovery; never restore a pre-restart connection or nomination as active.
- [ ] On restart, revoke all connection-scoped nomination authority before selecting from newly connected eligible clients.
- [ ] Ensure stale author and snapshot fencing tokens cannot commit after reconnect or replacement.
- [ ] Preserve classified errors and safe client-facing context through server dispatch and clients without exposing private server error chains.
- [ ] Test graceful close, reset, timeout, restart, and concurrent close.

Validation:

```bash
cargo test -p sea-sequencer -p sea-webtransport -p sea-webtransport-server --all-targets --all-features
```

### 8. Promote and reorganize the WASM bindings

This should be primarily ownership and file movement after the transport contract is stable.

- [ ] Move `wasm-bindgen` exports into a normal `cfg(target_arch = "wasm32")` module of the `sea-webtransport` library target.
- [ ] Build that same library source as a `cdylib` for `wasm32` without creating a second Rust crate or retaining a Cargo example as production code.
- [ ] Move WASM generation orchestration out of `tests/minimal-fluid-driver/scripts/build-wasm.mjs` to a script owned by the `sea-webtransport` crate or Rust workspace; downstream pnpm tasks may invoke it but do not own Sea artifact generation.
- [ ] Remove path imports of production source files.
- [ ] Verify the generated WASM dependency graph contains no `sea-webtransport-server`, storage backend, native endpoint, or server lifecycle code.
- [ ] Preserve the shared client established in checkpoint 6a while reorganizing bindings; do not move or duplicate its behavior here.
- [ ] Reduce browser-specific code to WebTransport read/write primitives and JavaScript/WASM value adaptation.
- [ ] Ensure WASM bindings delegate to the same client connection, event, author, snapshot, and content state machines used by native Rust.
- [ ] Do not create separate native and WASM logical-stream module trees.
- [ ] Move any process-local service used only by tests into explicit test support rather than the production browser binding surface.
- [ ] Keep protocol framing inside the shared Rust protocol/client implementation so generated TypeScript consumers never construct or parse frames.
- [ ] Generate one canonical web output and one canonical Node output from the same crate target, with documented stable locations and names; downstream harnesses consume those outputs rather than generating private duplicate copies.
- [ ] Update the declarative Fluid build task to track the new target and outputs.
- [ ] Add a crate or module README explaining purpose, consumers, build command, generated files, and why it is not a runnable example.
- [ ] Retain a Cargo example only if it has a `main` function and a documented user-facing scenario.

Validation:

```bash
pnpm --dir tests/minimal-fluid-driver run build:wasm
node tests/wasm-client/node-test.mjs
pnpm --dir tests/minimal-fluid-driver run typecheck
```

### 9. Make generated TypeScript APIs genuinely useful

- [ ] Generate or hand-declare closed Sea API discriminators such as durability and load-result kind; do not expose the internal network `MessageKind` catalog to TypeScript consumers.
- [ ] Replace `kind: string` plus conditionally valid optional fields with case-specific classes or discriminated unions.
- [ ] Replace `Array<any>` directory APIs with generated entry types.
- [ ] Preserve structured service error kind and diagnostic information in JavaScript errors or result types.
- [ ] Eliminate the handwritten `GeneratedSeaClient` mirror where generated declarations can be imported directly.
- [ ] Add declaration-shape tests or TypeScript compile fixtures for narrowing and IntelliSense-relevant contracts.
- [ ] Remove “typed” terminology or define any remaining use precisely.

Validation:

```bash
pnpm --dir tests/minimal-fluid-driver run build:wasm
pnpm --dir tests/minimal-fluid-driver run typecheck
pnpm --dir tests/minimal-fluid-driver run typecheck:shared-tree
node tests/wasm-client/node-test.mjs
```

### 10. Simplify the Fluid TypeScript adapter

This checkpoint may be split into small deletion-oriented commits.

#### 10a. Remove forwarding wrappers

- [ ] Delete `ProtocolClient` and its export.
- [ ] Move canonical snapshot-operation identity generation to the Fluid summary owner.
- [ ] Encode operation identity fields canonically with explicit lengths or a structured hash domain.
- [ ] Include every identity component required by the publication scope.
- [ ] Call the documented underlying client API directly where no adaptation is required.

#### 10b. Replace the client abstraction

- [ ] Remove `WasmProtocolClient` if generated network clients and explicit process-local test support can be consumed directly.
- [ ] Otherwise retain one unexported narrow driver-client interface only when it demonstrably avoids duplicating the `SeaDriver`; name and document it for that role rather than for WASM.
- [ ] Make `SeaDriver` the aggregate Fluid-facing implementation/factory composed from the current document service, storage, delta storage, delta connection, and lifecycle responsibilities; use `FluidSeaDriver` only where an exported context would otherwise be ambiguous.
- [ ] Remove `TypedSeaClientAdapter` if improved generated bindings satisfy the narrow internal contract directly; otherwise keep one unexported adapter named for generated Sea binding conversion, never `SeaDriver`.
- [ ] Remove archive, writer, and session parameters from methods already bound to those values.
- [ ] Remove `stillUncertain` unless a concrete implementation and recovery rule requires it.
- [ ] Remove `hasMore` if reads remain one bounded complete result.
- [ ] Remove or implement adapter metrics and benchmark activity counters proven to report permanent zero values; retain server measurements and counters backed by real observations.

#### 10c. Put concurrency in stream owners

- [ ] Remove `SerializedWasmProtocolClient` after generated stream clients enforce their documented concurrency contracts.
- [ ] Keep author submissions ordered by the author stream.
- [ ] Permit independent event, snapshot, and content streams to progress concurrently.
- [ ] Add tests for concurrent storage, subscription, and submission work.

#### 10d. Reduce duplication

- [ ] Centralize generated remote and local client construction.
- [ ] Share construction between trace, benchmark, and browser harnesses.
- [ ] Split `fluidDriver.ts` into storage, delta connection, document service, lifecycle, and shared helpers when each extraction has a clear owner.
- [ ] Keep direct benchmark clients separate from the Fluid driver but make them consume the same Sea client contract.

Validation after each subcommit:

```bash
pnpm --dir tests/minimal-fluid-driver run check:format
pnpm --dir tests/minimal-fluid-driver run lint
pnpm --dir tests/minimal-fluid-driver run typecheck
pnpm --dir tests/minimal-fluid-driver run typecheck:shared-tree
pnpm --dir tests/minimal-fluid-driver run test
```

### 11. Integrate snapshot coordination with Fluid

Fluid already has `SummarizerClientElection`, an elected interactive parent, and a separate summarizer client.
The standard driver interfaces do not expose a switch that can replace that election dynamically.
Do not add a second competing election or assume the driver alone can control runtime summarizer eligibility.

#### 11a. Choose and record the Fluid integration model

- [ ] Decide whether Sea nominates the interactive parent responsible for launching a Fluid summarizer or the actual session that uploads snapshots.
- [ ] Trace delegation and fencing if a nominated parent launches a separate summarizer client.
- [ ] Select one authoritative election model: either adapt Fluid's existing election to consume Sea nomination or replace it for this driver; never run both independently.
- [ ] Identify the smallest internal Fluid runtime integration seam and record why existing `IDocumentService` and `IDocumentDeltaConnection` surfaces are or are not sufficient.
- [ ] Record the decision and its API impact before implementation.

#### 11b. Implement the selected model

- [ ] Advertise snapshot capability and willingness for the selected Fluid session role.
- [ ] Consume latest and newly accepted snapshot notifications through `SeaDriver`.
- [ ] Feed Sea nomination into the selected Fluid runtime election seam without treating nomination as a request to summarize.
- [ ] Let Fluid's existing client-side summary heuristics decide when to generate a summary.
- [ ] Publish through the fenced snapshot coordination stream only under current or explicitly delegated nomination authority.
- [ ] Stop publication promptly on nomination loss or disconnect.
- [ ] Recover or resolve an ambiguous publication without accepting stale authority.
- [ ] Test nomination transfer between two Fluid-capable clients.
- [ ] Test an unresponsive nominee is disconnected and replaced.
- [ ] Test a non-nominated client cannot publish.
- [ ] Test snapshot cadence changes when client policy changes without a server protocol change.

Validation:

```bash
pnpm --dir tests/minimal-fluid-driver run test
pnpm --dir tests/minimal-fluid-driver run build:shared-tree
# Run the documented SharedTree Chromium workflow with summaries enabled.
```

### 12. Documentation and terminology completion

- [ ] Rewrite the `sea-webtransport` README around architecture, stream roles, framing, lifecycle, and targets.
- [ ] Document the single shared Sea client first, then document native and browser transport bindings and any local test support as thin environment-specific adapters.
- [ ] Add exact build and execution commands for every runnable artifact.
- [ ] Update [notes4.md](notes4.md) from prospective language where behavior is now settled.
- [ ] Document snapshot nomination as authority selection, never server-directed snapshot scheduling.
- [ ] Define every remaining use of “session,” “stream,” “client,” and “protocol.”
- [ ] Remove remaining “typed” and “unary” wording unless it names a real, documented distinction.
- [ ] Update the minimal Fluid driver README with its reduced layering and snapshot-coordination responsibilities.
- [ ] Update [DEVELOPMENT.md](DEVELOPMENT.md), [README.md](README.md), and [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
- [ ] Verify every local Markdown link and every documented command.

Validation:

```bash
node scripts/check-documentation.mjs
rg -n -i '\btyped\b|\bunary\b|SEA1|SEAS' crates tests README.md DEVELOPMENT.md notes4.md
```

Every remaining search hit must be intentional and explained.

### 13. Performance and final validation

- [ ] Run equivalent before/after WebTransport benchmarks for memory, buffered-file, and durable-file modes.
- [ ] Cover direct dummy, direct SharedTree, and Fluid-integrated SharedTree paths.
- [ ] Verify event, author, snapshot, and content streams are reused rather than opened per operation.
- [ ] Record stream counts, wire bytes, CPU, RSS, convergence, and throughput from implemented counters.
- [ ] Verify snapshot coordination does not alter client-selected snapshot cadence.
- [ ] Verify no owned service or browser process remains after each harness.
- [ ] Update this plan's **Status** with final evidence and remaining deferred work.

Canonical validation from `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p sea-counter
node scripts/check-documentation.mjs
pnpm --dir tests/minimal-fluid-driver run build:wasm
node tests/wasm-client/node-test.mjs
pnpm --dir tests/minimal-fluid-driver run check:format
pnpm --dir tests/minimal-fluid-driver run lint
pnpm --dir tests/minimal-fluid-driver run typecheck
pnpm --dir tests/minimal-fluid-driver run typecheck:shared-tree
pnpm --dir tests/minimal-fluid-driver run build:esm
pnpm --dir tests/minimal-fluid-driver run test:node
pnpm --dir tests/minimal-fluid-driver run build:shared-tree
pnpm --dir tests/minimal-fluid-driver run build:benchmarks
```

From the repository root:

```bash
pnpm policy-check --path rust-service
pnpm build:fast
```

## Required Evidence

The work is complete only when the repository contains durable evidence for:

- one surviving Sea storage/session API generation;
- explicit and exhaustive network message-kind encoding;
- one common frame codec used by the shared native/browser client implementation and the server implementation;
- no per-operation WebTransport stream path;
- idle persistent stream survival;
- author and snapshot-nomination cleanup after disconnect;
- stale nominee fencing after failover and restart;
- client-selected snapshot cadence with no server snapshot request;
- generated TypeScript APIs with closed discriminators and typed entries wherever Sea exposes a finite set of cases, without exposing internal network frames or `MessageKind`;
- removal of `ProtocolClient` and unnecessary global client serialization;
- real Chromium WebTransport coverage;
- generated Node binding coverage;
- full Rust workspace conformance; and
- benchmark evidence showing that cleanup preserves the persistent-stream performance improvement.

## Deferred Decisions

Resolve these only when the named checkpoint supplies evidence:

- Exact `MessageKind` numeric assignments: checkpoint 5.
- Whether the content stream permits multiple concurrent responses: checkpoint 6e.
- Exact heartbeat, inactivity, reconnect-grace, and lag thresholds: checkpoint 7.
- Exact generated TypeScript representation for Sea result cases: checkpoint 9 chooses between `wasm-bindgen`-exported case classes/enums and a generated custom TypeScript discriminated union; either choice must support exhaustive narrowing and make invalid field combinations unrepresentable.
- Whether a separate Fluid driver interface remains after wrapper removal: checkpoint 10b.
- Snapshot nominee selection policy among equally eligible clients: checkpoint 6d.
- Whether Sea nominates a Fluid parent client or the actual publishing summarizer session, and the runtime seam used to enforce that authority: checkpoint 11a.

Do not defer the ownership or semantic requirements stated in **Settled Decisions**.
