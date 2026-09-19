# Iteration 0017 Phase 2 Integration

Status: Phase 2 accepted; validation and artifact checks complete.
Integration branch: `rust-service-iteration-0017`
Iteration base commit: kickoff `cc2abb85cefb3a29e9b7d75e62986dff83e75680`; approved source `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`.
Integration HEAD: `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`.
Integration commit: the commit containing this completed report is the immutable Phase 2 boundary; Phase 3 records its hash.

## Accepted Work

The coordinator inspected the committed Git objects and changed-path ownership before merging the three independent workstreams in the order below from clean checkouts without conflicts.
The [inventory](../quality-inventory.md#reviewed-boundaries) reconciles exactly two reviewed boundaries from each report.

| Workstream / commit | Accepted scope | Ownership and evidence |
| --- | --- | --- |
| [Signals](signals.md): `07dada7abbb` | One test-only routing repair; slow-receiver policy already adequate | [Relay module](../../../../crates/sea-signals/src/lib.rs) and own report; scoped 6-test suite, Clippy/fmt, and native integration pass |
| [Transport](transport.md): `83e39e44d0e` | Report only; bounded admission adequacy, deferred no-grace callback assertion and browser physical release | Own report only; scoped 21 + 25 tests, Clippy/fmt, and native integration pass; no platform proof |
| [Recovery](recovery.md): `f0a90d78272` | One test-only failed-reconciliation terminal-leave repair; file uncertainty/recovery already adequate | [Sequencer fault tests](../../../../crates/sea-sequencer/src/fault_tests.rs) and own report; scoped 7 + 3 + 23 tests and Clippy/fmt pass after layout correction; native integration pass |

Commit and ownership verification is complete; the [durable execution evidence](../execution-evidence.json) records accepted command results and coordinator validation.
No production behavior, API, dependency, manifest, lockfile, or shared product contract change is accepted.

## Rejected or Deferred Work

No branch or repair was rejected.
Admission timeout, capacity release, listener survival, and cleanup counts have bounded adequate evidence, but `connection_closed(false)` is not directly observed by either admission test.
Defer that specific no-reconnect-grace callback slice to the transport owner when an executable recording-service fixture is authorized or admission/cleanup policy changes.
Defer browser physical release to coordinator and WASM/browser owners until test-only lifetime controls and bounded server cleanup/capacity observation are approved.
Explicit disconnect with the owner retained and final-owner drop need separate discriminating cases; logical reopen, factory-open counts, server shutdown, and native success do not prove either case.
Lower-ranked candidates and unchanged scope exclusions remain in the [inventory](../quality-inventory.md#deferred-candidates); no new iteration, production API, fixture expansion, or push is authorized.

## Conflict Resolution and Adaptation

No merge conflicts or integration-only product adaptations were reported.
Recovery's initial scoped run passed tests and Clippy but failed formatting on one observer/head chain; the coordinator applied the exact rustfmt layout and reran the same checks successfully.
The Phase 2 boundary includes the integration report, quality inventory, manifest, execution evidence, and transport report reconciliation.
Draft Phase 3 changes are kept outside that commit.

## Validation Evidence

### Native Integration

The coordinator validated the raw JSON and nonempty log; accepted metadata is retained in [execution evidence](../execution-evidence.json).
Raw local-only artifacts are `rust-service/target/iteration-0017-evidence/integration-native-1789848498902-93371f6b-9371-4652-b5bb-0139bf63ee70/{result.json,output.log}` under the integration checkout; they are ignored and nonportable.
The result records runner PID `468306`, owner/environment `integration`, branch and HEAD above, checkout `/workspaces/FluidFramework-rust-service-iteration-0017`, cwd its `rust-service/` directory, and empty run-start status.
Run `1789848498902-93371f6b-9371-4652-b5bb-0139bf63ee70` started at `1789848498903`, finished at `1789848650901` Unix ms, elapsed 151.998 seconds, final exit `0`.
All six recorded commands exited `0`:

| Command | Observed outcome |
| --- | --- |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Pass |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Pass; runner source explicitly sets the override and the recorded native mode confirms that path |
| `cargo build --workspace --all-targets` | Pass, including example target compilation |
| `cargo test --workspace --all-targets --all-features` | 174 passed, 0 failed, 0 ignored across 18 test binaries, two with zero tests |
| `node scripts/check-documentation.mjs` | Pass: 30 roots, 37 READMEs, 89 local links; predates this record edit |

The log's nonzero suite counts are 4 + 9 + 5 + 7 + 10 + 5 + 12 + 7 + 3 + 12 + 23 + 23 + 6 + 2 + 21 + 25 = 174.
This includes both new tests by name, existing local fault/policy tests, conformance invocations, 12 session-composition tests, and 5 counter-example tests.
The file fault test logged a greater-than-60-second notice and then passed; its suite took 61.48 seconds.
Example unit tests/builds are not a standalone example run, and native adapter tests are not fresh generated-consumer or browser execution.
The coordinator verified result/log attribution and success with no output misattribution.
Command identities, clocks, and exits come from JSON; test totals and named outcomes come from logs, not JSON command metadata alone.

### Scoped Execution and Scheduling

The early delegate probe returned `tool_search` unavailable; no direct delegate `run_task` execution or autonomous scheduling is claimed.
The coordinator launched compound task `rs17-parallel-checks` and validated raw JSON, nonempty logs, three distinct process IDs, and actual overlap.
The [durable execution evidence](../execution-evidence.json) retains exact run metadata and raw local paths; no output misattribution was observed.

| Check | Runner PID | Start (Unix ms) | Duration | Result |
| --- | --- | --- | --- | --- |
| [Signals](signals.md#validation-evidence) | 450349 | 1789847965169 | 15.168 s | Exit 0; 6 tests, Clippy/fmt pass |
| [Transport](transport.md#validation-evidence) | 450351 | 1789847965170 | 83.026 s | Exit 0; 46 tests, Clippy/fmt pass |
| [Recovery initial](recovery.md#validation-evidence) | 450353 | 1789847965171 | 19.816 s | Exit 1; 33 tests and Clippy pass, fmt fails |
| [Recovery rerun](recovery.md#validation-evidence) | 459631 | 1789848085439 | 2.295 s | Exit 0; 33 tests, Clippy/fmt pass |

Recovery rerun ID: `1789848085438-b9ce5126-fd8e-4a86-8a8d-d3e6bbb4ce27`.
Brief Cargo package-cache lock contention was reported, not terminal interference; each run retained attributable status and logs.
Cancellation tooling was unavailable and no cancellation was attempted.
There is no comparable sequential baseline, so overlap does not establish a throughput improvement or an upstream tool fix.

### Full Integration

The coordinator directly parsed final result `integration-full-1789848676088-f31e277c-8f10-4a4f-b9b3-18a9f439bc33`, verified exit `0`, all four command exits `0`, and exact HEAD `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`.
Runner PID `482925` started at `1789848676089` and finished at `1789849276964` Unix ms; total duration was 600.875 seconds.
Checkout, branch, cwd, and empty run-start status match native integration.
The first three commands ran at the integration repository root; the test script ran in its `rust-service/` directory.

| Command | Duration | Observed outcome |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 25.483 s | Exit 0 |
| `pnpm policy-check --path rust-service` | 2.386 s | Exit 0 |
| `pnpm build:fast` | 513.796 s | Exit 0 |
| `./test.sh` | 59.146 s | Exit 0; coordinator inspected the output ending and accepted generated, Node, and Chromium task success |

See [execution evidence](../execution-evidence.json) for exact command metadata and coordinator validation.
Raw local-only artifacts are `rust-service/target/iteration-0017-evidence/integration-full-1789848676088-f31e277c-8f10-4a4f-b9b3-18a9f439bc33/{result.json,output.log}` under the integration checkout.
Consumer outcomes are established by the inspected output, not inferred from JSON exits alone.
The broad browser pass does not close the specific physical-release deferral.

### Final Record Checks

Post-edit `validate-quality 0017`, `validate 0017 phase-2`, documentation checks, scoped policy, and whitespace checks passed.
The coordinator also checked 186 local links and anchors, unique report titles, and all nine retained execution records against raw results.
Native and full command gates, warnings-denied rustdoc provenance, and committed-object ownership acceptance are complete.
Editor diagnostics were not used as a substitute for these checks.

### Record Initialization

The coordinator tested `init` followed by `init-quality`.
An early `validate-quality` attempt failed because the kickoff table was empty; a temporary explicitly unreviewed row was used and is now removed in favor of the six evidenced rows.
Quality validation is a closeout check, not a mandated start check; this workaround is not an adequacy finding or a reason to retain placeholder rows.
Final quality and Phase 2 record checks passed; the six-boundary inventory is complete.

## Contract and Regression Review

The [six inventory rows](../quality-inventory.md#reviewed-boundaries) link precise existing contracts, owning decisions, named tests, and validation.
Signals' `document_scoped_routing_preserves_recipients_and_envelopes` uses live matching destinations in two rooms, exact envelopes, and empty live nonrecipient queues to distinguish routing and identity defects.
Recovery's `failed_reconciliation_prevents_terminal_leave_until_recovery` independently crosses failed head/read reconciliation with close/shutdown on announced membership; errors, append counts, exclusive ownership, and recovered replay discriminate false finality without hiding shutdown behind an earlier close.
Existing slow-receiver tests directly discriminate reliable-only eviction and terminal/departure notification; existing file tests discriminate poison guards, failure classification, exact recovered prefixes, and buffered/durable tail policy.
Admission capacity/listener/count evidence is adequate only for those decisions: changing the no-grace callback argument need not fail current tests.
Shared conformance and native composition prove distinct responsibilities, not substitutes for local diagnosis or browser physical release.

The independent read-only review examined both new tests against kickoff and the transport claims, found zero high-confidence issues, and judged both tests discriminating.
It specifically noted that admission counters cannot prove cleanup callback invocation/`false` and did not claim browser proof.
Review limitations: static inspection only, no commands, mutation runs, independent runtime validation, or browser execution.
Only test code changed in the owning production crates; existing documentation already states the behavior, so no new production documentation is needed.
Test-only repairs and reports change no user-facing behavior or API; no changeset is required.

## Cross-Workstream Findings

No shared product-semantic decision is needed; none changed, and no product decision record is missing.
Shared execution-skill refinement is deferred to Phase 3, including the unavailable delegate discovery path, coordinator compound scheduling, attributable evidence, and quality-validation timing.
Skill refinements are excluded from the Phase 2 commit; observed overlap is not evidence of autonomous delegation or improved throughput.
The common evidence lesson is to observe the owning decision: live delivery controls, announced membership before terminal failure, callback arguments rather than counts, and physical release rather than logical reopen.
No shared implementation dependency or duplicated repair mechanism was introduced.
The coordinator reconstructed the transport report after attempted replacements appended duplicate drafts.
Direct title-cardinality and record checks confirm one report; its accepted evidence is preserved.

## Artifact Check

All three active reports and committed-object ownership are accounted for; native and full results record clean run-start checkouts at the stated HEAD.
Only intended closeout records and Phase 3 skill/issue/learning changes remain before their separate commits.
Shared lockfiles are unchanged; no generated outputs or dependency changes are included.
The temporary inventory row is removed, leaving six genuine reviewed boundaries.
All owned process tasks completed and their temporary registration was removed; the main task configuration matches its original contents exactly.
No dependency symlinks were used; frozen-install dependencies and ignored build outputs remain worktree-local.
The ignored task runner and raw evidence are retained for diagnosis, not treated as portable records.
No owned validation process remains running, and no persistent environment override was introduced.
