# Iteration 0019 Phase 2 Integration

Status: phase-2 complete
Integration branch: `rust-service-iteration-0019`
Iteration base commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Validated implementation HEAD: `8adaea1dfc8`
Integration commit: the commit containing this completed report; its hash is recorded by the next phase
Manifest status: `phase-2-complete`

## Accepted Work

Discovery and cross-crate evidence commits were already present in integration history.
The following source commits were integrated in dependency order and mapped to the resulting
integration commits:

| Workstream | Source commit | Integrated commit | Paths and decision |
| --- | --- | --- | --- |
| foundations | `a9eddb51f45` | `757b5ca6f56` | Report-only rejected-checkpoint evidence. `FND-CA-001` production was fully reverted before integration; no foundations source repair was accepted. |
| persistence | `d843b8b422e` | `73d42e8f291` | Accepted `PERSIST-IMPL-001` in `crates/sea-file/src/storage.rs` plus its report: one private snapshot encoder owns bytes used by buffered and durable publication. |
| sessions | `767f93d8911` | `51ebbfcaffb` | Accepted `SESS-001` in `crates/sea-encryption/src/session.rs` plus its report: prepare ciphertext from a borrow, then move the original submission. |
| consumers | `8ec1f74fce9` | `8adaea1dfc8` | Accepted `RS0019-CONS-001` in `crates/sea-benchmarks/src/main.rs` plus its report: remove an unused parameter and six arguments. |

The three accepted source repairs use three of the four permitted repair slots.
The foundations report mapping does not consume a slot because checkpoint review rejected and
fully reverted its source change.

## Rejected or Deferred Work

