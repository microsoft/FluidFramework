# Iteration 0019: consumers Report

Status: Wave 1 discovery complete; awaiting coordinator reconciliation and Wave 2 selection
Branch: `rust-service-iteration-0019-consumers`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0019-consumers`
Kickoff commit: `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`
Approved source commit recorded by the shared charter: `575b77e825e598b15b7740f56956fe433a6153d8`
Final commit: none; Wave 1 is read-only and commits were prohibited
Agent or owner: consumers workstream agent
Model and tool version: model unknown; repository file-view and patch tools
Instruction source: [consumers instructions](instructions/consumers.md), read from the kickoff worktree
Session or transcript reference: none
Started and finished: 2026-09-24; exact times unknown

## Outcome

Completed full Conservative discovery and assessment of `sea-wasm`,
`sea-integration-tests`, `sea-benchmarks`, and `sea-counter` across
documentation, tests, implementation, abstractions, code organization, and
naming.
The review covered every hand-authored source file, member manifest, and member
guide, plus the workspace architecture, Sea architecture, development policy,
iteration charter, shared simplification inventory, and inherited 0018
consumer quality evidence.

One small, high-confidence implementation candidate removes an unused
benchmark-helper parameter.
Two larger duplication hypotheses remain plausible but are deferred because
their cheapest disproof requires a typed implementation prototype and, for the
WASM case, fresh generated/browser validation.
Five proposed consolidations or deletions were rejected or excluded because
they would couple distinct boundaries, weaken independent regression evidence,
obscure diagnostics, or provide no material maintenance benefit.
No production, test, guide, manifest, generated output, or shared record was
edited.

## Configuration and Provenance

- Mode and scope: broad current-state review of all four assigned members,
  including unchanged code; no candidate-count or time cutoff.
- Profile: Conservative for all six categories; no category was disabled.
- Constraints: preserve public APIs, dependencies, protocol, generated
  bindings, native/browser support, resource lifetimes, benchmark meaning and
  performance characteristics.
- Inherited evidence:
  [0018 quality inventory](../../0018/quality-inventory.md) and its
  [consumer report](../../0018/phase-2/consumers.md).
- Architecture inputs: [Sea architecture](../../../../SEA_ARCHITECTURE.md),
  [workspace architecture](../../../../WORKSPACE_ARCHITECTURE.md), and
  [development policy](../../../../DEVELOPMENT.md).
- The workstream instruction still names source commit
  `575b77e825e598b15b7740f56956fe433a6153d8`, while the user assigned kickoff
  `7b56e89cc3d79a861ed708c8d9d4b1fe7d9ff475`.
  Discovery used the assigned kickoff worktree; this provenance difference
  must remain visible during reconciliation.
- No terminal commands, tests, formatters, builds, generators, or Git commands
  ran in Wave 1.
- Registered future task labels: `rs0019 consumers test` and
  `rs0019 consumers format`.

## Complete Responsibility Map

| Member | Responsibilities and consumers/platforms | Contract and inherited regression evidence | Wave 1 result |
| --- | --- | --- | --- |
| `sea-wasm` | `session.rs` owns type-erased session forwarding, classified errors, and concrete availability evidence. `bindings.rs` owns JavaScript value conversion, input validation, generated object lifetimes, cancellable event/snapshot streams, memory namespace/runtime construction, and native/browser remote factories. `signals.rs` owns separately closable signal factories/connections. Consumers are generated wasm-bindgen exports, `sea-typescript`, Fluid adapters above it, Node.js, and browsers. | [Binding guide](../../../../crates/sea-wasm/README.md); inherited `wasm-availability-erasure`, `wasm-error-and-stream-forwarding`, `wasm-value-conversion-and-validation`, `wasm-factories-and-features`, `wasm-stream-cancellation`, and `wasm-signal-ownership`. Native adapter tests and raw generated/package/browser tests protect different boundaries. | Fully reviewed. One remote-factory duplication is deferred. Cancellation and type-erasure layers are proportionate and must remain distinct. |
| `sea-integration-tests` | The single matrix owns generic stack recursion, real per-hop endpoints, rejection probes, independent documents and memberships, plaintext expected history, nested content, snapshot authority, cancellation, reconnect, deadlines, and cleanup. It consumes core, memory, sequencer, compression, encryption, native transport, and server composition. | [Matrix guide](../../../../crates/sea-integration-tests/README.md); inherited `composition-real-hop-path`, `composition-payload-membership-and-recovery`, and `composition-authority-cancellation-cleanup`. Configuration-named Cargo tests, scenario-local deadlines, independent expected submissions, and hop counters are distinct evidence. | Fully reviewed. Proposed fixture/scenario consolidation is rejected because it would weaken failure locality or independent expectations. |
| `sea-benchmarks` | `lib.rs` owns deterministic fixtures, schema, and statistics. `measurement.rs` owns monotonic-to-host timestamp conversion. `main.rs` owns CLI parsing, storage/session workload execution, correctness verification, recovery, environment/resource reporting, and backend composition. The four binaries own storage-pipeline semantics, no-reader control semantics, native WebTransport/WebSocket worker semantics, and source-test span inventory. Consumers include collection/alignment scripts and retained result readers. | [Benchmark guide](../../../../crates/sea-benchmarks/README.md); inherited `benchmark-fixtures-schema-and-statistics`, `benchmark-command-and-concurrency`, `benchmark-snapshot-recovery-verification`, `benchmark-pipeline-order-drain-and-size`, `benchmark-clock-and-native-observation`, `benchmark-native-socket-boundary`, `benchmark-no-reader`, and `benchmark-source-inventory`. Exact fixtures, receipts, payloads, snapshots, timestamps, replay counts, and schema values are independent correctness evidence, not performance claims. | Fully reviewed. One unused helper parameter is a leading candidate. Decorator-branch consolidation is deferred. Shared utility extraction and metric renaming are rejected/excluded. |
| `sea-counter` | The example owns local document/session setup, signed eight-byte delta encoding, availability-backed snapshot publication, latest-snapshot plus tail replay, live-boundary termination, malformed payload rejection, executable assertion, and guide. Consumers are readers and users replaying the executable example. | [Example guide](../../../../examples/sea-counter/README.md); inherited `counter-replay-and-format`. Tests independently cover empty/no-snapshot replay, committed initial state, snapshot replacement, malformed snapshot and delta, and the complete executable scenario. | Fully reviewed. Current organization is proportionate; deleting the apparent duplicate demo test is rejected because it protects example replay. |

## Six-Category Coverage and No-Change Evidence

| Member | Documentation | Tests | Implementation | Abstractions | Code organization | Naming |
| --- | --- | --- | --- | --- | --- | --- |
| `sea-wasm` | Reviewed README and module/item contracts. The guide accurately separates generated-artifact ownership, feature selection, availability evidence, signals, and browser/Node lifetimes. No worthwhile prose consolidation found. | Native adapter tests prove concrete capability preservation; raw generated tests prove Rust-owned conversion/cancellation; package/browser tests prove generated and platform behavior. Sharing or deleting these layers would weaken discrimination. | Forwarders, conversion, preflight, close ordering, weak signal tracking, and constructors reviewed. Remote constructor tails generated `RS0019-CONS-002`; otherwise direct forwarding is proportionate. | `BindingHandle`, `SessionAdapter`, `SignalFactory`, `ConnectionAdapter`, and the object-safe aliases each erase a concrete type at an actual generated boundary. Event and snapshot stream state looks similar but has different completion/error and registration-revocation semantics (`RS0019-CONS-003`, rejected). | Four modules separate target-independent adaptation, wasm exports, and signal ownership without introducing production-crate dependencies. Generated output remains correctly owned by `sea-typescript`. | Export names match generated JavaScript concepts and Rust names describe their owned boundary. `service_error` versus `invalid` reflects classified service failure versus rejected binding input; no material rename. |
| `sea-integration-tests` | README and module narrative agree on matrix scope, exclusions, topology, reconnect, and plaintext expectations. They retain necessary local reading guidance rather than duplicating production contracts. | All scenarios, configurations, hop probes, plaintext models, cleanup, and deadlines reviewed. `RS0019-CONS-004` is rejected; no case/assertion can be removed safely from current evidence. | Test-host delegation and fixture lifecycle are direct enough for a test-only crate. Endpoint reverse-order shutdown and unwind aborts preserve resource ownership. No production implementation exists. | Generic concrete stack recursion avoids type erasure and is required to compose repeated/reordered layers. `Fixture`, `Trace`, `ExpectedEvent`, and `ContentTree` have distinct state ownership. | One large file is justified by macro-local concrete type generation and shared private fixtures. Splitting it would increase navigation and visibility without removing a concept. | Scenario, fixture, hop, expected-model, and lifecycle names match their responsibilities. No material ambiguous name found. |
| `sea-benchmarks` | README accurately distinguishes smoke correctness, measured boundaries, warmup/drain, aligned timestamps, file guarantees, and source inventory. No timing or durability claim should be shortened. | Tests pin fixture/schema/statistics, parser behavior, payload multiset, snapshot recovery, recursive bytes, native socket framing, no-reader replay, and source spans. Test configuration repetition is explicit evidence; helper-based defaults could hide benchmark meaning. | All workload and verifier paths reviewed. `RS0019-CONS-001` identifies dead parameter plumbing. Independent worker loops and validation remain tied to their measured phases. | Compression/encryption backend branches have a plausible common lifecycle (`RS0019-CONS-005`), but generic decorators and reopen types may displace complexity. Measurement workers remain distinct from the general harness. | Cross-binary procfs, recursive-size, payload, percentile, and error helpers were assessed in `RS0019-CONS-006`; keeping small copies avoids a public utility surface and false ownership. | `append_*` internally spans raw appends and sequenced submits, but the public schema deliberately calls the shared boundary “commit.” `RS0019-CONS-007` excludes a broad cosmetic rename. |
| `sea-counter` | README precisely states the bounded sequence, output, guarantees, and exclusions. Source comments document snapshot and decoding decisions. No duplicate contract obscures ownership. | Six tests prove distinct decisions. The demo test overlaps steps with narrower tests but uniquely replays the executable path (`RS0019-CONS-008`, rejected). | Setup, append, publish, decode, recover, and demo are linear and small. The generic decoder retains distinct snapshot/delta diagnostics supplied by callers. | The `CounterSession` alias and six narrow helpers reduce type noise without hiding behavior. No generalized counter abstraction is warranted. | One source file keeps a bounded example readable in execution order; splitting would add navigation without reducing responsibility. | Names are local, conventional, and match the guide. The allocated identity is not exposed through misleading public naming. |

## Assessed Candidates

### `RS0019-CONS-001` — remove unused benchmark identity-prefix plumbing

- Primary category/profile: Implementation / Conservative.
- Responsibility and owner: `sea-benchmarks/src/main.rs`,
  `open_local_sessions`.
- Evidence: `_identity_prefix: &str` is accepted at every call but never read;
  callers pass `"compression"`, `"compression-reopen"`, `"encryption"`,
  `"encryption-reopen"`, `"concurrent-test"`, and `"stale-snapshot"` without
  affecting session creation, identity allocation, diagnostics, schema, or
  fixtures.
- Consumers/platforms: in-process benchmark smoke/measurement and unit tests on
  native targets; no generated or browser consumer.
- Preserved contract/tests: inherited `benchmark-command-and-concurrency` and
  `benchmark-snapshot-recovery-verification`; `open_local_sessions` must still
  recover one sequencer and allocate exactly `writers` sessions.
- Hypothesis: deleting the parameter and its six arguments removes vestigial
  configuration without moving responsibility.
- Cheapest disproof: search all call sites for reads or diagnostics, then
  compile and run the `sea-benchmarks` targets; any output or behavior tied to
  the strings falsifies the hypothesis.
- Expected benefit: removes a false suggestion that benchmark session identity
  is caller-controlled and eliminates needless call-site noise.
- Displaced complexity/supporting edits: none; call-site edits only.
- Proposed disposition: **simplified**, subject to Wave 2 selection and
  validation.
- Ranking: 1. Highest confidence, smallest change, no boundary expansion.
- Revisit trigger: selection for Wave 2 or any new use of named benchmark
  identities before repair.

### `RS0019-CONS-002` — consolidate common WASM remote-session finalization

- Primary category/profile: Implementation / Conservative.
- Responsibility and owner: `sea-wasm/src/bindings.rs`,
  `open_remote` and `open_webtransport`.
- Evidence: after their distinct transport connection calls, both functions
  derive `ArchiveIntent`, call `SessionClient::open` with the same limits and
  `SessionOpen`, copy document identity, retain the signal factory and session
  identity, and call `SeaSession::from_stack`.
- Consumers/platforms: generated `openRemote` and `openWebTransport` exports,
  `sea-typescript`, Node/browser loaders, WebSocket-stream and strict browser
  WebTransport paths.
- Preserved contract/tests: inherited `wasm-factories-and-features`,
  `wasm-stream-cancellation`, and `wasm-signal-ownership`; strict
  `openWebTransport` must not gain fallback, features must remain independent,
  and signal/session resources must retain their concrete transport lifetime.
- Hypothesis: a private generic helper operating only after transport creation
  can own the common open/finalization sequence without erasing transport
  capabilities or changing generated signatures.
- Cheapest disproof: type-check a no-behavior-change helper against both
  concrete transport types and inspect generated TypeScript/JavaScript API
  diffs; any new bound, erased lifetime, changed export, or harder local error
  path disproves Conservative value.
- Expected benefit: one owner for common limits, archive intent, document and
  signal extraction, reducing drift between remote factories.
- Displaced complexity/supporting edits: generic trait bounds may be more
  complex than duplicated straight-line code; fresh generated package and
  browser checks are mandatory.
- Proposed disposition: **deferred** to the coordinator/cross-crate owner until
  exact generated consumers and a typed prototype establish net clarity.
- Ranking: 2. Meaningful agreement risk, but materially higher validation and
  abstraction cost than `RS0019-CONS-001`.
- Revisit trigger: a third remote transport, drift between the two tails, or a
  Wave 2 slot with generated/browser validation assigned.

### `RS0019-CONS-003` — unify generated event and snapshot stream state

- Primary category/profile: Abstractions / Conservative.
- Responsibility and owner: `SeaEventStream` and `SeaSnapshotStream` in
  `sea-wasm/src/bindings.rs`.
- Evidence: both contain `RefCell<Option<...>>` stream ownership and
  `RefCell<Option<AbortHandle>>`, and both abort and drop on `cancel`.
- Consumers/platforms: raw wasm-bindgen objects and wrapper consumers on
  Node.js/browser platforms.
- Preserved contract/tests: inherited `wasm-stream-cancellation`; event
  completion/cancellation returns `undefined`, concurrent event reads reject
  only while pending, while snapshot cancellation/end are explicit errors and
  dropping the stream revokes publisher registration.
- Hypothesis: one generic cancellation holder would remove duplicate state.
- Cheapest disproof: compare every `next` and `cancel` transition and generated
  export requirement. The differing terminal results and concrete stream error
  types already disprove a common behavioral owner.
- Expected benefit: only two fields and a small cancellation sequence.
- Displaced complexity/supporting edits: a generic/private wrapper adds
  indirection around the lifetime-critical generated boundary and still leaves
  distinct `next` logic.
- Proposed disposition: **rejected**; similarity is mechanical, not shared
  semantics.
- Ranking: 6.
- Revisit trigger: wasm-bindgen gains a shared, generated-safe stream primitive
  or both stream contracts intentionally converge.

### `RS0019-CONS-004` — collapse integration scenarios or derive expectations

- Primary category/profile: Tests / Conservative.
- Responsibility and owner: `session_composition.rs` scenario table, stack
  macro, `Trace`, `ExpectedEvent`, fixtures, and collaboration helpers.
- Evidence: the file is large and several workflows submit, replay, reconnect,
  and publish snapshots through common helpers.
- Consumers/platforms: all concrete local/decorator/native-transport
  configurations, including repeated layers and multiple real hops.
- Preserved contract/tests: inherited composition rows; exact plaintext inputs
  are retained independently from returned events, configuration names
  localize failures, each cell has fresh documents/deadlines, hop rejection is
  separate from scenarios, and reconnect rebuilds memberships and transports.
- Hypothesis: a smaller generic workflow/table could remove repeated setup and
  assertions.
- Cheapest disproof: map every proposed merged assertion to its independent
  expected input, scenario name, cleanup path, feature/topology, and failure
  message. The current workflows prove distinct lifecycle and topology
  boundaries; deriving expectations from received values would hide defects.
- Expected benefit: fewer test lines only; no production responsibility
  removed.
- Displaced complexity/supporting edits: denser parameters/macros, worse
  diagnostic locality, and increased shared state.
- Proposed disposition: **rejected**; current repetition is proportionate
  regression evidence.
- Ranking: 8.
- Revisit trigger: two scenarios become behaviorally identical after a
  contract change and a negative-control replay proves equivalent failure
  detection.

### `RS0019-CONS-005` — consolidate compression/encryption benchmark lifecycle

- Primary category/profile: Abstractions / Conservative.
- Responsibility and owner: `sea-benchmarks/src/main.rs`,
  `run_backend` file-backed decorator branches.
- Evidence: both branches create buffered file storage, create a view, open
  writer sessions, decorate them, run `run_session`, flush/measure bytes,
  reopen one session, redecorate, verify recovery, close, and remove the
  directory.
- Consumers/platforms: benchmark smoke and schema-3 measurement results for
  compression and encryption.
- Preserved contract/tests: inherited `benchmark-command-and-concurrency` and
  `benchmark-snapshot-recovery-verification`; constructor order, key provider,
  exact fixture bytes, recovery timing boundary, persisted-size timing, and
  active guarantee labels must remain unchanged.
- Hypothesis: a narrowly generic file-backed-decorator runner can make the
  lifecycle authoritative once without changing measured intervals.
- Cheapest disproof: prototype only the two branches, compare every timer,
  flush, drop, close, reopen, and cleanup point, and type-check both decorator
  constructors. Added trait/closure machinery or moved timer boundaries
  disproves net simplification.
- Expected benefit: removes roughly one duplicated lifecycle and reduces risk
  that correctness verification diverges between decorators.
- Displaced complexity/supporting edits: higher-ranked generic constructors,
  concrete reopened types, and key capture may produce a harder abstraction;
  benchmark tests must preserve exact meaning rather than merely pass.
- Proposed disposition: **deferred**; plausible but below the low-risk
  candidate and not safe to accept from textual similarity.
- Ranking: 3.
- Revisit trigger: Wave 2 budget remains after higher-confidence candidates, a
  third decorator backend is added, or branch behavior drifts.

### `RS0019-CONS-006` — share utility copies across benchmark binaries

- Primary category/profile: Code organization / Conservative.
- Responsibility and owner: procfs peak-memory readers, recursive persisted
  byte counters, payload generators, percentile selection, and display-error
  adapters in `main.rs` and standalone binaries.
- Evidence: several helpers have similar syntax within one package.
- Consumers/platforms: general schema harness, storage pipeline, no-reader
  matched control, and native presentation worker.
- Preserved contract/tests: inherited pipeline, no-reader, native observation,
  source inventory, fixture, and schema rows. Payload shapes, percentile
  formulas, process phases, absent-path handling, and output schemas differ.
- Hypothesis: moving copies into the library would remove repeated code.
- Cheapest disproof: compare inputs, output units, absent-path policy,
  percentile rank, payload sequence domain, and timing phase. These differ;
  only trivial `Display::to_string` is identical.
- Expected benefit: negligible after preserving separate policies.
- Displaced complexity/supporting edits: a public or package-wide utility API,
  additional imports, and false coupling among independently executable
  measurement tools.
- Proposed disposition: **rejected**; retain small local code and independent
  measurement ownership.
- Ranking: 7.
- Revisit trigger: three binaries require the same fully specified policy and
  correctness requires them to change together.

### `RS0019-CONS-007` — rename benchmark append terminology globally

- Primary category/profile: Naming / Conservative.
- Responsibility and owner: `RunMeasurements.append_latencies`,
  `append_elapsed_seconds`, and locals shared by storage append and session
  submit workloads.
- Evidence: “append” is exact for storage but “submit” is exact for sequenced
  sessions; public output deliberately uses neutral “commit.”
- Consumers/platforms: internal harness implementation and schema-3 result
  consumers.
- Preserved contract/tests: schema field names and historical interpretation
  from `benchmark-fixtures-schema-and-statistics` and
  `benchmark-command-and-concurrency`.
- Hypothesis: renaming internals to “commit” or “operation” improves
  consistency.
- Cheapest disproof: inspect call sites and public schema. The existing local
  term remains understandable, while a broad rename removes no mechanism and
  risks implying a stronger storage/session equivalence.
- Expected benefit: cosmetic only.
- Displaced complexity/supporting edits: broad churn across timing and result
  assembly, with no contract improvement.
- Proposed disposition: **excluded** as low-value Conservative churn.
- Ranking: 5.
- Revisit trigger: these fields become public, are reused by another boundary,
  or terminology causes a documented interpretation error.

### `RS0019-CONS-008` — delete the counter demo replay test

- Primary category/profile: Tests / Conservative.
- Responsibility and owner: `runs_snapshot_and_replay_demo` in
  `examples/sea-counter/src/main.rs`.
- Evidence: narrower tests exercise snapshot publication and tail replay, and
  `main` also asserts the result of `run_demo`.
- Consumers/platforms: the executable example and readers following the exact
  README sequence.
- Preserved contract/tests: inherited `counter-replay-and-format`; the test
  calls the same complete path as the executable without relying on captured
  output, while narrower tests isolate no-snapshot, replacement, and malformed
  input decisions.
- Hypothesis: removing the test eliminates duplicate replay evidence.
- Cheapest disproof: remove only this test conceptually and map the executable
  sequence to an automatically discovered regression. No remaining focused
  test executes `run_demo`; `main` is not a substitute for the named test in
  normal package test diagnosis.
- Expected benefit: one short test removed.
- Displaced complexity/supporting edits: example replay would depend on an
  external `cargo run` gate and failures would be less local.
- Proposed disposition: **rejected**; preserve independent example replay.
- Ranking: 4 because the decision is clear but no repair is warranted.
- Revisit trigger: a dedicated integration test executes the built binary and
  independently asserts its complete behavior and output.

## Ranking and Selection Recommendation

1. Select `RS0019-CONS-001` if a consumers repair slot is available.
   It removes an actual dead input with no displaced mechanism.
2. Consider `RS0019-CONS-002` only with an assigned generated/browser
   validation route and a prototype that is visibly simpler.
3. Consider `RS0019-CONS-005` only after fixed-timer-boundary review shows that
   generic construction does not obscure benchmark meaning.
4. Keep `RS0019-CONS-008` rejected to preserve example replay.
5. Keep `RS0019-CONS-007` excluded as cosmetic churn.
6. Keep `RS0019-CONS-003`, `RS0019-CONS-006`, and `RS0019-CONS-004` rejected;
   they respectively risk generated lifetimes, measurement ownership, and
   independent regression diagnosis.

The two deferred candidates are assessed-but-unrepaired, not unreviewed.
No candidate requires another workstream to edit shared code in Wave 1.
`RS0019-CONS-002` would require coordinator-owned generated/package/browser
validation if selected.

## Hypothesis Results

- Supported: at least one current consumer helper carries accidental,
  behavior-free configuration (`RS0019-CONS-001`).
- Plausible but inconclusive: remote binding construction and file-backed
  decorator benchmark lifecycles may have one owner
  (`RS0019-CONS-002`, `RS0019-CONS-005`).
- Falsified: similar cancellable fields imply one generated stream contract;
  similar integration setup implies duplicate evidence; similar benchmark
  helper syntax implies one measurement policy; overlapping counter scenarios
  imply redundant replay coverage.
- No material documentation, code-organization, or naming repair qualified
  under Conservative review.

## Deliverables and Commits

- Deliverable: this Wave 1 discovery report only.
- Commits: none, as required.
- Production/test/documentation changes: none.
- Shared inventory/instruction changes: none.

## Validation Evidence

Wave 1 intentionally ran no commands.
There are no test, formatting, lint, build, generated-binding, browser,
benchmark, or Git-status results to claim.

If `RS0019-CONS-001` is selected, the registered focused tasks are:

- `rs0019 consumers test`
- `rs0019 consumers format`

If `RS0019-CONS-002` is selected, the coordinator must additionally assign
fresh generated artifact/API comparison and the relevant Node/browser
consumer checks.
If `RS0019-CONS-005` is selected, review must compare measurement boundaries
before running correctness smoke/tests; no benchmark campaign or performance
improvement claim is proposed.

## Behavioral Contracts and Test Layers

No behavior changed.
The complete responsibility map and candidate records link each assessed
boundary to its 0018 evidence.
The review specifically retained:

- original concrete storage handles under `BindingHandle`, rather than
  manufacturing availability from identities;
- raw generated-binding tests separately from TypeScript wrapper and browser
  tests;
- event versus snapshot stream terminal and cancellation semantics;
- signal connections retained through pending operations and closed before
  session transport ownership;
- independently retained plaintext integration expectations, per-hop probes,
  fresh memberships, deadlines, and unwind cleanup;
- benchmark fixture/schema values, upper-rank percentile meaning, exact
  receipts/payloads/snapshots, timer boundaries, timestamp domains, and
  process-specific resource observations;
- no-reader replay after the timed phase, with no subscriptions during writes;
  and
- the counter's focused decoding tests plus complete executable replay.

No inherited 0018 test is proposed for removal.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | Shared stream cancellation state appeared extractable. | `SeaEventStream::next` treats end/cancel as `undefined`; `SeaSnapshotStream::next` reports cancellation/end and owns publisher revocation. | A helper would hide distinct generated lifetimes for minimal deletion. | `RS0019-CONS-003` rejected. | Compare state transitions and terminal meaning before sharing structurally similar async wrappers. |
| Falsified hypothesis | The large composition matrix appeared reducible through more table-driven setup. | Independent plaintext inputs, topology counters, scenario names, fresh documents, reconnect state, deadlines, and cleanup each diagnose a distinct boundary. | Reduction would mostly move complexity into parameters/macros. | `RS0019-CONS-004` rejected. | Test size is not duplication when repetition preserves independent expectations and diagnosis. |
| Provenance discrepancy | Assigned kickoff differs from the source commit recorded in instructions/charter. | User: `7b56e89c...`; records: `575b77e8...`. | Fixed-base review must not silently conflate them. | Recorded for coordinator reconciliation; no command was run. | Keep worktree kickoff and approved comparison source as separate provenance fields. |

## Contract and Integration Friction

- The generated WASM API is owned outside this crate by `sea-typescript`;
  even a private Rust constructor consolidation requires fresh generated
  consumer evidence.
- Benchmark binaries intentionally duplicate small utilities where their
  payload, percentile, path, or measurement policies differ.
- Integration stack macros must retain concrete types to test repeated and
  reordered decorators without replacing their capabilities with type erasure.
- No shared API limitation requires a Wave 1 decision.

## Human Interventions

The user supplied the exact worktree, branch, kickoff commit, no-command rule,
write restriction, preservation constraints, and task labels.
No additional human correction occurred.

## Measurements

- Performance: not measured; no campaign requested.
- Source size or dependency counts: not measured; line reduction is not a
  selection criterion.
- Discovery coverage: four of four assigned members and six of six enabled
  categories reviewed.
- Candidate outcomes: one proposed simplification, two deferred, four
  rejected, and one excluded.
- Command effort: zero terminal commands by instruction.
- Wall-clock/tool cost: unknown.

## Proposed Decisions

- Select `RS0019-CONS-001` for a small crate-local Wave 2 repair if it outranks
  candidates from other workstreams.
- Keep `RS0019-CONS-002` and `RS0019-CONS-005` deferred unless the coordinator
  assigns their required typed prototype and boundary review.
- No shared architectural, API, protocol, generated-binding, dependency, or
  benchmark-semantics decision is proposed.

## Candidate Skills and Process Changes

No skill change is proposed.
The existing instruction to preserve independent expectations and platform
lifetimes directly prevented false consolidations in
`RS0019-CONS-003`, `RS0019-CONS-004`, and `RS0019-CONS-006`.

## Remaining Work and Risks

- Coordinator reconciliation must copy these candidate dispositions and
  complete coverage into the shared simplification inventory.
- Wave 2 may select at most the charter's remaining repair budget; this report
  does not authorize edits.
- `RS0019-CONS-002` remains unsafe without generated Node/browser evidence.
- `RS0019-CONS-005` remains unsafe without fixed-base comparison of timer,
  flush, drop, reopen, and cleanup boundaries.
- No member or category remains unreviewed.

## Convergence Assessment

Wave 1 coverage is complete for the consumers workstream.
The current structure is largely proportionate after quality iteration 0018:
generated and browser boundaries, cross-crate composition, benchmark
correctness, and example replay justify most apparent repetition.
One small dead-input repair can remove confirmed accidental complexity.
The two deferred hypotheses have concrete revisit triggers and should not be
reinvestigated without them.
Another broad consumers discovery pass is not justified unless those triggers
or material code changes occur.

## Run Assessment

- Coverage: complete for all four assigned members and all six Conservative
  categories; no unreviewed area remains.
- Value: one high-confidence removal identified; two ownership hypotheses
  bounded; five low-value or unsafe simplifications prevented.
- Safety: static contract/test reconciliation completed, but no command,
  generated, browser, or checkpoint evidence exists because Wave 1 forbids
  execution and repair.
- Effort: every member source, manifest, guide, architecture input, and relevant
  inherited 0018 boundary was inspected; exact elapsed effort is unknown.
- Recommendation: select `RS0019-CONS-001` only if it ranks within the global
  four-repair budget; otherwise stop consumers work. Revisit the deferred
  candidates only on their recorded triggers.

Candidate selection was conservative and calibrated to boundary risk.
The main guardrails—independent expected values, generated/resource lifetime
preservation, fixed benchmark meaning, and example replay—were effective.
No checkpoint decomposition, review cycle, validation, or user intervention
beyond kickoff applies yet.
