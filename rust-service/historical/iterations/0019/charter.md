# Iteration 0019 Charter

Status: active
Source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Coordinator: Copilot session `9b96d921-a6dd-49be-848e-e550c12a0c24`.

The user approved a broad current-state simplification review of all 15 Rust
workspace members, including unchanged code. Generated artifacts and non-Rust
integration packages are excluded except for strictly necessary supporting
edits and distinct-boundary validation.
All six simplification categories are enabled at Conservative level.
Discovery and assessment cover the full scope without a candidate-count or
time cutoff. The estimate is 25-40 material candidate assessments and several
hours of discovery, repair, review, and validation; it is planning context, not
a coverage limit.
At most four independently reviewable repairs may be accepted. Reaching that
limit does not end discovery or assessment.
Discovery and repair use separate waves.

No public API, dependency, protocol, generated-binding, supported-platform, or
performance change is authorized. A candidate requiring one of those changes
must be deferred or separately approved.

## Questions and Hypotheses

Does the current implementation, test suite, and documentation contain clear
accidental complexity that can be removed without weakening the contracts and
regression evidence established by [quality iteration
0018](../0018/quality-inventory.md)?

Each candidate must state a falsifiable hypothesis about a specific mechanism,
responsibility, explanation, fixture, layer, state, conversion, or name that
can be removed or consolidated. The cheapest check must first reject false
duplication, distinct platform or failure guarantees, hidden consumers, and
independent regression expectations.
File size and textual similarity generate candidates but are not findings.

Risk orders discovery: persistence and recovery ownership; session lifecycle
and asynchronous state; transport framing and resource lifetimes; core
publication and progress laws; generated and benchmark consumers; then
lower-risk documentation, naming, and organization.
Risk ranking does not omit any workspace member or enabled category.

## Active Workstreams

Wave 1 performs full-scope discovery and assessment without production edits.
The first five owners refine their complete assigned area map and report
candidates, no-change evidence, contracts, discriminating tests, consumers,
platform constraints, cheapest disproof, expected maintenance benefit, and
possible displaced complexity.
They may not begin repairs until the coordinator reconciles all discovery
results and selects at most four repairs.

| Owner | Workspace members and read/write scope after repair selection | Responsibilities and stopping condition |
| --- | --- | --- |
| foundations | `crates/sea-core`, `crates/sea-memory`, `crates/sea-content-addressed`, `crates/sea-conformance` | Core contracts and adapters, memory ownership, content trees, shared laws, tests, docs, organization, and naming. Stop discovery only after every assigned member and enabled category is accounted for. |
| persistence | `crates/sea-file` | Buffered and durable storage, journals, recovery, checkpoints, worker ownership, tests, and documentation. Stop discovery only after the full crate responsibility map is assessed. |
| sessions | `crates/sea-sequencer`, `crates/sea-signals`, `crates/sea-compression`, `crates/sea-encryption` | Ordering, membership, election, caches, routing, transformations, wrappers, tests, and guides. Stop discovery only after all four members are assessed. |
| transport | `crates/sea-webtransport`, `crates/sea-webtransport-server` | Protocol implementation, framing, stream/resource lifecycle, native/browser/WebSocket paths, server runtime, tests, and guides. Stop discovery only after both members and distinct platform implementations are assessed. |
| consumers | `crates/sea-wasm`, `crates/sea-integration-tests`, `crates/sea-benchmarks`, `examples/sea-counter` | Binding conversions and lifetimes, composition evidence, benchmark correctness infrastructure, and example replay. Shared `tests` or `scripts` remain read-only unless a selected repair strictly requires them. Stop discovery only after all four members are assessed. |
| cross-crate | No implementation writes in Wave 1. Later ownership may include coordinator-approved shared manifests, cross-crate contracts, or narrowly assigned paths. | Reconcile cross-owner candidates after the five discovery reports. Reject coincidental similarity and false coupling. Own only selected later-wave consolidations with one clear authoritative responsibility. |

