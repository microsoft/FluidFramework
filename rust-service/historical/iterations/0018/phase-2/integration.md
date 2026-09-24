# Iteration 0018 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0018`
Iteration base commit: `37fa0c0e4a119f94844837818a810ef84f9f59f8`
Integration commit: the commit containing this completed Phase 2 record; the subsequent Phase 3 report records its hash.
Checkout: `/workspaces/FluidFramework-rust-service-iteration-0018`.

## Accepted Work

Persistence `6dbfcea511b52f32a0a671a4d6534b348be103fe` was inspected directly and cherry-picked as `5e232055bc8`.
Its six paths are the owned file crate and workstream report.
The production change retains completed read ownership; the other changes are localized regression evidence and documentation.
The workstream checkout was clean after commit.
Additional directly inspected Git objects and ownership:

| Workstream | Source commit | Integrated commit | Ownership disposition |
| --- | --- | --- | --- |
| foundations | `2529fae83a140cd3741d98ba92f627c5dda5d140` | `ddda24a93b8` | Four assigned crates and report, including the new core owner-local test module. |
| consumers | `82724b3e11354211d1c0ed1485b151c8bbe180c3` | `a9c9f511f1d` | Four members, directly related consumer fixtures, and report. Browser execution remained pending at integration. |
| sessions | `5d9678be1e42187f3dcfde319cbf98ea2703e6fe` | `b575fd3c703` | Four assigned crates and report; new monitored adapter received missing private documentation before acceptance. |
| transport | `34b7c75c6a241489e3a8e56cdbfd351e4ca8311a` | `415077e9f82` | Two assigned crates and report; the shared fixture inclusion was identical to consumers and applied once. |
| consumers follow-up | `d23af7ac55113ed46acf4d896e8043e691e4af2f` | `7a02c8c84c1` | Localized benchmark build/launch selection, regression, documentation, and report. |
| consumers navigation follow-up | `36a9603f225dd63fe6180d21f96b50d6d8351264` | `314248a7fb6` | Explicit document-readiness barrier, controlled CDP regression, and formatting of the owned browser fixture. |
| persistence late report | `7d89ab5eb7b1989e57cb82993e75173b07c8b6ba` | `175981fb120` | Report-only preservation of a delayed shared-target observation and the final isolated acceptance evidence. |

All five workstream checkouts were clean after their commits.
Closeout status inspection found a later persistence report edit from the delayed provenance handoff.
It was inspected and preserved in the report-only commit above, not discarded or mistaken for a source change.
Final platform validation passed on `314248a7fb6`.
Independent review and record reconciliation are complete as recorded below.

## Rejected or Deferred Work

No workstream was rejected or review scope reduced.
The user explicitly deferred stream-incarnation binding ([Decision 0023](../../../decisions/0023-defer-stream-incarnation-binding.md)) and native post-opening frame deadlines ([Decision 0025](../../../decisions/0025-native-timeout-scope.md)).
The ignored stale-author reproducer remains expected to fail; it is not passing evidence.

## Conflict Resolution and Adaptation

The integration checkout uses a worktree-local frozen pnpm install.
The first policy probe failed because TypeScript dependencies were absent in the fresh checkout.
`pnpm install --frozen-lockfile` restored all 171 workspace projects and the compatibility workspace; no lockfile changed.
The policy rerun passed.
The shared browser Rust fixture received the same four-line support-module inclusion in both worktrees after delayed peer messages.
The merge applied it once without conflict.
Unused fixture aliases introduced during those crossed messages were removed by the transport owner before commit.
The source report's claim of supplemental authorization does not expand shared ownership: the coordinator reconciled this concrete identical inclusion.

An initial focused Mocha invocation also loaded the package's configured full suite.
Its three new raw-binding tests passed, but eight Rust benchmark cases failed with `ENOENT` because build and launch target directories differed; Tinylicious lacked its separate dependencies.
The focused rerun used `--no-config --no-package` and passed all three tests.
The benchmark mismatch was an inherited concrete finding, not dismissed as environment noise.
The consumers follow-up now derives build arguments and executable from one workspace-local target selection and passes an exact regression under an unrelated inherited Cargo target.
A frozen install in `server/routerlicious` restored its missing dependencies; all shared lockfiles remained unchanged.

## Validation Evidence

Kickoff `validate 0018 start` and `git diff --check` passed before kickoff commit.
Integration preflight at the kickoff commit:

| Check | Outcome |
| --- | --- |
| `pnpm policy-check --path rust-service` | Failed, missing TypeScript in fresh worktree; no product failure inferred. |
| `pnpm install --frozen-lockfile` | Passed, including compatibility-workspace postinstall. |
| `pnpm policy-check --path rust-service` after restoration | Passed, 675 files processed. |
| `git diff --exit-code -- pnpm-lock.yaml rust-service/Cargo.lock` | Passed. |

