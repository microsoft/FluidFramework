# Iteration 0015 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0015`
Iteration base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Integration commit: pending by instruction; accepted workstreams are integrated
through `c16ff43e72f444893c7cfd651b22dc5d049a5600`, with the adaptations and
Phase 2 records below intentionally uncommitted

## Accepted Work

The complete accepted chain from kickoff through the integrated workstream HEAD
was reviewed as Git objects and compared with each workstream's writable scope:

1. `27bf6bde813606100a00bf180085e2a5ba3a0f08` starts iteration `0015` with the
	charter, manifest, five instructions and report templates, integration and
	Phase 3 templates, and quality inventory.
2. Core/session: `ef73fca6b8fc5023b78d89cd198230c17f4f0470`
	adds the two `sea-sequencer` tests;
	`3c1f5d506f7347bd9c0ea24f3de84d3bfa280777` completes the report; and
	`c88a010dea5219bab05b066256b6e68c01975841` removes duplicated template text
	from that report.
3. Storage: `4414b63b1ff1b0662eeda771be75f3cc2ef717a0` extends the `sea-file`
	snapshot-rejection test and completes the storage report.
4. Decorators: `b748f67bc430fa891b1782a6f4612483dc61d5d1` adds the
	`sea-stateful-compression` extended-frame assertion, followed by report commit
	`8f288b8f9b8edcc63265cf813e71f6ac5ab6f503`.
5. Transport: `568cc88135fc66e52993dbda9df75565749c0495` adds direct client decoder
	and same-connection server evidence, followed by report commit
	`c8bea24227a51fe9f5864c01f949684d99f02a8b`.
6. Workloads: `aa6c9fc157e2232ea2f25e10354d220e179b45fa` strengthens the benchmark
	and counter oracles, followed by report commit
	`c16ff43e72f444893c7cfd651b22dc5d049a5600`.

The committed delta from kickoff through `c16ff43e72f` contains only the five
reports and files owned by their workstreams. Both lockfiles are unchanged.
All five workstream worktrees were directly verified clean before integration.

## Rejected or Deferred Work

No workstream or workstream commit was rejected.

Six findings are deferred with concrete triggers in
[the quality inventory](../quality-inventory.md): partial file I/O recovery,
ambiguous sequencer append resolution, stale durable snapshot crash controls,
browser disconnect resource release, server connection-establishment timeout,
and injected-disconnect hook failure state. The first five are inherited. The
last is new and requires a consumer-semantic decision before a regression test
can select recovery behavior.

## Conflict Resolution and Adaptation

There were no source merge conflicts. The following integration-only
adaptations are pending commit on top of `c16ff43e72f`:

- The transport same-connection server test was fixed to compile and synchronize
	on response closure, then uses an explicit `ArchiveIntent::Create` follow-up.
	The focused test passes and now isolates survival of the parent connection,
	not merely listener or fresh-connection survival.
- The `sea-file` snapshot rejection cases were extracted into a matrix helper.
	The helper checks exact error discriminants and journal length after every
	case, preserving clean-reopen evidence while satisfying strict Clippy.
- `cargo fmt` normalized accepted touched code in `sea-core`, `sea-memory`,
	`sea-file`, `sea-sequencer`, the server test, and `sea-counter`.
- Strict integration Clippy exposed pre-existing `sea-sequencer` lints. A narrow
	`clippy::too_many_lines` allowance documents the existing 173-line async state
	machine; `is_empty` and branch-tail cleanups preserve behavior.
- Identical `sea-compression` test match arms were merged.
- The `sea-webtransport` README's nested list indentation was corrected.

These adaptations change test compilation, synchronization, formatting, lint
shape, and documentation only. No semantic runtime change is intended.

## Validation Evidence

Validation ran in the guarded integration checkout and passed:

- Focused `sea-file` snapshot-rejection and same-connection
	`sea-webtransport-server` tests passed after the adaptations. The server test
	proves a valid logical stream can be created on the same parent connection
	after the malformed stream closes.
- Package format checks, strict all-target/all-feature Clippy, warning-denied
	rustdoc, and all-target/all-feature tests passed for the accepted workstream
	packages. Canonical workspace format, strict Clippy, warning-denied docs,
	build, and tests also passed at integration.
- An independent integrated-diff review found no blockers.
- Worktree-local `pnpm install --frozen-lockfile` passed and changed neither
	`pnpm-lock.yaml` nor `rust-service/Cargo.lock`.
- `./test.sh` passed, including the Rust workspace and non-Rust generated WASM,
	TypeScript, and Chromium consumers.
- Repository-root `pnpm policy-check --path rust-service` and
	`pnpm build:fast` passed.
- Benchmark smoke passed, including two writers and memory/file snapshot modes.
	`cargo run -p sea-counter` passed and printed `recovered counter: 4`.
- `node scripts/check-documentation.mjs` passed.
- Final diff whitespace checking passed.

No retained machine-readable benchmark result was required. Generated WASM and
Node outputs were consumed by the exact downstream tests, remain ignored, and
produce no tracked diff.

## Contract and Regression Review

All accepted repairs are test-only and reinforce behavior already documented at
the owning boundary. No production contract, runtime implementation, public API,
wire or persistence format, dependency, manifest, or lockfile changed.

The reconciled inventory names the exact owning decision and nearest
discriminating test for all 47 inherited rows and the one new finding. Nine rows
were repaired: sequencer error mappings and inactive reference release; file
snapshot-rejection journal atomicity; stateful trailing-byte rejection; client
decoder validation; server same-connection stream isolation; reopened benchmark
payload integrity; and counter snapshot replacement and snapshot decoding.
Each repair has focused owning-crate evidence. Existing README or core contracts
already promise the behavior, so no additional contract prose was warranted.

The 33 `already adequate` rows were accepted only where the cited test would
fail if the named owner regressed in isolation, or where direct structural
evidence explains why no narrower test is meaningful. Conformance tests are
used for implementation-independent storage and session laws. Integration,
generated, executable, and browser layers remain only where they prove a
distinct process, adapter, output, or platform responsibility. The six gaps
that still need a fault seam, semantic decision, architecture authority, or
platform fixture remain deferred rather than being credited to topical broad
coverage.

## Cross-Workstream Findings

The exact-owning-decision challenge found nine practical evidence gaps without
finding a runtime defect or contradictory contract. Shared mapper and
conformance evidence remained valid only for their own laws and did not replace
focused wrapper, backend, protocol, or workload evidence.

The inherited durable claim required correction: `OpenAfterSnapshotRead` is
reachable but semantically misplaced before archive parsing, while all eight
`SnapshotAfter*` variants are unreachable. This remains an API/architecture
deferral, not an accepted repair. The only new material candidate is injected
disconnect-hook failure state, whose expected recovery behavior is not yet a
consumer contract. No unexpected implementation dependency remains for Phase 3.

## Artifact Check

All five active workstream reports are complete and correspond exactly to the
manifest. The committed workstream boundary ends at `c16ff43e72f`; the eight
adaptation files, this integration report, the quality inventory, and manifest
status are the intentional uncommitted Phase 2 artifact set. There are no
untracked or unexplained tracked files, and no commit was created as instructed.

Both lockfiles are unchanged. Workstream worktrees were directly verified clean
before integration. No owned endpoint or server process remains. Generated
outputs are ignored and clean with respect to tracked state. Temporary test
roots and Cargo targets retained by workstreams were removed or explicitly
accounted for. Phase 3 records remain templates and the iteration has not been
advanced to Phase 3.
