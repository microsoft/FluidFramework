# Async blob transfer plan

## Status and execution location

This is an implementation proposal, not a description of completed functionality.
Implement in the main worktree, `/workspaces/FluidFramework`, on branch `rust-service`.
The original proposal inspected `5c6d41ce89e349279e2968b6bc9a597d93715c78`.
The design was subsequently checked against `8e3db392ba4`, including bulk snapshot reads, byte-based opening credits, and direct SharedTree blob handles.
These are inspection references, not a substitute for freezing the implementation's actual baseline.
Recheck HEAD and local changes before implementation, and preserve unrelated work.
This plan does not authorize commits or pushes.

## Goal

Serve immutable, file-backed blobs without reading the entire blob into application memory, rehashing its contents on ordinary reads, or constructing payload-sized serialization and framing buffers.
Write the existing framing prefixes, then transfer the known-length body with Tokio asynchronous I/O.
Use `tokio::io::copy` for reader-backed bodies and direct writes for bodies already held in `Bytes`.
Use `copy_buf` only when the source is already buffered and this avoids a redundant buffer.

Do not implement syscall selection, a `sendfile` capability framework, a blocking bridge to `std::io::copy`, or speculative support for future transport offload.
The current WebTransport path needs QUIC encryption, packetization, and retransmission.
Optimize the path we actually use, rather than preserving synchronous endpoint types for an unavailable optimization.

## Scope and intentional limits

- Include both `sea-file` modes, the standalone `sea-content-addressed` backend, memory-backed content, session forwarding, server dispatch, native WebTransport sending, and the existing WebSocket sending adapter.
- Carry blob bodies through both `GetBlobTrees` demand responses and opening-prefetch content.
  Optimizing a separate single-blob API while leaving bulk or opening delivery materialized does not satisfy this plan.
- Preserve existing blob bytes, network protocol version, frame limits, storage formats, directory behavior, admission rules, publication ordering, and durability distinctions.
- Keep existing byte-returning APIs usable for callers that need materialized content.
- Preserve WASM/browser builds and existing TypeScript-facing API shapes.
- Do not stream uploads, redesign the receiving frame decoder, change encryption/compression formats, or make directory/event/snapshot transfers streaming in this change.
- Compression and encryption wrappers may continue to return materialized transformed bodies.
  In particular, do not release decrypted plaintext before authentication succeeds.
- A remote session used as an upstream source may initially materialize its response through the existing client decoder.
  Multi-hop behavior must remain correct, but bounded-memory forwarding across every network hop is not a completion claim for this plan.
- Do not add an integrity-check configuration mode or debug-only full-body hashing.
  Optional outbound content-hash validation is intentionally omitted, not relocated elsewhere on the server.
  Document where a client or explicit validating session adapter could add it later; do not implement that adapter now.

## Findings that determine the design

1. [BlobStore](crates/sea-core/src/storage/blob_store.rs) currently returns `Bytes` and promises verification.
   [SeaArchive](crates/sea-core/src/session.rs) exposes `get_blob_trees`, whose `BlobTreeItem::Blob` holds materialized `Bytes`.
   [SeaArchiveExt::get_blob](crates/sea-core/src/blob_tree.rs) is a convenience operation over that stream, not the session primitive.
   A server-only encoder change cannot remove storage materialization.
2. The [content dispatcher](crates/sea-webtransport-server/src/protocol/dispatch.rs) converts fetched `Bytes` into `Response::BlobTree { id, payload: Vec<u8> }`.
   The same content representation serves bulk demand reads and opening prefetch.
   [Protocol encoding](crates/sea-webtransport/src/protocol.rs) then clones the vector, serializes an owned payload, and copies that payload into a framed vector.
3. The standalone [content-addressed backend](crates/sea-content-addressed/src/lib.rs) stores raw blob bytes and rehashes them when fetched.
   Its publication path synchronizes staging contents before publishing a hard link and synchronizing the directory.
4. [Sea-file content](crates/sea-file/src/storage.rs) is not a raw blob file.
   Its current persisted layout is a 32-byte atomic-value checksum, a one-byte content record tag, then the blob bytes.
   Reads currently verify both the [atomic-value checksum](crates/sea-file/src/atomic_file.rs) and the typed content identity.
   A file-backed body must expose only the payload region, without a format migration.
