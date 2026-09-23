# Iteration 0005: content-addressed-blobs-summaries Report

Status: complete
Branch: `rust-service-iteration-0005-content-addressed-blobs-summaries`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-content-addressed-blobs-summaries`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f` (`docs(rust-service): start iteration 0005`)
Final commit: Wave 2 implementation `9a1315a712c4cf768393559502621c2d0fb1b1b9`; the final report commit follows it
Agent or owner: GitHub Copilot, assigned iteration `0005` implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [content-addressed-blobs-summaries.md](instructions/content-addressed-blobs-summaries.md) at `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: started `2026-09-12T19:44:20Z`; Wave 1 finished `2026-09-12T20:05:11Z`; Wave 2 finished `2026-09-12T20:31:10Z`

Pre-edit root file baseline: `rust-service/Cargo.toml` SHA-256 `dd40850dc1d232e7555a64dc2bd9aaba0e7448d845f9ce0732845a5404c07a09`; `rust-service/Cargo.lock` SHA-256 `fa09fb406da6522b12b07f489947b793bdd48d4128cd86c0a0a9b2df4d67a4ea`.

## Outcome

The workstream is complete. The isolated `snapshotted-stream-content-addressed` crate provides immutable SHA-256 blob identities, bounded streaming persistence and verified fetch, idempotent duplicate publication, canonical atomic summary manifests, durable reopen recovery, and deterministic persistence fault injection. Wave 2 adds bounded FSP4 upload/fetch and summary publish/fetch operations, native service-root integration, a stateless client facade with response identity validation, direct service reopen tests, and a Unix-socket lost-acknowledgement/process-restart round trip. The implementation preserves all accepted projected-read and ambiguity-recovery contracts and adds no retention or garbage collection.

## Hypothesis Results

- Supported: immutable blobs and manifests compose above filesystem durability without kernel changes. `blob_faults_never_expose_invalid_acknowledged_content` and `summary_faults_reopen_to_absent_or_fully_valid_manifest` show interruption leaves an object either absent or fully verifiable.
- Supported: a manifest cannot be acknowledged with a missing or corrupt referenced blob. `summary_publication_verifies_references_and_round_trips_atomically` rejects absent references before creating a manifest, and `corrupt_referenced_blob_invalidates_an_existing_summary` rejects later corruption on load.
- Supported: core upload/fetch is bounded streaming, while FSP4 deliberately uses bounded single-frame payloads capped at 512 KiB. `bounded_streaming_round_trips_small_and_large_blobs_after_reopen` verifies 4 KiB read requests over a 1 MiB payload, and the measurement example covers 16 MiB with a 64 KiB buffer.
- Supported end to end: `content_operations_survive_lost_acknowledgement_and_process_restart` uploads and fetches a blob, publishes and fetches its summary, loses the first publication response, confirms idempotent duplicate resolution, kills the service process, restarts it, and verifies both objects.

## Deliverables and Commits

1. `4407a10bd62b8fe40e23ed12b99868278b5bf568` (`feat(rust-service): add content-addressed blob core`) adds the isolated crate, public API, persistence implementation, focused tests, child-process restart test, and deterministic measurement example.
2. `38ee668482b54568a32f530d0d1a72d220a7ea24` (`docs(rust-service): record blob core Wave 1`) records the Wave 1 handoff and waiting state.
3. Accepted prerequisite commits `24d24c57f7922094087ce891dd72e49a49edb55a` (`feat(rust-service): add projected reads and recovery`) and `16d8482b384e59c2a47de9d6a73f919e747c4a79` (`docs(rust-service): report projected reads workstream`) were cherry-picked before Wave 2.
4. `9a1315a712c4cf768393559502621c2d0fb1b1b9` (`feat(rust-service): add blob and summary service operations`) adds the protocol, service, client, direct service tests, process tests, and workspace-format/Clippy conformance needed by the newly integrated crate.
5. The commit containing this report records the completed workstream handoff.

Wave 1 API handoff:

- `ContentDigest`: SHA-256 parsing, formatting, and computation.
- `StoreConfig`: maximum blob bytes, maximum encoded manifest bytes, and copy-buffer bound.
- `ContentStore::open` / `open_with_fault_injector`: create or reopen a store and clean unpublished temporary files.
- `ContentStore::put_blob`: bounded streaming upload returning `BlobReceipt { digest, size_bytes, deduplicated }` only after file and directory sync.
- `ContentStore::open_blob` / `verify_blob`: bounded-memory full digest validation before returning a seekable reader or verified size.
- `ContentStore::publish_summary`: validates canonical path ordering and all referenced blobs before durable immutable publication; returns `SummaryReceipt`.
- `ContentStore::load_summary`: validates manifest digest, framing, canonical form, and every referenced blob.
- `StoreError`: stable invalid digest/manifest, size limit, missing, corruption, injected, ambiguous, I/O, and poisoned categories.
- `FaultInjector` / `FaultPoint`: deterministic before/during/after persistence boundaries for isolated fault tests.

Wave 2 wire and API handoff:

- Additive FSP4 request kinds: `UploadBlob=10`, `FetchBlob=11`, `PublishSummary=12`, and `FetchSummary=13`; existing request kinds `1-9` are unchanged.
- Additive FSP4 response kinds: `BlobUploaded=70`, `Blob=71`, `SummaryPublished=72`, and `Summary=73`; existing response kinds through `69` are unchanged.
- Digests are exact 32-byte SHA-256 values on wire. Blob bodies permit empty content and are bounded by `Limits::max_blob_bytes` (512 KiB by default). Summary paths remain length-prefixed non-empty bytes on wire and become validated UTF-8 canonical paths at the service boundary.
- Additive stable errors: `BlobNotFound=23`, `SummaryNotFound=24`, `ContentTooLarge=25`, `InvalidDigest=26`, and `InvalidManifest=27`; corrupt persisted content maps to existing `Corrupt`, post-publication uncertainty to existing `Ambiguous`, and I/O availability failures to existing `Unavailable`.
- `NativeService` owns one durable service-root `content/` store, recomputes upload digests, verifies every fetched object, verifies every summary reference before acknowledgement, and reopens the store on process restart. Content operations do not enter document/sequencer routing.
- `ContentClient` constructs the four requests and decodes typed `BlobUpload` / `SummaryPublication` results. Fetch decoders require the echoed digest to match the requested identity and reject mismatches.

## Validation Evidence

Wave 2 validation ran from the exact disposable copy `/tmp/ff-ca-wave2-final` with `CARGO_TARGET_DIR=/tmp/ff-ca-wave2-validation-target`. `rsync` parity was exact before dependency resolution and remained exact afterward excluding only the disposable generated `Cargo.lock` and target. Checkout identity was `/workspaces/FluidFramework-rust-service-iteration-0005-content-addressed-blobs-summaries`, branch `rust-service-iteration-0005-content-addressed-blobs-summaries`, source implementation HEAD `9a1315a712c4cf768393559502621c2d0fb1b1b9`.

- `cargo +1.98.1 fmt --all -- --check`: passed.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave2-validation-target cargo +1.98.1 clippy -p snapshotted-stream-content-addressed -p fluid-service-protocol -p fluid-native-service -p snapshotted-stream-client --all-targets -- -D warnings`: passed with no diagnostics.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave2-validation-target cargo +1.98.1 test -p snapshotted-stream-content-addressed -p fluid-service-protocol -p fluid-native-service -p snapshotted-stream-client --all-targets`: passed. Protocol `7/7`; service `8/8`; client unit `14/14`; client process `3/3`; content core `9/9`; content process `1/1` with one child-only entry ignored; library/example empty harnesses `0/0`.
- Integrity/durability coverage includes `digest_parsing_is_canonical_and_rejects_malformed_values`, `bounded_streaming_round_trips_small_and_large_blobs_after_reopen`, `duplicate_and_concurrent_identical_uploads_are_idempotent`, `missing_corrupt_and_oversized_blobs_have_stable_errors`, `summary_publication_verifies_references_and_round_trips_atomically`, `malformed_and_oversized_manifests_are_rejected`, both full fault matrices, dangling/corrupt reference rejection, and `child_process_publication_survives_restart_and_orphan_cleanup`.
- Protocol/service/client coverage includes exact additive kind-number stability, all request/response round trips, typed client response validation, direct duplicate/reopen service behavior, missing-reference rejection, and the lost-acknowledgement Unix-socket restart trace.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave2-validation-target cargo +1.98.1 run -p snapshotted-stream-content-addressed --example measure --quiet`: passed and produced the measurements below.
- Root files remained unchanged immediately after dependency validation and final focused validation: `rust-service/Cargo.toml` SHA-256 `dd40850dc1d232e7555a64dc2bd9aaba0e7448d845f9ce0732845a5404c07a09`; `rust-service/Cargo.lock` SHA-256 `fa09fb406da6522b12b07f489947b793bdd48d4128cd86c0a0a9b2df4d67a4ea`.
- `git diff --check`: passed before the implementation commit and after final exact-copy validation.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0005 start`: still fails on pre-existing missing decision links in other workstream instructions: `../../../decisions/0007-projected-reads-and-ambiguity-recovery.md` and `../../../decisions/0008-portable-wasm-client-boundary.md`. This report has no unresolved required markers; shared iteration records remain outside this workstream's ownership.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation harness | The first focused test invocation treated the disposable-only generated `Cargo.lock` as a source parity difference. | Parity command exited `1`; no tests ran and no source changed. | One validation invocation was lost. | Repeated parity excluding only generated `Cargo.lock` and `target`; all tests then passed. | Exact-copy dependency checks should define generated disposable artifacts explicitly before comparing source parity. |
| Tool reporting | A delegated commit command reported success although `HEAD` remained at kickoff and the crate was still untracked. | Direct `git rev-parse HEAD`, `git status --short`, and `git show` contradicted the summary. | Implementation was not committed on the first attempt. | Staged exact paths, printed staged/unstaged lists, committed directly, and verified `4407a10bd62b8fe40e23ed12b99868278b5bf568`. | Never accept summarized commit evidence without the resulting hash and direct status/content verification. |
| Cross-workstream validation | Iteration start validation found missing decision links in projected-read and browser-WASM instruction files present at kickoff. | Validator exit `1` named decisions `0007` and `0008`; this report's marker and diff checks passed. | Iteration-wide validator cannot pass from this workstream. | Preserved the failure and left shared records unchanged under Wave 1 ownership. | Run iteration validators early and distinguish workstream report defects from kickoff-wide record defects. |
| Validation harness | Shared terminal and delegated command output twice surfaced commands from the concurrent browser-WASM worktree. | Reported checkout `/workspaces/FluidFramework-rust-service-iteration-0005-browser-wasm-client-package` contradicted the requested absolute path. | Those results could not be accepted as evidence. | Captured validation through absolute-path scripts and dedicated `/tmp` logs, then verified the printed source, branch, HEAD, parity, and protected hashes. | Multi-worktree validation evidence must identify the checkout inside the command output, not only in the invocation request. |
| Test isolation | Adding a second process test exposed that `TempDirectory` used only the parent PID, so parallel tests collided on one socket/root and the combined suite hung. | The focused new test passed alone; the combined process binary stopped after starting. | One full-suite run was terminated. | Added an atomic per-test suffix; the complete process binary then passed `3/3` in `0.02s`. | Process harnesses need per-test resource identity even when each test already isolates child processes. |
| Workspace conformance | Registering the formerly standalone crate through the service path dependency surfaced Rust 1.98 strict-Clippy and workspace-rustfmt differences in Wave 1 files. | First full Clippy run reported missing public error docs, `chunks_exact_to_as_chunks`, and one unchecked test conversion. | Required local conformance edits and formatting of three Wave 1 files. | Added API error documentation, used `as_chunks`, made the conversion checked, and reran format/Clippy/tests successfully. | Validate a new crate under its eventual workspace lint context in the disposable copy, not only through its standalone manifest. |

## Contract and Integration Friction

The accepted projected-read/ambiguity-recovery prerequisite was integrated as `24d24c57f7922094087ce891dd72e49a49edb55a..16d8482b384e59c2a47de9d6a73f919e747c4a79` before Wave 2. Blob and summary kinds are strictly additive above request `9` and response `69`; no projected contracts changed. Root workspace membership and the root lockfile remain untouched by instruction. Integration must add `crates/content-addressed` to workspace members and regenerate the lockfile for the service path dependency and `sha2 0.10.9` dependency graph.

## Human Interventions

The user initially constrained execution to Wave 1, supplied actual kickoff `c9106df9d9b`, prohibited root `Cargo.toml`/`Cargo.lock` edits, and required protocol/service/client paths to remain read-only. The user then explicitly opened Wave 2 after the projected prerequisite was cherry-picked and retained the root manifest/lock prohibition. These constraints determined the standalone crate, service path dependency, and exact disposable-copy validation approach.

## Measurements

Environment: Linux `6.8.0-1064-azure` x86_64 GNU/Linux; `rustc 1.98.1 (48a229cea 2026-09-01)`, LLVM `22.1.8`; debug profile; one deterministic run. These are implementation measurements, not production benchmarks.

- Small blob: payload `1,024` bytes; persisted `1,024` bytes; amplification `1.0x`.
- Large blob: payload `16,777,216` bytes; persisted `16,777,216` bytes; amplification `1.0x`.
- Two-entry summary manifest: persisted `94` bytes.
- Streaming copy buffer: configured and enforced at `65,536` bytes. The generated large input is never materialized by the example.
- Process `VmHWM`: `2,156` KiB before uploads and `2,312` KiB after; observed delta `156` KiB. This includes allocator/hash/filesystem overhead and is not solely the copy buffer.
- Direct dependency need: `sha2 = "0.10.9"` only. Disposable resolution: `sha2 0.10.9`, `digest 0.10.7`, `block-buffer 0.10.4`, `crypto-common 0.1.7`, `generic-array 0.14.7`, `typenum 1.20.1`, `version_check 0.9.5`, `cfg-if 1.0.4`, `cpufeatures 0.2.17`, and `libc 0.2.189`.
- Wall-clock workstream interval: approximately 47 minutes from recorded Wave 1 start through Wave 2 implementation completion; detailed agent token usage is unknown.

## Proposed Decisions

No shared decision is proposed. Atomic immutable publication uses a same-filesystem hard link from a synced temporary file followed by directory sync. FSP4 exposes bounded whole-object transfer rather than introducing streaming state into the accepted request/response protocol; the 512 KiB default is explicit and enforced during protocol encode/decode and service persistence.

## Candidate Skills and Process Changes

Candidate coordination improvement: standardize an exact disposable-crate validation helper that copies source, permits only a generated disposable lockfile/target, prints checkout identity and command exit status, then immediately hashes protected source manifests. The first notable event shows the value of making generated-file exclusions part of that helper rather than improvising them per workstream.

## Remaining Work and Risks

- Integration must add `crates/content-addressed` to `rust-service/Cargo.toml` workspace members and regenerate `rust-service/Cargo.lock`. The only direct new external dependency is `sha2 = "0.10.9"`; disposable resolution added `sha2 0.10.9`, `digest 0.10.7`, and `block-buffer 0.10.4` beyond packages already present in the lock.
- The wire API is bounded whole-object transfer, not chunked streaming. The default 512 KiB blob bound is intentional for FSP4 frame safety; larger production objects would require a future additive chunk/session protocol rather than raising the frame bound casually.
- The service reads a verified blob into one bounded response buffer after the store's bounded-memory integrity pass. Peak service memory therefore includes one blob response up to the configured wire limit.
- Multi-process content-store writers and opening a store while another process has unpublished temporary files are unsupported; deployment must preserve single-service ownership of a root.
- Retention, pruning, leases, mutable replacement, cloud storage, and garbage collection remain explicitly out of scope. Content persists indefinitely unless managed outside this API.