The [simplification inventory](../simplification-inventory.md#reviewed-candidates) is the
candidate-level source of truth and avoids double-counting the cross-crate reconciliation.

- **Rejected (24):** includes selected `FND-CA-001`, which changed pre-hash rejection order and
  was fully reverted; false sharing across platform bounds, append modes, public traits,
  persistence workers/publication/cursors/budgets, transform adapters and fixtures, lifecycle
  states, transport roles/platforms/listeners/configuration, generated streams, integration
  scenarios, benchmark utilities, and example replay; and `TR-003`, whose genuine wire-value
  agreement lacks a simpler narrow non-public owner.
- **Deferred after assessment (9):** `FND-NAME-001`, `FND-MEM-001`,
  `FND-CA-002`, `PERSIST-ORG-001`, `SESS-002`, `TR-001`, `TR-002`,
  `RS0019-CONS-002`, and `RS0019-CONS-005`.
  These are assessed opportunities with explicit terminology, performance authorization,
  lossless-move, typed-prototype, generated/browser, or timer-boundary revisit triggers;
  they are not unreviewed work.
- **Excluded (5):** `PERSIST-NAME-001`, `SESS-007`, `TR-007`, `TR-008`, and
  `RS0019-CONS-007` were outside the permitted API constraint or below the Conservative
  value threshold.
- **Already proportionate (2 candidate groups):**
  `FND-CORE-003` / `FND-MEM-003` / `FND-CONF-001` preserve distinct
  composition, private-state, and substitutability test layers; `TR-010` preserves distinct
  architecture, caller, deployment, authorization, and shutdown documentation.
- **Unreviewed:** none. All 15 workspace members and all six enabled categories completed
  Wave 1 discovery and assessment.

The vacated fourth repair slot was not backfilled.
The accepted codec owner, runtime clone removal, and dead-input removal outranked deferrals
because each removed a concrete mechanism or false concept at one owner with strong independent
tests and no new abstraction, public surface, generated boundary, performance policy, or
measurement ambiguity.

## Conflict Resolution and Adaptation

No source conflict, shared-manifest edit, lockfile adaptation, generated change, public API
change, protocol change, or cross-crate implementation was required.
The source, kickoff, checkpoint, and integration commits retain distinct provenance:
the approved source remains `575b77e825e598b15b7740f56956fe433a6153d8`;
workstream reports retain their operational kickoff; each checkpoint records its own fixed base;
and the table above records source-to-integrated mapping.

Integration preserved workstream checkpoint content.
The only repair-cycle adaptations were evidence corrections in cumulative reports:

- foundations repair cycle 1 restored production exactly after a blocking review finding;
- persistence repair cycle 1 corrected stale validation prose;
- sessions cycles 1 and 2 corrected provenance/dirty-path and validation contradictions;
  after the normal two-cycle allowance was exhausted, the user authorized exceptional
  report-only cycle 3 to correct a stale cycle header and obtain a fresh review; and
- consumers repair cycle 1 corrected stale validation prose.

No report-only cycle changed source or invalidated focused test evidence.

## Validation Evidence

### Focused checkpoint validation

| Checkpoint | Guarded result |
| --- | --- |
| Foundations post-revert | Formatting passed; 13 `sea-content-addressed` + 21 `sea-core` + 31 `sea-memory` + 0 standalone `sea-conformance` = **65 passed, 0 failed**. Production matched the fixed base; no lockfile change. |
| `PERSIST-IMPL-001` | Formatting passed; 59 `sea-file` unit tests + 1 process-locking integration test = **60 passed, 0 failed**. No out-of-scope or lockfile change. |
| `SESS-001` | Formatting passed; 7 compression + 17 encryption + 70 sequencer + 11 signals = **105 passed, 0 failed**. Editor diagnostics were clear; no out-of-scope or lockfile change. |
| `RS0019-CONS-001` | Formatting passed; benchmark targets, counter, integration composition, and WASM = **49 passed, 0 failed**. No out-of-scope or lockfile change. |

### Canonical integration validation

All gates ran against integrated implementation HEAD `8adaea1dfc8`:

| Required gate | Status |
| --- | --- |
| `cargo fmt --all -- --check` | **passed** |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | **passed** |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | **passed** |
| `cargo build --workspace --all-targets` | **passed** |
| `cargo test --workspace --all-targets --all-features` | **passed** |
| `node scripts/check-documentation.mjs` | **passed:** 29 roots, 55 documents, 330 local links |
| `./test.sh` | **passed on exact rerun** after restoring missing Routerlicious dependencies |
| Repository-root `pnpm policy-check --path rust-service` | **passed on exact rerun** |
| Repository-root `pnpm build:fast` | **passed:** 1,857 tasks |
| `iteration-records.mjs validate 0019 phase-2` | **passed** |

The first policy attempt failed because the fresh worktree lacked local
TypeScript dependency links.
`pnpm install --frozen-lockfile` restored the root workspace without changing a
lockfile; the exact policy rerun and `pnpm build:fast` then passed.

The first `./test.sh` attempt reached 29 passing integration tests and passing
browser evidence, then failed the Tinylicious benchmark because
`server/routerlicious` dependencies were absent.
`pnpm install --frozen-lockfile` in that workspace restored the missing local
dependencies without lockfile changes.
The exact `./test.sh` rerun passed all ten package `test:all` tasks, including
Mocha and the real Chromium WebTransport harness.
No benchmark campaign is claimed.

## Contract and Regression Review

### `PERSIST-IMPL-001`

The persisted snapshot contract remains tag `4`, big-endian public event position, and typed
tree identity.
Buffered publication remains visible at admission; durable publication still validates
dependencies and order, appends and synchronizes before visibility, and poisons uncertain
failure.
Recovery, lookup, physical offsets, workers, and platform behavior are unchanged.
`fixed_snapshot_layout_matches_encoding_and_checks_ordinal_arithmetic` constructs expected
bytes independently rather than calling `SnapshotRecord::encode`.
The foreign/nonadvancing dependency, buffered ordering, ambiguity/recovery, and process-locking
tests preserve owner-local and OS-process diagnosis; conformance is not used as a substitute.

### `SESS-001`

Encryption still occurs before the submission moves to the inner session, and the same
`author_terminal` guard owns preparation and append.
Nonce/context construction, fresh encryption, references, stored-tree identity, metadata, and
error/cancellation fail-stop behavior are unchanged.
The four named encryption tests independently exercise metadata/tree preservation, key failure
across clones, fresh equal-submission encryption, and cancelled preparation.
Compression/conformance coverage remains a distinct transform/substitutability layer and cannot
mask encryption-owner regressions.

### `RS0019-CONS-001`

`open_local_sessions` still recovers one sequencer and creates exactly the requested sessions
in order.
Benchmark configuration, fixtures, schema, guarantee labels, diagnostics, timers, generated
surfaces, and output are unchanged.
Concurrency, file recovery, and reopened snapshot tests execute the affected helper paths;
their expectations do not depend on the deleted identity labels.
No benchmark campaign is needed for removal of an unread input because measured phases and
operations are unchanged.

### Rejected `FND-CA-001`

Checkpoint review established that the attempted one-pass call hashed oversized input before
the configured rejection.
The exact source revert restores encode, size check, then identity calculation.
Bounds/corruption, identity-mismatch, and reopen tests retain literal independent limits and
identities, but did not detect hashing order; the review finding is therefore retained as the
revisit safeguard rather than claiming those tests proved performance preservation.

No inherited test was removed or weakened.
Independent expected persisted bytes, wire values, encrypted envelopes, benchmark fixtures, and
counter formats remain independent from production helpers.
All final checkpoint reviews had no actionable findings.

## Checkpoint Review Record

| Checkpoint | Fixed base | Final reviewed patch | Findings and disposition |
| --- | --- | --- | --- |
| `FND-CA-001` | `50114459e5b` | `0a129127634a070772390d3685513c494ad87b926a525f59f672231a223fcfd9` | Blocking Medium performance-order regression: hashing moved before oversize rejection. No compliant current API avoided the duplicate encoding. Production was fully reverted and the candidate rejected. Final review: no actionable findings. |
| `PERSIST-IMPL-001` | `142cefda415` | `65574472f3cb21c1eb6ba5b2aa32191e7a37d795a0da9349af6356b0e77a79fe` | Source was sound; blocking report-only contradiction misstated successful validation. Cycle 1 corrected the report. Final review: no actionable findings. |
| `SESS-001` | `e25b4e46566d67189dd6530a09e9a20bc565ea78` | `dab753ca90d9ca066adce8d002a869c58748805c032894591403a88f89e24797` | No runtime regression. Medium report provenance/dirty-path issue, then stale validation text, then stale cycle header. Cycles 1-2 were report-only; the user authorized exceptional report-only cycle 3 after the normal allowance. Final review: no actionable findings. |
| `RS0019-CONS-001` | `94a1d5a36f9` | `e0552bfdac15d5beaa003e3cdd2b15da02e5a142fdaf894f6ca15d61d7de4804` | Source was sound; stale report statements contradicted successful validation. Cycle 1 corrected only the report. Final review: no actionable findings. |

## Cross-Workstream Findings

- Required agreement is not sufficient to justify sharing: `TR-003` would add a callable
  cross-crate surface for four small conversion functions.
- Similar transform, queue, lifecycle, persistence, transport, capacity, and test-fixture code
  protects independently evolving contracts; the run rejected these false-sharing proposals.
- Owner-local focused tests, conformance, integration, and generated/browser tests retain
  distinct responsibilities and must not be substituted for one another.
- The selected foundations optimization exposed a gap in existing tests for work-before-error
  ordering. Fixed-base review prevented that performance regression and the source was reverted.
- Cumulative report handoffs repeatedly left stale provenance or validation prose.
  These were report defects, not source defects; the sessions report required a user-authorized
  exceptional report-only third cycle.
- No shared architectural decision, API change, dependency change, or generated-binding change
  resulted.

## Artifact Check

**Phase 2 artifact check: complete.**

All six active workstream reports are present and reconciled:
`foundations`, `persistence`, `sessions`, `transport`, `consumers`, and `cross-crate`.
The inventory accounts for all 15 workspace members, all six Conservative categories, every
material candidate, the three accepted source repairs, and the fully reverted foundations
checkpoint.
Discovery and cross-crate evidence commits are already in history.

All six workstream checkouts were clean before removal.
Stable patch IDs matched every source/integrated mapping listed above, including
transport discovery and cross-crate reconciliation.
No workstream process or review still required those checkouts, and all six
worktrees were removed without force; their branches remain as recorded
history.
The integration checkout contains only these Phase 2 record updates beyond the
validated implementation.
Dependency restoration created ignored local installations only; no manifest
or lockfile changed.
No owned process or temporary symlink remains.
The Phase 2 record validator passed before the integration boundary commit.
