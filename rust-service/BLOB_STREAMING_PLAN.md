# Async blob transfer plan

## Status and execution location

This is an implementation proposal, not a description of completed functionality.
Implement in the main worktree, `/workspaces/FluidFramework`, on branch `rust-service`.
The inspected baseline is `5c6d41ce89e349279e2968b6bc9a597d93715c78`; the worktree was clean before this plan was added.
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
- Preserve existing blob bytes, network protocol version, frame limits, storage formats, directory behavior, admission rules, publication ordering, and durability distinctions.
- Keep existing byte-returning APIs usable for callers that need materialized content.
- Preserve WASM/browser builds and existing TypeScript-facing API shapes.
- Do not stream uploads, redesign the receiving frame decoder, change encryption/compression formats, or make directory/event/snapshot transfers streaming in this change.
- Compression and encryption wrappers may continue to return materialized transformed bodies.
  In particular, do not release decrypted plaintext before authentication succeeds.
- A remote session used as an upstream source may initially materialize its response through the existing client decoder.
  Multi-hop behavior must remain correct, but bounded-memory forwarding across every network hop is not a completion claim for this plan.
- Do not add an integrity-check configuration mode or debug-only full-body hashing.
  Document where an explicit integrity verifier could be added later.

## Findings that determine the design

1. [BlobStore](crates/sea-core/src/storage/blob_store.rs) currently returns `Bytes` and promises verification.
   [SeaArchive](crates/sea-core/src/session.rs) also returns `Bytes`.
   A server-only encoder change cannot remove storage materialization.
2. The [content dispatcher](crates/sea-webtransport-server/src/protocol/dispatch.rs) converts fetched `Bytes` into `Response::Blob(Vec<u8>)`.
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

## Proposed contracts

### Trusted immutable file contents

Ordinary file-backed blob reads trust published payload bytes instead of comparing them to their content hash.
Atomic publication protects against exposing unfinished writes; it does not prove immunity to media corruption, external modification, or application defects.
Published files must not be modified in place by supported operations.

Retain:

- Hashing required to determine a blob's identity when publishing new content.
- Publication barriers, existing collision/publication checks, and backend failure poisoning.
- Missing-file and I/O errors, existing storage-size limits, record/header shape checks, and configured network limits.
- Directory decoding, directory identity/closure checks, journal checksums, checkpoint checksums, and recovery validation.

For persisted `sea-file` blobs, skip both full-body read-time hashes: the atomic-value checksum and the blob identity recomputation.
Keep the existing on-disk checksum bytes and write behavior.
Do not weaken the shared atomic-file reader used by other record types; add a narrow blob-opening path.
For byte-returning blob APIs, collect through the same trusted-read path so integrity semantics do not depend on which API a caller chooses.

Document the intentional change: same-length payload corruption can be returned successfully.
Without an independent trusted payload length, some pre-existing truncations can also be indistinguishable from a shorter published body.
Transfer-length checks detect a short read relative to the opened file's advertised extent, not every historical corruption.
Clients may verify content where their API supplies the corresponding stored-content identity; do not require a new client verification policy here.

### Owned, known-length blob body

Introduce the smallest common representation needed for:

- Immutable in-memory `Bytes`, without copying their contents.
- An owned asynchronous reader with a declared `u64` body length.

An opened body owns all resources necessary for its supported read lifetime.
It must not borrow a storage mutex, mutable shared file cursor, or transient request-local buffer.
Cancellation drops that ownership; it must not close unrelated sessions or document openings.
Document whether session closure terminates an active body and preserve the existing session/transport lifecycle policy.
Do not accidentally use the new path to bypass authorization or admission decorators.

Recommended API direction: retain `get_blob` and add a body-opening operation with a compatibility implementation that materializes through `get_blob`.
Override it in file backends and every transparent forwarding layer on the direct file-to-server path.
File-backed `get_blob` can collect from the overridden body operation; ensure defaults cannot recurse.
Memory implementations should return their existing `Bytes` directly.
Transforming wrappers must explicitly use their transformed `get_blob` result, not forward raw underlying storage bytes.

At the first implementation checkpoint, resolve reader trait ownership:

- Prefer Tokio `AsyncRead` if an `io-util`-only dependency is acceptable in sea-core and compiles for supported WASM targets.
- Keep filesystem/runtime features in native backends; do not pull `tokio::fs` into browser builds.
- Preserve the existing native `Send` versus browser-local ownership distinction.
- If this requires compatibility adapters or extra trait layers throughout the system, stop and compare a smaller alternative before committing to that design.

Use an open file and metadata from that same handle.
Each transfer needs an independent cursor; do not assume cloning a file handle creates an independent seek offset.
For `sea-file`, validate the fixed header/tag and expose the payload after the existing 33-byte prefix.
Capture pending-overlay `Bytes` or open the published file under the existing visibility rules, then release locks before awaiting or transferring.
Retain the necessary backend/lease ownership, and account for Tokio file I/O that may outlive cancellation while a blocking operation completes.

### Prefix followed by exact body

Keep the existing `Blob` response wire format:

1. Outer network length.
2. Message-kind byte.
3. Postcard byte-vector length prefix.
4. Unchanged blob bytes.

Check stream role, integer conversions, prefix arithmetic, and the complete encoded frame limit before writing any prefix.
Do not increase blob or frame limits merely because the sender can stream.
Derive prefix encoding from the existing format and test it against independent fixed-base bytes.

Copy at most the declared body length and require the returned count to equal that length.
Do not probe arbitrary extra body bytes or send appended file contents.
Do not emit `ResponseComplete` until the entire body succeeds.
Preserve response ordering, transfer deadlines, fairness/yield behavior, and the established wire-byte metric semantics.

