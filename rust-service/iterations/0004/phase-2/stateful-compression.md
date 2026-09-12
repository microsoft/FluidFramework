# Iteration 0004: stateful-compression Report

Status: complete
Branch: `rust-service-iteration-0004-stateful-compression`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-stateful-compression`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56`
Final commit: report completion commit (this commit); implementation tip `87c66b52b60`
Agent or owner: GitHub Copilot stateful-compression coding agent
Model and tool version: GitHub Copilot; model version unknown; rustc 1.98.1; cargo 1.98.1
Instruction source: [`instructions/stateful-compression.md`](./instructions/stateful-compression.md) at actual kickoff commit `30c4a06d7b456e135e046905553dd23d14326a56`; its generated `Iteration source commit` field is `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Session or transcript reference: none
Started and finished: 2026-09-12; exact elapsed time unknown

## Outcome

Implemented a bounded immutable-dictionary wrapper using maintained `zstd` 0.13.3. Every logical record and snapshot is one independent frame and one underlying operation, so receipts, opaque positions, boundaries, durability, capabilities, snapshot IDs, and lineage pass through unchanged. The frame is 21 bytes of wrapper metadata (`SSDZ`, version 1, 64-bit dictionary fingerprint, and 64-bit decoded length) followed by one zstd frame. Every record and snapshot is a restart boundary.

The adaptive previous-record design was rejected because the public contract provides no bounded predecessor traversal from `head`; rebuilding encoder state after reopen would require `read(None)` over retained history and fails if retention removes dictionary inputs. The accepted immutable-dictionary design needs no stream history and passed direct shared conformance, every-position reopen, isolated retained-record, snapshot, corruption, bound, deterministic-byte, and compression-before-encryption ordering tests. Confidence is high for contract transparency and the tested bounds, and moderate for workload value because dictionary quality is application-specific and timings are debug-build observations rather than benchmarks.

## Hypothesis Results

Initial hypothesis: an immutable caller-supplied dictionary, bounded by configuration and copied into each encoder/decoder operation, can improve repeated multi-record compression relative to independent zlib frames while preserving arbitrary-position reads, receipts, positions, record boundaries, snapshots, retention assumptions, and corruption classification. Each stored payload remains an independent frame; no prior record or retained prefix is required.

Cheapest disproof: run the shared conformance function directly over the wrapper, append a deterministic trace and resume after every returned position, reopen the wrapper over the same store, and repeat reads around snapshot and configured dictionary boundaries. Any changed receipt/position, missing or duplicate record, unavailable-history dependency, unbounded configured dictionary, or non-`Corrupt` malformed-frame result falsifies transparency. Identical seeded workloads compare persisted bytes and decoded values against per-record zlib.

Result: partially supported and bounded. The immutable dictionary reduced the repeated workload from 23,875 zlib bytes to 12,166 bytes while preserving all tested laws. It did not improve incompressible data: 40,448 dictionary bytes versus 35,584 zlib bytes. The adaptive-history form of the broader charter hypothesis was falsified by the retention/reopen counterexample; no kernel change was made to rescue it.

## Deliverables and Commits

1. `5cb5a4f692de88d693f5433c1a53a432bf07023d` (`feat(rust-service): add bounded dictionary compression`) adds the crate, immutable-dictionary frame, public errors, direct conformance and position-codec conformance, every-position reopen, isolated retention, snapshots, corruption, payload-bound, deterministic comparison, and encryption-order tests, plus pre-implementation provenance.
2. `87c66b52b6013dac487e95ded6997531262084a2` (`fix(rust-service): bound dictionary decoder memory`) adds the 128 MiB global decoded ceiling and configures zstd `WindowLogMax` from the per-instance payload/dictionary bound.
3. This report completion commit records final evidence and disposition.

## Validation Evidence

- Exact disposable copy: `rsync -a --delete --exclude target/ /workspaces/FluidFramework-rust-service-iteration-0004-stateful-compression/rust-service/ /tmp/ff-stateful-compression-validation/`, followed by temporary registration of `crates/wrappers/stateful-compression` only in the copy. Test evidence run ID `2026-09-12T16:54:04.152765463Z` identified branch `rust-service-iteration-0004-stateful-compression`; `CARGO_TARGET_DIR=/tmp/ff-stateful-compression-target cargo test --manifest-path /tmp/ff-stateful-compression-validation/Cargo.toml -p snapshotted-stream-stateful-compression --all-features -- --nocapture` exited `0`: 10 passed, 0 failed, 0 ignored; doc tests 0 passed, 0 failed.
- Direct shared checks passed without copied conformance logic: `passes_shared_conformance_directly` and `passes_position_codec_conformance_directly`.
- Focused checks passed: every one of 18 starts (`None` plus after each of 17 positions) after wrapper reopen; one retained frame decoded without its two-record prefix; snapshots at `Initial`, first, and second restart positions reopened; empty and 16 KiB records round-tripped; 16 KiB + 1 was rejected before append; malformed, truncated, and wrong-dictionary frames classified `Corrupt`; two independently encoded seeded traces had byte-identical persisted frames; and a test encryption layer stored no visible compression magic while records and snapshots round-tripped.
- Unique quality copy `/tmp/ff-stateful-quality-fa38fc21` run ID `2026-09-12T16:54:35.697712788Z`: assigned and copied `src/lib.rs` SHA-256 both `3120147d3a6d29411bbd276115a7b95a01e60575fd2bec9efc114e8eb7fdfc7c`. `cargo fmt --manifest-path ... --package snapshotted-stream-stateful-compression -- --check` exited `0`. `cargo clippy --manifest-path ... -p snapshotted-stream-stateful-compression --all-targets --all-features -- -D warnings` exited `0` in 5.58 seconds.
- Every accepted disposable run printed the exact source path/branch and showed no assigned-worktree status for `rust-service/Cargo.toml` or `rust-service/Cargo.lock`. Neither shared file was edited or committed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified design | Adaptive dictionary derived from preceding records | `AppendStream::head` returns only an opaque position and `read` supports forward reads; reopening cannot recover a bounded predecessor window without reading from the retained beginning. Retention may make earlier dictionary inputs unavailable. | A prior-record adaptive context would require unbounded replay or undocumented retention and cannot satisfy the stopping conditions. | Rejected before implementation; test the immutable bounded dictionary design instead. | For transparent random-access wrappers, derive decode state solely from immutable configuration and the selected physical record unless the storage contract explicitly exposes restart metadata and bounded predecessor access. |
| Validation failure | Initial compile after implementation | Rust errors `E0220` for unconstrained `S::Error` and `E0308` for constructing a generic wrapper with `inner: ()`. | No tests ran on the first attempt. | Pure frame helpers now return codec-only errors and read closures decode directly from captured immutable configuration; the next focused run passed all 10 tests. | Keep transform codec errors independent of generic backing-store errors when the transform is also used inside mapped readers. |
| Bound gap | Decoded output was capped but the zstd frame window was initially unconstrained | Review of `zstd::bulk::Decompressor::set_parameter` found maintained support for `DParameter::WindowLogMax`. | A malicious frame could request decoder history beyond the intended output bound, weakening the bounded-memory claim. | Added a 128 MiB global payload ceiling and per-instance window-log limit; tests, format, and strict Clippy passed afterward. | For compressed untrusted input, bound both output allocation and codec history/window parameters.
| Tooling/workaround | Shared terminal and delegated commands repeatedly ran in sibling worktrees or returned stale/absent evidence | One check identified `benchmark-baseline`; another copied the repository root; shared terminal output contained service-assembly and encryption commands. | Several apparent validations were discarded as inadmissible. | Used atomic scripts, unique `/tmp` paths, run IDs, explicit branch/HEAD, source-copy SHA-256 comparison, persisted outputs, and explicit assigned shared-file status. | Multi-worktree concurrent validation needs unique artifact paths and self-identifying output, not terminal cwd or summary-only evidence. |

## Contract and Integration Friction

The public contract cannot support a transparent adaptive prior-record dictionary after arbitrary retention/reopen because it has no bounded predecessor lookup or restart-metadata channel. The immutable dictionary avoids that limitation without shared API changes, but the same dictionary bytes must be provisioned durably out of band when reopening. Integration must register the new crate and regenerate the shared lockfile; this branch intentionally does neither. The encryption workstream was not available at this kickoff, so the composition test uses a test-only reversible transform to prove ordering and transparency, not cryptographic correctness.

## Human Interventions

None.

## Measurements

- Environment: Debian GNU/Linux 13, Linux 6.8.0-1064-azure x86_64, AMD EPYC 7763 64-Core Processor, rustc 1.98.1, cargo 1.98.1, debug test profile. Exact elapsed workstream effort is unknown.
- Seeded repeated workload: 256 records, 28,672 logical bytes. Immutable-dictionary zstd persisted 12,166 bytes (42.43% of logical); independent zlib persisted 23,875 bytes (83.28%). Dictionary framing was 49.04% smaller than zlib. One debug observation recorded 3,771 microseconds dictionary encode time and 42,289 microseconds zlib encode time; this is diagnostic only, not a stable benchmark.
- Seeded incompressible workload: 256 records, 32,768 logical bytes. Immutable-dictionary zstd persisted 40,448 bytes (123.44% of logical); independent zlib persisted 35,584 bytes (108.59%). Dictionary framing was 13.67% larger than zlib. One debug observation recorded 4,696 microseconds dictionary encode time and 41,098 microseconds zlib encode time.
- Hard bounds and retained state: dictionary at most 65,536 bytes; decoded record/snapshot bound configurable from 1 byte through 134,217,728 bytes; decoder `WindowLogMax` is the ceiling log2 of the larger configured payload bound, dictionary length, or 1,024 bytes. Wrapper metadata is 21 bytes per independently restartable record/snapshot. No prior stream record is retained by the wrapper.
- Resolved maintained codec: direct `zstd` 0.13.3 with default features disabled, resolving `zstd-safe` 7.3.0 `std` and `zstd-sys` 2.1.0+zstd.1.5.7. Baseline dev comparison resolved `flate2` 1.1.10 with `rust_backend`/`miniz_oxide`.

## Proposed Decisions

No shared semantic or API decision is proposed. Integrate the immutable-dictionary experiment as an optional wrapper; do not describe it as adaptive cross-record state or add predecessor/restart semantics to the kernel based on this workstream.

## Candidate Skills and Process Changes

Extend the multi-worktree validation procedure to require a unique disposable-copy path, unique target path, run ID, explicit source branch/HEAD, source-to-copy checksum for owned files, persisted full command output, and assigned manifest/lock status. This is supported by the validation-misrouting event above; explicit `git -C` alone did not prevent shared-terminal command replacement.

## Remaining Work and Risks

- Integration must add `crates/wrappers/stateful-compression` to the root workspace and regenerate `Cargo.lock`; expected new production packages are zstd 0.13.3, zstd-safe 7.3.0, zstd-sys 2.1.0+zstd.1.5.7 and their native build dependencies.
- Dictionary selection, version rollout, and durable distribution are application policy. A reopened wrapper with a different dictionary fails closed as `Corrupt`; the 64-bit FNV-1a fingerprint detects accidental mismatch but is not collision-resistant authentication.
- zstd framing is not a cryptographic integrity layer. The tests prove malformed/truncated/wrong-dictionary classification, not detection of every adversarial bit change. Production encryption/authentication must remain outside this compression wrapper, with compression applied first, and must not mix secrets with attacker-controlled adaptive context.
- Incompressible 128-byte records expanded by 23.44% and were 13.67% larger than zlib in the seeded comparison. Callers need workload evidence and may require an explicit bypass policy in a future iteration; no adaptive fallback was added here.
- The composition fixture uses XOR solely to verify transform ordering. Integration should add a direct composition test against the accepted encryption crate after that workstream is available.
- No unfinished artifacts remain in the authorized paths. Recommended disposition: accept with the limitations above; confidence is high for tested contract behavior and bounded restart independence, moderate for general compression benefit.