Fresh consumer package build at `b575fd3c703` passed all 97 executed tasks, including generated WASM, TypeScript compilation, formatting, and lint.
The three raw generated-binding regressions passed independently.
The artifact-selection follow-up passed test compilation, package formatting/lint, and its exact focused regression.
Canonical native run `native-2026-09-24T01-54-33.207Z-952386` at `415077e9f82` passed all seven commands: format, strict Clippy, warnings-as-errors rustdoc, all-target build, all-feature/all-target tests, documentation checker, and scoped policy.
Documentation check covered 29 roots, 54 documents, and 330 local links.
Final validation on `314248a7fb6` is retained in [execution evidence](../execution-evidence.json), including exact commands, checkout identities, exit statuses, log sizes and SHA-256 hashes.

| Check | Attributable outcome |
| --- | --- |
| Navigation syntax and controlled CDP tests | Three syntax checks and five Node tests passed in the guarded consumer checkout before integration. |
| Integrated navigation package checks | TypeScript test compilation, package format and lint passed; focused Mocha readiness/profile-cleanup cases passed 2/2. |
| Formerly failing memory-direct benchmark | Passed in 910 ms with an unrelated inherited Cargo target after the navigation repair; build and launch used the explicit workspace-local target. |
| `bash test.sh` | Run `full-2026-09-24T02-10-40.057Z-1038157`: exit 0, including workspace Rust tests, generated consumers, Sea TypeScript/driver/tree suites, aggregate Mocha, and real Chromium. |
| Companion benchmark alignment/gate tests | Same run: 7/7 Node tests passed. |
| `pnpm build:fast` | Run `build-2026-09-24T02-12-31.074Z-1038155`: exit 0, 148 scheduled tasks, 71.861 s. |
| Shared lockfiles | Root pnpm, Routerlicious pnpm, and Rust lockfiles unchanged. |

The final browser log contains 13 parsed passing evidence records.
Its lifetime record explicitly reports pending establishment, failed datagram setup, successful establishment, nonfinal/final stream-clone ownership, and finished-stream cleanup.
The real server test `browser_disconnect_and_drop_release_capacity` passed and separately reports physical release after disconnect and drop.
The aggregate browser task passed in 96.748 s; native success is not used as a substitute.

Two failed integration attempts remain part of acceptance evidence.
Run `full-2026-09-24T01-58-36.421Z-970271` passed the browser task but failed one memory-direct Mocha benchmark with `Execution context was destroyed`.
An isolated retry passed; that alone did not resolve the incident.
Direct inspection exposed a document-readiness gap, now guarded by exact frame/loader `DOMContentLoaded` observation without blanket retries or arbitrary sleeps.
The deterministic CDP fixture proves evaluation cannot begin in the old context; it does not establish exact causality for the original failure.
Run `build-2026-09-24T02-02-54.198Z-993081` completed its 1,766 tasks with one failing root Biome task for browser-fixture formatting.
The repository formatter corrected that owned file, and the root gate passed on rerun.
A command assembling the final suite initially used the wrong working directory; the runner's cwd guard rejected it before running the suite.
The corrected absolute-cwd invocation is the passing run above.

Persistence acceptance verified fresh run `2026-09-24T01-18-47.395Z-868278`: JSON parsed, expected cwd/branch/kickoff HEAD matched, exactly three commands exited zero, and nonempty test/Clippy logs recorded 59 unit plus one process test.
The empty format log is expected for success.
An optional full-suite wake-suppression mutation had stalled unrelated live-read tests.
The coordinator verified process ancestry `834907` (runner) -> `834961` (Cargo) -> `835555` (test binary), terminated only the test child, and verified all three exited.
The mutation was already restored before the fresh passing task.
That negative-control attempt remains inconclusive; the ownership defect has separate completed red/green evidence.
Further potentially hanging mutations require a narrow filtered test and bounded timeout.

The sessions owner later reported a surprising passing assertion while assigned tasks shared `/workspaces/.cargo-target`.
This is an unresolved provenance concern, not proof of stale build output or a runtime defect.
The coordinator paused all task dispatch, verified no assigned task/Cargo test remained active, and changed the external task runner to use `/workspaces/.cargo-target-quality-0018-<workstream>` with four build jobs per invocation.
Each result now records that target.
Fresh isolated-source workstream manifests were parsed and verified for foundations (`01-35-03.128Z-913011`), sessions (`01-35-02.428Z-912931`, followed by documentation-only `01-47-19.101Z-926519`), transport (`01-49-04.591Z-935621`), and consumers (`01-24-21.817Z-880903`).
Each identifies the expected branch, kickoff HEAD, target, exact three commands and zero exits, with nonempty test/Clippy logs.
Final native integration used its checkout-local `rust-service/target`, independently validating accepted persistence source as well.

## Contract and Regression Review

