# Iteration 0010 Charter

Status: complete
Source commit: `d5238a5a93098f8fe8cd14f7828e311450aa4aa2`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Constant-size SharedTree work:** Replacing one numeric object field per edit avoids the sequence-size-dependent cost of append while preserving a real SharedTree edit. The cheapest disproof is a local 100-edit run whose tree shape grows or whose final value differs.
- **Independent edit accounting:** `nodeChanged` events on writer and observer can verify that every separate field assignment is applied without growing persisted SharedTree state. The cheapest disproof is a 100-edit two-container smoke whose event counts do not increase by exactly the requested warmup and measured edit counts.
- **Service-sensitive comparison:** With fixed-size tree state, the existing full-driver six-arm harness should expose more transport/storage service overhead than iteration `0009`. The hypothesis is inconclusive if browser-side SharedTree work still dominates or run distributions overlap.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence | Stopping condition |
| --- | --- | --- | --- | --- | --- |
| `fixed-size-single-writer-capacity` | GitHub Copilot | Iteration `0009` full-driver matrix and storage modes | Minimal-driver benchmark schema/core/adapters/tests, new retained benchmark evidence, iteration `0010` report | Fixed-size numeric overwrite workload, exact writer/observer event counts, six 100-edit smokes, repeated clean-source large runs, comparison with guarantee labels | Stop if overwrites are coalesced so requested edits cannot be independently verified, if an arm requires a different workload, or if service semantics must change |

## Deferred Scope

Service/storage implementation changes, production membership, multi-writer, multi-document, multi-node, power-loss, retention, batching optimization, Routerlicious/ODSP, authentication, and publication are deferred. This iteration changes only the application workload needed to answer the user's single-writer comparison concern.

## Shared Validation

- Minimal-driver format, lint, both TypeScript typechecks, unit tests, and all benchmark bundles under Node `22.23.2`.
- Six 100-edit correctness smokes with exact final value and writer/observer edit-event counts.
- Ten clean-source repetitions of one common calibrated large overwrite count for every arm, retaining JSON and external service CPU/RSS where available.
- `git diff --check`, lockfile review, and `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0010 phase-2`.

## Risks and Escalation

- SharedTree or runtime batching may collapse observer change notifications. If event counts cannot prove each assignment, retain the counterexample and do not present final-value-only results as verified logical-edit capacity.
- Event listeners add constant per-edit client overhead. Apply the same listeners to every arm and label the metric accordingly.
- The fixed-size workload may remain browser-bound. Report overlapping distributions rather than forcing a service ranking.
- Preserve the six-arm workload, source provenance, durable default, and guarantee labels; do not mutate iteration `0009` evidence.