5. Buffered file storage can serve admitted content from a pending in-memory overlay before its file exists.
   Streaming must preserve that visibility and the unpublished-content exclusion.
6. The server's [send abstraction](crates/sea-webtransport-server/src/stream.rs) exposes asynchronous `write_all`, not Tokio `AsyncWrite`.
   The [WebSocket adapter](crates/sea-webtransport-server/src/websocket_io.rs) additionally builds bounded Sea records and WebSocket messages.
   Integrating `copy` requires deliberate treatment of this boundary, not an assumption that the existing abstraction implements `AsyncWrite`.
7. [Sea-core's manifest](crates/sea-core/Cargo.toml) does not currently depend on Tokio.
   Choosing the reader trait and its native/WASM bounds is a real dependency/API decision.
8. The [sequencer's blob-tree traversal](crates/sea-sequencer/src/blob_tree.rs) materializes each blob and independently recomputes its identity after the backend read.
   Backend-only changes therefore leave both materialization and hashing on the download path.
   Traversal also owns root ordering, deduplication, descendant selection, and response-byte accounting.
9. [Opening delivery](crates/sea-webtransport-server/src/server.rs) uses separate event/content byte credits and a bounded lookahead item.
   It currently calls the buffered encoder when validating an opening content frame.
   Replacing dispatch alone would leave this validation allocation in place.

## Proposed contracts

### Trusted immutable file contents

Ordinary file-backed blob reads trust published payload bytes instead of comparing them to their content hash.
This is an agreed integrity-policy change, independent of the streaming mechanism.
Work that can be performed equally well by client or server should preferably run on the client, especially optional validation.
Remove ordinary outbound blob hashing from both the file backend and sequencer traversal rather than moving it to another server layer.
Atomic publication protects against exposing unfinished writes; it does not prove immunity to media corruption, external modification, or application defects.
Published files must not be modified in place by supported operations.

Retain:

- Hashing required to determine a blob's identity when publishing new content.
- Publication barriers, existing collision/publication checks, and backend failure poisoning.
- Missing-file and I/O errors, existing storage-size limits, record/header shape checks, and configured network limits.
- Directory decoding, directory identity/closure checks, journal checksums, checkpoint checksums, and recovery validation.
- Authenticated decryption before releasing plaintext; authentication is not optional content-address validation.

For persisted `sea-file` blobs, skip both full-body read-time hashes: the atomic-value checksum and the blob identity recomputation.
Keep the existing on-disk checksum bytes and write behavior.
Do not weaken the shared atomic-file reader used by other record types; add a narrow blob-opening path.
For byte-returning blob APIs, collect through the same trusted-read path so integrity semantics do not depend on which API a caller chooses.

Document the intentional change: same-length payload corruption can be returned successfully.
Without an independent trusted payload length, some pre-existing truncations can also be indistinguishable from a shorter published body.
Transfer-length checks detect a short read relative to the opened file's advertised extent, not every historical corruption.
Clients may verify content where their API supplies the corresponding stored-content identity; do not require a new client verification policy here.
A future verifier must see the representation identified by that hash.
For compressed or encrypted content, the stored identity need not identify the decoded application bytes.
Place verification before transformation, or use a separately defined identity for the transformed representation.
Transport encryption does not detect corruption already present in stored bytes.

### Owned, known-length blob body

Introduce the smallest common representation needed for:

- Immutable in-memory `Bytes`, without copying their contents.
- An owned asynchronous reader with a declared `u64` body length.

An opened body owns all resources necessary for its supported read lifetime.
It must not borrow a storage mutex, mutable shared file cursor, or transient request-local buffer.
Cancellation stops further admission and releases ownership once any required frame completion and already-dispatched filesystem work settle.
It must not close independent sessions or document openings.
Opening content and live events share a physical stream, so failure after a content frame starts can affect both logical channels as specified below.
Document whether session closure terminates an active body and preserve the existing session/transport lifecycle policy.
Do not accidentally use the new path to bypass authorization or admission decorators.

At the storage boundary, retain `BlobStore::get_blob` and add a body-opening operation with a compatibility implementation that materializes through `get_blob`.
At the session boundary, carry known-length blob bodies through the content traversal used by both `get_blob_trees` and `SessionLoad::content`.
Resolve the exact compatible stream API at the first checkpoint; do not add a single-item shortcut that bypasses traversal or admission.
Override the storage operation in file backends and propagate bodies through every transparent forwarding layer on the direct file-to-server path.
File-backed `get_blob` can collect from the overridden body operation; ensure defaults cannot recurse.
Preserve materialized content streams and convenience reads for callers that require them.
Memory implementations should return their existing `Bytes` directly.
Transforming wrappers must explicitly return their transformed content, using a materializing fallback where necessary, not forward raw underlying storage bytes.

At the first implementation checkpoint, resolve reader trait ownership:

- Prefer Tokio `AsyncRead` if an `io-util`-only dependency is acceptable in sea-core and compiles for supported WASM targets.
- Keep filesystem/runtime features in native backends; do not pull `tokio::fs` into browser builds.
- Preserve the existing native `Send` versus browser-local ownership distinction.
- Resolve filesystem-worker admission for body reads, not only file opening, and logical versus physical cancellation before accepting the body API.
- If this requires compatibility adapters or extra trait layers throughout the system, stop and compare a smaller alternative before committing to that design.

Use an open file and metadata from that same handle.
Each transfer needs an independent cursor; do not assume cloning a file handle creates an independent seek offset.
For `sea-file`, validate the fixed header/tag and expose the payload after the existing 33-byte prefix.
Capture pending-overlay `Bytes` or open the published file under the existing visibility rules, then release locks before awaiting or transferring.
Retain the necessary backend/lease ownership, and account for Tokio file I/O that may outlive cancellation while a blocking operation completes.

### Filesystem-worker admission

Preserve the [shared filesystem-worker contract](crates/sea-file/src/common.rs) across opening, metadata inspection, and body reads.
Every bounded blocking filesystem operation must acquire capacity from the existing factory-wide budget.
Already-dispatched work retains its permit and required resources until the actual blocking operation finishes, even if its awaiting future is cancelled.
Cancellation while waiting for admission must not dispatch the cancelled operation.

Do not hold a worker permit for the lifetime of a body or merely while waiting for network capacity or opening credit.
Release it after the filesystem operation completes, before awaiting downstream writes.
Bound read-operation size, outstanding reads per body, and read-ahead; include their buffers in the application-owned memory budget.
Keep file/lease ownership separate from worker-permit ownership.
Stalled downloads must not monopolize the workers required by mutations, event reads, or other documents.

Adapting a standard file to a plain Tokio file is acceptable only if all subsequent blocking reads demonstrably retain these admission and cancellation guarantees.
An outer permit around a cancellable read future is insufficient if the underlying blocking work can outlive that permit.
Otherwise, use a small budget-aware asynchronous reader over bounded blocking reads.
Do not introduce a separate unbounded worker path or a transfer-long permit to satisfy the reader interface.

### Prefix followed by exact body

Keep the existing `BlobTree` response wire format, including its typed identity:

1. Outer network length.
2. Message-kind byte.
3. Postcard-encoded typed tree identity, including the blob discriminator and digest.
4. Postcard byte-vector length prefix.
5. Unchanged blob bytes.

Check stream role, integer conversions, prefix arithmetic, and the complete encoded frame limit before writing any prefix.
Do not increase blob or frame limits merely because the sender can stream.
Derive prefix encoding from the existing format and test it against independent fixed-base bytes.

Copy at most the declared body length and require the returned count to equal that length.
Do not probe arbitrary extra body bytes or send appended file contents.
Do not emit `ResponseComplete` or `LoadContentComplete` until all preceding bodies in that response have succeeded.
Preserve response ordering, transfer deadlines, fairness/yield behavior, and the established wire-byte metric semantics.

Before a response prefix is sent, opening and validation failures may use the existing structured error response.
After transmission starts, reader failure, writer failure, timeout, short EOF, or physical cancellation must abort/reset the affected physical stream.
Release resources subject to already-dispatched filesystem work settling.
Never append an error frame or reuse a physical stream whose frame is incomplete.
Tokio copy cancellation does not imply that no bytes were consumed or sent.

### Logical content cancellation and shared-stream failures

Opening content and live events share one physical stream.
Preserve logical content cancellation without treating it as cancellation of an in-progress copy:

- If no content frame has started, discard queued content and stop further content admission.
  Complete the content channel through the existing terminal-marker rules while continuing event delivery.
- If a content frame has started, finish that frame under its existing transfer deadline.
  Then discard queued content, stop further content admission, and signal content completion while retaining events.
  Do not restart the deadline, interleave an event frame inside the body, or wait indefinitely.
- The client load pump must continue draining and discarding an in-flight content frame after the content consumer cancels.
  It must not block shared-stream decoding on delivery to a cancelled content queue or prevent subsequent events from being consumed.

If that frame cannot finish because of a read/write failure, short EOF, deadline expiry, or physical cancellation, abort the shared physical stream instead.
Both logical channels must observe failure through their existing error paths, and host recovery must reconcile and resume delivery correctly.
A failure on an independent demand-response stream must not unnecessarily terminate unrelated streams or sessions.
Keep this distinction in ownership documentation and tests; logical channel cancellation and physical-stream failure are different operations.

Streaming introduces a failure-timing change: a storage-read error previously detected before buffered transmission can now occur after an opening content prefix has been sent.
Such a mid-frame failure also interrupts live events on that physical stream.
Document and test this tradeoff explicitly rather than claiming unchanged failure isolation.

### Traversal, credits, and bounded admission

Use declared body lengths for traversal's response-byte budget without reading blob payloads merely to determine their size.
Preserve explicit-root priority, identity deduplication, breadth-first descendant selection, item/work limits, and partial-response progress.
In particular, retain the first-root progress rule when its size exceeds the soft traversal byte budget, subject to the existing hard frame limit.

Opening content credits remain the full declared payload length plus the existing conservative per-message overhead.
They are not a charge for the sender's copy buffer.
Reserve the full charge before sending a frame; do not read payload data speculatively while waiting for credit.
Account for unavoidable bounded file-adapter read-ahead separately.
Retain the opening encoded-item ceiling and the existing fallback to bulk demand reads for omitted content.
Streaming does not make an oversized opening item eligible.
Keep explicit content-stream behavior distinct from opening-channel credit accounting.

Validate encoded lengths using the checked prefix/length logic, not by constructing a complete frame.
Bound live body handles, queued bodies, and source read-ahead as well as payload buffers.
Do not open files for every requested root in advance.
Logical cancellation releases queued ownership and completes any already-started frame as specified above.
Physical failure releases active ownership after outstanding filesystem work settles and can fail both channels on the shared opening stream, but must not terminate independent sessions.

## Implementation checkpoints

Each checkpoint must leave a buildable, behaviorally coherent state.
Use focused checks during development, freeze source before validation, and independently review the complete fixed-base checkpoint diff before acceptance.
If commits are authorized separately, commit only accepted checkpoints; otherwise keep the changes uncommitted.

### 1. Establish evidence and resolve the API boundary

- Re-establish the baseline using the validation commands below, including the extended transport/browser gate.
- Capture representative blob response bytes and errors from the unmodified encoder.
  Include empty bodies, small binary bodies, postcard length boundaries, and exact frame-limit boundaries.
- Record the current direct file-to-server allocation/read behavior for the same workload.
- Freeze the workload matrix, cache/source classifications, timing boundaries, and comparison method below before changing code.
  Record baseline variability and select explicit acceptable regression tolerances for throughput, small-blob latency, and event responsiveness before evaluating the final implementation.
- Resolve the body representation, reader trait, error mapping, and native/WASM bounds described above.
- Resolve per-operation filesystem-worker admission and permit retention through cancellation.
  Demonstrate that waiting on network capacity or opening credits holds no worker permit.
- Resolve logical content cancellation separately from physical failure, including completion of an in-flight frame under its original deadline, client draining, shared-channel failure propagation, and host recovery.
- Prototype compilation through one file backend, one session forwarding implementation, and one transport writer.
  Exercise the worker-budget and cancellation boundaries before accepting the prototype.
  Do not retain a prototype that requires an unbounded queue, full-body collection, or synchronous I/O on an async executor.

### 2. Implement trusted file reads and blob bodies

- Update the blob storage contract and file backend documentation for the intentional integrity-policy change.
  Also update the session traversal contract that currently requires verification before payload transformation.
- Add the body representation and compatibility operation; update memory, standalone content-addressed, and buffered/durable file implementations.
- Open files, obtain metadata, and read bounded body chunks through the existing filesystem-worker budget.
  Reuse the opened file rather than reopening by path.
  Use Tokio's file adapter only if it preserves per-operation admission and permit retention through cancellation; otherwise use the budget-aware reader resolved at checkpoint 1.
  Enable only native Tokio filesystem features actually required by the chosen implementation.
- Keep the standalone synchronous content-store API functional and align its blob integrity policy with the async adapter.
- Preserve pending/unpublished visibility, storage bounds, missing-file classifications, header/tag checks, publication failure handling, and independent file offsets.
- Update corruption tests only for the explicitly relaxed blob checks; retain all distinct metadata/directory/journal/persistence regression evidence.
- Audit `resolve_tree` and availability checks for incidental body hashing that would still occur on the download path.
  Keep any change there limited to the same trusted-blob policy, without weakening directory closure or provenance.

### 3. Carry bodies through sessions and server dispatch

- Wire the new operation through core forwarding/admission decorators, sequencer storage/session implementations, and direct factory/session consumers.
- Replace sequencer traversal's materializing blob read and redundant identity recomputation with known-length bodies.
  Preserve traversal limits and first-root progress without reading a rejected or omitted payload.
- Add explicit compatible behavior for compression, encryption, native remote sessions, and WASM adapters.
  Check every `SeaArchive` and `BlobStore` implementation, including test doubles and conformance fixtures.
- Replace the blob materialization in server dispatch with an outbound body.
  Prefer a server-owned outbound response type separating ordinary wire messages from streamed blob bodies; do not put a reader into the serializable protocol schema.
- Scope any response-stream type change narrowly to content responses where practical.
  Cover both explicit `GetBlobTrees` responses and opening-prefetch content, including materialized compatibility consumers.
  Update custom `SeaConnectionService` implementations, host forwarding, tests, and examples together.
- Keep the old pure buffered encoder useful as a compatibility oracle and for existing callers.
  Avoid creating a competing implementation of protocol policy.

### 4. Stream over current transports

- Add a small checked prefix encoder and use it for streamed blob responses.
  Include the typed identity and use the same checked-length logic for opening-frame validation without materializing a frame.
- Use the native transport's supported Tokio `AsyncWrite` implementation when available in the pinned dependency version.
  Adapt or narrow the existing send abstraction rather than wrapping writes in a producer task or channel.
- For WebSockets, retain required record framing and bounded message ownership.
  Implement only the async writer/copy bridge needed by that transport; preserve partial-write, flush, finish, and remote-stop semantics.
- Use direct slice writes for `Bytes` bodies and Tokio copy for reader-backed bodies.
  Do not add another `BufReader` when it only duplicates existing buffering.
- Bound source prefetch and writer buffering as well as the copy buffer.
  Native file adapters and WebSocket sinks can otherwise hide additional read-ahead.
- Preserve full-payload byte credits, opening-item limits, bounded body ownership, and demand fallback.
- Apply one transfer deadline according to the existing operation policy, not a fresh full timeout for each successful chunk.
- Preserve logical content cancellation by completing any started frame under that deadline and draining it on the client.
  Abort/reset on physical cancellation or mid-body failure and propagate shared opening-stream failure to both logical channels.
- Preserve client decoding unchanged; byte-returning clients still collect the final blob.
  Preserve the wire decoder while updating load-pump cancellation handling if needed to maintain draining and failure propagation.

### 5. Prove behavior and memory bounds, then finish documentation

- Run the regression matrix and measurements below against the assembled result.
  Include the direct SharedTree lazy/eager handle workload on file-backed transports, not just a synthetic downloader.
- Update affected crate READMEs and item contracts, including the fallback/materialization boundaries.
- Add a changeset describing the file-backed integrity-policy change and any customer-facing API changes, following the [changeset guidelines](../.changeset/README.md).
  Select actual affected release packages; do not invent npm package identities for Rust crates.
- Regenerate API reports only if affected; never hand-edit them.
- Remove prototype scaffolding and redundant helpers introduced during development.
- Report exact source/final identities, commands and outcomes, measured bounds, remaining materializing paths, and any unresolved limitations.

## Regression and measurement requirements

### Storage and ownership

- Raw content-store and both file modes: empty/nonempty blobs; missing file; wrong record tag; undersized storage header; applicable size limits; open/read failure.
- An altered same-length blob is returned without rehashing, while directory and metadata corruption still fail through their existing checks.
- Pending buffered blobs remain readable before disk publication; unpublished durable blobs remain unavailable.
- Concurrent readers have independent positions; opening/reopening, close, cancellation, and publication races retain their documented ownership and visibility.
- No storage state lock remains held during a slow download.
- With a low shared worker limit, stall downloads on network writes and opening credits while event reads and mutations run in the same factory.
  Assert worker concurrency stays within the configured limit and unrelated filesystem operations continue to make progress.
- Cancel reads both while awaiting worker admission and after blocking dispatch.
  Assert undispatched work does not start, dispatched work retains its permit until completion, and permits/resources become available afterward.
  Use controlled blocking-work completion rather than assuming dropping an async future stops a filesystem operation.
- An opened body's declared extent bounds transmission if the file grows.
  A file that becomes shorter after opening fails the transfer when it cannot satisfy that extent.

### Protocol and transport

- Compare complete prefix-plus-body output byte-for-byte with frozen baseline vectors and the existing buffered encoder.
  Include the typed blob identity, both eligible stream roles, and unchanged directory responses.
  Use body lengths 0, 1, 127, 128, 16383, and 16384, plus the largest allowed body and one byte beyond it.
- Preserve wrong-stream and oversize errors; rejected oversized bodies must not be read or partially sent.
- Force fragmented reads/writes, backpressure, early EOF, injected I/O failure, cancellation, and timeout at prefix/body boundaries.
- Assert successful response ordering and exactly one completion marker; assert no completion/error frame or stream reuse after a partial-body failure.
- Cancel only opening content before a frame starts and during fragmented prefix/body writes.
  Assert any started frame finishes under its original deadline, queued content is discarded, the content terminal marker is not duplicated, and live events remain decodable.
  Cancel the client content consumer while a frame is in flight and verify draining does not block on its abandoned queue.
- Inject a mid-body storage failure and a deadline expiry after logical cancellation.
  Assert the shared physical stream aborts, both logical channels receive failure, and direct-host recovery resumes without lost or duplicated edits.
  Contrast this with a pre-prefix content error and an independent demand-stream failure to verify their narrower failure scope.
- Verify root ordering, deduplication, truncated bulk responses, first-root progress, and retrying only omitted roots through streamed traversal.
- Verify full declared-length credit charging before opening transmission, bounded lookahead/file ownership while credit is withheld, and cancellation cleanup.
  Test encoded sizes immediately below, at, and above the opening-item ceiling and verify bulk fallback without increasing production limits.
- Run direct file-backed WebTransport and WebSocket downloads, both file modes, transformed-session regressions, multi-hop composition, and browser/Fluid integration.
- Verify bounded reads with a synthetic large source and a stalled destination, not only a fast loopback benchmark.
- Run slow large transfers alongside independent small downloads and collaborative event delivery.
  Check bounded resource retention, cancellation recovery, and small-request/event responsiveness on both transports, including shared-connection scheduling where supported.

### Workloads and source classification

Use a small staged matrix rather than multiplying every dimension into every benchmark.
Run deterministic correctness and memory gates first, a focused transfer benchmark second, and the real application workload last.
Cover both file modes and both server transports; keep memory-backed reads as a regression control.

| Workload | Purpose |
|---|---|
| One 1 MiB or 16 MiB blob | Per-byte hashing, copying, allocation, and sender buffering |
| The same total payload split into many smaller blobs | File-opening overhead, allocations per object, traversal, and batching |
| Blobs around the opening encoded-item ceiling | Prefetch eligibility, truncation, and bulk-demand fallback |
| Real 1 MiB and 10 MiB SharedTree snapshots | Directory shape, many summary chunks, request waves, and application-ready latency |
| SharedTree plus a real application blob handle | Lazy/eager policy, first payload availability, and integration correctness |

Record unique blob count, blob-size distribution, directory count/depth/fanout, and total unique payload bytes.
Exercise both bulk-demand and opening-prefetch paths.
Do not infer snapshot performance from a single large leaf.
Keep compression disabled for the primary untransformed-path measurements; label transformed-session results separately.

Prove which storage source supplies measured bytes.
For persisted-file measurements, finish publication and drain buffered writes before reopening the backend, or use equivalent instrumentation that demonstrates the overlay is not serving the payload.
Record pending-overlay reads, persisted files with warm OS cache, and reproducible cold-cache reads as separate cases.
A fresh browser or reopened file does not establish a cold OS cache.
Do not evict host-wide caches in a shared environment.
If safe cold-cache isolation is unavailable, state that limitation instead of labeling warm reads as cold.
Keep durability mode and fixture publication outside the measured download interval, without weakening publication barriers.

### Attribution and timing

Where practical, measure three buildable checkpoints: the baseline, trusted reads with materialized sending, and trusted reads with streaming.
The middle checkpoint is an attribution experiment, not an accepted implementation of the bounded-memory goal.
If it is impractical to isolate, report combined gains without attributing them specifically to hashing or copying.
Do not add production configuration switches solely to support this experiment.

Report server CPU per GiB of payload, throughput, peak live allocation bytes, allocation volume, and allocation/read sizes.
Include per-object costs for small-blob workloads.
Keep detailed allocation instrumentation separate from throughput timing when it changes the execution cost.
Report process RSS and transport-internal buffering separately from the application-owned allocation budget.

For browser integration, measure these milestones separately:

- Tree ready, without dereferencing application handles.
- First uncached handle `get()` completion, excluding subsequent full-byte verification.
- All requested application payloads available.
- Full content verification complete.

Verify every payload outside the transfer/readiness timing, and count only verified results as successful.
Record verification cost separately; include it in generator-load accounting when it runs during capacity measurements.
Measure actual content requests and bytes by identity/path in addition to API spans.
A driver read call can hit a prefetched cache, so it is not proof of a network request or of lazy transfer.
Assert that lazy opening does not transfer handle-only payloads and that eager opening leaves no payload fetch for the subsequent handle read.
Use distinct fixture content so a summary-blob identity does not alias a handle-only payload.
Do not sum overlapping API spans or mix post-readiness payload traffic into a readiness-only byte claim.
Client decoding and handle caching still materialize data; describe this as server-side streaming, not application-level streaming.

### Capacity, fairness, and comparison discipline

Reuse the [snapshot harness](tests/sea-integration-tests/README.md#snapshot-download-and-load-benchmark) where applicable, extending it rather than creating a competing application benchmark.
Use a lean downloader for server-capacity measurements and browser SharedTree runs for application evidence.
Keep closed-loop concurrency sweeps distinct from open-loop offered-load tests.
Record successes, failures, timeouts, scheduled-arrival latency, scheduler lag, queue growth, client CPU, and server CPU.
Run long enough to distinguish sustained throughput from transient buffering and to drain admitted work.
Do not report a client-generator bottleneck as service capacity.

Use loopback and verified 100 ms RTT latency cases, plus one recorded bandwidth-limited or slow-reader case.
Record achieved RTT, bandwidth configuration, network bytes, and unintended packet drops.
Measure open file descriptors and retained resources during stalls and after cancellation.
Test one and multiple slow transfers alongside small downloads and event traffic; compare latency distributions against the same mixed workload on the baseline.

Use identical fixture bytes, limits, transport, build mode, and cache/source classification across comparisons.
Control document membership/history growth by using independently prepared equivalent documents or a pinned archive workload.
Alternate baseline and final runs, repeat independent trials, and retain raw samples and artifact hashes.
Record CPU placement and environmental contention; do not run heavy builds or unrelated benchmark work concurrently.
Three samples per cell are diagnostic only.
Use sufficient sustained runs and samples before making saturation or tail-latency claims, and report variability rather than unsupported precision.

### Measurable acceptance

For the untransformed persisted-file-to-server-send path, there must be no allocation proportional to total blob length in Sea's body opening, dispatch, serialization, or framing.
Use 1 MiB and 16 MiB blobs under explicitly recorded test limits; this does not change production defaults.
Exclude initial upload/setup and the receiving client's materialized result from the sender measurement.

Start with an acceptance budget of at most 256 KiB of incremental application-owned buffering per active file transfer, independent of those body sizes.
Include configured file read-ahead and Sea's WebSocket record/message buffers.
Measure transport-internal buffering separately; do not claim that QUIC or TLS memory is eliminated.
If the library defaults exceed the application budget, first bound them or revise the documented budget with evidence, rather than quietly excluding them.

Record allocation sizes/peak live bytes, bytes read before the blocked sink advances, and read-call sizes.
Test one transfer and multiple concurrent transfers to verify that memory scales with active transfer count rather than total blob bytes.
Use deterministic read/backpressure tests as regression gates and an isolated allocation measurement for the numeric budget.
Measure throughput and CPU against the baseline with identical files, limits, transport, build mode, and warm/cold-cache conditions.
Do not make a zero-copy, syscall-offload, or throughput-improvement claim without direct evidence.
Acceptance requires the memory bound, preserved behavior, and no material regression against the predeclared tolerances for many-small-blob throughput/latency and mixed-workload event responsiveness.
Quantify server CPU and capacity changes, including neutral or negative results.
A large end-to-end latency improvement is not required: this change does not inherently remove network round trips or client-side materialization.

## Validation commands

Run from `rust-service/`, following [Development](DEVELOPMENT.md):

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps --locked
cargo build --workspace --all-targets --locked
cargo test --workspace --doc --all-features --locked
node scripts/check-documentation.mjs
./test.sh --extended
```

The extended gate is required because this changes transport behavior and lifecycle handling; a scoped `./test.sh` pass alone is insufficient.
Use complete affected-crate suites during checkpoints, including dependent session and transport crates, and the required boundary tests.
Serialize Clippy, rustdoc, build, and native tests that share Cargo output directories.

From the repository root:

```bash
pnpm policy-check --path rust-service
```

If implementation changes dependency topology, lockfiles, shared build inputs, or consumers outside the scoped Rust-service build, also run `pnpm build:fast` as required by the development guide.
Restore missing dependencies only after a missing-tool/dependency failure, using frozen lockfiles.
Attribute baseline failures before changing source or weakening any test.

## Completion criteria

- Direct untransformed downloads from both file backends reach both supported server transports through bulk-demand and eligible opening-prefetch paths without whole-blob materialization on the server.
- File-backed ordinary reads and sequencer blob traversal no longer perform full-body integrity hashing; structural checks, authenticated decryption, and unrelated persistence checks remain intact.
- Existing wire and storage formats are unchanged.
- Traversal progress, opening byte credits, encoded-item limits, and bulk fallback are preserved without materializing bodies for validation.
- Error, cancellation, ownership, timeout, and resource-release behavior is explicit and tested.
- Body reads preserve the shared filesystem-worker limit, retain permits through actual blocking-work completion, and hold no worker permit merely while waiting for network capacity or opening credit.
- Logical content cancellation preserves events by finishing any started frame within its original deadline; physical opening-stream failures propagate to both channels and pass recovery tests.
- Required validation, independent checkpoint reviews, and the memory budget pass.
- The persisted-file source is demonstrated, server CPU/capacity changes are quantified, and small-blob and mixed-workload regressions meet the predeclared acceptance tolerances.
- Real lazy/eager SharedTree handle tests validate the file-backed transport integration, with readiness, payload availability, and verification timed separately.
- Remaining materialization in transformed sessions, remote-source decoding, and byte-returning consumers is documented rather than described as end-to-end streaming.
