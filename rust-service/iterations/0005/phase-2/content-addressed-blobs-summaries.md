# Iteration 0005: content-addressed-blobs-summaries Report

Status: in progress
Branch: `rust-service-iteration-0005-content-addressed-blobs-summaries`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-content-addressed-blobs-summaries`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f` (`docs(rust-service): start iteration 0005`)
Final commit: Wave 1 implementation `4407a10bd62b8fe40e23ed12b99868278b5bf568`; this report's commit follows it
Agent or owner: GitHub Copilot, assigned iteration `0005` implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [content-addressed-blobs-summaries.md](./instructions/content-addressed-blobs-summaries.md) at `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: Wave 1 started `2026-09-12T19:44:20Z` and finished `2026-09-12T20:05:11Z`; workstream remains in progress awaiting Wave 2

Pre-edit root file baseline: `rust-service/Cargo.toml` SHA-256 `dd40850dc1d232e7555a64dc2bd9aaba0e7448d845f9ce0732845a5404c07a09`; `rust-service/Cargo.lock` SHA-256 `fa09fb406da6522b12b07f489947b793bdd48d4128cd86c0a0a9b2df4d67a4ea`.

## Outcome

Wave 1 is implemented as the isolated `snapshotted-stream-content-addressed` crate. It provides immutable SHA-256 blob identities, bounded streaming upload and verified fetch, idempotent concurrent duplicate publication, stable missing/corrupt/limit errors, canonical summary manifests, reference verification before summary acknowledgement, durable same-filesystem publication, reopen recovery, deterministic persistence fault injection, and focused process-restart tests. Confidence is high for this isolated single-process filesystem core on Linux. The workstream is intentionally not complete: no shared protocol, service, client, root workspace manifest, or lockfile path was edited, and Wave 2 remains blocked on the projected-read/recovery prerequisite handoff.

## Hypothesis Results

- Supported for Wave 1: immutable blobs and manifests compose above filesystem durability without kernel changes. `blob_faults_never_expose_invalid_acknowledged_content` and `summary_faults_reopen_to_absent_or_fully_valid_manifest` show interruption leaves an object either absent or fully verifiable.
- Supported for Wave 1: a manifest cannot be acknowledged with a missing or corrupt referenced blob. `summary_publication_verifies_references_and_round_trips_atomically` rejects absent references before creating a manifest, and `corrupt_referenced_blob_invalidates_an_existing_summary` rejects later corruption on load.
- Supported for Wave 1: bounded upload/fetch can be expressed with `Read`; `bounded_streaming_round_trips_small_and_large_blobs_after_reopen` verifies 4 KiB read requests over a 1 MiB payload, while the measurement example covers 16 MiB with a 64 KiB buffer.
- Inconclusive until Wave 2: composition through projected protocol/service/client operations and recovery semantics has not been tested because the prerequisite is not integrated.

## Deliverables and Commits

1. `4407a10bd62b8fe40e23ed12b99868278b5bf568` (`feat(rust-service): add content-addressed blob core`) adds the isolated crate, public API, persistence implementation, focused tests, child-process restart test, and deterministic measurement example.
2. The commit containing this report records the Wave 1 handoff and waiting state.

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

## Validation Evidence

All Cargo commands ran in the one exact disposable copy `/tmp/ff-ca-wave1-validation/content-addressed` with `CARGO_TARGET_DIR=/tmp/ff-ca-wave1-validation/target`, after `rsync` and `diff -qr` source parity checks excluding only the disposable generated `Cargo.lock` and target directory. Checkout identity was `/workspaces/FluidFramework-rust-service-iteration-0005-content-addressed-blobs-summaries`, branch `rust-service-iteration-0005-content-addressed-blobs-summaries`, source HEAD `4407a10bd62b8fe40e23ed12b99868278b5bf568` after the implementation commit.

- `cargo +1.98.1 check --all-targets`: passed before tests; this was the initial dependency/compile disproof check.
- `cargo +1.98.1 fmt --all -- --check`: passed.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave1-validation/target cargo +1.98.1 clippy --all-targets -- -D warnings`: passed with no diagnostics.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave1-validation/target cargo +1.98.1 test --all-targets --quiet`: passed; library `0/0`, core integration tests `9/9`, process integration tests `1/1` with the child-only entry point ignored by the parent harness, examples `0/0`.
- Integrity/durability coverage includes `digest_parsing_is_canonical_and_rejects_malformed_values`, `bounded_streaming_round_trips_small_and_large_blobs_after_reopen`, `duplicate_and_concurrent_identical_uploads_are_idempotent`, `missing_corrupt_and_oversized_blobs_have_stable_errors`, `summary_publication_verifies_references_and_round_trips_atomically`, `malformed_and_oversized_manifests_are_rejected`, both full fault matrices, dangling/corrupt reference rejection, and `child_process_publication_survives_restart_and_orphan_cleanup`.
- `CARGO_TARGET_DIR=/tmp/ff-ca-wave1-validation/target cargo +1.98.1 run --example measure --quiet`: passed and produced the measurements below.
- Root files remained unchanged immediately after dependency validation and final focused validation: `rust-service/Cargo.toml` SHA-256 `dd40850dc1d232e7555a64dc2bd9aaba0e7448d845f9ce0732845a5404c07a09`; `rust-service/Cargo.lock` SHA-256 `fa09fb406da6522b12b07f489947b793bdd48d4128cd86c0a0a9b2df4d67a4ea`.
- `git diff --check`: passed before the implementation commit.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0005 start`: failed on pre-existing missing decision links in other workstream instructions: `../../../decisions/0007-projected-reads-and-ambiguity-recovery.md` and `../../../decisions/0008-portable-wasm-client-boundary.md`. This report has no unresolved `TODO(required)` or `<!-- TODO` markers; shared iteration records were outside Wave 1 ownership and were not changed.
- Shared conformance and service round trips: not applicable in Wave 1 because no blob/summary protocol exists yet.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation harness | The first focused test invocation treated the disposable-only generated `Cargo.lock` as a source parity difference. | Parity command exited `1`; no tests ran and no source changed. | One validation invocation was lost. | Repeated parity excluding only generated `Cargo.lock` and `target`; all tests then passed. | Exact-copy dependency checks should define generated disposable artifacts explicitly before comparing source parity. |
| Tool reporting | A delegated commit command reported success although `HEAD` remained at kickoff and the crate was still untracked. | Direct `git rev-parse HEAD`, `git status --short`, and `git show` contradicted the summary. | Implementation was not committed on the first attempt. | Staged exact paths, printed staged/unstaged lists, committed directly, and verified `4407a10bd62b8fe40e23ed12b99868278b5bf568`. | Never accept summarized commit evidence without the resulting hash and direct status/content verification. |
| Cross-workstream validation | Iteration start validation found missing decision links in projected-read and browser-WASM instruction files present at kickoff. | Validator exit `1` named decisions `0007` and `0008`; this report's marker and diff checks passed. | Iteration-wide validator cannot pass from this workstream. | Preserved the failure and left shared records unchanged under Wave 1 ownership. | Run iteration validators early and distinguish workstream report defects from kickoff-wide record defects. |