Before a response prefix is sent, opening and validation failures may use the existing structured error response.
After transmission starts, reader failure, writer failure, timeout, short EOF, or cancellation must abort/reset the affected transfer and release its resources.
Never append an error frame or reuse the partially written logical stream as though its frame completed.
Tokio copy cancellation does not imply that no bytes were consumed or sent.

## Implementation checkpoints

Each checkpoint must leave a buildable, behaviorally coherent state.
Use focused checks during development, freeze source before validation, and independently review the complete fixed-base checkpoint diff before acceptance.
If commits are authorized separately, commit only accepted checkpoints; otherwise keep the changes uncommitted.

### 1. Establish evidence and resolve the API boundary

- Re-establish the baseline using the validation commands below, including the extended transport/browser gate.
- Capture representative blob response bytes and errors from the unmodified encoder.
  Include empty bodies, small binary bodies, postcard length boundaries, and exact frame-limit boundaries.
- Record the current direct file-to-server allocation/read behavior for the same workload.
- Resolve the body representation, reader trait, error mapping, and native/WASM bounds described above.
- Prototype compilation through one file backend, one session forwarding implementation, and one transport writer.
  Do not retain a prototype that requires an unbounded queue, full-body collection, or synchronous I/O on an async executor.

### 2. Implement trusted file reads and blob bodies

- Update the blob storage contract and file backend documentation for the intentional integrity-policy change.
- Add the body representation and compatibility operation; update memory, standalone content-addressed, and buffered/durable file implementations.
- Open files and obtain metadata through existing bounded blocking dispatch where appropriate.
  Reuse an opened standard file with Tokio's file adapter rather than reopening by path.
  Enable only the required native Tokio filesystem feature.
- Keep the standalone synchronous content-store API functional and align its blob integrity policy with the async adapter.
- Preserve pending/unpublished visibility, storage bounds, missing-file classifications, header/tag checks, publication failure handling, and independent file offsets.
- Update corruption tests only for the explicitly relaxed blob checks; retain all distinct metadata/directory/journal/persistence regression evidence.
- Audit `resolve_tree` and availability checks for incidental body hashing that would still occur on the download path.
  Keep any change there limited to the same trusted-blob policy, without weakening directory closure or provenance.

### 3. Carry bodies through sessions and server dispatch

- Wire the new operation through core forwarding/admission decorators, sequencer storage/session implementations, and direct factory/session consumers.
- Add explicit compatible behavior for compression, encryption, native remote sessions, and WASM adapters.
  Check every `SeaArchive` and `BlobStore` implementation, including test doubles and conformance fixtures.
- Replace the blob materialization in server dispatch with an outbound body.
  Prefer a server-owned outbound response type separating ordinary wire messages from streamed blob bodies; do not put a reader into the serializable protocol schema.
- Scope any response-stream type change narrowly to content responses where practical.
  Update custom `SeaConnectionService` implementations, host forwarding, tests, and examples together.
- Keep the old pure buffered encoder useful as a compatibility oracle and for existing callers.
  Avoid creating a competing implementation of protocol policy.

### 4. Stream over current transports

- Add a small checked prefix encoder and use it for streamed blob responses.
- Use the native transport's supported Tokio `AsyncWrite` implementation when available in the pinned dependency version.
  Adapt or narrow the existing send abstraction rather than wrapping writes in a producer task or channel.
- For WebSockets, retain required record framing and bounded message ownership.
  Implement only the async writer/copy bridge needed by that transport; preserve partial-write, flush, finish, and remote-stop semantics.
- Use direct slice writes for `Bytes` bodies and Tokio copy for reader-backed bodies.
  Do not add another `BufReader` when it only duplicates existing buffering.
- Bound source prefetch and writer buffering as well as the copy buffer.
  Native file adapters and WebSocket sinks can otherwise hide additional read-ahead.
- Apply one transfer deadline according to the existing operation policy, not a fresh full timeout for each successful chunk.
- Preserve client decoding unchanged; byte-returning clients still collect the final blob.

### 5. Prove behavior and memory bounds, then finish documentation

- Run the regression matrix and measurements below against the assembled result.
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
- An opened body's declared extent bounds transmission if the file grows.
  A file that becomes shorter after opening fails the transfer when it cannot satisfy that extent.

### Protocol and transport

- Compare complete prefix-plus-body output byte-for-byte with frozen baseline vectors and the existing buffered encoder.
  Use body lengths 0, 1, 127, 128, 16383, and 16384, plus the largest allowed body and one byte beyond it.
- Preserve wrong-stream and oversize errors; rejected oversized bodies must not be read or partially sent.
- Force fragmented reads/writes, backpressure, early EOF, injected I/O failure, cancellation, and timeout at prefix/body boundaries.
- Assert successful response ordering and exactly one completion marker; assert no completion/error frame or stream reuse after a partial-body failure.
- Run direct file-backed WebTransport and WebSocket downloads, both file modes, transformed-session regressions, multi-hop composition, and browser/Fluid integration.
- Verify bounded reads with a synthetic large source and a stalled destination, not only a fast loopback benchmark.

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

- Direct untransformed downloads from both file backends reach both supported server transports without whole-blob materialization on the server.
- File-backed ordinary reads no longer perform full-body integrity hashing; structural and unrelated persistence checks remain intact.
- Existing wire and storage formats are unchanged.
- Error, cancellation, ownership, timeout, and resource-release behavior is explicit and tested.
- Required validation, independent checkpoint reviews, and the memory budget pass.
- Remaining materialization in transformed sessions, remote-source decoding, and byte-returning consumers is documented rather than described as end-to-end streaming.
