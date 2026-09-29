# Iteration 0020 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0020`
Integration worktree: `/workspaces/FluidFramework-rust-service-iteration-0020`
Iteration base commit: `b06b46be6b88723ea64f4ef1a77a5895781c21bc`
Integrated source HEAD: `2e6d36a0b7cc798bb06d69566243db2bf192a4a4`.
Integration acceptance commit: `9f64365338a1c317a31ccccd9031ac2f9286fd39`.

## Accepted Work

Sessions handoff accepted as `15a5c95ae79da5dffcf91af3ea84fa15e817695d` and fast-forwarded unchanged into integration.
The coordinator inspected every test hunk and confirmed the changed paths match ownership.
Frozen source/report patch SHA-256: `1252e3be7f31ced00eec9062adc5e438bac556ffe79e2b03c68601826c823e21`.
The [sessions report](sessions.md) records the full four-crate incremental coverage and five repaired evidence gaps.
No production behavior changed in that handoff.
Consumers source `4384351b75de72ef29e4655c4d7cb2b873492d4e` maps to integration `c5c442366f8098e7a738bffaef341d23a4ef0015`.
Frozen patch SHA-256: `9175a8d0c5a290e4cfe033cedc50d1c17a86c1f30985aac46e8940743003387e`.
Every source hunk was inspected; the three benchmark source files and report are within ownership.
The source and integrated owned trees compare equal.
The [consumers report](consumers.md) records the four-member scope, three repaired evidence gaps, and the private writer seams needed to exercise the real decisions.

Foundations source `733de6eafc1acfd1b7fbad5c821b63644e8851d1` maps to integration `4f4212ca026a1b7f6694885add228ebd731ed419`.
Frozen patch SHA-256: `fd50ecc90b6d4f03b7e3b92f9213c718fa98ca70c332eabb47845767310f29ad`.
Every source hunk was inspected; all five changed files are within ownership and the source/integrated owned trees compare equal.
The [foundations report](foundations.md) records all five members, one documentation correction, and four focused evidence repairs.
Transport source `2084fc1aface770a260e09375efaaa271080234c` maps to integration `2e6d36a0b7cc798bb06d69566243db2bf192a4a4`.
Accepted patch SHA-256: `97d5af868a159450b8677edb464bb540f93c2e1f88dc68becc8dd92622446df5`.
The five accepted source/report paths are within ownership and their source/integrated trees compare equal.
The [transport report](transport.md) accounts for both members, four focused evidence repairs and one stale contract description.
The five files containing the deferred API proposal compare exactly to kickoff before acceptance.

## Rejected or Deferred Work