The [quality inventory](../quality-inventory.md) retains each owning decision, exact contract, discriminating evidence, and report link.
The core publication probes deliberately use permissive dependent components, so backend checks cannot mask a missing view-level decision.
File ownership has completed red/green evidence; the stalled optional wake mutation is not claimed as a successful negative control.
Sessions has isolated red/green evidence for progress preservation distinct from the core boxed-stream correction.
Admission and signal tests observe retained allocation ownership, not only logical payload length.
Typed framing/receipt/content tests discriminate the responsible transport decision; raw WASM tests bypass TypeScript validation.
Browser lifetime acceptance requires explicit platform observations rather than incidental native RAII.
Independent review must challenge all dispositions and reconcile the accepted semantic decisions and retained deferrals.

### Independent Checkpoint Review

The standard-depth review uses fixed approved source `73aae4414baff2e635f6ccdcbd2b4cb507d62bfd`, not a moving merge base.
Fresh read-only reviewers receive complete scoped diffs and immutable baseline/current source archives, shared review criteria, relevant reports, and actual validation paths.
They cannot edit, execute commands, or delegate further.
Together the scopes cover all changed implementation files and directly related documentation/tests; coordinator record reconciliation is assessed separately.

| Reviewer | Frozen source and diff SHA-256 | Complete scope and current disposition |
| --- | --- | --- |
| `250a3a75-72e1-4c4a-a6f9-0ed757551492` | `7a02c8c84c1`; `49a71fe644fd6292d61b7cbbf3dfb4a0edc9adfc6d6a9337fda6a984ad887709` | Foundations/persistence: all 2,280 diff lines, 19 changed files in five crates, controlling baseline/current paths and both reports; no actionable findings. |
| `5da253f4-f5dc-4d25-9a0a-2cafe922d393` | `7a02c8c84c1`; `fab0f36f83a1c505fb0868ea1e68d40fe3d5e538f9351b9f42f2ad76b48cb370` | Sessions: all 1,638 diff lines, 13 changed files in four crates, controlling baseline/current paths and report; no actionable findings. |
| `814f9857-7908-4188-a216-f901669638de` | `314248a7fb6`; `abf3d2e36bd4a1612bc753893aca7db35f1c5e651442943c9c167db5a42d2510` | Transport/consumers: all 3,512 diff lines, 38 changed files, six remaining members and related harnesses; no actionable findings after completing the initially unfinished unchanged-boundary evidence review. |

The first two reviewers inspected native result manifests and relevant raw logs; historical mutations remain implementer-reported to them.
Their initial snapshots remain valid: the coordinator verified no subsequent source difference in those nine crates.
The sessions review initially returned only a generic summary; acceptance required a follow-up with actual complete diff ranges, controlling source coverage, evidence and limitations, rather than inferring coverage from that sentence.
The transport/consumer reviewer initially marked coverage Incomplete rather than silently sampling unchanged evidence.
Its continuation inspected server admission/registry/shutdown, server and ordinary-browser WebSocket ownership, codec bounds, benchmark schema/parser/source inventory, and remaining harness responsibilities.
Its final detailed report explicitly supersedes the Incomplete disposition and reports no remaining assigned review gaps.
It inspected native, aggregate/browser, companion Node, and successful root-build evidence; no reviewer independently reran commands.
Two generic reviewer responses required explicit evidence follow-ups before acceptance.
All three reviewers returned no actionable findings and no reproduction requests after full assigned coverage.
No repair/review cycle was consumed by evidence-completion follow-ups.
The coordinator revalidated all three fixed-base source-diff hashes against the current working source and mechanically checked that their union covers all 70 changed implementation/test/guide files.
The late persistence report commit changes only bookkeeping and does not invalidate any implementation snapshot.
The limitations diff hash is `38f7624dc3c8a521480511dbd0f1944c1357c470e91ba608e27cf37af4e3e8ca`; the reviewer also read all five decision additions and the changeset.
No independent-review result is treated as a proof that the remaining deferred defects are absent.

## Cross-Workstream Findings

The user accepted constructor-owned namespace synchronization, membership-inclusive snapshot positions, and conservative logical abandonment after disconnect error.
The user deferred stale-stream incarnation repair and selected accurate opening-only native timeout documentation rather than new frame-deadline behavior.
Decisions 0021-0025 record the exact alternatives and consequences.
Core progress repair and the sequencer's monitored-source preservation own different observations and both are required.

## Artifact Check

All five reports and their new source/test files are accounted for.
The inventory has 130 distinct boundary rows across all five owners, including both consumer follow-ups.
All 258 inventory filesystem links were checked, including conversion and rebasing of reference-style links when merging report tables.
The coordinator reconciled pending platform dispositions against the fresh passing execution evidence.
The final documentation check passed for 29 roots, 54 documents, and 329 local links; scoped policy passed for 688 processed files.
The five owned temporary task registrations were removed while preserving the original task configuration byte-for-byte, and no delegated task runner remains active.
All five implementation worktrees are clean after preserving the late persistence note.
Primary-branch fast-forward and removal of owned worktrees are Phase 3 delivery steps; unrelated worktrees are outside this iteration.