## Contract and Integration Friction

Wave 2 depends on the projected-read/ambiguity-recovery workstream being integrated and an explicit coordinator handoff opening shared protocol/service/client ownership. The isolated API uses synchronous `Read` and filesystem handles; Wave 2 must adapt this to the accepted wire-level bounded or streaming request/response contract without weakening digest recomputation or ambiguous-outcome handling. Root workspace membership and the root lockfile remain untouched, so integration must add the crate and its dependency through the normal shared-manifest process.

## Human Interventions

The user constrained execution to Wave 1, supplied actual kickoff `c9106df9d9b`, prohibited root `Cargo.toml`/`Cargo.lock` edits, and required the protocol/service/client paths to remain read-only pending the projected protocol prerequisite. These constraints determined the standalone crate and disposable-copy validation approach.

## Measurements

Environment: Linux `6.8.0-1064-azure` x86_64 GNU/Linux; `rustc 1.98.1 (48a229cea 2026-09-01)`, LLVM `22.1.8`; debug profile; one deterministic run. These are implementation measurements, not production benchmarks.

- Small blob: payload `1,024` bytes; persisted `1,024` bytes; amplification `1.0x`.
- Large blob: payload `16,777,216` bytes; persisted `16,777,216` bytes; amplification `1.0x`.
- Two-entry summary manifest: persisted `94` bytes.
- Streaming copy buffer: configured and enforced at `65,536` bytes. The generated large input is never materialized by the example.
- Process `VmHWM`: `2,368` KiB before uploads and `2,528` KiB after; observed delta `160` KiB. This includes allocator/hash/filesystem overhead and is not solely the copy buffer.
- Direct dependency need: `sha2 = "0.10.9"` only. Disposable resolution: `sha2 0.10.9`, `digest 0.10.7`, `block-buffer 0.10.4`, `crypto-common 0.1.7`, `generic-array 0.14.7`, `typenum 1.20.1`, `version_check 0.9.5`, `cfg-if 1.0.4`, `cpufeatures 0.2.17`, and `libc 0.2.189`.
- Wall-clock Wave 1 interval: approximately 21 minutes from recorded start to report completion; detailed agent token usage is unknown.

## Proposed Decisions

No shared decision is proposed in Wave 1. Atomic immutable publication uses a same-filesystem hard link from a synced temporary file followed by directory sync; this remains an isolated implementation detail until Wave 2 integration review.

## Candidate Skills and Process Changes

Candidate coordination improvement: standardize an exact disposable-crate validation helper that copies source, permits only a generated disposable lockfile/target, prints checkout identity and command exit status, then immediately hashes protected source manifests. The first notable event shows the value of making generated-file exclusions part of that helper rather than improvising them per workstream.

## Remaining Work and Risks

- Wait for coordinator confirmation that projected-read/ambiguity-recovery is integrated and Wave 2 shared-path ownership is open.
- Add `crates/content-addressed` to the root workspace and add `sha2 = "0.10.9"` through the shared dependency/lockfile process; rerun workspace dependency review at integration time because the current evidence comes from a disposable lock.
- Define blob upload/fetch and summary publish/load protocol operations using the accepted bounded/streaming transport and stable error mapping.
- Wire service and client adapters to the isolated core, preserving server-side digest recomputation, pre-ack reference validation, duplicate idempotency, size limits, and ambiguous outcomes after publication.
- Add service round trips, applicable conformance, and protocol-level process interruption/recovery tests, then rerun all Wave 1 focused checks.
- Multi-process writers and store opening concurrently with active writes are unsupported in Wave 1; Wave 2 must either preserve single-writer ownership or add explicit coordination. Retention, pruning, leases, and GC remain out of scope.