The user explicitly deferred the proposed compound Rust client errors and associated timeout-classification fix.
[Decision 0030](../../../decisions/0030-defer-compound-client-errors.md) records the alternatives, experiment and revisit trigger.
The defect remains in accepted source and is recorded in [Known Issues](../../../../KNOWN_ISSUES.md#client-timeout-classification-can-be-lost-when-cleanup-fails).
The original experimental patch is preserved outside the worktrees as `transport-frozen.patch`, SHA-256 `97c5cf4a2df86c9f768631d7c3d3b16844be57a5ed81a67f5e4b19e8e1f45c72`.
It is not the accepted transport snapshot.
No review area was dropped or converted to a repair deferral.

## Conflict Resolution and Adaptation

There were no merge conflicts during integration.
After initial review, the coordinator added one test-only adaptation in server resource policy to cover byte-only session/reader admission; the original workstream-to-integration mappings above describe the handoffs before this additional repair.
Coordinator-owned root documentation was reconciled with the worker-verified contracts and manifests: typed versus protocol hosting, embedded versus executable policy defaults, soft pressure targets, combined buffered/durable file ownership, snapshot lookup, visible metadata, dependency edges and current overview links.
The coordinator also owns the known-issue updates, Decision 0030 and consolidated inventory.
No customer-facing behavior/API change remains in accepted work; the only non-test implementation changes are private benchmark test seams preserving the existing loops.
No changeset is needed for these tests, documentation and behavior-preserving private seams.

## Validation Evidence

Setup evidence, not final acceptance:

- Kickoff `validate 0020 start` and `git diff --check` passed before commit.
- Kickoff documentation checker passed: 29 roots, 58 documents, 375 links.
- First isolated integration `pnpm policy-check --path rust-service` failed because local TypeScript dependencies were absent.
  A worktree-local `pnpm install --frozen-lockfile --offline` restored dependencies successfully; no lockfile changed.
  Repeated policy validation passed: 760 files.
- Registered process tasks provide per-worker probe, scoped formatting, and package checks with absolute cwd, branch, kickoff, status, command, and exit guards.
  All four delegates invoked their assigned tasks successfully; final logs below verify distinct checkouts and outputs.
  The runner creates a worktree-owned fixture directory and sets command-local `TMPDIR`; acceptance runs use this configuration.

Sessions acceptance evidence:

- Directly verified the final guarded log `2026-09-29T19-17-43.075Z-sessions-check-3e0c20ec-0e1a-4316-b384-d36848b4ff77/output.log` in coordinator session files.
  Its checkout guards, formatting, strict Clippy, 118 unit tests, one doctest, strict rustdoc, and lockfile check passed.
- Editor diagnostics found no errors in the four changed Rust files.
- Workstream documentation and diff checks passed before committing; clean status followed.
- Coordinator architecture/README corrections passed the documentation checker: 376 local links.

Transport's focused `cleanup_failure_does_not_hide_mutating_timeout_ambiguity` ran exactly one test against the original production behavior and failed with the injected cleanup error rather than the documented ambiguity result.
The coordinator verified the guarded red log `2026-09-29T19-14-09.934Z-transport-timeout-regression-3d01f726-221f-48f0-a938-6fcb99f75308/output.log`.
Experimental green and full-check runs validate only the subsequently deferred proposal, not the accepted source.
The final accepted transport run `2026-09-29T20-06-07.128Z-transport-check-1917f03d-37fa-403d-8ba5-1abaf049f42c/output.log` passed formatting, strict Clippy/rustdoc, 49 client tests, 63 server tests, configuration/integration tests, doctests and unchanged lockfiles.
The coordinator inspected its checkout guard, command and exit evidence.
The earlier native durable-opening timeout remains unattributed: `2026-09-29T19-10-53.930Z-transport-check-4686b16d-3548-499b-a6aa-e2cdf6fc0462/output.log`.
Passing retries do not close that issue.

Integrated validation uses exact source HEAD `2e6d36a0b7cc798bb06d69566243db2bf192a4a4`, branch/cwd/status guards, command-local fixture storage and fresh session logs.
The native gate passed formatting, strict workspace all-target/all-feature Clippy, strict workspace rustdoc, all-target build, documentation links and unchanged lockfiles in `2026-09-29T20-09-53.114Z-integration-native-0820e6e3-57d5-4423-9b4c-7a4b33a10195/output.log`.
Repository policy passed for 761 files in `2026-09-29T20-09-53.113Z-integration-policy-71f8f0f3-08cb-43f5-b480-32329805e762/output.log`.
The first extended run, `2026-09-29T20-11-20.064Z-integration-extended-6f6c5825-79dc-4d9d-badc-55793a2c5e8c/output.log`, passed native tests and generated-package checks but failed Chromium startup because the coordinator's long `TMPDIR` exceeded the Unix-domain socket path limit.
This was validation setup, not a product regression.
The runner now allocates a uniquely owned short `/tmp/q20-*` directory and records it in the log.
The second run, `2026-09-29T20-18-49.383Z-integration-extended-7b0f50ec-a511-464b-bb8e-076ee21352cf/output.log`, passed the focused Chromium probe, native tests, package tests, browser transport matrix and 29 integration/benchmark correctness cases.
Its sole failure was missing worktree-local Tinylicious dependencies.
An offline frozen install in `server/routerlicious` succeeded without changing either pnpm lockfile or Cargo.lock.
The final extended run `2026-09-29T20-22-01.253Z-integration-extended-d3592905-0630-41e7-942f-f323d5ada2da/output.log` passed after focused Chromium and Tinylicious probes.
It records 454 native test/doctest passes, no failures, one browser-only native ignore, all package tasks, 30 integration/benchmark correctness cases, and the complete default browser transport matrix.
The ignored physical-release test runs explicitly in the browser harness.
The coordinator parsed the package/integration JUnit reports, checked all 14 generated Node/web WASM files for nonzero size and WASM headers, and parsed 16 passing browser evidence objects.
An additional `SEA_SNAPSHOT_POLICY=sea` transport-matrix run passed in `2026-09-29T20-27-19.274Z-integration-browser-sea-c1938cbf-8d23-4a46-b9e3-c75b7db7782f/output.log`.
Its 16 evidence objects parse, and all three transport results report `seaSelected` and released snapshot leases.
Native and browser validation target distinct responsibilities; neither establishes physical power-loss or deployment qualification.

Consumers final guarded run `2026-09-29T19-20-23.896Z-consumers-check-f5472cd6-b48a-40c7-89a1-16306de432a6` passed formatting, strict Clippy/rustdoc, 61 tests including 13 composition tests, and lockfile checks.
Foundations final guarded run `2026-09-29T19-17-21.256Z-foundations-check-03b7e29e-5810-4e4f-9d5e-b8eb6b7fabf7` passed formatting, strict Clippy/rustdoc, 153 tests, and lockfile checks.
The coordinator directly read both logs, verified their checkout identity and command/exit evidence, and ran documentation/diff checks before their source commits.
An additional editor-diagnostics request for integrated files returned no response after 1800 seconds; it is inconclusive and is not reported as a passing check.
Compilation/Clippy and integrated validation supply the acceptance evidence instead.

## Contract and Regression Review

The [quality inventory](../quality-inventory.md) indexes 98 workstream boundary rows and one coordinator documentation boundary across all 15 members.
Each workstream report links precise contract text, controlling decisions and nearest tests, including no-change dispositions.
The added tests isolate decisions previous topical checks could miss: actual writer loops and factory wire choices, multiple eligible readers, independent pressure dimensions, real wakeups before repolling, termination ownership and source rejection.
The scripted QUIC peer avoids a host/sequencer masking factory choices.
Shared conformance still proves substitutability; real-host composition and generated/browser suites cover distinct transport/platform responsibilities.
No production contract was weakened to match a defect.
Initial independent review covered the complete fixed-base change and supporting dispositions.
Fresh repair review accepted the localized evidence repair and final records as described below.

## Cross-Workstream Findings

Root prose lagged implemented composition and storage ownership; those statements were corrected rather than changing shared semantics.
The timeout-cleanup finding is a confirmed implementation defect with an unresolved public representation choice, not permission to weaken the ambiguity contract.
The native opening timeout is an unattributed validation incident, not a demonstrated consequence of accepted changes.
No new shared dependency, workspace topology change or competing fixture abstraction was introduced.

## Independent Review

Initial reviewer: `aebdce16-8da6-40ff-8d0e-90d0f80fc707`, read-only, standard depth, no nested agents or command execution.
Fixed base: `b06b46be6b88723ea64f4ef1a77a5895781c21bc`; source HEAD: `2e6d36a0b7cc798bb06d69566243db2bf192a4a4`.
The complete 26-file staged/working snapshot is `integrated-review.patch`, SHA-256 `4fcba6b0aa62d6a1c410538e33c3aa492c50930faebbfcfd9a0424e4d0506ad1`.
All per-file hashes were reverified before the repair.
The reviewer read every changed file/report, reconciled all 99 rows and 15 members, inspected baseline/current context and validation logs, and found no introduced production regression.

One medium-severity required-evidence gap blocked acceptance: byte-pressure background shedding did not discriminate the server's separate session/reader admission byte predicate.
The coordinator added `byte_only_output_pressure_checks_both_admission_paths_inclusively`.
It aborts and joins the monitor before accumulating retained bytes, keeps entries below their target, checks both admissions below/at 8 MiB and above it, and verifies reader permits are acquired/released or left untouched as appropriate.
Initial oversized fixtures hit the independent 4 MiB sequencer pipeline budget; the final fixture uses 3 MiB, 3 MiB, 2 MiB and one-byte submissions.
These setup failures are not mutation evidence.

The exact test passed in `2026-09-29T20-36-55.524Z-integration-admission-932cdb2c-7560-473d-9d73-1add6f019432/output.log`.
Removing only the production admission byte predicate failed its session-refusal assertion in `2026-09-29T20-37-12.825Z-integration-admission-198723c9-9348-4791-9cec-0a5c9d8db8b1/output.log`.
The command selected exactly one test under a 120-second external deadline and exited 101, not a timeout.
The predicate was restored, and the same test passed in `2026-09-29T20-37-24.809Z-integration-admission-a5d87780-094e-457e-989d-97ac280dd47c/output.log`.
No production mutation remains.

The separately requested `node --test scripts/benchmark-gates.test.mjs` passed all eight cases in `2026-09-29T20-36-59.885Z-integration-benchmark-gates-c17d7b01-9d15-40fd-945e-90f283ddcbaf/output.log`.
Post-repair workspace formatting, strict Clippy/rustdoc, build and documentation checks passed in `2026-09-29T20-37-27.055Z-integration-native-affdcbd0-6713-4275-9f3c-77c3d292e745/output.log`.

The complete concurrent server run `2026-09-29T20-37-52.351Z-integration-server-30cd21db-e70b-4fa3-a55a-1e84a819e735/output.log` passed the new test but reproduced the known durable-opening timeout after 5.01069134 seconds: 63 passed, one failed, one ignored.
The failure retained nine wire bytes, one active connection, one peak stream and no cleanup.
The exact native test then passed in `2026-09-29T20-38-45.104Z-integration-native-opening-7453add7-7353-4e11-b0cb-827b547ba872/output.log`.
The entire server suite with `--test-threads=1` passed 64 library, six configuration, four integration and three doctests in `2026-09-29T20-38-45.738Z-integration-server-serial-ceddab08-d082-42d5-ae88-d37422bf90b9/output.log`.
The user explicitly accepted this known-timeout validation exception and instructed proceeding to final repair review and closeout.
No test was removed, deadline increased or cause inferred from serialization.
The previously passed extended/browser gates remain applicable because this repair adds only an owner-local test and restores production byte-for-byte.
Post-repair policy passed in `2026-09-29T20-38-54.973Z-integration-policy-66955c06-8c52-4894-b4ee-9d7ec60fd2fd/output.log`.
Fresh repair reviewer `c7cdea89-acda-4f7f-9ae8-68d024e304f8` completed cycle one at standard depth.
Its complete updated snapshot is `integrated-review-repair1.patch`, SHA-256 `d068ae10486f71ea62f4196f11a4af30b15302dfd31ff189a97f3c0728086c9a`, against the same fixed base and source HEAD.
The reviewer inspected the complete 30-file diff for context, deeply checked the repair and its controlling baseline/current paths, and reconciled the changed reports and new closeout records.
Unchanged-area coverage remains with the initial reviewer.
The reviewer directly inspected green/red/restored-green, benchmark, canonical, concurrent-failure and serialized-pass logs and found the original medium finding resolved with no further actionable findings or reproduction requests.
The mutation fails at the session assertion before reaching the reader assertion; separate reader-hook protection is established by its source assertions, not a second claimed mutation failure.
The coordinator rehashed all 30 files and the complete patch before acceptance.
One repair/review cycle was used; the second was not needed.
The checkpoint is accepted with the explicit user-approved native-timeout exception.
Subsequent edits are status, commit and cleanup bookkeeping only.

## Artifact Check

All four reports and frozen patches are accounted for above.
Workstream checkouts are clean at their named source commits.
Sessions is an integration ancestor; the other three have verified exact owned-tree mappings, not merely conflict-free cherry-picks.
The four worker checkouts were removed non-forcibly after their agents and commands finished; reviewers used the integration checkout and preserved baseline instead.
Before removal the coordinator rechecked each exact branch, final commit, empty tracked/untracked status and source-to-integration mapping above.
Both absent worktree registration and absent directory were verified for:

- `/workspaces/FluidFramework-rust-service-iteration-0020-foundations`
- `/workspaces/FluidFramework-rust-service-iteration-0020-sessions`
- `/workspaces/FluidFramework-rust-service-iteration-0020-transport`
- `/workspaces/FluidFramework-rust-service-iteration-0020-consumers`

The coordinator's later resource-policy test and report updates are accepted additions on integration, not omitted workstream edits.
Workstream branches are retained with their recorded provenance.
All temporary process task entries were removed; the primary task configuration compares exactly to its original state.
Owned short fixture roots were removed after their processes finished.
Required patches and command logs are preserved in coordinator session storage outside the disposable worktrees.
Coordinator documentation, the added admission test and Phase 2 records are included in the acceptance commit.
Reviewed Phase 3 bookkeeping is committed separately.
The primary `rust-service` branch fast-forwarded from kickoff to closeout `731ce0e9a65b18d02bb859423b6741a5b078e435`.
The integration checkout was clean at that exact commit, which was verified as an ancestor of primary.
After all owned commands and review work finished, `/workspaces/FluidFramework-rust-service-iteration-0020` was removed with non-forced `git worktree remove`.
Its absent registration and absent directory were verified.
Worktree-local dependency installs and generated outputs were disposable; required command logs, frozen patches, baseline/review snapshots and consumer reports remain outside those checkouts in coordinator session storage.
No temporary symlinks, owned processes, persistent environment overrides or task edits remain.
Unrelated worktrees were untouched, iteration branches retain provenance, and nothing was pushed.
An accidental inventory-validation invocation from the still-kickoff primary checkout found its expected placeholders; the guarded invocation from integration passed.
A supplementary heading scan checked 229 links and found only the unchanged pre-existing `storage-and-core-exploration` anchor in Known Issues, outside this incremental repair.
Final `validate 0020 complete` reports nine missing-template-heading errors, all in pre-existing Decisions 0028 and 0029.
The coordinator verified both records and the validator are unchanged from approved source `8a3889518d537d6a85bd55cc31a1b7404eee78e7`; `validate 0019 complete` reproduces the same nine errors.
The user explicitly approved a historical-formatting exception and instructed finishing closeout without editing those earlier decisions.
This exception does not waive checks for the new Decision 0030 or iteration 0020 records; no errors name those files.
Quality-inventory, Phase 2, documentation and policy checks pass.