Wave 2 compares all assessed candidates, records why selected repairs outrank
deferred candidates, and dispatches no more than four repairs to their
pre-registered owning workstreams. Crate-local independent repairs may proceed
in parallel. Cross-crate changes belong only to `cross-crate` and begin after
the coordinator names exact writable paths and integration order.

Each repair has one primary category and one coherent checkpoint.
Before any authorized checkpoint commit, a fresh read-only reviewer uses the
checkpoint-review workflow against the fixed checkpoint-start commit at
standard depth. The reviewer receives the Conservative profile, supporting-edit
rationale, before-and-after sources, relevant consumers, and focused
contract-preservation criteria. Up to two bounded repair/review cycles are
allowed. An unresolved behavior, clarity, ownership, or evidence finding
rejects or defers the repair rather than weakening acceptance.

Wave 3 integrates accepted checkpoints in dependency order, runs canonical and
distinct-boundary validation, reconciles every workspace member and candidate,
and conducts independent Phase 3 review.

## Deferred Scope

Broad redesigns, feature work, known-issue fixes, dependency changes, public API
changes, protocol revisions, generated-binding redesign, performance tuning,
benchmark campaigns, and production or power-loss qualification are excluded.
The active network-protocol and session-resource plans are design inputs, not
authorization to implement them.
Non-Rust packages and generated artifacts are excluded from proactive cleanup.
No Rust workspace member or enabled simplification category is excluded.

## Shared Validation

Every selected repair uses the narrowest focused check that protects its
affected contract, cases, assertions, links, visibility, or platform behavior.
The integrated implementation must pass, from `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
node scripts/check-documentation.mjs
./test.sh
```

It must also pass `pnpm policy-check --path rust-service` from the repository
root. Run `pnpm build:fast` when a selected change affects a registered pnpm
package or a declared build input, including Rust sources or manifests consumed
by generated WASM tasks.
Fresh generated/browser consumers are required only when a selected repair
affects their distinct boundary.

Machine-readable evidence is not requested unless a repair needs it.
If retained, its instruction must define exact paths, nonzero/parse checks,
checkout identity, command, exit status, and domain invariants.
All delegated commands require absolute checkout, branch, HEAD, status, and
working-directory guards. The coordinator owns shared foreground terminal
execution; process tasks are the preferred isolated route.

## Contract and Test Evidence

The [0018 quality inventory](../0018/quality-inventory.md) is inherited safety
evidence, not permission to derive test expectations from production values or
to skip current consumer mapping.
Every candidate identifies the exact owning contract and nearest discriminating
test before production edits.
Documentation changes preserve normative qualifications and useful local
context. Test cleanup maps original cases and assertions to surviving evidence
and preserves execution and failure diagnosis. Implementation and abstraction
changes keep existing expectations stable and add characterization evidence
first when current tests cannot distinguish required behavior.

No test cited by the inherited inventory may be removed unless a surviving
independent test discriminates the same owning decision or an approved contract
change is recorded. Conformance and integration/browser evidence are retained
when they prove distinct responsibilities. A changed production crate that
needs no contract or test edit records why existing evidence remains sufficient.

## Risks and Escalation

The principal risks are false sharing across independently evolving
responsibilities, collapsing platform or persistence guarantees, deriving
regression expectations from production logic, moving rather than removing
complexity, weakening local diagnostics, incidental comment loss during moves,
and exceeding the Conservative profile.
Known intermittent transport/browser failures must remain attributed and may
not be dismissed by passing retries.

Escalate unresolved semantics, unclear ownership, cross-crate dependency
direction, API/protocol/generated/performance effects, missing contracts, or
incomplete full-scope coverage. Missing contract evidence defers a candidate to
a quality audit rather than guessing.
Stop repair after four accepted checkpoints, but continue promised discovery
and assessment. Enter Phase 3 only after every scoped member is accounted for
or the user explicitly approves reduced coverage.
